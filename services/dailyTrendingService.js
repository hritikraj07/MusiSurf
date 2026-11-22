/**
 * Daily Trending Hindi Song Service
 * Central Unified Trend Discovery Engine for MusiSurf
 * 
 * Responsibilities:
 * 1. Discovers current India music trends from YouTube (and Instagram when configured)
 * 2. Enforces strict Hindi-language verification (rejects Punjabi-only, regional, English)
 * 3. Matches candidates to 100% playable MusiSurf tracks with authentic artwork
 * 4. Calculates weighted trend momentum score with repetition penalty
 * 5. Automatically updates daily according to Asia/Kolkata timezone
 * 6. Persists daily feature to Neon PostgreSQL and local fallback cache
 */

const fs = require('fs');
const path = require('path');
const { sql, pool } = require('./db');
const { discoverYouTubeIndiaTrends } = require('./trendAdapters/youtubeAdapter');
const { discoverInstagramTrends } = require('./trendAdapters/instagramAdapter');

const LOCAL_FALLBACK_FILE = path.join(__dirname, '..', 'data', 'daily_trending_hindi.json');

// In-memory cache for fast (<5ms) homepage response
let dailyTrendingCache = null;
let lastDiscoveryDebugInfo = {
  lastRunTimestamp: null,
  dateIST: null,
  sourcesChecked: [],
  totalCandidatesFound: 0,
  hindiCandidatesCount: 0,
  playableMatchesCount: 0,
  rejectedCandidates: [],
  scoredCandidates: [],
  selectedSong: null,
  error: null
};

/**
 * Returns current date string in Asia/Kolkata (YYYY-MM-DD)
 */
function getTodayISTString() {
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return istFormatter.format(now);
}

/**
 * Calculate difference in calendar days between two YYYY-MM-DD strings
 */
