// ============================================================================
// MUSISURF - Next-Gen Intelligent Search & Discovery Engine
// Live Autocomplete, Lyrics-Based Search, Multilingual/Transliteration,
// Typo Tolerance, Intent Detection & Strict 10-Tier Relevance Ranking.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { isMashupTrack } = require('./mashup_detector');

// In-Memory Caches
const autocompleteCache = new Map();
const lyricsSearchCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Curated Global & Indian Superstars Regex
const SUPERSTARS_REGEX = /\b(arijit singh|atif aslam|shreya ghoshal|pritam|a\.?\s*r\.?\s*rahman|rahman|kishore kumar|lata mangeshkar|alka yagnik|kumar sanu|udit narayan|sunidhi chauhan|sonu nigam|badshah|diljit dosanjh|sidhu moose wala|honey singh|yo yo honey singh|anirudh ravichander|anirudh|k\.?k\.?|neha kakkar|jubin nautiyal|mohit chauhan|vishal-shekhar|shankar-ehsaan-loy|amit trivedi|armaan malik|darshan raval|guru randhawa|b praak|jaani|himesh reshammiya|lucky ali|prateek kuhad|jasleen royal|the weeknd|weeknd|taylor swift|ed sheeran|drake|eminem|justin bieber|billie eilish|bruno mars|dua lipa|post malone|rihanna|adele|coldplay|imagine dragons|kendrick lamar|travis scott|ariana grande|beyonce|bts|maroon 5|charlie puth|shawn mendes|selena gomez|katy perry|queen|michael jackson|beatles|linkin park)\b/i;

// Curated Major Official Record Labels Regex
const MAJOR_LABELS_REGEX = /\b(tips|t-series|tseries|sony|zee|yrf|universal|warner|saregama|speed|times music|columbia|interscope|atlantic|def jam|republic|rca|epic|island|geffen)\b/i;

// Common Typo & Phonetic Alias Dictionary
const TYPO_ALIASES = {
  'arjit': 'arijit',
  'arjit singh': 'arijit singh',
  'pasori': 'pasoori',
  'keshariya': 'kesariya',
  'kesriya': 'kesariya',
  'shreya ghosal': 'shreya ghoshal',
  'atif': 'atif aslam',
  'sidhu': 'sidhu moose wala',
  'diljit': 'diljit dosanjh',
  'jubin': 'jubin nautiyal',
  'b prak': 'b praak',
  'bpraak': 'b praak',
  'honey sing': 'honey singh',
  'yo yo': 'yo yo honey singh',
  'ed sheran': 'ed sheeran',
  'the weekend': 'the weeknd',
  'weekend': 'the weeknd',
  'pratik kuhad': 'prateek kuhad',
  'chana mereya': 'channa mereya',
  'channa merea': 'channa mereya',
  'tere bina jina': 'tere bina jeena',
  'tum hi ho ab': 'tum hi ho'
};

// Common Hindi/Urdu Romanized Words Mapping
const ROMAN_TO_HINDI_MAP = {
  'main': 'मैं', 'mai': 'मैं', 'me': 'में', 'mein': 'में', 'hum': 'हम', 'ham': 'हम',
  'tu': 'तू', 'tum': 'तुम', 'aap': 'आप', 'tera': 'तेरा', 'teri': 'तेरी', 'tere': 'तेरे',
  'mera': 'मेरा', 'meri': 'मेरी', 'mere': 'मेरे', 'apna': 'अपना', 'apni': 'अपनी', 'apne': 'अपने',
  'mujhe': 'मुझे', 'tujhe': 'तुझे', 'uska': 'उसका', 'uski': 'उसकी', 'uske': 'उसके',
  'hai': 'है', 'hain': 'हैं', 'ho': 'हो', 'hoon': 'हूँ', 'hu': 'हूँ', 'tha': 'था', 'thi': 'थी', 'the': 'थे',
  'ka': 'का', 'ki': 'की', 'ke': 'के', 'ko': 'को', 'se': 'से', 'par': 'पर', 'pe': 'पे',
  'bina': 'बिना', 'bin': 'बिन', 'jeena': 'जीना', 'jina': 'जीना', 'marna': 'मरना',
  'dil': 'दिल', 'jaan': 'जान', 'pyar': 'प्यार', 'pyaar': 'प्यार', 'ishq': 'इश्क़', 'mohabbat': 'मोहब्बत',
  'raat': 'रात', 'din': 'दिन', 'aankh': 'आँख', 'aankhen': 'आँखें', 'ankhiyan': 'अखियाँ',
  'samne': 'सामने', 'saamne': 'सामने', 'paas': 'पास', 'door': 'दूर', 'saath': 'साथ',
  'zindagi': 'ज़िंदगी', 'khwab': 'ख़्वाब', 'sapna': 'सपना', 'yaad': 'याद', 'baat': 'बात',
  'fitoor': 'फ़ितूर', 'parwardigara': 'परवरदिगारा', 'perwerdigara': 'परवरदिगara',
  'alfaaz': 'अल्फ़ाज़', 'alfaz': 'अल्फ़ाज़'
};

