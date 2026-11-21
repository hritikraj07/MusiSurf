const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CACHE_FILE_PATH = path.join(__dirname, '..', 'data', 'silence_bounds_cache.json');
const memoryCache = new Map();

// Load persistent disk cache on startup
function loadDiskCache() {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v.effectiveStart === 'number' && typeof v.effectiveEnd === 'number') {
          memoryCache.set(k, v);
        }
      }
      console.log(`[SilenceDetector] Loaded ${memoryCache.size} cached track bounds from disk.`);
    }
  } catch (err) {
    console.warn('[SilenceDetector] Failed to load disk cache:', err.message);
  }
}
loadDiskCache();

let saveDebounceTimer = null;
function scheduleSaveDiskCache() {
  if (saveDebounceTimer) return;
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    try {
      const out = {};
      // Keep most recent 500 entries
      const entries = Array.from(memoryCache.entries()).slice(-500);
      for (const [k, v] of entries) {
        out[k] = v;
      }
      fs.mkdirSync(path.dirname(CACHE_FILE_PATH), { recursive: true });
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(out, null, 2), 'utf8');
    } catch (e) {
      console.warn('[SilenceDetector] Failed to persist disk cache:', e.message);
    }
  }, 1000);
}

/**
 * Parses stderr output from ffmpeg -af silencedetect=noise=-42dB:d=0.15 -f null -
 * Strictly trims only leading (t near 0) and trailing (t near duration) silence.
 * Middle of song is 100% untouched.
 */
function parseSilenceDetectStderr(stderr, rawDuration) {
  let detectedDuration = 0;
  const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):([0-9.]+)/i);
  if (durMatch) {
    const hours = parseInt(durMatch[1], 10);
    const mins = parseInt(durMatch[2], 10);
    const secs = parseFloat(durMatch[3]);
    detectedDuration = hours * 3600 + mins * 60 + secs;
  }

  const duration = (rawDuration && rawDuration > 0) ? rawDuration : (detectedDuration > 0 ? detectedDuration : 200);

  const lines = stderr.split('\n');
  const intervals = [];
  let currentStart = null;

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/i);
    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
    }
    const endMatch = line.match(/silence_end:\s*([0-9.]+)/i);
    if (endMatch) {
      const endVal = parseFloat(endMatch[1]);
      intervals.push({ start: currentStart !== null ? currentStart : 0, end: endVal });
      currentStart = null;
    }
  }
  if (currentStart !== null) {
    intervals.push({ start: currentStart, end: duration });
  }

  let effectiveStart = 0;
  let effectiveEnd = duration;

  // 1. LEADING SILENCE: strictly starting at or near 0 (<= 0.15s)
  if (intervals.length > 0 && intervals[0].start <= 0.15) {
    const maxStartTrim = Math.min(10.0, duration * 0.18);
    const trimmedStart = Math.min(intervals[0].end, maxStartTrim);
    if (trimmedStart >= 0.05) {
      effectiveStart = Math.max(0, trimmedStart - 0.04); // 40ms anti-click lead-in
      effectiveStart = Math.round(effectiveStart * 100) / 100;
    }
  }

  // 2. TRAILING SILENCE: strictly ending at or near the file duration
  if (intervals.length > 0) {
    const last = intervals[intervals.length - 1];
    const maxEndTrim = Math.min(15.0, duration * 0.22);
    const isEndingSilence = (last.end >= duration - 0.3) || 
                            (last.start >= duration - maxEndTrim && last.end >= duration - 1.0);
    if (isEndingSilence) {
      const minEnd = duration - maxEndTrim;
      const trimmedEnd = Math.max(last.start, minEnd);
      if (duration - trimmedEnd >= 0.1) {
        effectiveEnd = Math.min(duration, trimmedEnd + 0.06); // 60ms reverb-tail buffer
        effectiveEnd = Math.round(effectiveEnd * 100) / 100;
      }
    }
  }

  return {
    effectiveStart,
    effectiveEnd: effectiveEnd > effectiveStart ? effectiveEnd : duration,
    duration,
    intervalsCount: intervals.length
  };
}

/**
 * Analyzes audio for leading and trailing silence using system ffmpeg.
 */