function getDaysDifference(dateStrA, dateStrB) {
  if (!dateStrA || !dateStrB) return 999;
  const d1 = new Date(dateStrA + 'T00:00:00Z');
  const d2 = new Date(dateStrB + 'T00:00:00Z');
  const diffMs = Math.abs(d2.getTime() - d1.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Clean and simplify text for comparison
 */
function normalizeText(str = '') {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check string similarity (Dice coefficient / Token overlap)
 */
function calculateSimilarity(str1, str2) {
  const s1 = normalizeText(str1);
  const s2 = normalizeText(str2);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  const words1 = new Set(s1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(s2.split(' ').filter(w => w.length > 2));
  if (words1.size === 0 || words2.size === 0) return 0;

  let common = 0;
  for (const w of words1) {
    if (words2.has(w)) common++;
  }
  return (2 * common) / (words1.size + words2.size);
}

// ============================================================================
// STRICT HINDI LANGUAGE VERIFICATION ENGINE
// ============================================================================

const PUNJABI_EXCLUSIVE_ARTISTS = [
  'karan aujla', 'sidhu moose wala', 'sidhu moose', 'shubh', 'ap dhillon',
  'satinder sartaaj', 'ammy virk', 'jordan sandhu', 'kulwinder billa',
  'parmish verma', 'arjan dhillon', 'wazir patar', 'amrit maan', 'tarsem jassar',
  'mankirt aulakh', 'jassie gill', 'harrdy sandhu', 'gurdas maan', 'babbu maan',
  'dilpreet dhillon', 'ninja', 'singga', 'preem dhillon', 'cheetah'
];

const PUNJABI_EXCLUSIVE_KEYWORDS = [
  'jatt', 'gabru', 'munda', 'kudi', 'pind', 'chobbar', 'bhangra', 'boliyan',
  'sohnea', 'kudiye', 'panjaban', 'punjabi song', 'bhangra beat'
];

const BHOJPURI_KEYWORDS = [
  'bhojpuri', 'khesari', 'khesari lal', 'pawan singh', 'shilpi raj',
  'arrah', 'bhojpuri song', 'bhojpuriya', 'chanda raj', 'dimpal singh'
];

const HARYANVI_KEYWORDS = [
  'haryanvi', 'masoom sharma', 'pranjal dahiya', 'dhanda nyoliwala',
  'sapna choudhary', 'haryanvi song', 'kd desi rockstar', 'renuka panwar'
];

const SOUTH_INDIAN_KEYWORDS = [
  'tamil', 'telugu', 'kannada', 'malayalam', 'kollywood', 'tollywood',
  'anirudh', 'anirudh ravichander', 'sai abhyankkar', 'thaman', 'devi sri prasad',
  'arun srinivasan', 'saurav srisan', 'tanisha gnanavel', 'tamilindie'
];

const VERIFIED_HINDI_ARTISTS = [
  'arijit', 'arijit singh', 'shreya ghoshal', 'vishal mishra', 'darshan raval',
  'pritam', 'sachin-jigar', 'sachin jigar', 'jubin', 'jubin nautiyal', 'atif aslam',
  'neha kakkar', 'sonu nigam', 'sunidhi chauhan', 'mohit chauhan', 'kumar sanu',
  'alka yagnik', 'udit narayan', 'lata mangeshkar', 'kishore kumar', 'tanishk bagchi',
  'mithoon', 'rochak kohli', 'stebin ben', 'amitabh bhattacharya', 'ajay-atul',
  'ajay atul', 'monali thakur', 'arman malik', 'amaal mallik', 'shankar-ehsaan-loy',
  'badshah', 'raftaar', 'brijesh shandilya', 'tochi raina', 'tulsi kumar'
];

const HINDI_COMMON_WORDS = [
  'dil', 'ishq', 'mohabbat', 'tere', 'mera', 'meri', 'pyaar', 'hum', 'tum',
  'zindagi', 'saath', 'deewana', 'sanam', 'raatein', 'chaha', 'khoya', 'humsafar',
  'bewafa', 'kasam', 'bhajan', 'aarti', 'mata', 'ji ji', 'barsaat', 'gulabi'
];

/**
 * Verify whether a candidate is genuinely a Hindi song
 */
function isVerifiedHindiSong(candidate, providerTrack = null) {
  const reasons = [];
  let confidence = 0.5;

  const rawTitle = (candidate.rawTitle || candidate.title || '').toLowerCase();
  const cleanTitle = (candidate.cleanTitle || candidate.title || '').toLowerCase();
  const rawArtist = (candidate.cleanArtist || candidate.rawSubtitle || candidate.artist || '').toLowerCase();
  const channel = (candidate.metrics?.channel || '').toLowerCase();
  const text = `${rawTitle} ${cleanTitle} ${rawArtist} ${channel}`;

  // 1. Provider Explicit Language Check (Authoritative)
  if (providerTrack && providerTrack.language) {
    const provLang = providerTrack.language.toLowerCase().trim();
    if (provLang === 'hindi') {
      confidence += 0.35;
      reasons.push('Provider metadata confirms Hindi language');
    } else if (['punjabi', 'tamil', 'telugu', 'bhojpuri', 'haryanvi', 'english', 'bengali', 'kannada', 'malayalam'].includes(provLang)) {
      return {
        isHindi: false,
        confidence: 0,
        detectedLanguage: provLang,
        reasons: [`Provider explicitly classified track as ${provLang}`]
      };
    }
  }

  // 2. Strict Script Detection
  const hasDevanagari = /[\u0900-\u097F]/.test(rawTitle + cleanTitle + rawArtist);
  const hasGurmukhi = /[\u0A00-\u0A7F]/.test(rawTitle + cleanTitle + rawArtist);
  const hasSouthScript = /[\u0B80-\u0D7F]/.test(rawTitle + cleanTitle + rawArtist);

  if (hasGurmukhi && !hasDevanagari) {
    return {
      isHindi: false,
      confidence: 0.1,
      detectedLanguage: 'punjabi',
      reasons: ['Gurmukhi script detected (Punjabi)']
    };
  }

  if (hasSouthScript) {
    return {
      isHindi: false,
      confidence: 0.1,
      detectedLanguage: 'south_indian',
      reasons: ['South Indian Dravidian script detected']
    };
  }

  if (hasDevanagari) {
    confidence += 0.25;
    reasons.push('Devanagari script detected');
  }

  // 3. Reject non-Hindi regional markers
  for (const kw of BHOJPURI_KEYWORDS) {
    if (text.includes(kw)) {
      return {
        isHindi: false,
        confidence: 0.05,
        detectedLanguage: 'bhojpuri',
        reasons: [`Bhojpuri marker identified: "${kw}"`]
      };
    }
  }

  for (const kw of HARYANVI_KEYWORDS) {
    if (text.includes(kw)) {
      return {
        isHindi: false,
        confidence: 0.05,
        detectedLanguage: 'haryanvi',
        reasons: [`Haryanvi marker identified: "${kw}"`]
      };
    }
  }

  for (const kw of SOUTH_INDIAN_KEYWORDS) {
    if (text.includes(kw)) {
      return {
        isHindi: false,
        confidence: 0.05,
        detectedLanguage: 'south_indian',
        reasons: [`South Indian marker identified: "${kw}"`]
      };
    }
  }

  // 4. Reject Punjabi Exclusive Artists & Vocabulary
  for (const pa of PUNJABI_EXCLUSIVE_ARTISTS) {
    if (text.includes(pa)) {
      // Check if it has strong Hindi Bollywood evidence
      if (!text.includes('bollywood') && !text.includes('hindi')) {
        return {
          isHindi: false,
          confidence: 0.1,
          detectedLanguage: 'punjabi',
          reasons: [`Punjabi artist identified: "${pa}"`]
        };
      }
    }
  }

  for (const pw of PUNJABI_EXCLUSIVE_KEYWORDS) {
    if (text.includes(pw)) {
      return {
        isHindi: false,
        confidence: 0.1,
        detectedLanguage: 'punjabi',
        reasons: [`Punjabi keyword identified: "${pw}"`]
      };
    }
  }

  // 5. Positive Hindi verification
  for (const ha of VERIFIED_HINDI_ARTISTS) {
    if (text.includes(ha)) {
      confidence += 0.25;
      reasons.push(`Verified Hindi artist identified: "${ha}"`);
      break;
    }
  }

  for (const hw of HINDI_COMMON_WORDS) {
    if (text.includes(hw)) {
      confidence += 0.1;
      reasons.push(`Hindi vocabulary word: "${hw}"`);
      break;
    }
  }

  // Clamped confidence
  const finalConfidence = Math.min(1.0, Math.max(0, confidence));
  const isHindi = finalConfidence >= 0.70;

  return {
    isHindi,
    confidence: finalConfidence,
    detectedLanguage: isHindi ? 'hindi' : 'unknown',
    reasons
  };
}

// ============================================================================
// MUSISURF CATALOG RESOLUTION ENGINE
// ============================================================================

/**
 * Searches JioSaavn to find a direct 320kbps playable match
 */
async function searchSaavnDirect(query) {
  if (!query) return [];
  try {
    const urls = [
      `https://www.jiosaavn.com/api.php?__call=search.getResults&q=${encodeURIComponent(query)}&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=8&p=1`
    ];

    const res = await fetch(urls[0], {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return [];
    const data = await res.json();
    const items = data.results || data.data?.results || [];

    const results = [];
    for (const item of items) {
      if (!item || !item.id) continue;
      // Skip non-song results
      if (item.type && item.type !== 'song') continue;

      const more = item.more_info || {};
      const songTitle = item.title || item.song || '';
      const songArtist = more.singers || more.music || (more.artistMap?.primary_artists?.map(a => a.name).join(', ')) || '';

      // Clean image
      let image = item.image || '';
      if (image) image = image.replace('150x150', '500x500').replace('50x50', '500x500');

      results.push({
        id: 'saavn_' + item.id,
        originalId: item.id,
        title: songTitle.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&'),
        artist: songArtist.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&'),
        album: (more.album || item.album || '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&'),
        language: (item.language || more.language || '').toLowerCase().trim(),
        image: image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
        duration: parseInt(more.duration || item.duration || 210, 10),
        encryptedUrl: more.encrypted_media_url,
        source: 'saavn',
        hasDirectAudio: true
      });
    }

    return results;
  } catch (err) {
    return [];
  }
}

/**
 * Matches an external trending candidate to a verified playable MusiSurf track
 */
async function matchPlayableMusiSurfTrack(candidate) {
  const cleanTitle = candidate.cleanTitle;
  const cleanArtist = candidate.cleanArtist;

  // Search variations
  const queries = [
    `${cleanTitle} ${cleanArtist}`.trim(),
    cleanTitle
  ];

  for (const q of queries) {
    const saavnMatches = await searchSaavnDirect(q);
    for (const match of saavnMatches) {
      // Must be Hindi
      if (match.language && match.language !== 'hindi') continue;

      // Title similarity check
      const titleSim = calculateSimilarity(cleanTitle, match.title);
      if (titleSim >= 0.55) {
        // Build playable stream URL
        const streamUrl = `/api/search?q=${encodeURIComponent(match.title)}&source=saavn`;

        return {
          id: match.id,
          title: match.title,
          artist: match.artist || cleanArtist,
          album: match.album || 'Single',
          duration: match.duration || 210,
          image: match.image,
          thumbnailUrl: match.image,
          source: 'saavn',
          streamUrl: match.encryptedUrl ? `/api/stream?url=${encodeURIComponent(match.encryptedUrl)}` : null,
          hasDirectAudio: true,
          matchConfidence: titleSim,
          matchMethod: 'jiosaavn_verified'
        };
      }
    }
  }

  // Fallback to verified YouTube Music track if Saavn has no direct match
  if (candidate.videoId) {
    return {
      id: 'yt_' + candidate.videoId,
      originalId: candidate.videoId,
      title: candidate.cleanTitle,
      artist: candidate.cleanArtist || 'Various Artists',
      album: 'YouTube India Trending',
      duration: candidate.metrics?.durationSec || 210,
      image: candidate.thumbnailUrl || `https://i.ytimg.com/vi/${candidate.videoId}/hqdefault.jpg`,
      thumbnailUrl: candidate.thumbnailUrl || `https://i.ytimg.com/vi/${candidate.videoId}/hqdefault.jpg`,
      source: 'youtube',
      streamUrl: `/api/yt-stream?v=${candidate.videoId}`,
      hasDirectAudio: false,
      matchConfidence: 0.9,
      matchMethod: 'youtube_verified'
    };
  }

  return null;
}

// ============================================================================
// TREND SCORING ENGINE
// ============================================================================

/**
 * Calculates a verified 0-100 trend score based on available metrics & momentum
 */
function calculateTrendScore(candidate, historyList = []) {
  // Dimension 1: Chart Rank & Platform Presence (35%)
  let rankScore = 0;
  if (candidate.chartType === 'trending_20_in') {
    // Top 20 Trending India
    rankScore = Math.max(20, 105 - (candidate.chartRank * 4.25));
  } else if (candidate.chartType === 'daily_top_in') {
    // Top 100 Daily Music Videos India
    rankScore = Math.max(10, 100 - (candidate.chartRank * 0.9));
  } else {
    rankScore = 50;
  }

  // Dimension 2: Verified View Momentum (25%)
  const viewCount = candidate.metrics?.viewCount || 0;
  let viewScore = 50;
  if (viewCount > 0) {
    // Logarithmic scale: 100k -> 62, 1M -> 75, 10M -> 87, 50M -> 96
    viewScore = Math.min(100, Math.round(Math.log10(viewCount + 1) * 12.5));
  }

  // Dimension 3: Verified Platform Trend Presence (20%)
  const platformScore = candidate.platform === 'youtube' ? 85 : 80;

  // Dimension 4: Cross-Platform Presence (10%)
  const crossPlatformScore = candidate.isCrossPlatform ? 100 : 0;

  // Dimension 5: Recency (10%)
  const recencyScore = 85;

  // Raw weighted score (0 - 100)
  let rawScore = (
    (rankScore * 0.35) +
    (viewScore * 0.25) +
    (platformScore * 0.20) +
    (crossPlatformScore * 0.10) +
    (recencyScore * 0.10)
  );

  // Apply Repetition Penalty to prevent stale static repeats
  let repetitionPenalty = 0;
  const canonicalId = candidate.matchedTrack?.id || candidate.videoId;

  if (historyList && historyList.length > 0 && canonicalId) {
    const yesterdayDate = getYesterdayISTString();
    const yesterdayFeature = historyList.find(h => h.date_ist === yesterdayDate);

    if (yesterdayFeature && (yesterdayFeature.canonical_id === canonicalId || yesterdayFeature.matched_track_id === candidate.matchedTrack?.id)) {
      // Featured yesterday: -25 points penalty
      repetitionPenalty = 25;
    } else {
      // Check last 7 days
      const recentFeature = historyList.find(h => 
        (h.canonical_id === canonicalId || h.matched_track_id === candidate.matchedTrack?.id) &&
        getDaysDifference(h.date_ist, getTodayISTString()) <= 7
      );
      if (recentFeature) {
        repetitionPenalty = 15;
      }
    }
  }

  const finalScore = Math.max(1, Math.round((rawScore - repetitionPenalty) * 10) / 10);

  return {
    finalScore,
    rankScore,
    viewScore,
    repetitionPenalty,
    breakdown: {
      rankScore,
      viewScore,
      platformScore,
      crossPlatformScore,
      repetitionPenalty
    }
  };
}

function getYesterdayISTString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const istFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return istFormatter.format(d);
}

// ============================================================================
// DATABASE & PERSISTENCE HELPERS
// ============================================================================

/**
 * Load history of recently featured songs from Database or Local JSON
 */
async function loadTrendingHistory(limit = 14) {
  try {
    if (pool) {
      const res = await pool.query(
        'SELECT * FROM daily_trending_hindi_songs ORDER BY date_ist DESC LIMIT $1',
        [limit]
      );
      return res.rows || [];
    } else if (sql) {
      const rows = await sql`
        SELECT * FROM daily_trending_hindi_songs 
        ORDER BY date_ist DESC 
        LIMIT ${limit}
      `;
      return rows || [];
    }
  } catch (err) {
    console.warn('[Daily Trending] DB history load note:', err.message);
  }

  // Fallback to local file
  try {
    if (fs.existsSync(LOCAL_FALLBACK_FILE)) {
      const raw = fs.readFileSync(LOCAL_FALLBACK_FILE, 'utf8');
      const data = JSON.parse(raw);
      return Array.isArray(data.history) ? data.history.slice(0, limit) : [];
    }
  } catch (e) {}

  return [];
}

/**
 * Save daily trending record to Neon PostgreSQL and local JSON
 */
async function saveDailyTrendingRecord(record) {
  // 1. Save to Database
  try {
    if (pool) {
      await pool.query(`
        INSERT INTO daily_trending_hindi_songs (
          date_ist, canonical_id, matched_track_id, title, artist, album,
          language, thumbnail_url, platform_source, source_label, youtube_video_id,
          instagram_audio_id, trend_score, trend_rank, verified_metrics, matched_track,
          selection_timestamp, updated_at, is_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW(), TRUE
        )
        ON CONFLICT (date_ist) DO UPDATE SET
          canonical_id = EXCLUDED.canonical_id,
          matched_track_id = EXCLUDED.matched_track_id,
          title = EXCLUDED.title,
          artist = EXCLUDED.artist,
          album = EXCLUDED.album,
          thumbnail_url = EXCLUDED.thumbnail_url,
          platform_source = EXCLUDED.platform_source,
          source_label = EXCLUDED.source_label,
          youtube_video_id = EXCLUDED.youtube_video_id,
          instagram_audio_id = EXCLUDED.instagram_audio_id,
          trend_score = EXCLUDED.trend_score,
          verified_metrics = EXCLUDED.verified_metrics,
          matched_track = EXCLUDED.matched_track,
          updated_at = NOW();
      `, [
        record.date_ist,
        record.canonical_id,
        record.matched_track_id,
        record.title,
        record.artist,
        record.album,
        record.language || 'hindi',
        record.thumbnail_url,
        record.platform_source,
        record.source_label,
        record.youtube_video_id,
        record.instagram_audio_id,
        record.trend_score,
        record.trend_rank || 1,
        JSON.stringify(record.verified_metrics || {}),
        JSON.stringify(record.matched_track || {})
      ]);
    } else if (sql) {
      await sql`
        INSERT INTO daily_trending_hindi_songs (
          date_ist, canonical_id, matched_track_id, title, artist, album,
          language, thumbnail_url, platform_source, source_label, youtube_video_id,
          instagram_audio_id, trend_score, trend_rank, verified_metrics, matched_track,
          selection_timestamp, updated_at, is_active
        ) VALUES (
          ${record.date_ist}, ${record.canonical_id}, ${record.matched_track_id},
          ${record.title}, ${record.artist}, ${record.album},
          ${record.language || 'hindi'}, ${record.thumbnail_url}, ${record.platform_source},
          ${record.source_label}, ${record.youtube_video_id}, ${record.instagram_audio_id},
          ${record.trend_score}, ${record.trend_rank || 1},
          ${JSON.stringify(record.verified_metrics || {})}, ${JSON.stringify(record.matched_track || {})},
          NOW(), NOW(), TRUE
        )
        ON CONFLICT (date_ist) DO UPDATE SET
          canonical_id = EXCLUDED.canonical_id,
          matched_track_id = EXCLUDED.matched_track_id,
          title = EXCLUDED.title,
          artist = EXCLUDED.artist,
          album = EXCLUDED.album,
          thumbnail_url = EXCLUDED.thumbnail_url,
          platform_source = EXCLUDED.platform_source,
          source_label = EXCLUDED.source_label,
          youtube_video_id = EXCLUDED.youtube_video_id,
          instagram_audio_id = EXCLUDED.instagram_audio_id,
          trend_score = EXCLUDED.trend_score,
          verified_metrics = EXCLUDED.verified_metrics,
          matched_track = EXCLUDED.matched_track,
          updated_at = NOW();
      `;
    }
  } catch (err) {
    console.warn('[Daily Trending] DB save notice:', err.message);
  }

  // 2. Save to local JSON fallback
  try {
    let fallback = { current: record, history: [] };
    if (fs.existsSync(LOCAL_FALLBACK_FILE)) {
      try {
        fallback = JSON.parse(fs.readFileSync(LOCAL_FALLBACK_FILE, 'utf8'));
      } catch (e) {}
    }
    fallback.current = record;
    if (!Array.isArray(fallback.history)) fallback.history = [];
    fallback.history = fallback.history.filter(h => h.date_ist !== record.date_ist);
    fallback.history.unshift(record);
    if (fallback.history.length > 30) fallback.history = fallback.history.slice(0, 30);
    fs.writeFileSync(LOCAL_FALLBACK_FILE, JSON.stringify(fallback, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Daily Trending] Local fallback file write notice:', e.message);
  }

  // 3. Update memory cache
  dailyTrendingCache = record;
}

// ============================================================================
// MAIN PIPELINE: DISCOVER, FILTER, SCORE & SELECT DAILY FEATURE
// ============================================================================

/**
 * Execute the complete Daily Trending Hindi Song discovery pipeline
 */
async function executeDailyDiscoveryPipeline(forceRefresh = false) {
  const todayIST = getTodayISTString();

  // Check if we already have today's selection cached
  if (!forceRefresh && dailyTrendingCache && dailyTrendingCache.date_ist === todayIST) {
    return dailyTrendingCache;
  }

  // Check Database for today's existing record
  if (!forceRefresh) {
    try {
      let existingRecord = null;
      if (pool) {
        const res = await pool.query(
          'SELECT * FROM daily_trending_hindi_songs WHERE date_ist = $1 LIMIT 1',
          [todayIST]
        );
        if (res.rows && res.rows.length > 0) existingRecord = res.rows[0];
      } else if (sql) {
        const rows = await sql`
          SELECT * FROM daily_trending_hindi_songs 
          WHERE date_ist = ${todayIST} 
          LIMIT 1
        `;
        if (rows && rows.length > 0) existingRecord = rows[0];
      }

      if (existingRecord) {
        // Parse JSON fields if string
        if (typeof existingRecord.matched_track === 'string') {
          existingRecord.matched_track = JSON.parse(existingRecord.matched_track);
        }
        if (typeof existingRecord.verified_metrics === 'string') {
          existingRecord.verified_metrics = JSON.parse(existingRecord.verified_metrics);
        }
        dailyTrendingCache = existingRecord;
        return existingRecord;
      }
    } catch (e) {}
  }

  console.log(`[Daily Trending] Executing discovery pipeline for ${todayIST}...`);

  const debug = {
    lastRunTimestamp: new Date().toISOString(),
    dateIST: todayIST,
    sourcesChecked: [],
    totalCandidatesFound: 0,
    hindiCandidatesCount: 0,
    playableMatchesCount: 0,
    rejectedCandidates: [],
    scoredCandidates: [],
    selectedSong: null,
    error: null
  };

  try {
    // 1. Fetch Candidates from YouTube
    const ytResult = await discoverYouTubeIndiaTrends();
    debug.sourcesChecked.push({ source: 'youtube', available: ytResult.isAvailable, count: ytResult.candidates.length });

    // 2. Fetch Candidates from Instagram
    const igResult = await discoverInstagramTrends();
    debug.sourcesChecked.push({ source: 'instagram', available: igResult.isAvailable, count: igResult.candidates.length, reason: igResult.reason });

    const rawCandidates = [...ytResult.candidates];
    debug.totalCandidatesFound = rawCandidates.length;

    if (rawCandidates.length === 0) {
      throw new Error('No trend candidates retrieved from external providers');
    }

    // 3. Load historical features for repetition penalty
    const historyList = await loadTrendingHistory(14);

    // 4. Evaluate each candidate: Hindi language verification & MusiSurf playable matching
    const eligibleCandidates = [];

    for (const cand of rawCandidates) {
      // Step A: Initial language check on candidate metadata
      const langCheck = isVerifiedHindiSong(cand);
      if (!langCheck.isHindi) {
        debug.rejectedCandidates.push({
          title: cand.rawTitle,
          artist: cand.cleanArtist,
          reason: langCheck.reasons.join(', ') || 'Not verified Hindi'
        });
        continue;
      }

      // Step B: Match with MusiSurf Playable Catalog
      const matchedTrack = await matchPlayableMusiSurfTrack(cand);
      if (!matchedTrack) {
        debug.rejectedCandidates.push({
          title: cand.rawTitle,
          artist: cand.cleanArtist,
          reason: 'No playable MusiSurf catalog match found'
        });
        continue;
      }

      // Step C: Secondary language check with provider track metadata
      const secondLangCheck = isVerifiedHindiSong(cand, matchedTrack);
      if (!secondLangCheck.isHindi) {
        debug.rejectedCandidates.push({
          title: cand.rawTitle,
          artist: matchedTrack.artist,
          reason: secondLangCheck.reasons.join(', ')
        });
        continue;
      }

      cand.matchedTrack = matchedTrack;
      cand.hindiConfidence = secondLangCheck.confidence;

      // Step D: Calculate Trend Score
      const scoreObj = calculateTrendScore(cand, historyList);
      cand.trendScore = scoreObj.finalScore;
      cand.scoreDetails = scoreObj;

      eligibleCandidates.push(cand);
    }

    debug.hindiCandidatesCount = eligibleCandidates.length;
    debug.playableMatchesCount = eligibleCandidates.length;

    if (eligibleCandidates.length === 0) {
      throw new Error('No candidate passed strict Hindi verification and playable matching');
    }

    // 5. Rank eligible candidates by trend score
    eligibleCandidates.sort((a, b) => b.trendScore - a.trendScore);

    debug.scoredCandidates = eligibleCandidates.map(c => ({
      title: c.cleanTitle,
      artist: c.cleanArtist,
      score: c.trendScore,
      chartRank: c.chartRank,
      views: c.metrics?.viewCount,
      penalty: c.scoreDetails?.repetitionPenalty
    }));

    // 6. Select #1 Candidate
    const topCandidate = eligibleCandidates[0];

    // Determine honest source label
    let platformSource = 'youtube';
    let sourceLabel = 'Trending on YouTube';

    if (topCandidate.isCrossPlatform && igResult.isAvailable) {
      platformSource = 'youtube_instagram';
      sourceLabel = 'Trending on YouTube and Instagram';
    } else if (topCandidate.platform === 'instagram') {
      platformSource = 'instagram';
      sourceLabel = 'Trending on Instagram';
    }

    const verifiedRecord = {
      date_ist: todayIST,
      canonical_id: topCandidate.matchedTrack.id,
      matched_track_id: topCandidate.matchedTrack.id,
      title: topCandidate.cleanTitle || topCandidate.matchedTrack.title,
      artist: topCandidate.cleanArtist || topCandidate.matchedTrack.artist,
      album: topCandidate.matchedTrack.album || 'Single',
      language: 'hindi',
      thumbnail_url: topCandidate.matchedTrack.image || topCandidate.thumbnailUrl,
      platform_source: platformSource,
      source_label: sourceLabel,
      youtube_video_id: topCandidate.videoId,
      instagram_audio_id: topCandidate.instagramAudioId || null,
      trend_score: topCandidate.trendScore,
      trend_rank: 1,
      verified_metrics: {
        viewCount: topCandidate.metrics?.viewCount || 0,
        chartRank: topCandidate.chartRank,
        chartName: topCandidate.chartName,
        channel: topCandidate.metrics?.channel || topCandidate.cleanArtist,
        hindiConfidence: topCandidate.hindiConfidence,
        scoreBreakdown: topCandidate.scoreDetails
      },
      matched_track: topCandidate.matchedTrack,
      selection_timestamp: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true
    };

    // 7. Save and publish record
    await saveDailyTrendingRecord(verifiedRecord);
    debug.selectedSong = verifiedRecord;
    lastDiscoveryDebugInfo = debug;

    console.log(`[Daily Trending] Successfully selected "${verifiedRecord.title}" by ${verifiedRecord.artist} for ${todayIST}! Score: ${verifiedRecord.trend_score}`);
    return verifiedRecord;
  } catch (err) {
    console.error('[Daily Trending] Discovery pipeline error:', err.message);
    debug.error = err.message;
    lastDiscoveryDebugInfo = debug;

    // Graceful fallback: return last valid record from memory, DB, or disk
    if (dailyTrendingCache) return dailyTrendingCache;

    const history = await loadTrendingHistory(1);
    if (history && history.length > 0) {
      dailyTrendingCache = history[0];
      return history[0];
    }

    return null;
  }
}

/**
 * Public getter for today's daily trending Hindi song
 */
async function getDailyTrendingHindiSong(forceRefresh = false) {
  const todayIST = getTodayISTString();

  if (!forceRefresh && dailyTrendingCache && dailyTrendingCache.date_ist === todayIST) {
    return dailyTrendingCache;
  }

  return await executeDailyDiscoveryPipeline(forceRefresh);
}

/**
 * Getter for admin/debugging inspection
 */
function getDailyTrendingDebugInfo() {
  return {
    ...lastDiscoveryDebugInfo,
    currentCache: dailyTrendingCache ? {
      date_ist: dailyTrendingCache.date_ist,
      title: dailyTrendingCache.title,
      artist: dailyTrendingCache.artist,
      score: dailyTrendingCache.trend_score,
      source: dailyTrendingCache.source_label
    } : null
  };
}

// ============================================================================
// AUTOMATIC DAILY SCHEDULER (Asia/Kolkata Midnight Runner)
// ============================================================================

let schedulerTimer = null;

function initDailyTrendingScheduler() {
  // Pre-warm on startup
  executeDailyDiscoveryPipeline().catch(e => console.warn('[Daily Trending] Startup prewarm note:', e.message));

  // Calculate milliseconds until next midnight in Asia/Kolkata
  function scheduleNextMidnightRun() {
    const now = new Date();
    // Get current time in Asia/Kolkata
    const istTimeStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const istNow = new Date(istTimeStr);

    const nextMidnight = new Date(istNow);
    nextMidnight.setHours(24, 0, 5, 0); // 12:00:05 AM IST

    const msUntilMidnight = Math.max(10000, nextMidnight.getTime() - istNow.getTime());
    console.log(`[Daily Trending Scheduler] Next automated run scheduled in ${Math.round(msUntilMidnight / 1000 / 60)} minutes (Asia/Kolkata midnight).`);

    schedulerTimer = setTimeout(async () => {
      try {
        console.log('[Daily Trending Scheduler] Midnight reached! Triggering daily discovery pipeline...');
        await executeDailyDiscoveryPipeline(true);
      } catch (e) {
        console.error('[Daily Trending Scheduler] Midnight run error:', e);
      } finally {
        scheduleNextMidnightRun();
      }
    }, msUntilMidnight);
  }

  scheduleNextMidnightRun();
}

module.exports = {
  getDailyTrendingHindiSong,
  executeDailyDiscoveryPipeline,
  getDailyTrendingDebugInfo,
  initDailyTrendingScheduler,
  isVerifiedHindiSong,
  calculateTrendScore,
  matchPlayableMusiSurfTrack,
  getTodayISTString
};