const HINDI_TO_ROMAN_MAP = {};
for (const [rom, hin] of Object.entries(ROMAN_TO_HINDI_MAP)) {
  if (!HINDI_TO_ROMAN_MAP[hin]) HINDI_TO_ROMAN_MAP[hin] = rom;
}

/**
 * Standardize and clean text for Unicode matching
 * Keeps all alphanumeric Unicode characters (Devanagari, Gurmukhi, Arabic/Urdu, Latin)
 */
function normalizeSearchText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips consecutive duplicate characters (e.g. tuuuu -> tu, soooo -> so, jeeeena -> jeena)
 */
function collapseConsecutiveChars(str) {
  return str.replace(/(.)\1{2,}/g, '$1$1');
}

/**
 * Compute Levenshtein edit distance between two strings
 */
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return d[m][n];
}

/**
 * Expand query with phonetic, typo, and script transliterations
 */
function expandQueryVariants(rawQuery) {
  const q = normalizeSearchText(rawQuery);
  const variants = new Set([q]);

  // 1. Direct typo dictionary check
  if (TYPO_ALIASES[q]) {
    variants.add(TYPO_ALIASES[q]);
  }

  // 2. Character collapse
  const collapsed = collapseConsecutiveChars(q);
  if (collapsed !== q) {
    variants.add(collapsed);
    if (TYPO_ALIASES[collapsed]) variants.add(TYPO_ALIASES[collapsed]);
  }

  // 3. Phonetic letter variations: ee <-> i, oo <-> u, sh <-> s, k <-> q, z <-> j, ph <-> f
  let phonetic = q
    .replace(/\bee\b/g, 'i')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/sh/g, 's')
    .replace(/ph/g, 'f')
    .replace(/q/g, 'k')
    .replace(/aa/g, 'a');
  if (phonetic !== q) variants.add(phonetic);

  // 4. Romanized to Devanagari translation of tokens
  const words = q.split(/\s+/).filter(Boolean);
  const devanagariTokens = words.map(w => ROMAN_TO_HINDI_MAP[w] || w);
  const devanagariPhrase = devanagariTokens.join(' ');
  if (devanagariPhrase !== q) {
    variants.add(devanagariPhrase);
  }

  // 5. Devanagari to Romanized translation of tokens
  const romanTokens = words.map(w => HINDI_TO_ROMAN_MAP[w] || w);
  const romanPhrase = romanTokens.join(' ');
  if (romanPhrase !== q) {
    variants.add(romanPhrase);
  }

  return Array.from(variants);
}

/**
 * Detect query intent:
 * - artist: searching specifically for an artist
 * - lyrics: searching with lyric fragments
 * - title_artist: song title + artist name
 * - mood_genre: romantic, sad, party, sufi, 90s, retro, acoustic
 * - title: song title
 */