async function analyzeTrackSilence({ trackId, url, duration = 0, ytdlGetter = null }) {
  if (!trackId && !url) {
    return { success: false, error: 'Missing trackId or url' };
  }

  const cacheKey = trackId || url;
  if (memoryCache.has(cacheKey)) {
    const cached = memoryCache.get(cacheKey);
    return { success: true, trackId: cacheKey, ...cached, source: 'cache' };
  }

  const rawDur = parseFloat(duration) || 0;

  return new Promise(async (resolve) => {
    let resolved = false;
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      memoryCache.set(cacheKey, {
        effectiveStart: result.effectiveStart,
        effectiveEnd: result.effectiveEnd,
        duration: result.duration
      });
      scheduleSaveDiskCache();
      resolve({ success: true, trackId: cacheKey, ...result });
    };

    const timeoutTimer = setTimeout(() => {
      console.warn(`[SilenceDetector] Timeout analyzing ${cacheKey}, fallback to raw bounds.`);
      finish({ effectiveStart: 0, effectiveEnd: rawDur > 0 ? rawDur : 210, duration: rawDur > 0 ? rawDur : 210, source: 'timeout' });
    }, 7000);

    try {
      const isYt = (trackId && trackId.startsWith('yt_')) || 
                   (url && url.includes('/api/yt-stream')) || 
                   (url && url.includes('youtube.com')) || 
                   (url && url.includes('youtu.be'));
      
      let ytId = null;
      if (isYt) {
        if (trackId && trackId.startsWith('yt_')) {
          ytId = trackId.replace('yt_', '');
        } else if (url) {
          const match = url.match(/[?&]id=([a-zA-Z0-9_-]{11})/);
          if (match) ytId = match[1];
        }
      }

      if (isYt && ytId && ytdlGetter) {
        const ytdl = await ytdlGetter();
        if (!ytdl) throw new Error('ytdl unavailable');

        const ytStream = await ytdl.download(ytId, {
          filter: { hasAudio: true, hasVideo: false },
          highWaterMark: 1 << 22
        });

        const ff = spawn('ffmpeg', [
          '-hide_banner',
          '-nostats',
          '-i', 'pipe:0',
          '-af', 'silencedetect=noise=-42dB:d=0.15',
          '-f', 'null',
          '-'
        ]);

        let stderr = '';
        ff.stderr.on('data', (d) => { stderr += d.toString(); });
        ytStream.pipe(ff.stdin);

        ff.on('close', (code) => {
          clearTimeout(timeoutTimer);
          const parsed = parseSilenceDetectStderr(stderr, rawDur);
          finish({ ...parsed, source: 'ffmpeg' });
        });

        ff.on('error', (err) => {
          clearTimeout(timeoutTimer);
          console.warn('[SilenceDetector] FFmpeg error on YT stream:', err.message);
          finish({ effectiveStart: 0, effectiveEnd: rawDur, duration: rawDur, source: 'fallback' });
        });

        ytStream.on('error', (err) => {
          try { ff.kill(); } catch (e) {}
        });
      } else {
        // Direct HTTP / JioSaavn Stream
        let audioUrl = url;
        if (audioUrl && audioUrl.includes('/api/stream?url=')) {
          const parsed = new URL(audioUrl, 'http://localhost');
          audioUrl = decodeURIComponent(parsed.searchParams.get('url') || audioUrl);
        }

        if (!audioUrl || !audioUrl.startsWith('http')) {
          clearTimeout(timeoutTimer);
          return finish({ effectiveStart: 0, effectiveEnd: rawDur, duration: rawDur, source: 'invalid_url' });
        }

        const ff = spawn('ffmpeg', [
          '-hide_banner',
          '-nostats',
          '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\n',
          '-i', audioUrl,
          '-af', 'silencedetect=noise=-42dB:d=0.15',
          '-f', 'null',
          '-'
        ]);

        let stderr = '';
        ff.stderr.on('data', (d) => { stderr += d.toString(); });

        ff.on('close', (code) => {
          clearTimeout(timeoutTimer);
          const parsed = parseSilenceDetectStderr(stderr, rawDur);
          finish({ ...parsed, source: 'ffmpeg' });
        });

        ff.on('error', (err) => {
          clearTimeout(timeoutTimer);
          console.warn('[SilenceDetector] FFmpeg error on HTTP stream:', err.message);
          finish({ effectiveStart: 0, effectiveEnd: rawDur, duration: rawDur, source: 'fallback' });
        });
      }
    } catch (err) {
      clearTimeout(timeoutTimer);
      console.warn('[SilenceDetector] Execution exception:', err.message);
      finish({ effectiveStart: 0, effectiveEnd: rawDur, duration: rawDur, source: 'error' });
    }
  });
}

module.exports = {
  analyzeTrackSilence,
  parseSilenceDetectStderr,
  memoryCache
};
