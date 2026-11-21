// ============================================================================
// MUSISURF - Lyrics Matcher & Metadata Verification Engine
// Exact song matching, version compatibility, artist extraction, and LRC validation.
// Strict anti-wrong-lyrics rules: NEVER match covers, remixes, or different artists.
// ============================================================================

'use strict';

/**
 * Remove noise, video descriptors, and movie metadata from track titles
 * while preserving the essential recording identity.
 */
function cleanTrackTitle(title) {
  if (!title) return '';
  let cleaned = title
    // Remove pipeline separators like "| Shah Rukh Khan | Arijit Singh | T-Series"
    .replace(/\|.*$/g, '')
    // Remove brackets with video / format / visualizer / quality tags
    .replace(/[\(\[][^\)\]]*(?:official|video|audio|lyrics?|visualizer|hd|4k|hq|remastered|soundtrack|ost|clip|explicit|teaser|trailer)[^\)\]]*[\)\]]/gi, '')
    // Remove (From "Movie Name") or (From Movie Name)
    .replace(/[\(\[](?:from\s+["']?.*?["']?|original\s*motion\s*picture\s*soundtrack|soundtrack|ost)[\)\]]/gi, '')
    // Remove trailing " - Official Video", " - Audio", etc.
    .replace(/\s*-\s*(?:official\s*(?:music\s*)?video|video|audio|lyrics?|visualizer|remastered).*$/gi, '')
    // Remove trailing " - From Movie Name"
    .replace(/\s*-\s*(?:from\s+.*|original\s*motion\s*picture\s*soundtrack|soundtrack).*$/gi, '')
    // Remove featured artist clauses in title (already captured in artist metadata)
    .replace(/[\(\[](?:feat\.?|ft\.?|featuring)\s+.*?[\)\]]/gi, '')
    .replace(/\s+(?:ft\.?|feat\.?|featuring)\s+.*$/gi, '')
    // Remove trailing " - Artist Name" if title was formatted as "Track - Artist"
    .replace(/\s+-\s+.*$/g, '')
    // Remove quotes
    .replace(/^["']+|["']+$/g, '')
    // Clean empty brackets
    .replace(/[\(\[]\s*[\)\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || title.trim();
}

/**
 * Extract primary artist and all collaborating artists
 */
function extractArtists(artistStr) {
  if (!artistStr) {
    return { primary: '', all: [], primaryArtist: '', allArtists: [], cleanArtistStr: '' };
  }

  // Split on common artist separators: commas, &, feat, ft, x, with, and
  const rawParts = artistStr
    .split(/\s*(?:,|&|\band\b|\bwith\b|\bx\b|\bfeat\.?|\bft\.?|\bfeaturing\b)\s*/i)
    .map(p => p.trim())
    .filter(Boolean);

  const cleanParts = rawParts.map(p => p.replace(/^["']+|["']+$/g, '').trim()).filter(Boolean);
  const primaryArtist = cleanParts[0] || '';
  const primary = primaryArtist.toLowerCase();

  return {
    primary,
    all: cleanParts.map(p => p.toLowerCase()),
    primaryArtist,
    allArtists: cleanParts,
    cleanArtistStr: cleanParts.join(', ')
  };
}

/**
 * Identify recording version: standard, remix, acoustic, live, instrumental, cover, slowed
 */
function extractSongVersion(str) {
  const s = (str || '').toLowerCase();
  if (/\b(remix|club mix|extended mix|vip|dub|mashup)\b/.test(s)) return 'remix';
  if (/\b(acoustic|unplugged|piano version|stripped)\b/.test(s)) return 'acoustic';
  if (/\b(live|concert|in concert|at the \w+)\b/.test(s)) return 'live';
  if (/\b(instrumental|karaoke|backing track)\b/.test(s)) return 'instrumental';
  if (/\b(cover|tribute)\b/.test(s)) return 'cover';
  if (/\b(slowed|reverb)\b/.test(s)) return 'slowed';
  return 'standard';
}

/**
 * Normalize text for semantic matching: lowercase, strip accents, punctuation
 */
function normalizeLyricsText(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\(\[](?:feat\.?|ft\.?|featuring).*?[\)\]]/gi, '')
    .replace(/\b(?:feat\.?|ft\.?|featuring)\b.*$/gi, '')
    .replace(/[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|video|audio|lyric\s*video|lyrics|visualizer|hd|4k|remastered|full\s*song|clip)[\)\]]/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strict Multi-Parameter Candidate Verification Score (0 - 100)
 * Evaluates candidate song from any provider or internet source against the target song.
 *
 * Scored Criteria:
 * 1. Title Similarity (up to 50 pts)
 * 2. Artist Similarity (up to 35 pts)
 * 3. Version Compatibility (up to 10 pts, heavy penalty for mismatch)
 * 4. Duration Compatibility (up to 15 pts)
 * 5. Album match bonus (up to 5 pts)
 *
 * Hard Reject Conditions (Score = 0):
 * - Completely different artist (zero overlap between target and candidate artists)
 * - Mismatched song title (low token overlap and no substring containment)
 * - Instrumental vs vocal mismatch
 */
function computeLyricsMatchScore(candidate, target) {
  if (!candidate || !target) return 0;

  const targetTitle = normalizeLyricsText(cleanTrackTitle(target.title || target.rawTitle));
  let candRawTitle = candidate.title || candidate.trackName || '';

  // If candidate title contains trailing artist e.g. "Bijlee Bijlee - Harrdy Sandhu", strip it
  if (target.artist && candRawTitle.toLowerCase().includes(target.artist.toLowerCase())) {
    candRawTitle = candRawTitle.replace(new RegExp(`\\s*-\\s*${target.artist}`, 'gi'), '');
  }
  const candTitle = normalizeLyricsText(cleanTrackTitle(candRawTitle));

  const targetArtistObj = extractArtists(target.artist);
  const candArtistObj = extractArtists(candidate.artist || candidate.artistName);

  const targetPrimary = normalizeLyricsText(targetArtistObj.primaryArtist);
  const candPrimary = normalizeLyricsText(candArtistObj.primaryArtist);

  if (!targetTitle || !candTitle) return 0;

  let score = 0;

  // ----------------------------------------------------
  // 1. Title Similarity (up to 50 pts)
  // ----------------------------------------------------
  if (candTitle === targetTitle) {
    score += 50;
  } else if (candTitle.startsWith(targetTitle + ' ') || targetTitle.startsWith(candTitle + ' ')) {
    score += 44;
  } else {
    const targetTokens = targetTitle.split(' ').filter(Boolean);
    const candTokens = candTitle.split(' ').filter(Boolean);
    if (targetTokens.length === 0 || candTokens.length === 0) return 0;

    const common = targetTokens.filter(t => candTokens.includes(t));
    const tokenOverlap = common.length / Math.max(targetTokens.length, candTokens.length);

    // Hard reject if title similarity is too low
    if (tokenOverlap < 0.40 && !candTitle.includes(targetTitle) && !targetTitle.includes(candTitle)) {
      return 0; // Hard reject: mismatched song title
    }
    score += Math.round(tokenOverlap * 44);
  }

  // ----------------------------------------------------
  // 2. Artist Similarity (up to 35 pts)
  // ----------------------------------------------------
  if (targetPrimary && candPrimary) {
    // Check if primary artist matches exactly
    if (candPrimary === targetPrimary || candPrimary.includes(targetPrimary) || targetPrimary.includes(candPrimary)) {
      score += 35;
    } else {
      // Check if candidate matches ANY artist in target's artist list (or vice versa)
      const targetAllNorm = targetArtistObj.allArtists.map(a => normalizeLyricsText(a));
      const candAllNorm = candArtistObj.allArtists.map(a => normalizeLyricsText(a));

      const hasCrossMatch = targetAllNorm.some(ta => candAllNorm.some(ca => ta === ca || ta.includes(ca) || ca.includes(ta)));
      if (hasCrossMatch) {
        score += 30;
      } else {
        const targetTokens = targetPrimary.split(' ').filter(Boolean);
        const candTokens = candPrimary.split(' ').filter(Boolean);
        const commonTokens = targetTokens.filter(t => candTokens.includes(t));

        if (commonTokens.length === 0) {
          // STRICT RULE: Different artist -> Instant Hard Reject!
          // e.g. "Tuu by Darshan Raval" vs "Tuu by Harrdy Sandhu" -> REJECTED
          return 0;
        }
        score += Math.round((commonTokens.length / Math.max(targetTokens.length, 1)) * 25);
      }
    }
  } else if (!candPrimary && targetPrimary) {
    // Missing candidate artist when target has a known artist:
    // STRICT ANTI-WRONG-SONG RULE: Cannot verify artist identity.
    // An artist-less candidate must not qualify on title alone.
    score += 0;
  }

  // ----------------------------------------------------
  // 3. Version Compatibility (up to 10 pts, heavy penalty)
  // ----------------------------------------------------
  const normVer = v => (!v || v === 'original' ? 'standard' : v);
  const targetVersion = normVer(target.version || extractSongVersion(target.rawTitle || target.title));
  const candVersion = normVer(candidate.version || extractSongVersion(candidate.title || candidate.trackName));
  if (targetVersion !== candVersion) {
    // Mismatched version (e.g. remix vs standard, acoustic vs standard, etc.) -> HARD REJECT!
    return 0;
  }
  score += 10;

  // ----------------------------------------------------
  // 4. Duration Compatibility (up to 15 pts)
  // ----------------------------------------------------
  if (target.duration && candidate.duration && candidate.duration > 0 && target.duration > 0) {
    const diff = Math.abs(target.duration - candidate.duration);
    if (diff <= 4) score += 15;
    else if (diff <= 10) score += 12;
    else if (diff <= 20) score += 6;
    else if (diff > 35) score -= 30; // Severe duration difference penalty
  }

  // ----------------------------------------------------
  // 5. Album match bonus (up to 5 pts)
  // ----------------------------------------------------
  if (target.album && candidate.albumName) {
    const normTargetAlbum = normalizeLyricsText(target.album);
    const normCandAlbum = normalizeLyricsText(candidate.albumName);
    if (normTargetAlbum && normCandAlbum && (normTargetAlbum === normCandAlbum || normTargetAlbum.includes(normCandAlbum))) {
      score += 5;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Validate Synchronized LRC Timestamps
 * Strictly checks:
 * 1. Monotonic chronological order (no reversed time jumps)
 * 2. Non-negative values
 * 3. Within track duration (with grace period for outro)
 * 4. Rejects fake/manufactured timestamps (identical intervals)
 */
function validateLrcTimestamps(lrcText, durationSec = null) {
  if (!lrcText || typeof lrcText !== 'string' || lrcText.trim().length === 0) {
    return { valid: false, reason: 'empty_input' };
  }

  const lines = lrcText.split('\n');
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
  const entries = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const matches = [...trimmed.matchAll(timeRegex)];
    if (matches.length > 0) {
      const text = trimmed.replace(timeRegex, '').trim();
      for (const m of matches) {
        const mins = parseInt(m[1], 10);
        const secs = parseInt(m[2], 10);
        const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
        const time = mins * 60 + secs + (ms / 1000);
        entries.push({ time, text });
      }
    }
  }

  // A genuine synchronized lyrics track must have at least 3 timestamped lines
  if (entries.length < 3) {
    return { valid: false, reason: 'too_few_timed_lines' };
  }

  // 1. Check for negative timestamps
  if (entries.some(e => e.time < 0)) {
    return { valid: false, reason: 'negative_timestamp' };
  }

  // 2. Check for chronological / non-decreasing order (allow tiny jitter <= 0.08s)
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].time < entries[i - 1].time - 0.08) {
      return { valid: false, reason: 'non_monotonic_timestamps (out-of-order timestamps)' };
    }
  }

  // 3. Check for timestamps outside duration if duration is provided
  if (durationSec && durationSec > 10) {
    const maxAllowed = durationSec + 35; // 35s grace period for outros & reverberation
    if (entries[entries.length - 1].time > maxAllowed) {
      return { valid: false, reason: 'timestamp_exceeds_duration' };
    }
  }

  // 4. Reject fake constant intervals (e.g. exactly 5.000s every line created artificially)
  if (entries.length >= 4) {
    const diffs = [];
    for (let i = 1; i < entries.length; i++) {
      diffs.push(Math.round((entries[i].time - entries[i - 1].time) * 100) / 100);
    }
    const allSame = diffs.every(d => Math.abs(d - diffs[0]) < 0.05);
    if (allSame) {
      return { valid: false, reason: 'fabricated_constant_intervals (artificial sync)' };
    }
  }

  return {
    valid: true,
    lineCount: entries.length,
    firstTime: entries[0].time,
    lastTime: entries[entries.length - 1].time
  };
}

module.exports = {
  cleanTrackTitle,
  extractArtists,
  extractSongVersion,
  normalizeLyricsText,
  computeLyricsMatchScore,
  validateLrcTimestamps
};