function detectQueryIntent(rawQuery) {
  const q = normalizeSearchText(rawQuery);
  const words = q.split(/\s+/).filter(Boolean);

  // Check Mood & Genre
  const MOOD_REGEX = /\b(romantic|love songs?|sad songs?|breakup|party|dance hits?|retro|classics?|90s|cassette|sufi|acoustic|chill|unplugged|mashup|lofi|remix)\b/i;
  if (MOOD_REGEX.test(q)) {
    return { type: 'mood_genre', genre: q.match(MOOD_REGEX)[0] };
  }

  // Check Artist Match
  if (SUPERSTARS_REGEX.test(q)) {
    // If the entire query is basically the artist's name
    const cleanQ = q.replace(/songs?|hits?|all songs?|music/gi, '').trim();
    if (SUPERSTARS_REGEX.test(cleanQ) && words.length <= 4) {
      return { type: 'artist', artist: cleanQ };
    }
    return { type: 'title_artist', query: q };
  }

  // Check Lyrics Match: multi-word phrases with common lyric tokens
  const LYRIC_SIGNALS = /\b(tere|bina|jeena|ankhiyan|de|samne|tu|tum|hi|ho|we found love|hopeless place|unke|alfaaz|nazar|dhadkan|barsaat|khwaab|rooh|saanson|chahat|fitoor|parvardigara|dilbar|pehli nazar|tujhe dekha to|kabira)\b/i;
  if (words.length >= 3 && LYRIC_SIGNALS.test(q)) {
    return { type: 'lyrics', phrase: q };
  }

  if (words.length >= 4) {
    return { type: 'lyrics', phrase: q };
  }

  return { type: 'title', query: q };
}

/**
 * Load verified and contributed lyrics from disk for fast in-memory indexing
 */
let localLyricsCache = null;
function getLocalLyricsIndex() {
  if (localLyricsCache) return localLyricsCache;
  const list = [];

  try {
    const verifiedPath = path.join(__dirname, '..', 'data', 'verified_lyrics_db.json');
    if (fs.existsSync(verifiedPath)) {
      const db = JSON.parse(fs.readFileSync(verifiedPath, 'utf8'));
      for (const [key, item] of Object.entries(db)) {
        if (item && item.trackName) {
          list.push({
            trackName: item.trackName,
            artistName: item.artistName || '',
            syncedLyrics: item.syncedLyrics || '',
            plainLyrics: item.plainLyrics || ''
          });
        }
      }
    }
  } catch (e) {
    console.warn('[SearchEngine] Could not load verified_lyrics_db:', e.message);
  }

  try {
    const contributedPath = path.join(__dirname, '..', 'data', 'contributed_lyrics.json');
    if (fs.existsSync(contributedPath)) {
      const db = JSON.parse(fs.readFileSync(contributedPath, 'utf8'));
      for (const [key, item] of Object.entries(db)) {
        if (item && item.trackName) {
          list.push({
            trackName: item.trackName,
            artistName: item.artistName || '',
            syncedLyrics: item.syncedLyrics || '',
            plainLyrics: item.plainLyrics || ''
          });
        }
      }
    }
  } catch (e) {
    console.warn('[SearchEngine] Could not load contributed_lyrics:', e.message);
  }

  localLyricsCache = list;
  return localLyricsCache;
}

/**
 * Searches local lyrics index and LRCLIB for lyric phrase matches
 */
