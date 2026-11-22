// ============================================================================
// MUSISURF - Multi-Stage Automatic Lyrics Discovery & Verification Engine
// Multi-Provider Waterfall:
// 1. Persistent Verified Lyrics DB (Disk JSON + Memory)
// 2. User-Contributed Lyrics Store
// 3. LRCLIB (Exact + Scored Query + Clean Title Search)
// 4. JioSaavn Lyrics API (Bollywood, Indian, Punjabi, Regional)
// 5. Lyrics.ovh API (International / Western)
// 6. Legitimate Public Lyrics Search Fallback
// 7. Strict Anti-Wrong-Lyrics Candidate Verification
// 8. Timestamp Validation & Multilingual Script Detection
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const {
  cleanTrackTitle,
  extractArtists,
  extractSongVersion,
  normalizeLyricsText,
  computeLyricsMatchScore,
  validateLrcTimestamps
} = require('./lyrics_matcher');
const {
  transliterateTextToDevanagari,
  detectLyricsLanguage
} = require('./lyrics_transliteration');

// Persistent Database Paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const VERIFIED_DB_FILE = path.join(DATA_DIR, 'verified_lyrics_db.json');
const CONTRIBUTED_FILE = path.join(DATA_DIR, 'contributed_lyrics.json');

// In-Memory Fast Cache
const memoryCache = new Map();
const MEMORY_CACHE_MAX = 2000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class LyricsDiscoveryEngine {
  constructor() {
    this.verifiedDb = {};
    this.contributedDb = {};
    this.initStorage();
  }

  initStorage() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(VERIFIED_DB_FILE)) {
        const raw = fs.readFileSync(VERIFIED_DB_FILE, 'utf8').replace(/^\uFEFF/, '');
        this.verifiedDb = JSON.parse(raw || '{}');
      }

      if (fs.existsSync(CONTRIBUTED_FILE)) {
        const raw = fs.readFileSync(CONTRIBUTED_FILE, 'utf8').replace(/^\uFEFF/, '');
        this.contributedDb = JSON.parse(raw || '{}');
      }
    } catch (err) {
      console.warn('[LyricsDiscoveryEngine] Storage init warning:', err.message);
    }
  }

  saveVerifiedDb() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(VERIFIED_DB_FILE, JSON.stringify(this.verifiedDb, null, 2), 'utf8');
    } catch (err) {
      console.warn('[LyricsDiscoveryEngine] Error saving verified lyrics database:', err.message);
    }
  }

  saveContributedDb() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(CONTRIBUTED_FILE, JSON.stringify(this.contributedDb, null, 2), 'utf8');
    } catch (err) {
      console.warn('[LyricsDiscoveryEngine] Error saving contributed lyrics database:', err.message);
    }
  }

  buildTrackKey(cleanTrack, cleanArtist, version = 'standard', duration = null) {
    const t = normalizeLyricsText(cleanTrack);
    const a = normalizeLyricsText(cleanArtist);
    const v = version || 'standard';
    return `${t}__${a}__${v}`;
  }

  decodeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'");
  }

  /**
   * Main Discovery Pipeline: Multi-Stage Waterfall with Strict Verification
   */
  async findLyrics(targetMeta) {
    const { rawTitle, title, artist, album, duration, trackId } = targetMeta;

    const cleanTrack = cleanTrackTitle(title || rawTitle);
    const artistInfo = extractArtists(artist);
    const primaryArtist = artistInfo.primaryArtist;
    const targetVersion = extractSongVersion(rawTitle || title);

    const normMeta = {
      title: cleanTrack,
      rawTitle: rawTitle || title,
      artist: primaryArtist,
      allArtists: artistInfo.allArtists,
      album: album || '',
      duration: duration && duration > 0 ? duration : null,
      version: targetVersion,
      trackId
    };

    const dbKey = this.buildTrackKey(cleanTrack, primaryArtist, targetVersion);
    const cacheKey = `${dbKey}__${Math.round(duration || 0)}`;

    // =========================================================================
    // STAGE 1: Check In-Memory Fast Cache
    // =========================================================================
    const inMem = memoryCache.get(cacheKey);
    if (inMem && (Date.now() - inMem.timestamp < CACHE_TTL_MS)) {
      return inMem.data;
    }

    // =========================================================================
    // STAGE 2: Check Persistent Verified Database
    // =========================================================================
    if (this.verifiedDb[dbKey]) {
      const entry = this.verifiedDb[dbKey];
      // STRICT VERIFICATION: Verify that cached entry's artist matches targetMeta
      const score = computeLyricsMatchScore({
        title: entry.trackName,
        artist: entry.artistName,
        duration: entry.duration
      }, normMeta);
      if (score >= 70) {
        memoryCache.set(cacheKey, { data: entry, timestamp: Date.now() });
        return entry;
      } else {
        // Discard invalid/mismatched cached entry
        delete this.verifiedDb[dbKey];
        this.saveVerifiedDb();
      }
    }

    // Check Contributed Database
    const contribKey = `${normalizeLyricsText(cleanTrack)}__${normalizeLyricsText(primaryArtist)}`;
    if (this.contributedDb[contribKey]) {
      const entry = this.contributedDb[contribKey];
      memoryCache.set(cacheKey, { data: entry, timestamp: Date.now() });
      return entry;
    }

    // =========================================================================
    // STAGE 3: Search Primary Synced Provider (LRCLIB)
    // =========================================================================
    const lrclibResult = await this.searchLrclib(normMeta);
    if (lrclibResult && lrclibResult.verified) {
      return this.storeVerifiedResult(dbKey, cacheKey, lrclibResult);
    }

    // =========================================================================
    // STAGE 4: Search JioSaavn Lyrics API (Bollywood, Indian, Punjabi, Regional)
    // =========================================================================
    const saavnResult = await this.searchJioSaavn(normMeta);
    if (saavnResult && saavnResult.verified) {
      // Check if we can find matching synced LRC for this verified recording
      if (!saavnResult.syncedLyrics && lrclibResult && lrclibResult.candidateLrc) {
        saavnResult.syncedLyrics = lrclibResult.candidateLrc;
      }
      return this.storeVerifiedResult(dbKey, cacheKey, saavnResult);
    }

    // =========================================================================
    // STAGE 5: Search Lyrics.ovh API (International / Western Plain Lyrics)
    // =========================================================================
    const ovhResult = await this.searchLyricsOvh(normMeta);
    if (ovhResult && ovhResult.verified) {
      return this.storeVerifiedResult(dbKey, cacheKey, ovhResult);
    }

    // =========================================================================
    // STAGE 6: Legitimate Internet Search Discovery Fallback
    // =========================================================================
    const fallbackResult = await this.searchInternetFallback(normMeta);
    if (fallbackResult && fallbackResult.verified) {
      return this.storeVerifiedResult(dbKey, cacheKey, fallbackResult);
    }

    // =========================================================================
    // STAGE 7: All Supported Sources Exhausted -> Honest Unavailable Result
    // =========================================================================
    const notFound = {
      success: false,
      verified: false,
      message: "Lyrics aren't available for this track yet.",
      trackName: cleanTrack,
      artistName: primaryArtist,
      checkedSources: ['verified_cache', 'lrclib_exact', 'lrclib_search', 'jiosaavn', 'lyrics_ovh', 'internet_discovery']
    };

    // Cache negative result briefly (3 minutes) to avoid thrashing
    memoryCache.set(cacheKey, { data: notFound, timestamp: Date.now() - (CACHE_TTL_MS - 180000) });
    return notFound;
  }

  /**
   * LRCLIB Multi-Query Search with Candidate Scoring
   */
  async searchLrclib(meta) {
    const { title, artist, album, duration, version } = meta;

    // Strategy 1: Exact Match /api/get
    try {
      let getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
      if (album) getUrl += `&album_name=${encodeURIComponent(album)}`;
      if (duration && duration > 0) getUrl += `&duration=${duration}`;

      const res = await fetch(getUrl, {
        headers: { 'User-Agent': 'MusiSurf-MusicPlayer/1.0.0 (https://musisurf.app)' },
        signal: AbortSignal.timeout(4500)
      });

      if (res.ok) {
        const data = await res.json();
        if (data && (data.syncedLyrics || data.plainLyrics)) {
          const score = computeLyricsMatchScore({
            title: data.trackName,
            artist: data.artistName,
            albumName: data.albumName,
            duration: data.duration
          }, meta);

          if (score >= 68) {
            return this.formatVerifiedLyrics(data, score, 'lrclib_exact', meta);
          }
        }
      }
    } catch (e) {
      // Proceed to search queries
    }

    // Strategy 2: Scored Search Queries
    const searchQueries = [];
    if (artist) searchQueries.push(`${title} ${artist}`.trim());
    if (artist) searchQueries.push(`${artist} ${title}`.trim());
    if (title.length > 3) searchQueries.push(title);

    for (const q of searchQueries) {
      try {
        const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
        const res = await fetch(searchUrl, {
          headers: { 'User-Agent': 'MusiSurf-MusicPlayer/1.0.0' },
          signal: AbortSignal.timeout(4500)
        });

        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            const scoredList = list
              .filter(item => Boolean(item.syncedLyrics || item.plainLyrics))
              .map(candidate => ({
                candidate,
                score: computeLyricsMatchScore({
                  title: candidate.trackName,
                  artist: candidate.artistName,
                  albumName: candidate.albumName,
                  duration: candidate.duration
                }, meta)
              }))
              .filter(item => item.score >= 70); // Strict threshold to reject wrong song

            if (scoredList.length > 0) {
              // Prioritize synced lyrics, then highest score
              scoredList.sort((a, b) => {
                const aSynced = Boolean(a.candidate.syncedLyrics);
                const bSynced = Boolean(b.candidate.syncedLyrics);
                if (bSynced && !aSynced && b.score >= 70) return 1;
                if (aSynced && !bSynced && a.score >= 70) return -1;
                return b.score - a.score;
              });

              const best = scoredList[0];
              return this.formatVerifiedLyrics(best.candidate, best.score, 'lrclib_search', meta);
            }
          }
        }
      } catch (e) {
        // Continue to next query
      }
    }

    return null;
  }

  /**
   * Extract authentic artist string from JioSaavn song object
   */
  extractSaavnArtists(s) {
    if (!s) return '';
    const mapArtists = [
      ...(s.more_info?.artistMap?.primary_artists || []),
      ...(s.more_info?.artistMap?.artists || [])
    ].map(a => a.name).filter(Boolean);
    if (mapArtists.length > 0) {
      return [...new Set(mapArtists)].join(', ');
    }
    if (s.subtitle) {
      const parts = s.subtitle.split(' - ');
      return parts[0].trim();
    }
    return s.more_info?.primary_artists || s.more_info?.singers || s.more_info?.music || '';
  }

  /**
   * JioSaavn Lyrics API Search
   */
  async searchJioSaavn(meta) {
    const { title, artist, album, duration } = meta;

    const queries = [];
    if (artist) queries.push(`${title} ${artist}`.trim());
    if (title && title.length > 3) queries.push(title);

    for (const q of queries) {
      try {
        const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=8&p=1&q=${encodeURIComponent(q)}`;
        const res = await fetch(searchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(4500)
        });

        if (res.ok) {
          const data = await res.json();
          const results = data?.results || [];

          // Note: has_lyrics can be boolean true, string "true", or "1"
          const scored = results
            .filter(s => {
              const hl = s.more_info?.has_lyrics;
              return hl === true || hl === 'true' || hl === '1' || hl === 1;
            })
            .map(s => {
              const candArtist = this.extractSaavnArtists(s);
              return {
                song: s,
                candArtist,
                score: computeLyricsMatchScore({
                  title: s.title,
                  artist: candArtist,
                  duration: parseInt(s.more_info?.duration, 10) || null
                }, meta)
              };
            })
            .filter(item => item.score >= 70);

          if (scored.length > 0) {
            scored.sort((a, b) => b.score - a.score);
            const best = scored[0];
            const song = best.song;
            const lyricsId = song.more_info?.lyrics_id || song.id;

            if (lyricsId) {
              const lyrRes = await fetch(`https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&ctx=web6dot0&api_version=4&_format=json&lyrics_id=${encodeURIComponent(lyricsId)}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(4500)
              });

              if (lyrRes.ok) {
                const lyrData = await lyrRes.json();
                let rawLyrics = lyrData?.lyrics || '';
                if (rawLyrics && rawLyrics.trim().length > 30) {
                  const plainText = this.decodeHtml(rawLyrics.replace(/<br\s*[\/]?>/gi, '\n')).trim();
                  return this.formatVerifiedLyrics({
                    trackName: song.title || title,
                    artistName: best.candArtist || song.subtitle || artist,
                    albumName: song.more_info?.album || album,
                    duration: parseInt(song.more_info?.duration, 10) || duration,
                    syncedLyrics: null,
                    plainLyrics: plainText
                  }, best.score, 'jiosaavn', meta);
                }
              }
            }
          }
        }
      } catch (e) {
        // Continue
      }
    }

    return null;
  }

  /**
   * Lyrics.ovh Search
   */
  async searchLyricsOvh(meta) {
    const { title, artist } = meta;
    if (!title || !artist) return null;

    try {
      const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
      if (res.ok) {
        const data = await res.json();
        const text = (data?.lyrics || '').trim();
        if (text && text.length > 40) {
          return this.formatVerifiedLyrics({
            trackName: title,
            artistName: artist,
            syncedLyrics: null,
            plainLyrics: text
          }, 80, 'lyrics_ovh', meta);
        }
      }
    } catch (e) {
      // Continue
    }

    return null;
  }

  /**
   * Internet Discovery Fallback for Unindexed Tracks
   * Queries legitimate open repositories and verifies candidate identity before display.
   */
  async searchInternetFallback(meta) {
    const { title, artist, album } = meta;
    // Attempt secondary discovery via ChartLyrics or authorized public endpoints
    try {
      const clUrl = `http://api.chartlyrics.com/apiv1.asmx/SearchLyricDirect?artist=${encodeURIComponent(artist)}&song=${encodeURIComponent(title)}`;
      const clRes = await fetch(clUrl, { signal: AbortSignal.timeout(4000) });
      if (clRes.ok) {
        const xml = await clRes.text();
        const lyricMatch = xml.match(/<Lyric>([\s\S]*?)<\/Lyric>/i);
        const artistMatch = xml.match(/<LyricArtist>([\s\S]*?)<\/LyricArtist>/i);
        const songMatch = xml.match(/<LyricSong>([\s\S]*?)<\/LyricSong>/i);

        if (lyricMatch && lyricMatch[1] && lyricMatch[1].trim().length > 30) {
          const candText = this.decodeHtml(lyricMatch[1].trim());
          const candArtist = artistMatch ? artistMatch[1].trim() : artist;
          const candSong = songMatch ? songMatch[1].trim() : title;

          const score = computeLyricsMatchScore({
            title: candSong,
            artist: candArtist
          }, meta);

          if (score >= 75) {
            return this.formatVerifiedLyrics({
              trackName: candSong,
              artistName: candArtist,
              syncedLyrics: null,
              plainLyrics: candText
            }, score, 'chartlyrics_verified', meta);
          }
        }
      }
    } catch (e) {
      // Continue
    }

    return null;
  }

  /**
   * Format, Validate Timestamps, Detect Script, and Transliterate Verified Lyrics
   */
  formatVerifiedLyrics(candidate, matchScore, providerName, targetMeta) {
    const rawLyrics = candidate.syncedLyrics || candidate.plainLyrics;
    let synced = candidate.syncedLyrics || null;
    let plain = candidate.plainLyrics || null;

    // Validate LRC timestamps if syncedLyrics provided
    if (synced) {
      const validation = validateLrcTimestamps(synced, targetMeta.duration);
      if (!validation.valid) {
        // If timestamps corrupted or fake, convert to plain text safely
        plain = synced.replace(/\[\d{1,2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
        synced = null;
      }
    }

    const langInfo = detectLyricsLanguage(rawLyrics, targetMeta.title, targetMeta.artist, targetMeta.album);
    let romanizedSynced = null;
    let romanizedPlain = null;
    let hasDevanagariAlt = false;

    // Transliterate Romanized Hindi to Devanagari while preserving Latin original
    if (langInfo.language === 'Hindi' && !langInfo.isNativeScript) {
      if (synced) {
        romanizedSynced = synced;
        synced = transliterateTextToDevanagari(synced);
        hasDevanagariAlt = true;
      }
      if (plain) {
        romanizedPlain = plain;
        plain = transliterateTextToDevanagari(plain);
        hasDevanagariAlt = true;
      }
    }

    return {
      success: true,
      verified: true,
      matchScore,
      confidence: matchScore >= 85 ? 'high' : 'medium',
      trackName: candidate.trackName || targetMeta.title,
      artistName: candidate.artistName || targetMeta.artist,
      syncedLyrics: synced,
      plainLyrics: plain,
      romanizedSyncedLyrics: romanizedSynced,
      romanizedPlainLyrics: romanizedPlain,
      hasDevanagariAlt,
      language: langInfo.language,
      script: hasDevanagariAlt ? 'Devanagari' : langInfo.script,
      duration: candidate.duration || targetMeta.duration || null,
      version: targetMeta.version || 'standard',
      provider: providerName,
      fetchedAt: new Date().toISOString()
    };
  }

  storeVerifiedResult(dbKey, cacheKey, result) {
    // 1. Store in Persistent Verified DB ONLY IF key contains a non-empty verified artist
    if (dbKey && !dbKey.includes('____') && result && result.artistName) {
      this.verifiedDb[dbKey] = result;
      this.saveVerifiedDb();
    }

    // 2. Store in Memory Cache
    if (memoryCache.size >= MEMORY_CACHE_MAX) {
      const firstKey = memoryCache.keys().next().value;
      memoryCache.delete(firstKey);
    }
    memoryCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  }

  /**
   * Save a User Contribution to Persistent Database
   */
  contributeLyrics(contribution) {
    const { track, artist, album, lyrics } = contribution;
    if (!track || !lyrics || lyrics.trim().length < 20) {
      throw new Error('Track title and valid lyrics (at least 20 characters) are required.');
    }

    const cleanTrack = cleanTrackTitle(track) || track;
    const cleanArtist = (artist || '').split(',')[0].replace(/\s+(?:ft\.?|feat\.|with).*$/i, '').trim();
    const isSynced = /\[\d{2}:\d{2}(?:\.\d{2,3})?\]/.test(lyrics);

    let synced = isSynced ? lyrics.trim() : null;
    let plain = !isSynced ? lyrics.trim() : null;

    if (synced) {
      const validation = validateLrcTimestamps(synced);
      if (!validation.valid) {
        plain = synced.replace(/\[\d{1,2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
        synced = null;
      }
    }

    const langInfo = detectLyricsLanguage(lyrics, cleanTrack, cleanArtist, album);
    let romanizedSynced = null;
    let romanizedPlain = null;
    let hasDevanagariAlt = false;

    if (langInfo.language === 'Hindi' && !langInfo.isNativeScript) {
      if (synced) {
        romanizedSynced = synced;
        synced = transliterateTextToDevanagari(synced);
        hasDevanagariAlt = true;
      }
      if (plain) {
        romanizedPlain = plain;
        plain = transliterateTextToDevanagari(plain);
        hasDevanagariAlt = true;
      }
    }

    const contribData = {
      success: true,
      verified: true,
      isUserContributed: true,
      matchScore: 100,
      confidence: 'high',
      trackName: cleanTrack,
      artistName: cleanArtist || 'Various Artists',
      syncedLyrics: synced,
      plainLyrics: plain,
      romanizedSyncedLyrics: romanizedSynced,
      romanizedPlainLyrics: romanizedPlain,
      hasDevanagariAlt,
      language: langInfo.language,
      script: hasDevanagariAlt ? 'Devanagari' : langInfo.script,
      provider: 'user_contributed',
      contributedAt: new Date().toISOString()
    };

    const contribKey = `${normalizeLyricsText(cleanTrack)}__${normalizeLyricsText(cleanArtist)}`;
    this.contributedDb[contribKey] = contribData;
    this.saveContributedDb();

    const dbKey = this.buildTrackKey(cleanTrack, cleanArtist);
    this.verifiedDb[dbKey] = contribData;
    this.saveVerifiedDb();

    const cacheKey = `${dbKey}__0`;
    memoryCache.set(cacheKey, { data: contribData, timestamp: Date.now() });

    return contribData;
  }
}

module.exports = new LyricsDiscoveryEngine();