async function searchLyrics(query) {
  const normQ = normalizeSearchText(query);
  if (!normQ || normQ.length < 3) return [];

  const cacheKey = `lyrics_${normQ}`;
  const cached = lyricsSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const results = [];
  const seenTracks = new Set();
  const qWords = normQ.split(/\s+/).filter(Boolean);

  // 1. Check local indexed lyrics
  const localList = getLocalLyricsIndex();
  for (const item of localList) {
    const fullText = normalizeSearchText(`${item.syncedLyrics}\n${item.plainLyrics}`);
    if (!fullText) continue;

    let matchedLine = '';
    // Check if whole phrase matches
    if (fullText.includes(normQ)) {
      const lines = `${item.syncedLyrics}\n${item.plainLyrics}`.split('\n');
      for (const rawLine of lines) {
        const cleanLine = rawLine.replace(/\[\d{2}:\d{2}\.\d{2}\]/g, '').trim();
        if (normalizeSearchText(cleanLine).includes(normQ)) {
          matchedLine = cleanLine;
          break;
        }
      }
    } else if (qWords.length >= 3 && qWords.filter(w => fullText.includes(w)).length >= Math.ceil(qWords.length * 0.75)) {
      const lines = `${item.syncedLyrics}\n${item.plainLyrics}`.split('\n');
      for (const rawLine of lines) {
        const cleanLine = rawLine.replace(/\[\d{2}:\d{2}\.\d{2}\]/g, '').trim();
        const normLine = normalizeSearchText(cleanLine);
        const matchCount = qWords.filter(w => normLine.includes(w)).length;
        if (matchCount >= 2) {
          matchedLine = cleanLine;
          break;
        }
      }
    }

    if (matchedLine) {
      const key = `${item.trackName.toLowerCase()}__${item.artistName.toLowerCase()}`;
      if (!seenTracks.has(key)) {
        seenTracks.add(key);
        results.push({
          title: item.trackName,
          artist: item.artistName,
          matchedLine: matchedLine.slice(0, 120),
          isLyricsMatch: true,
          score: 85000
        });
      }
    }
  }

  // 2. Query LRCLIB search API for universal external lyrics matching
  try {
    const lrclibUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(lrclibUrl, {
      headers: { 'User-Agent': 'MusiSurf/2.0 (music@musisurf.app)' },
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const track of data.slice(0, 5)) {
          if (!track || !track.name) continue;
          const key = `${track.name.toLowerCase()}__${(track.artistName || '').toLowerCase()}`;
          if (seenTracks.has(key)) continue;

          let matchedLine = '';
          const lyricBody = `${track.syncedLyrics || ''}\n${track.plainLyrics || ''}`;
          const lines = lyricBody.split('\n');
          for (const rawLine of lines) {
            const clean = rawLine.replace(/\[\d{2}:\d{2}\.\d{2}\]/g, '').trim();
            if (clean && (normalizeSearchText(clean).includes(normQ) || qWords.filter(w => normalizeSearchText(clean).includes(w)).length >= 2)) {
              matchedLine = clean;
              break;
            }
          }

          if (!matchedLine && lines.length > 0) {
            matchedLine = lines[0].replace(/\[\d{2}:\d{2}\.\d{2}\]/g, '').trim();
          }

          seenTracks.add(key);
          results.push({
            title: track.name,
            artist: track.artistName || 'Unknown Artist',
            album: track.albumName || '',
            duration: track.duration || 0,
            matchedLine: matchedLine ? matchedLine.slice(0, 120) : normQ,
            isLyricsMatch: true,
            score: 80000
          });
        }
      }
    }
  } catch (e) {
    // Non-blocking network error for external LRCLIB
  }

  lyricsSearchCache.set(cacheKey, { timestamp: Date.now(), data: results });
  return results;
}

/**
 * Multi-Parameter Strict Relevance Scorer implementing 10-Tier Ranking:
 * 1. Exact song title match
 * 2. Song title prefix match
 * 3. Primary artist exact match
 * 4. Title + Artist combined match
 * 5. Exact lyric phrase match
 * 6. Partial lyric match
 * 7. Title contains all query words
 * 8. Artist contains query words
 * 9. Album match
 * 10. Popularity tie-breaker
 *
 * Strict Mashup, Cover & Long-Compilation Penalties applied.
 */
function scoreTrackRelevance(track, rawQuery, matchedLyricsMap = new Map()) {
  if (!track || !track.title) return 0;

  const rawTitle = (track.title || '').trim();
  const rawArtist = (track.artist || '').trim();
  const rawAlbum = (track.album || '').trim();

  // Strip noise from title (e.g. " (From Film)", " (Official Video)")
  const cleanTitle = rawTitle
    .replace(/\s*[\(\[](From\s+.*|With\s+.*|Feat\.?\s+.*|Official\s*Audio|Official\s*Video|Full\s*Song|Original\s*Motion\s*Picture\s*Soundtrack|Soundtrack|Duet|Audio|Video|Lyrics|Remix|Lofi|Slowed|Reverb)[\)\]]/gi, '')
    .replace(/\s*-\s*(From\s+.*|Original\s*Motion\s*Picture\s*Soundtrack|Soundtrack|Full\s*Song)/gi, '')
    .trim();

  const normTitle = normalizeSearchText(rawTitle);
  const normCleanTitle = normalizeSearchText(cleanTitle);
  const normArtist = normalizeSearchText(rawArtist);
  const normAlbum = normalizeSearchText(rawAlbum);

  const queryVariants = expandQueryVariants(rawQuery);
  const primaryNormQ = normalizeSearchText(rawQuery);
  const qWords = primaryNormQ.split(/\s+/).filter(Boolean);

  let bestScore = 0;

  for (const q of queryVariants) {
    if (!q) continue;
    let score = 0;
    const words = q.split(/\s+/).filter(Boolean);

    // 1. EXACT TITLE MATCH (Rank 1: +100,000)
    if (normCleanTitle === q || normTitle === q) {
      score += 100000;
    }
    // 2. TITLE PREFIX MATCH (Rank 2: +80,000)
    else if (normCleanTitle.startsWith(q) || normTitle.startsWith(q)) {
      score += 80000;
    }
    // 3. PRIMARY ARTIST EXACT MATCH (Rank 3: +70,000)
    else if (normArtist === q) {
      score += 70000;
    }
    // 4. TITLE + ARTIST COMBINED MATCH (Rank 4: +65,000)
    else if (words.length >= 2 && (
      (normCleanTitle.includes(words[0]) && normArtist.includes(words[words.length - 1])) ||
      (normArtist.includes(words[0]) && normCleanTitle.includes(words[words.length - 1]))
    )) {
      score += 65000;
    }
    // 5 & 6. LYRICS MATCHES (Rank 5 & 6: +55,000 / +45,000)
    else if (matchedLyricsMap.has(track.id) || track.isLyricsMatch) {
      const isExact = (track.matchedLine || '').toLowerCase().includes(q);
      score += isExact ? 55000 : 45000;
    }
    // 7. TITLE CONTAINS ALL WORDS (Rank 7: +40,000)
    else if (words.every(w => normCleanTitle.includes(w) || normTitle.includes(w))) {
      score += 40000;
    }
    // 8. ARTIST CONTAINS QUERY WORDS (Rank 8: +30,000)
    else if (words.every(w => normArtist.includes(w))) {
      score += 30000;
    }
    // 9. ALBUM MATCH (Rank 9: +20,000)
    else if (normAlbum && normAlbum.includes(q)) {
      score += 20000;
    }
    // Partial word intersection
    else {
      const matched = words.filter(w => normCleanTitle.includes(w) || normTitle.includes(w) || normArtist.includes(w));
      if (matched.length > 0) {
        score += (matched.length / words.length) * 15000;
      }
    }

    if (score > bestScore) {
      bestScore = score;
    }
  }

  // If no relevance was established and not a lyric match, track is completely irrelevant
  if (bestScore === 0) {
    return 0;
  }

  // Superstar & Renowned Hitmakers Priority (+15,000 points)
  if (SUPERSTARS_REGEX.test(rawArtist) || SUPERSTARS_REGEX.test(rawAlbum)) {
    bestScore += 15000;
  }

  // Major Record Label Boost (+8,000 points)
  if (MAJOR_LABELS_REGEX.test(track.label || '') || MAJOR_LABELS_REGEX.test(rawAlbum) || MAJOR_LABELS_REGEX.test(rawArtist)) {
    bestScore += 8000;
  }

  // Popularity scaling based on stream / view counts (capped at +10,000 to never override relevance)
  const plays = track.playCount || track.viewCount || 0;
  if (plays >= 100000000) bestScore += 10000;      // 100M+
  else if (plays >= 20000000) bestScore += 8000;   // 20M+
  else if (plays >= 5000000) bestScore += 6000;    // 5M+
  else if (plays >= 1000000) bestScore += 4000;    // 1M+
  else if (plays >= 200000) bestScore += 2500;     // 200k+
  else if (plays >= 50000) bestScore += 1000;      // 50k+

  // Bonus for direct 320kbps studio audio when scores are competitive
  if (track.hasDirectAudio) {
    bestScore += 2000;
  }

  // Verified artist / official channel
  if (track.isVerified) {
    bestScore += 2000;
  }

  // STRICT PENALTY: Unsolicited Mashup Tracks (-60,000)
  const wantsMashup = /mashup|mash\s*up/i.test(rawQuery);
  const mashupResult = isMashupTrack(track);
  const isMashup = typeof mashupResult === 'boolean' ? mashupResult : Boolean(mashupResult && mashupResult.isMashup);
  if (!wantsMashup && isMashup) {
    bestScore -= 60000;
  }

  // STRICT PENALTY: Unsolicited Covers, Karaoke, Remakes (-50,000)
  const isCover = /cover|karaoke|instrumental|remake|tribute|ringtone|status/i.test(rawTitle);
  const wantsCover = /cover|karaoke|instrumental|remake|tribute|ringtone|status/i.test(rawQuery);
  if (isCover && !wantsCover) {
    bestScore -= 50000;
  }

  // STRICT PENALTY: Compilations / 1-hour loops (> 15 mins) (-40,000)
  const isLong = (track.duration || 0) > 900;
  const wantsLong = /1\s*hour|extended|full album|loop|playlist|jukebox/i.test(rawQuery);
  if (isLong && !wantsLong) {
    bestScore -= 40000;
  }

  return Math.max(0, bestScore);
}

/**
 * Upgrades JioSaavn thumbnail resolution (e.g. 50x50 -> 500x500)
 */
function upgradeThumbnail(url, size = '500x500') {
  if (!url) return '';
  return url.replace(/50x50|150x150/g, size);
}

/**
 * Autocomplete Service: Fetches structured live typeahead suggestions
 */
async function fetchAutocomplete(rawQuery) {
  const q = (rawQuery || '').trim();
  if (!q) {
    return {
      success: true,
      query: '',
      suggestions: { songs: [], artists: [], albums: [], lyricsMatches: [], queries: [] }
    };
  }

  const cacheKey = `ac_${q.toLowerCase()}`;
  const cached = autocompleteCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const intent = detectQueryIntent(q);

  // Parallel fetch: JioSaavn Autocomplete + Lyrics Match
  const [saavnAcRes, lyricsRes] = await Promise.allSettled([
    (async () => {
      const url = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&cc=in&includeMetaTags=1&query=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(3500)
      });
      if (!res.ok) return null;
      return res.json();
    })(),
    searchLyrics(q)
  ]);

  const saavnData = saavnAcRes.status === 'fulfilled' ? saavnAcRes.value : null;
  const lyricsData = lyricsRes.status === 'fulfilled' ? (lyricsRes.value || []) : [];

  const songs = [];
  const artists = [];
  const albums = [];
  const queries = [];

  // 1. Process JioSaavn Autocomplete
  if (saavnData) {
    // Top Query (Could be an artist, album, or song)
    if (saavnData.topquery && saavnData.topquery.data) {
      for (const item of saavnData.topquery.data) {
        if (item.type === 'artist' && !artists.some(a => a.name.toLowerCase() === item.title.toLowerCase())) {
          artists.push({
            id: item.id,
            name: item.title,
            image: upgradeThumbnail(item.image, '150x150'),
            description: item.description || 'Artist',
            type: 'artist'
          });
        }
      }
    }

    // Songs
    if (saavnData.songs && saavnData.songs.data) {
      for (const s of saavnData.songs.data) {
        const more = s.more_info || {};
        songs.push({
          id: s.id,
          title: s.title,
          artist: more.primary_artists || more.singers || s.description || 'Artist',
          album: s.album || '',
          image: upgradeThumbnail(s.image, '150x150'),
          duration: parseInt(more.duration || 0, 10),
          isLyricsMatch: false,
          type: 'song'
        });
      }
    }

    // Artists
    if (saavnData.artists && saavnData.artists.data) {
      for (const a of saavnData.artists.data) {
        if (!artists.some(existing => existing.name.toLowerCase() === a.title.toLowerCase())) {
          artists.push({
            id: a.id,
            name: a.title,
            image: upgradeThumbnail(a.image, '150x150'),
            description: 'Artist',
            type: 'artist'
          });
        }
      }
    }

    // Albums
    if (saavnData.albums && saavnData.albums.data) {
      for (const alb of saavnData.albums.data) {
        const more = alb.more_info || {};
        albums.push({
          id: alb.id,
          title: alb.title,
          artist: more.primary_artists || more.artist || alb.description || 'Album',
          image: upgradeThumbnail(alb.image, '150x150'),
          year: more.year || '',
          type: 'album'
        });
      }
    }
  }

  // 2. Query completions
  queries.push(q);
  if (songs.length > 0 && songs[0].title.toLowerCase() !== q.toLowerCase()) {
    queries.push(songs[0].title);
  }
  if (songs.length > 0 && songs[0].artist) {
    queries.push(`${songs[0].title} ${songs[0].artist.split(',')[0].trim()}`);
  }
  if (artists.length > 0 && artists[0].name.toLowerCase() !== q.toLowerCase()) {
    queries.push(`${artists[0].name} Songs`);
  }

  // 3. Lyrics Matches
  const lyricsMatches = lyricsData.slice(0, 4).map(l => ({
    title: l.title,
    artist: l.artist,
    album: l.album || '',
    matchedLine: l.matchedLine,
    snippet: `“${l.matchedLine}”`,
    isLyricsMatch: true
  }));

  const payload = {
    success: true,
    query: q,
    intent: intent.type,
    suggestions: {
      songs: songs.slice(0, 6),
      artists: artists.slice(0, 3),
      albums: albums.slice(0, 3),
      lyricsMatches,
      queries: Array.from(new Set(queries)).slice(0, 5)
    }
  };

  autocompleteCache.set(cacheKey, { timestamp: Date.now(), data: payload });
  return payload;
}

/**
 * Search Discovery Data for when the search bar is empty and focused
 */
function getDiscoveryData() {
  return {
    success: true,
    trendingSearches: [
      'Arijit Singh',
      'Kesariya',
      'Pasoori',
      'Tu Hai Kahan',
      'Sanam Teri Kasam',
      'Diljit Dosanjh',
      'Coldplay',
      'Shreya Ghoshal',
      'Sidhu Moose Wala',
      'The Weeknd'
    ],
    popularSongs: [
      {
        id: 'kesariya_trending',
        title: 'Kesariya',
        artist: 'Pritam, Arijit Singh',
        image: 'https://c.saavncdn.com/871/Brahmastra-Original-Motion-Picture-Soundtrack-Hindi-2022-20221006155213-500x500.jpg'
      },
      {
        id: 'pasoori_trending',
        title: 'Pasoori',
        artist: 'Ali Sethi, Shae Gill',
        image: 'https://c.saavncdn.com/609/Pasoori-Punjabi-2022-20220207162547-500x500.jpg'
      },
      {
        id: 'channa_trending',
        title: 'Channa Mereya',
        artist: 'Arijit Singh, Pritam',
        image: 'https://c.saavncdn.com/658/Ae-Dil-Hai-Mushkil-Hindi-2016-500x500.jpg'
      },
      {
        id: 'tum_hi_ho_trending',
        title: 'Tum Hi Ho',
        artist: 'Arijit Singh, Mithoon',
        image: 'https://c.saavncdn.com/001/Aashiqui-2-Hindi-2013-500x500.jpg'
      }
    ],
    topArtists: [
      {
        name: 'Arijit Singh',
        image: 'https://c.saavncdn.com/artists/Arijit_Singh_004_20241118063717_500x500.jpg',
        role: 'Artist'
      },
      {
        name: 'Shreya Ghoshal',
        image: 'https://c.saavncdn.com/artists/Shreya_Ghoshal_005_20241118064619_500x500.jpg',
        role: 'Artist'
      },
      {
        name: 'Atif Aslam',
        image: 'https://c.saavncdn.com/artists/Atif_Aslam_004_20241118064937_500x500.jpg',
        role: 'Artist'
      },
      {
        name: 'Diljit Dosanjh',
        image: 'https://c.saavncdn.com/artists/Diljit_Dosanjh_004_20241118064517_500x500.jpg',
        role: 'Artist'
      }
    ]
  };
}

module.exports = {
  normalizeSearchText,
  expandQueryVariants,
  detectQueryIntent,
  levenshteinDistance,
  searchLyrics,
  scoreTrackRelevance,
  fetchAutocomplete,
  getDiscoveryData
};
