require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const CryptoJS = require('crypto-js');
const { transliterateTextToDevanagari, detectLyricsLanguage } = require('./scripts/lyrics_transliteration');
const lyricsDiscoveryEngine = require('./scripts/lyrics_discovery_engine');
const { cleanTrackTitle, extractArtists, extractSongVersion, computeLyricsMatchScore, validateLrcTimestamps } = require('./scripts/lyrics_matcher');
const { analyzeTrackSilence } = require('./scripts/silence_detector');
const { isMashupTrack, isEligibleForRecommendation } = require('./scripts/mashup_detector');
const { getCanonicalTrackId, getTrackFingerprint, areTracksIdentical, extractPrimaryArtist, normalizeString } = require('./scripts/canonical_track');
const searchEngine = require('./scripts/search_engine');
const { requireAuth, optionalAuth, getAuthenticatedUser } = require('./services/auth');
const libraryService = require('./services/library');

const app = express();
const PORT = process.env.PORT || 3000;

// Lazy-loaded YouTube audio stream extractor for serverless safety
let ytdlInstance = null;
async function getYtdl() {
  if (ytdlInstance) return ytdlInstance;
  try {
    const { Ytdl } = await import('@distube/ytdl-core');
    ytdlInstance = new Ytdl();
    return ytdlInstance;
  } catch (err) {
    console.warn('ytdl dynamic load note:', err.message);
    return null;
  }
}

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Google Search Console Site Ownership Verification File
app.get('/google8877bb5a6dba28c3.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send('google-site-verification: google8877bb5a6dba28c3.html');
});

// Legal Pages (Privacy Policy & Terms of Service for Google OAuth & Public Compliance)
app.get(['/privacy', '/privacy-policy', '/privacy.html'], (req, res) => {
  const filePath = path.resolve(__dirname, 'public', 'privacy.html');
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      try {
        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.status(200).send(fs.readFileSync(filePath, 'utf8'));
        }
      } catch (e) {}
      res.status(404).send('Privacy Policy not found');
    }
  });
});

app.get(['/terms', '/terms-of-service', '/terms.html'], (req, res) => {
  const filePath = path.resolve(__dirname, 'public', 'terms.html');
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      try {
        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.status(200).send(fs.readFileSync(filePath, 'utf8'));
        }
      } catch (e) {}
      res.status(404).send('Terms of Service not found');
    }
  });
});

// Helper to decode HTML entities
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&copy;/g, '©');
}

// Helper to decrypt JioSaavn media URLs
function decryptSaavnMediaUrl(enc) {
  if (!enc) return null;
  try {
    const key = CryptoJS.enc.Utf8.parse('38346591');
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(enc) },
      key,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    const url = decrypted.toString(CryptoJS.enc.Utf8);
    if (!url || !url.startsWith('http')) return null;
    // Upgrade to 320kbps AAC
    return url.replace('_96.mp4', '_320.mp4');
  } catch (err) {
    console.error('DES decrypt error:', err.message);
    return null;
  }
}

// Format seconds into MM:SS
function formatDuration(sec) {
  const s = parseInt(sec, 10);
  if (isNaN(s) || s <= 0) return '3:30';
  const mins = Math.floor(s / 60);
  const remainder = s % 60;
  return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
}

// Clean and transform Saavn track data
function transformSaavnSong(item) {
  const more = item.more_info || {};
  const encryptedUrl = more.encrypted_media_url;
  const audioUrl = decryptSaavnMediaUrl(encryptedUrl);

  // Upgrade image resolution to 500x500
  let image = item.image || '';
  if (image) {
    image = image.replace('150x150', '500x500').replace('50x50', '500x500');
  } else {
    image = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
  }

  // Primary artist name
  let artist = '';
  if (more.artistMap && more.artistMap.primary_artists && more.artistMap.primary_artists.length > 0) {
    artist = more.artistMap.primary_artists.map(a => a.name).join(', ');
  } else if (more.music) {
    artist = more.music;
  } else if (more.singers) {
    artist = more.singers;
  } else {
    artist = 'Various Artists';
  }

  const durationSec = parseInt(more.duration || item.duration || 210, 10);
  const playCount = parseInt(item.play_count || more.play_count || 0, 10);
  const isVerified = Boolean(more.artistMap?.primary_artists?.length > 0);
  const label = decodeHtmlEntities(more.label || more.copyright_text || '');

  return {
    id: 'saavn_' + item.id,
    originalId: item.id,
    title: decodeHtmlEntities(item.title || item.song || 'Unknown Title'),
    artist: decodeHtmlEntities(artist),
    album: decodeHtmlEntities(more.album || item.album || 'Single'),
    year: item.year || more.release_date?.substring(0, 4) || '',
    language: (item.language || more.language || '').toLowerCase().trim(),
    image: image,
    audioUrl: audioUrl, // 320kbps direct ad-free audio stream
    streamUrl: audioUrl ? `/api/stream?url=${encodeURIComponent(audioUrl)}` : null,
    duration: durationSec,
    durationStr: formatDuration(durationSec),
    playCount: playCount,
    isVerified: isVerified,
    label: label,
    source: 'saavn',
    hasDirectAudio: true
  };
}

// Search JioSaavn (Prioritizes dedicated song-search engine & general engine in parallel with pagination support)
async function searchSaavn(query, limit = 25, page = 1) {
  if (!query) return [];
  try {
    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const urls = [
      `https://www.jiosaavn.com/api.php?__call=search.getMoreResults&params=${encodeURIComponent(JSON.stringify({ type: 'songs' }))}&query=${encodeURIComponent(query)}&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=${limit}&p=${pageNum}`,
      `https://www.jiosaavn.com/api.php?__call=search.getResults&q=${encodeURIComponent(query)}&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=${limit}&p=${pageNum}`
    ];

    const responses = await Promise.allSettled(urls.map(u => fetch(u, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    })));

    const allItems = [];
    for (const r of responses) {
      if (r.status === 'fulfilled' && r.value.ok) {
        try {
          const data = await r.value.json();
          const items = Array.isArray(data.results) ? data.results :
                        (Array.isArray(data?.data?.results) ? data.data.results : []);
          allItems.push(...items);
        } catch (e) {}
      }
    }

    const seenIds = new Set();
    const uniqueSongs = [];
    for (const item of allItems) {
      if (!item || !item.id || seenIds.has(item.id)) continue;
      // Filter out non-song results (e.g. albums, playlists without direct tracks)
      if (item.type && item.type !== 'song') continue;

      seenIds.add(item.id);
      const transformed = transformSaavnSong(item);
      if (transformed && transformed.audioUrl) {
        const validation = validateMusicContent(transformed);
        if (validation.isMusic) {
          uniqueSongs.push(transformed);
        }
      }
    }

    return uniqueSongs;
  } catch (err) {
    console.error('Saavn search error:', err.message);
    return [];
  }
}

function parseViewCount(viewStr) {
  if (!viewStr) return 0;
  const clean = viewStr.toLowerCase().replace(/views?/g, '').trim();
  if (clean.includes('b')) return parseFloat(clean) * 1e9;
  if (clean.includes('m')) return parseFloat(clean) * 1e6;
  if (clean.includes('k')) return parseFloat(clean) * 1e3;
  const num = parseInt(clean.replace(/,/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

function parseYouTubeMusicTitle(rawTitle, channel) {
  let title = decodeHtmlEntities(rawTitle || 'Unknown Title').trim();
  let artist = decodeHtmlEntities(channel || 'Universal Artist').trim();
  let album = 'Single';

  if (title.includes('|')) {
    const segments = title.split('|').map(s => s.trim()).filter(Boolean);
    if (segments.length >= 2) {
      const part0 = segments[0];
      if (part0.includes(' - ')) {
        const sub = part0.split(' - ').map(s => s.trim());
        title = sub[0];
        album = sub[1];
      } else {
        title = part0;
        album = segments[1];
      }

      if (segments.length >= 4) {
        const last = segments[segments.length - 1];
        const secondLast = segments[segments.length - 2];
        if (secondLast.length + last.length < 50) {
          artist = `${secondLast}, ${last}`;
        } else {
          artist = last;
        }
      } else if (segments.length >= 3) {
        artist = segments[segments.length - 1];
      } else if (segments.length === 2 && !part0.includes(' - ')) {
        artist = segments[1];
      }
    }
  } else if (title.includes(' - ')) {
    const parts = title.split(' - ').map(s => s.trim()).filter(Boolean);
    if (parts.length === 2 && parts[0].length < 35 && parts[1].length < 65) {
      artist = parts[0];
      title = parts[1];
    }
  }

  // Remove common artifacts from title
  title = title
    .replace(/\s*[\(\[](Official\s*(Music\s*)?Video|Music\s*Video|Official\s*Audio|Audio|Lyric\s*Video|Lyrics|Visualizer|HD|4K|HQ|Explicit|Video|Full\s*Song)[\)\]]/gi, '')
    .replace(/\|\s*(HD|4K|HQ|Explicit|Video)/gi, '')
    .trim();

  // Remove duplicate feature tags like "ft. Daft Punk ft. Daft Punk"
  title = title.replace(/(ft\.|feat\.)\s*([^(\[]+?)\s*\1\s*\2/gi, '$1 $2').trim();

  // Clean artist
  artist = artist.replace(/\s*(VEVO|- Topic|Official)$/i, '').trim();

  return { title, artist, album };
}

// Curated regex for global & Indian top superstar artists
const FAMOUS_SUPERSTARS_REGEX = /\b(atif aslam|sachin-jigar|sachin jigar|shreya ghoshal|arijit singh|pritam|a\.?\s*r\.?\s*rahman|rahman|kishore kumar|lata mangeshkar|alka yagnik|kumar sanu|udit narayan|sunidhi chauhan|sonu nigam|badshah|diljit dosanjh|sidhu moose wala|honey singh|yo yo honey singh|anirudh ravichander|anirudh|k\.?k\.?|neha kakkar|jubin nautiyal|mohit chauhan|vishal-shekhar|vishal dadlani|shekhar ravjiani|shankar-ehsaan-loy|amit trivedi|armaan malik|amal mallik|darshan raval|guru randhawa|b praak|jaani|himesh reshammiya|lucky ali|the weeknd|weeknd|taylor swift|ed sheeran|drake|eminem|justin bieber|billie eilish|bruno mars|dua lipa|post malone|rihanna|adele|coldplay|imagine dragons|kendrick lamar|travis scott|ariana grande|beyonce|bts|maroon 5|charlie puth|shawn mendes|selena gomez|katy perry|avicii|david guetta|calvin harris|alan walker|martin garrix|chainsmokers|queen|michael jackson|elvis presley|beatles|linkin park|metallica|green day|nirvana|ac\/dc|bon jovi|hans zimmer)\b/i;

// Curated regex for major official record labels
const MAJOR_LABELS_REGEX = /\b(tips|t-series|sony|zee|yrf|universal|warner|saregama|speed|times music|columbia|interscope|atlantic|def jam|republic|rca|epic|island|geffen)\b/i;

function calculateRelevanceScore(track, query) {
  const normQ = query.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');
  const qWords = normQ.split(/\s+/).filter(Boolean);
  const rawTitle = track.title || '';
  const normTitle = rawTitle.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');
  const normArtist = (track.artist || '').toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');

  // Clean title for comparison (strip "(From ...)", "(Audio)", "(Video)", etc.)
  const cleanTitle = rawTitle
    .replace(/\s*[\(\[](From\s+.*|With\s+.*|Feat\.?\s+.*|Official\s*Audio|Official\s*Video|Full\s*Song|Original\s*Motion\s*Picture\s*Soundtrack|Soundtrack|Duet|Audio|Video|Lyrics|Remix|Lofi|Slowed|Reverb)[\)\]]/gi, '')
    .replace(/\s*-\s*(From\s+.*|Original\s*Motion\s*Picture\s*Soundtrack|Soundtrack|Full\s*Song)/gi, '')
    .trim();
  const normCleanTitle = cleanTitle.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');

  let score = 0;

  // Title / Artist Matching Gate: track must match at least one query term
  const matchedWords = qWords.filter(w => normCleanTitle.includes(w) || normTitle.includes(w) || normArtist.includes(w));
  if (matchedWords.length === 0) {
    return 0; // completely irrelevant track
  }

  // Exact Title Matching (Normalized against both full and cleaned titles)
  if (normCleanTitle === normQ || normTitle === normQ) {
    score += 65000;
  } else if (normCleanTitle.startsWith(normQ) || normTitle.startsWith(normQ)) {
    score += 48000;
  } else if (qWords.every(w => normCleanTitle.includes(w) || normTitle.includes(w))) {
    score += 32000;
  } else {
    score += (matchedWords.length / qWords.length) * 16000;
  }

  // Penalize titles that don't start with the query and have unrelated words prefixed (like "Joganimaano Rang Lagyo")
  if (!normCleanTitle.startsWith(normQ) && !normTitle.startsWith(normQ) && normCleanTitle !== normQ) {
    score -= 15000;
  }

  // Superstar & Renowned Hitmakers Priority (+55,000 points ensures famous original artists come first)
  if (FAMOUS_SUPERSTARS_REGEX.test(track.artist || '') || FAMOUS_SUPERSTARS_REGEX.test(track.album || '')) {
    score += 55000;
  }

  // Major Record Label Boost (Tips, T-Series, Sony, Zee, Universal, etc. gets +25,000)
  if (MAJOR_LABELS_REGEX.test(track.label || '') || MAJOR_LABELS_REGEX.test(track.album || '') || MAJOR_LABELS_REGEX.test(track.artist || '')) {
    score += 25000;
  }

  // Popularity scaling based on real stream / view counts (Famous hits get massive priority)
  const plays = track.playCount || 0;
  if (plays >= 100000000) score += 50000;       // 100M+
  else if (plays >= 20000000) score += 40000;   // 20M+
  else if (plays >= 5000000) score += 30000;    // 5M+
  else if (plays >= 1000000) score += 20000;    // 1M+
  else if (plays >= 200000) score += 12000;     // 200k+
  else if (plays >= 50000) score += 5000;       // 50k+
  else if (plays >= 10000) score += 1000;       // 10k+
  else score += Math.min(300, Math.floor(plays / 100));

  // Verified artist / official channel boost
  if (track.isVerified) {
    score += 12000;
  }

  // Query mentions artist
  if (normArtist.includes(normQ) || qWords.some(w => normArtist.includes(w))) {
    score += 18000;
  }

  // Penalize covers, karaoke, ringtones, remake unless specifically queried
  const isCoverOrRemake = /cover|karaoke|instrumental|remake|tribute|ringtone|status/i.test(track.title);
  const wantsCover = /cover|karaoke|instrumental|remake|tribute|ringtone|status/i.test(query);
  if (isCoverOrRemake && !wantsCover) {
    score -= 40000;
  }

  // Penalize long compilations / extended looped versions unless specifically requested
  const isLongTrack = (track.duration || 0) > 900; // > 15 mins
  const wantsLong = /1\s*hour|extended|full album|loop|playlist|jukebox/i.test(query);
  if (isLongTrack && !wantsLong) {
    score -= 30000;
  }

  // Bonus for direct 320kbps studio audio when scores are competitive
  if (track.hasDirectAudio) {
    score += 3000;
  }

  return score;
}

function getDedupeKey(title, artist) {
  const normTitle = (title || '')
    .toLowerCase()
    .replace(/\s*[\(\[](feat\.?|ft\.?|from|official|remix|lofi|slowed|reverb|audio|video|lyric|lyrics).*?[\)\]]/gi, '')
    .replace(/[^a-z0-9]/g, '');

  const artistTokens = (artist || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['and', 'the', 'feat', 'featuring', 'various', 'artists', 'from'].includes(w))
    .sort()
    .slice(0, 3)
    .join('');

  return `${normTitle}__${artistTokens}`;
}

// ==========================================================================
// STRICT MUSIC-ONLY VALIDATION ENGINE (Reusable across all endpoints)
// Evaluates category, title, channel, description, duration, and music signals
// Does NOT rely exclusively on keyword blacklists
// Does NOT classify as music merely due to lack of banned words
// Rejects when metadata is missing or insufficient to establish content is music
// ==========================================================================

function validateMusicContent(track) {
  if (!track) return { isMusic: false, reason: 'Empty track data' };

  // 1. JioSaavn tracks: verified studio releases
  if (track.source === 'saavn' || track.source === 'jiosaavn') {
    if (!track.title || !track.audioUrl) {
      return { isMusic: false, reason: 'Incomplete JioSaavn track metadata' };
    }
    return { isMusic: true, categoryId: '10', source: 'saavn' };
  }

  // 2. Local device uploads
  if (track.isLocal) {
    return { isMusic: true, categoryId: '10', source: 'local' };
  }

  const rawTitle = (track.title || '').trim();
  const rawArtist = (track.artist || '').trim();
  const lowerTitle = rawTitle.toLowerCase();
  const lowerArtist = rawArtist.toLowerCase();

  // 3. Disqualify podcasts and episodic series
  if (track.isPodcast ||
      /\b(podcast|full episode|episode\s*\d+|ep\s*\d+|ep\.\s*\d+)\b/i.test(lowerTitle) ||
      /\b(podcast|episode)\b/i.test(lowerArtist)) {
    return { isMusic: false, reason: 'Podcast/Episode content' };
  }

  // 4. Disqualify non-music content signatures in title
  const NON_MUSIC_TITLE_REGEX = /\b(gameplay|walkthrough|playthrough|let'?s play|gaming|gamer|speedrun|minecraft|roblox|fortnite|gta\s*v?|grand theft auto|valorant|call of duty|cod|warzone|apex legends|pubg|genshin|clash royale|brawl stars|clash of clans|smp|hardcore world|survival mode|world #?\d+|episode #?\d+|unboxing|tech review|phone review|pc build|tutorial|how to (fix|code|build|make|install|play game|draw|use)|guide for|coding in|python|javascript|java|c\+\+|html|css|react|programming|full course|course for|learn \w+ in \d+|lecture|lesson \d+|class \d+|study with me|quantum physics|physics and|particle physics|cognitive science|audiobook|chapter\s*\d+|kapitel\s*\d+|news live|breaking news|daily news|headline news|mukbang|daily vlog|vlog \d+|prank|reaction to|reacting to|reacts to|interviews? with|press conference|speech at|court hearing|highlights? (hd|4k)?|match highlights|cricket highlights|football highlights|tiktok compilation|fails compilation|meme compilation|trailer \d|official trailer|teaser)\b/i;

  if (NON_MUSIC_TITLE_REGEX.test(lowerTitle)) {
    return { isMusic: false, reason: 'Non-music content signature in title' };
  }

  // 5. Disqualify non-music channel signatures
  const NON_MUSIC_CHANNEL_REGEX = /\b(gaming|gamer|walkthroughs?|playthroughs?|vlogs?|vlogger|tech news|breaking news|news live|tutorials?|academy|university|lectures?|course|coding|software|sports live|freecodecamp|tedx|ted talk)\b/i;
  if (NON_MUSIC_CHANNEL_REGEX.test(lowerArtist)) {
    return { isMusic: false, reason: 'Non-music channel profile' };
  }

  // 6. Duration bounds check:
  // Songs are typically 40s to 18m. Under 40s is too short for a song release.
  const dur = track.duration || 0;
  if (dur > 0 && dur < 40) {
    return { isMusic: false, reason: 'Duration too short for full song' };
  }
  // Videos longer than 20 mins are typically podcasts, full livestreams, or compilations
  if (dur > 1200) {
    const isAllowedLongForm = /\b(symphony|orchestra|concerto|dj mix|continuous mix|live concert|full concert|full album)\b/i.test(lowerTitle);
    if (!isAllowedLongForm) {
      return { isMusic: false, reason: 'Duration exceeds 20 minutes without symphonic/mix indicators' };
    }
  }

  // 7. Positive Music Evidence Requirement:
  // Must NOT classify as music merely due to absence of banned keywords.
  // Must have concrete positive music indicators:
  const hasPositiveMusicToken = /\b(official (music )?video|music video|official audio|audio|song|lyric video|lyrics|audio track|soundtrack|original soundtrack|ost|score|remix|lofi|slowed|reverb|cover|instrumental|acoustic|unplugged|piano|guitar|orchestra|feat\.?|ft\.?|prod\.? by|album|single|ep)\b/i.test(lowerTitle);
  const isVerifiedArtistChannel = Boolean(track.isVerified) ||
    /(- topic|vevo|records|music|entertainment)$/i.test(lowerArtist) ||
    FAMOUS_SUPERSTARS_REGEX.test(lowerArtist) ||
    MAJOR_LABELS_REGEX.test(lowerArtist) ||
    Boolean(track.isMusicArtist);
  const hasMusicCategoryConfirmed = track.isVerifiedMusicCategory || String(track.categoryId) === '10';
  const hasArtistAndAlbum = Boolean(track.isMusicAlbum && track.album && track.album !== 'Single' && track.artist && track.artist !== 'Universal Artist');

  if (!hasPositiveMusicToken && !isVerifiedArtistChannel && !hasMusicCategoryConfirmed && !hasArtistAndAlbum) {
    return { isMusic: false, reason: 'Insufficient music metadata' };
  }

  return { isMusic: true, categoryId: '10' };
}

// In-Memory Validation Cache for YouTube video categories (24h TTL)
const videoMetadataCache = new Map();

async function validateYouTubeVideoMetadata(videoId, rawTitle = '', rawChannel = '') {
  if (!videoId) return { allowed: false, reason: 'Missing videoId' };

  const cached = videoMetadataCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60 * 24) {
    return cached;
  }

  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20240301.00.00', hl: 'en', gl: 'US' } },
        videoId: videoId
      }),
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) {
      return { allowed: false, reason: 'Player metadata fetch failed' };
    }

    const d = await res.json();
    const details = d.videoDetails;
    const micro = d.microformat?.playerMicroformatRenderer;
    if (!details || !micro) {
      return { allowed: false, reason: 'Missing video details or microformat' };
    }

    const category = (micro.category || '').trim();
    const isCategoryMusic = category.toLowerCase() === 'music';
    if (!isCategoryMusic) {
      const result = { allowed: false, category, reason: `Non-music category: ${category}` };
      videoMetadataCache.set(videoId, { ...result, timestamp: Date.now() });
      return result;
    }

    const titleToCheck = details.title || rawTitle;
    const authorToCheck = details.author || rawChannel;
    const validation = validateMusicContent({
      title: titleToCheck,
      artist: authorToCheck,
      duration: parseInt(details.lengthSeconds || '210', 10),
      categoryId: '10',
      isVerifiedMusicCategory: true
    });

    const result = {
      allowed: validation.isMusic,
      category: 'Music',
      categoryId: '10',
      title: details.title,
      author: details.author,
      reason: validation.reason || 'Verified Music'
    };
    videoMetadataCache.set(videoId, { ...result, timestamp: Date.now() });
    return result;
  } catch (err) {
    // When metadata retrieval or validation fails, REJECT per user instruction
    return { allowed: false, reason: `Validation error: ${err.message}` };
  }
}

function parseDurationToSec(durStr) {
  if (!durStr) return 210;
  if (typeof durStr === 'number') return durStr;
  const parts = String(durStr).split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  const parsed = parseInt(durStr, 10);
  return isNaN(parsed) ? 210 : parsed;
}

// Parse structured YouTube Music items
function parseYouTubeMusicListItem(r) {
  if (!r) return null;
  const flexCols = r.flexColumns || [];
  if (flexCols.length === 0) return null;

  const col0Runs = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const rawTitle = col0Runs.map(x => x.text).join('').trim();
  if (!rawTitle) return null;

  const videoId = r.playlistItemData?.videoId ||
    r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
    col0Runs[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
    r.doubleTapCommand?.watchEndpoint?.videoId;
  if (!videoId) return null;

  const col1Runs = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const fullCol1 = col1Runs.map(x => x.text.trim()).filter(Boolean).join(' ');

  // Immediate podcast/episode rejection
  if (/podcast|episode/i.test(fullCol1) || /podcast|episode/i.test(rawTitle)) {
    return null;
  }

  let artist = '';
  let album = 'Single';
  let isMusicArtist = false;
  let isMusicAlbum = false;
  let durationStr = '3:30';
  let playCount = 0;

  const artistsList = [];
  for (const run of col1Runs) {
    const text = run.text.trim();
    if (!text || text === '•') continue;
    const pageType = run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
    if (pageType === 'MUSIC_PAGE_TYPE_ARTIST') {
      artistsList.push(text);
      isMusicArtist = true;
    } else if (pageType === 'MUSIC_PAGE_TYPE_ALBUM') {
      album = text;
      isMusicAlbum = true;
    } else if (/^\d+:\d+(:\d+)?$/.test(text)) {
      durationStr = text;
    } else if (/views?|plays?/i.test(text)) {
      playCount = parseViewCount(text);
    }
  }

  if (artistsList.length > 0) {
    artist = artistsList.join(', ');
  } else {
    const parts = fullCol1.split('•').map(p => p.trim()).filter(Boolean);
    const nonMetaParts = parts.filter(p => !/^\d+:\d+(:\d+)?$/.test(p) && !/views?|plays?|song|video/i.test(p));
    if (nonMetaParts.length > 0) artist = nonMetaParts[0];
    const durPart = parts.find(p => /^\d+:\d+(:\d+)?$/.test(p));
    if (durPart) durationStr = durPart;
    const playPart = parts.find(p => /views?|plays?/i.test(p));
    if (playPart) playCount = parseViewCount(playPart);
  }

  if (!artist) artist = 'Universal Artist';

  let thumb = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
    ('https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg');
  if (thumb.includes('=w') && thumb.includes('-h')) {
    thumb = thumb.replace(/=w\d+-h\d+/, '=w544-h544');
  }

  const durationSec = parseDurationToSec(durationStr);
  const isVerifiedMusic = Boolean(isMusicArtist || isMusicAlbum);

  return {
    id: 'yt_' + videoId,
    ytId: videoId,
    title: rawTitle,
    artist: artist,
    album: album,
    isMusicArtist: isMusicArtist,
    isMusicAlbum: isMusicAlbum,
    duration: durationSec,
    durationStr: durationStr,
    playCount: playCount,
    image: thumb,
    audioUrl: '/api/yt-stream?id=' + videoId,
    streamUrl: '/api/yt-stream?id=' + videoId,
    source: 'youtube',
    categoryId: isVerifiedMusic ? '10' : null,
    isVerifiedMusicCategory: isVerifiedMusic,
    hasDirectAudio: true
  };
}

function parseYouTubeMusicCardShelf(card) {
  if (!card) return null;
  const rawTitle = card.title?.runs?.map(r => r.text).join('').trim();
  if (!rawTitle) return null;

  const videoId = card.onTap?.watchEndpoint?.videoId ||
    card.buttons?.[0]?.buttonRenderer?.command?.watchEndpoint?.videoId;
  if (!videoId) return null;

  const subRuns = card.subtitle?.runs || [];
  const fullSub = subRuns.map(r => r.text).join('').trim();
  if (/podcast|episode/i.test(fullSub) || /podcast|episode/i.test(rawTitle)) return null;

  const parts = fullSub.split('•').map(p => p.trim()).filter(Boolean);
  let artist = 'Universal Artist';
  let durationStr = '3:30';
  let playCount = 0;

  for (const p of parts) {
    if (/^\d+:\d+(:\d+)?$/.test(p)) durationStr = p;
    else if (/views?|plays?/i.test(p)) playCount = parseViewCount(p);
    else if (!/song|video|artist/i.test(p)) artist = p;
  }

  let thumb = card.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
    ('https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg');
  if (thumb.includes('=w') && thumb.includes('-h')) {
    thumb = thumb.replace(/=w\d+-h\d+/, '=w544-h544');
  }

  const durationSec = parseDurationToSec(durationStr);
  const isExplicitSong = /song|artist|album|single/i.test(fullSub);

  return {
    id: 'yt_' + videoId,
    ytId: videoId,
    title: rawTitle,
    artist: artist,
    album: 'Single',
    duration: durationSec,
    durationStr: durationStr,
    playCount: playCount,
    image: thumb,
    audioUrl: '/api/yt-stream?id=' + videoId,
    streamUrl: '/api/yt-stream?id=' + videoId,
    source: 'youtube',
    categoryId: isExplicitSong ? '10' : null,
    isVerifiedMusicCategory: isExplicitSong,
    hasDirectAudio: true
  };
}

// Universal Multi-Source YouTube Search Engine
// Uses YouTube Music category filter wherever supported
// Retrieves & validates video metadata before accepting results
// Never falls back to unrestricted general YouTube search
async function searchYouTube(query, limit = 30) {
  if (!query) return [];

  const results = [];
  const seenIds = new Set();

  // Strategy 1: YouTube Music Songs API (WEB_REMIX client with Songs category filter)
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': '1.20240301.01.00',
        'Origin': 'https://music.youtube.com'
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240301.01.00', hl: 'en', gl: 'US' } },
        query: query,
        params: 'Eg-KAQwIARAQEAMQBBAJEAo%3D' // Strictly filtered to Songs
      }),
      signal: AbortSignal.timeout(6000)
    });

    if (res.ok) {
      const data = await res.json();
      const sections = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

      for (const section of sections) {
        const isrItems = section.itemSectionRenderer?.contents || [];
        const shelfItems = section.musicShelfRenderer?.contents || [];
        const allCandidateItems = [...isrItems, ...shelfItems];

        for (const item of allCandidateItems) {
          const r = item.musicResponsiveListItemRenderer;
          if (!r) continue;

          const parsed = parseYouTubeMusicListItem(r);
          if (!parsed || !parsed.ytId || seenIds.has(parsed.ytId)) continue;

          let check = validateMusicContent(parsed);
          if (!check.isMusic && check.reason === 'Insufficient music metadata') {
            const meta = await validateYouTubeVideoMetadata(parsed.ytId, parsed.title, parsed.artist);
            if (meta.allowed) {
              parsed.categoryId = '10';
              parsed.isVerifiedMusicCategory = true;
              check = validateMusicContent(parsed);
            }
          }
          if (!check.isMusic) continue;

          seenIds.add(parsed.ytId);
          results.push(parsed);
          if (results.length >= limit) break;
        }
        if (results.length >= limit) break;
      }
    }
  } catch (err) {
    console.warn('YouTube Music Songs search note:', err.message);
  }

  // Strategy 2: Query YouTube Music without params for official music videos, covers & remixes
  if (results.length < limit) {
    try {
      const res = await fetch('https://music.youtube.com/youtubei/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'X-YouTube-Client-Name': '67',
          'X-YouTube-Client-Version': '1.20240301.01.00',
          'Origin': 'https://music.youtube.com'
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240301.01.00', hl: 'en', gl: 'US' } },
          query: query
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const data = await res.json();
        const sections = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

        for (const section of sections) {
          // Check top card shelf if present
          const card = section.musicCardShelfRenderer;
          if (card) {
            const cardItem = parseYouTubeMusicCardShelf(card);
            if (cardItem && cardItem.ytId && !seenIds.has(cardItem.ytId)) {
              let check = validateMusicContent(cardItem);
              if (!check.isMusic && check.reason === 'Insufficient music metadata') {
                const meta = await validateYouTubeVideoMetadata(cardItem.ytId, cardItem.title, cardItem.artist);
                if (meta.allowed) {
                  cardItem.categoryId = '10';
                  cardItem.isVerifiedMusicCategory = true;
                  check = validateMusicContent(cardItem);
                }
              }
              if (check.isMusic) {
                seenIds.add(cardItem.ytId);
                results.push(cardItem);
              }
            }
          }

          const isrItems = section.itemSectionRenderer?.contents || [];
          const shelfItems = section.musicShelfRenderer?.contents || [];
          for (const item of [...isrItems, ...shelfItems]) {
            const r = item.musicResponsiveListItemRenderer;
            if (!r) continue;
            const parsed = parseYouTubeMusicListItem(r);
            if (!parsed || !parsed.ytId || seenIds.has(parsed.ytId)) continue;
            let check = validateMusicContent(parsed);
            if (!check.isMusic && check.reason === 'Insufficient music metadata') {
              const meta = await validateYouTubeVideoMetadata(parsed.ytId, parsed.title, parsed.artist);
              if (meta.allowed) {
                parsed.categoryId = '10';
                parsed.isVerifiedMusicCategory = true;
                check = validateMusicContent(parsed);
              }
            }
            if (!check.isMusic) continue;
            seenIds.add(parsed.ytId);
            results.push(parsed);
            if (results.length >= limit) break;
          }
          if (results.length >= limit) break;
        }
      }
    } catch (err) {
      console.warn('YouTube Music video search note:', err.message);
    }
  }

  // Strategy 3 (Fallback with Strict Music Category Validation):
  // When YouTube Music is unavailable, query YouTube Innertube with music intent
  // and validate every candidate's metadata to verify Category 10 (Music)
  if (results.length === 0) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'X-YouTube-Client-Name': '1',
          'X-YouTube-Client-Version': '2.20240301.00.00'
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20240301.00.00', hl: 'en', gl: 'US' } },
          query: `${query} official audio song`
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const data = await res.json();
        const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

        for (const section of contents) {
          const items = section?.itemSectionRenderer?.contents || [];
          for (const item of items) {
            if (!item.videoRenderer) continue;
            const v = item.videoRenderer;
            const videoId = v.videoId;
            if (!videoId || seenIds.has(videoId)) continue;

            const rawTitle = v.title?.runs?.[0]?.text || '';
            const rawChannel = v.ownerText?.runs?.[0]?.text || '';
            const durationStr = v.lengthText?.simpleText || '3:30';

            const { title, artist, album } = parseYouTubeMusicTitle(rawTitle, rawChannel);
            const candidate = {
              id: 'yt_' + videoId,
              ytId: videoId,
              title: title,
              artist: artist,
              album: album,
              durationStr: durationStr,
              duration: parseDurationToSec(durationStr),
              source: 'youtube'
            };

            const initialCheck = validateMusicContent(candidate);
            if (!initialCheck.isMusic) continue;

            // Verify Category 10 via player metadata (never approve blindly)
            const catCheck = await validateYouTubeVideoMetadata(videoId, rawTitle, rawChannel);
            if (!catCheck.allowed) continue;

            seenIds.add(videoId);
            results.push({
              ...candidate,
              image: v.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              audioUrl: `/api/yt-stream?id=${videoId}`,
              streamUrl: `/api/yt-stream?id=${videoId}`,
              playCount: parseViewCount(v.viewCountText?.simpleText || ''),
              isVerified: Boolean(v.ownerBadges && v.ownerBadges.length > 0),
              categoryId: '10',
              hasDirectAudio: true
            });
            if (results.length >= limit) break;
          }
          if (results.length >= limit) break;
        }
      }
    } catch (err) {
      console.warn('Fallback YouTube search note:', err.message);
    }
  }

  return results;
}

// ============================================================================
// INTELLIGENT SEARCH & AUTOCOMPLETE ROUTES
// ============================================================================

// Autocomplete suggestions (Sub-100ms with caching & JioSaavn + Lyrics)
app.get('/api/search/autocomplete', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const data = await searchEngine.fetchAutocomplete(q);
    res.json(data);
  } catch (err) {
    console.error('Autocomplete error:', err);
    res.status(500).json({ success: false, error: 'Autocomplete failed' });
  }
});

// Search discovery data for empty search bar focus state
app.get('/api/search/discovery', (req, res) => {
  try {
    const data = searchEngine.getDiscoveryData();
    res.json(data);
  } catch (err) {
    console.error('Discovery error:', err);
    res.status(500).json({ success: false, error: 'Failed to get discovery data' });
  }
});

// User Search History (Account Synced)
app.get('/api/search/history', optionalAuth, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.json({ success: true, history: [] });
    }
    const history = await libraryService.getUserSearchHistory(req.user.id);
    res.json({ success: true, history: history.map(h => h.query) });
  } catch (err) {
    console.error('Get search history error:', err);
    res.status(500).json({ success: false, error: 'Failed to get search history' });
  }
});

app.post('/api/search/history', optionalAuth, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.json({ success: true, saved: false, reason: 'guest' });
    }
    const query = req.body.query || '';
    const item = await libraryService.addUserSearchHistory(req.user.id, query);
    res.json({ success: true, saved: true, item });
  } catch (err) {
    console.error('Add search history error:', err);
    res.status(500).json({ success: false, error: 'Failed to save search history' });
  }
});

app.delete('/api/search/history', optionalAuth, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.json({ success: true, removed: true, reason: 'guest' });
    }
    const query = req.query.query;
    await libraryService.removeUserSearchHistory(req.user.id, query);
    res.json({ success: true, removed: true });
  } catch (err) {
    console.error('Remove search history error:', err);
    res.status(500).json({ success: false, error: 'Failed to remove search history' });
  }
});

// Unified Search Route with 10-Tier Relevance, Lyrics Search & Typo Expansion
app.get('/api/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  const source = req.query.source || 'all'; // 'all', 'saavn', 'youtube'

  if (!query) {
    return res.json({ success: true, results: [], count: 0 });
  }

  try {
    const intent = searchEngine.detectQueryIntent(query);
    const matchedLyricsMap = new Map();

    // 1. Parallel search: Saavn, YouTube, and Lyrics Search
    const searchPromises = [];
    if (source === 'saavn') {
      searchPromises.push(searchSaavn(query, 30));
      searchPromises.push(Promise.resolve([]));
    } else if (source === 'youtube') {
      searchPromises.push(Promise.resolve([]));
      searchPromises.push(searchYouTube(query, 30));
    } else {
      searchPromises.push(searchSaavn(query, 30));
      searchPromises.push(searchYouTube(query, 30));
    }

    // Include lyrics search for multi-word or lyric-like queries
    const words = query.split(/\s+/).filter(Boolean);
    if (intent.type === 'lyrics' || words.length >= 2) {
      searchPromises.push(searchEngine.searchLyrics(query));
    } else {
      searchPromises.push(Promise.resolve([]));
    }

    const [saavnRes, ytRes, lyricsRes] = await Promise.allSettled(searchPromises);

    let saavnSongs = saavnRes.status === 'fulfilled' ? (saavnRes.value || []) : [];
    let ytSongs = ytRes.status === 'fulfilled' ? (ytRes.value || []) : [];
    const lyricsMatches = lyricsRes.status === 'fulfilled' ? (lyricsRes.value || []) : [];

    // Map lyric matches for quick lookup
    const lyricsExtraQueries = [];
    for (const lm of lyricsMatches) {
      if (lm && lm.title) {
        lyricsExtraQueries.push(`${lm.title} ${lm.artist || ''}`.trim());
      }
    }

    // If lyrics search identified songs not found in main search, fetch them
    if (lyricsExtraQueries.length > 0) {
      const extraFetches = await Promise.allSettled(
        lyricsExtraQueries.slice(0, 3).map(eq => searchSaavn(eq, 5))
      );
      for (const ef of extraFetches) {
        if (ef.status === 'fulfilled' && Array.isArray(ef.value)) {
          for (const s of ef.value) {
            // Find corresponding lyric match
            const match = lyricsMatches.find(lm => 
              s.title.toLowerCase().includes(lm.title.toLowerCase()) ||
              lm.title.toLowerCase().includes(s.title.toLowerCase())
            );
            if (match) {
              s.isLyricsMatch = true;
              s.matchedLine = match.matchedLine;
              matchedLyricsMap.set(s.id, match.matchedLine);
            }
            saavnSongs.push(s);
          }
        }
      }
    }

    // Combine all tracks
    const allTracks = [...saavnSongs, ...ytSongs];

    // Score all tracks with strict 10-tier scoring
    const scoredTracks = allTracks.map(track => {
      const score = searchEngine.scoreTrackRelevance(track, query, matchedLyricsMap);
      return {
        ...track,
        score,
        isLyricsMatch: track.isLyricsMatch || matchedLyricsMap.has(track.id),
        matchedLine: track.matchedLine || matchedLyricsMap.get(track.id) || null
      };
    });

    // Sort by score in descending order
    scoredTracks.sort((a, b) => b.score - a.score);

    // Smart deduplication: keep highest-scored version of each unique track
    const seen = new Map();
    const deduped = [];

    for (const track of scoredTracks) {
      if (!track || !track.title) continue;
      const key = getDedupeKey(track.title, track.artist);
      if (!seen.has(key)) {
        seen.set(key, true);
        deduped.push(track);
      }
    }

    // Ensure search page Top Result is strictly synchronized with the search bar autocomplete top song
    try {
      const acData = await searchEngine.fetchAutocomplete(query);
      const topAcSong = acData?.suggestions?.songs?.[0];
      if (topAcSong && topAcSong.title) {
        const cleanAcTitle = searchEngine.normalizeSearchText(topAcSong.title);
        const cleanAcArtist = searchEngine.normalizeSearchText(topAcSong.artist || '');
        const matchIdx = deduped.findIndex(t => {
          const tTitle = searchEngine.normalizeSearchText(t.title);
          const tArtist = searchEngine.normalizeSearchText(t.artist || '');
          const idMatch = t.id && topAcSong.id && (String(t.id) === String(topAcSong.id) || String(t.id) === `saavn_${topAcSong.id}`);
          const nameMatch = tTitle === cleanAcTitle && (
            !cleanAcArtist || !tArtist || tArtist.includes(cleanAcArtist) || cleanAcArtist.includes(tArtist)
          );
          return idMatch || nameMatch;
        });

        if (matchIdx > 0) {
          const [topTrack] = deduped.splice(matchIdx, 1);
          topTrack.score = Math.max(topTrack.score || 0, (deduped[0]?.score || 100000) + 1000);
          deduped.unshift(topTrack);
        } else if (matchIdx === -1 && topAcSong.id) {
          const topTrack = {
            id: String(topAcSong.id).startsWith('saavn_') ? topAcSong.id : `saavn_${topAcSong.id}`,
            title: topAcSong.title,
            artist: topAcSong.artist || 'Artist',
            album: topAcSong.album || '',
            image: topAcSong.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80',
            duration: topAcSong.duration || 210,
            durationStr: topAcSong.duration ? `${Math.floor(topAcSong.duration / 60)}:${String(topAcSong.duration % 60).padStart(2, '0')}` : '3:30',
            source: 'saavn',
            score: (deduped[0]?.score || 100000) + 1000,
            hasDirectAudio: true
          };
          deduped.unshift(topTrack);
        }
      }
    } catch (acErr) {
      // Fallback to scored ranking
    }

    res.json({
      success: true,
      query,
      intent: intent.type,
      count: deduped.length,
      topResult: deduped[0] || null,
      results: deduped,
      lyricsMatches: deduped.filter(t => t.isLyricsMatch)
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, error: 'Failed to search songs' });
  }
});

// Deduplicate and Shuffle tracks ensuring unique albums, thumbnails, and titles
function deduplicateAndShuffle(tracks, max = 10) {
  if (!tracks || !Array.isArray(tracks)) return [];

  // Fisher-Yates Shuffle
  const shuffled = [...tracks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const seenAlbums = new Set();
  const seenImages = new Set();
  const seenTitles = new Set();
  const uniqueTracks = [];

  for (const track of shuffled) {
    if (!track || !track.audioUrl) continue;

    // Normalize album name (ignore generic 'single')
    const rawAlbum = (track.album || '').trim().toLowerCase();
    const isSingle = !rawAlbum || rawAlbum === 'single' || rawAlbum === 'singles';
    
    // Normalize track title
    const normTitle = (track.title || '').trim().toLowerCase().replace(/\(.*\)|\[.*\]|- .*/g, '').trim();

    // Extract image signature (e.g. filename from CDN URL)
    let imgKey = '';
    if (track.image) {
      try {
        const u = new URL(track.image);
        imgKey = u.pathname.split('/').pop() || track.image;
      } catch (e) {
        imgKey = track.image;
      }
    }

    // Reject duplicates of album, thumbnail, or title
    if (!isSingle && seenAlbums.has(rawAlbum)) continue;
    if (imgKey && seenImages.has(imgKey)) continue;
    if (normTitle && seenTitles.has(normTitle)) continue;

    if (!isSingle) seenAlbums.add(rawAlbum);
    if (imgKey) seenImages.add(imgKey);
    if (normTitle) seenTitles.add(normTitle);

    uniqueTracks.push(track);
    if (uniqueTracks.length >= max) break;
  }

  return uniqueTracks;
}

// Curated 100% Bollywood Trending & Home Categories with Poetic Expressions
const TRENDING_CATEGORIES = [
  {
    id: 'bollywood-acoustic',
    title: "Chai & Acoustic — Unplugged Bollywood Chill",
    subtitle: "Gentle acoustic guitars, cozy sunset breeze, and soft intimate unplugged melodies",
    queries: ["Bollywood Acoustic Love Songs", "Arijit Singh Acoustic Unplugged", "Jasleen Royal Soft Melodies", "Prateek Kuhad Hindi", "Anuv Jain Melodies", "Sanam Acoustic Hits", "Pritam Unplugged Melodies"]
  },
  {
    id: 'bollywood-romantic',
    title: "Ishq Sufiyana — Bollywood Romance",
    subtitle: "Timeless melodies of pure love, monsoon sparks, and unspoken promises",
    queries: ["Arijit Singh Romantic Hits", "Atif Aslam Love Songs", "Shreya Ghoshal Romantic", "Mohit Chauhan Love Songs", "Pritam Romantic Anthems"]
  },
  {
    id: 'bollywood-sad',
    title: "Dard-e-Dil — Soulful Heartbreak Melodies",
    subtitle: "Raw tears, midnight quiet, and aching lyrics for a wounded heart",
    queries: ["Arijit Singh Sad Songs", "B Praak Emotional Hits", "Jubin Nautiyal Sad Melodies", "Mustafa Zahid Soulful", "Jagjit Singh Ghazals Bollywood"]
  },
  {
    id: 'bollywood-party',
    title: "Dhamaka Beats — High-Octane Bollywood Party",
    subtitle: "Infectious dhol drops, festive celebration vibes, and late-night club bangers",
    queries: ["Badshah Bollywood Hits", "Honey Singh Party Anthems", "Mika Singh Dance Hits", "Sukhwinder Singh Hits", "Kala Chashma Party Beats"]
  },
  {
    id: 'bollywood-retro',
    title: "Purani Yaadein — Golden Retro Bollywood",
    subtitle: "Vintage vinyl treasures from the golden legends that never fade",
    queries: ["Kishore Kumar Romantic Hits", "Lata Mangeshkar Golden Hits", "Mohammed Rafi Classics", "R.D. Burman Magical Melodies", "Mukesh Timeless Hits"]
  },
  {
    id: 'bollywood-90s',
    title: "90s Magic — Nostalgic Cassette Tape Hits",
    subtitle: "Sweet monsoon college romances and unhurried melodious cassette duets",
    queries: ["Kumar Sanu 90s Hits", "Alka Yagnik Romantic Duets", "Udit Narayan Romantic 90s", "Sonu Nigam 2000s Classics", "KK Soulful Melodies"]
  },
  {
    id: 'bollywood-sufi',
    title: "Roohani Sukoon — Sufi & Spiritual Reverie",
    subtitle: "Soul-elevating poetry, divine acoustic warmth, and serene peaceful contemplation",
    queries: ["Kun Faya Kun A.R. Rahman", "Khwaja Mere Khwaja Jodhaa Akbar", "Arziyan Delhi 6", "Tere Rashke Qamar Rahat Fateh Ali Khan", "Javed Ali Sufi Hits", "Maula Mere Maula Anwar", "Sajdaa My Name Is Khan", "Kailash Kher Bollywood Hits"]
  }
];

let trendingSectionsCache = null;
let trendingCacheTime = 0;

async function fetchTrendingData() {
  const sections = await Promise.all(
    TRENDING_CATEGORIES.map(async (cat) => {
      // Shuffle queries so different top artists and moods are selected each time
      const shuffledQueries = [...cat.queries].sort(() => Math.random() - 0.5);
      const queryPromises = shuffledQueries.slice(0, 4).map(q => searchSaavn(q, 8));
      const resultsArray = await Promise.all(queryPromises);
      const combinedTracks = resultsArray.flat();

      // Strictly exclude any devotional or bhajan tracks from all homepage shelves
      const nonDevotional = combinedTracks.filter(t => !isDevotionalOrBhajan(t));
      const uniqueTracks = deduplicateAndShuffle(nonDevotional, 12);
      return {
        id: cat.id,
        title: cat.title,
        subtitle: cat.subtitle,
        tracks: uniqueTracks
      };
    })
  );
  return sections.filter(s => s.tracks.length > 0);
}

// Pre-warm cache on standalone server startup (skip on Vercel cold boot)
if (!process.env.VERCEL) {
  fetchTrendingData().then(data => {
    if (data && data.length > 0) {
      trendingSectionsCache = data;
      trendingCacheTime = Date.now();
      console.log(`⚡ Pre-cached ${data.length} trending music sections with unique albums!`);
    }
  }).catch(err => console.warn('Preload trending warning:', err.message));
}

app.get('/api/trending', async (req, res) => {
  const now = Date.now();
  const forceRefresh = req.query.refresh === '1';

  let dailyTopTracks = [];
  try {
    const rawDaily = await getDailyTrendingHindiTracks(24);
    // Shuffle daily tracks on every request so home page rotates after every refresh
    dailyTopTracks = [...rawDaily].sort(() => Math.random() - 0.5);
  } catch (e) {}

  if (!forceRefresh && trendingSectionsCache && now - trendingCacheTime < 1000 * 60 * 3) {
    // Return a fresh shuffle of the distinct album tracks so home page is always dynamic
    const dynamicSections = trendingSectionsCache.map(sec => ({
      ...sec,
      tracks: [...sec.tracks].sort(() => Math.random() - 0.5)
    }));
    return res.json({ success: true, sections: dynamicSections, dailyTopTracks });
  }

  try {
    const sections = await fetchTrendingData();
    if (sections && sections.length > 0) {
      trendingSectionsCache = sections;
      trendingCacheTime = now;
    }
    const targetSections = trendingSectionsCache || sections;
    const dynamicSections = targetSections.map(sec => ({
      ...sec,
      tracks: [...sec.tracks].sort(() => Math.random() - 0.5)
    }));
    res.json({ success: true, sections: dynamicSections, dailyTopTracks });
  } catch (err) {
    console.error('Trending fetch error:', err);
    if (trendingSectionsCache) {
      const dynamicSections = trendingSectionsCache.map(sec => ({
        ...sec,
        tracks: [...sec.tracks].sort(() => Math.random() - 0.5)
      }));
      return res.json({ success: true, sections: dynamicSections, dailyTopTracks });
    }
    res.status(500).json({ success: false, error: 'Failed to load trending music' });
  }
});

// ============================================================================
// Daily Trending Hindi Song Feature Engine
// ============================================================================
const {
  getDailyTrendingHindiSong,
  getDailyTrendingHindiTracks,
  executeDailyDiscoveryPipeline,
  getDailyTrendingDebugInfo,
  initDailyTrendingScheduler,
  isDevotionalOrBhajan
} = require('./services/dailyTrendingService');

// Public endpoint for homepage: returns verified #1 trending Hindi song for Asia/Kolkata date
app.get('/api/trending/daily', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const song = await getDailyTrendingHindiSong(forceRefresh);
    if (!song) {
      return res.status(404).json({
        success: false,
        error: 'No verified trending Hindi song available for today'
      });
    }
    res.json({
      success: true,
      data: song
    });
  } catch (err) {
    console.error('Error fetching daily trending Hindi song:', err);
    res.status(500).json({ success: false, error: 'Internal error loading daily trending feature' });
  }
});

// Admin / internal inspection and debug endpoint
app.get('/api/trending/daily/debug', (req, res) => {
  res.json({
    success: true,
    debug: getDailyTrendingDebugInfo()
  });
});

// Admin manual refresh trigger
app.post('/api/trending/daily/refresh', async (req, res) => {
  try {
    const refreshed = await executeDailyDiscoveryPipeline(true);
    res.json({
      success: true,
      message: 'Daily trending pipeline executed successfully',
      data: refreshed
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// Intelligent Recommendations & Vibe Matching Engine
// ============================================================================
const MOOD_KEYWORDS = {
  romantic: ['romantic', 'love', 'pyaar', 'ishq', 'dil', 'tum', 'tere', 'humsafar', 'slow', 'acoustic', 'ballad', 'mohabbat', 'pehla', 'janam', 'kasam', 'deewana', 'duet', 'soulmate'],
  sad: ['sad', 'dard', 'judaai', 'bewafa', 'heartbreak', 'tears', 'alone', 'broken', 'roothna', 'yaad', 'tanha', 'rona', 'bikhra', 'chhod', 'gham', 'alvida', 'judai', 'khoya'],
  energetic: ['party', 'dance', 'banger', 'remix', 'club', 'dhol', 'bhangra', 'nach', 'dj', 'bass', 'high energy', 'beat', 'swag', 'munda', 'kudi', 'groove', 'edm', 'upbeat'],
  chill: ['chill', 'lofi', 'unplugged', 'acoustic', 'sunset', 'peaceful', 'calm', 'relax', 'vibes', 'soft', 'coffee', 'midnight', 'sleep', 'ambient', 'breeze'],
  sufi: ['sufi', 'qawwali', 'bhajan', 'spiritual', 'khwaja', 'maula', 'allah', 'krishna', 'shiva', 'devotional', 'ishq murshid', 'fakira', 'arziyan']
};

function detectSongVibe(title = '', artist = '', album = '') {
  const text = `${title} ${artist} ${album}`.toLowerCase();
  let bestMood = 'romantic';
  let maxMatches = 0;
  for (const [mood, words] of Object.entries(MOOD_KEYWORDS)) {
    let matches = 0;
    for (const w of words) {
      if (text.includes(w)) matches++;
    }
    if (matches > maxMatches) {
      maxMatches = matches;
      bestMood = mood;
    }
  }
  let energy = 'medium';
  if (bestMood === 'energetic') energy = 'high';
  else if (bestMood === 'sad' || bestMood === 'chill') energy = 'low';
  return { mood: bestMood, energy };
}

function detectSongLanguage(title = '', artist = '', explicitLang = '') {
  if (explicitLang && explicitLang.trim()) {
    const l = explicitLang.toLowerCase().trim();
    if (l !== 'unknown' && l !== 'undefined' && l !== 'null') return l;
  }
  const text = `${title} ${artist}`.toLowerCase();
  if (/[\u0900-\u097F]/.test(title + artist)) return 'hindi';
  if (/[\u0A00-\u0A7F]/.test(title + artist)) return 'punjabi';
  if (/[\u0600-\u06FF]/.test(title + artist)) return 'urdu';

  const punjabiArtists = ['diljit', 'karan aujla', 'sidhu moose', 'ap dhillon', 'shubh', 'guru randhawa', 'ammy virk', 'b praak', 'jassie gill', 'harrdy sandhu', 'wazir patar', 'jordan sandhu', 'kulwinder billa', 'mankirt', 'sukhe', 'arjan dhillon', 'parmish verma', 'sidhu', 'tarsem'];
  if (punjabiArtists.some(pa => text.includes(pa))) return 'punjabi';

  const hindiArtists = ['arijit', 'pritam', 'shreya ghoshal', 'neha kakkar', 'jubin', 'vishal mishra', 'darshan raval', 'sonu nigam', 'sunidhi', 'kishore kumar', 'lata mangeshkar', 'kumar sanu', 'udit narayan', 'alka yagnik', 'atif aslam', 'mohit chauhan', 'sachin-jigar', 'meet bros', 'tony kakkar', 'badshah', 'raftaar'];
  if (hindiArtists.some(ha => text.includes(ha))) return 'hindi';

  const englishArtists = ['taylor swift', 'ed sheeran', 'weeknd', 'drake', 'bieber', 'billie eilish', 'bruno mars', 'dua lipa', 'post malone', 'ariana grande', 'coldplay', 'eminem', 'adele', 'maroon 5', 'shawn mendes', 'charlie puth', 'olivia rodrigo', 'selena gomez', 'rihanna', 'katy perry', 'imagine dragons'];
  if (englishArtists.some(ea => text.includes(ea))) return 'english';

  return 'hindi';
}

function areLanguagesCompatible(langA, langB, mood) {
  if (!langA || !langB) return true;
  const a = langA.toLowerCase();
  const b = langB.toLowerCase();
  if (a === b) return true;
  if ((a === 'hindi' && b === 'punjabi') || (a === 'punjabi' && b === 'hindi')) return true;
  if ((a === 'hindi' && b === 'urdu') || (a === 'urdu' && b === 'hindi')) return true;
  return false;
}

app.get('/api/recommendations', async (req, res) => {
  const seedId = (req.query.seedId || '').trim();
  let title = (req.query.title || '').trim();
  let artist = (req.query.artist || '').trim();
  let album = (req.query.album || '').trim();
  let language = (req.query.language || '').toLowerCase().trim();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(30, Math.max(1, parseInt(req.query.limit || '12', 10)));
  const rawExclude = (req.query.excludeIds || '').trim();
  const rawRecentArtists = (req.query.recentArtists || '').trim();
  const rawSeedHistory = (req.query.seedHistory || '').trim();

  const recentArtistsList = rawRecentArtists.split(',').map(s => extractPrimaryArtist(s)).filter(Boolean);
  const recentArtistsSet = new Set(recentArtistsList);

  const excludeIdSet = new Set();
  const excludeFingerprintSet = new Set();

  if (rawExclude) {
    for (const raw of rawExclude.split(',')) {
      const trimmed = raw.trim().toLowerCase();
      if (!trimmed) continue;
      excludeIdSet.add(trimmed);
      excludeIdSet.add(trimmed.replace(/^saavn_/, ''));
      excludeIdSet.add(`saavn_${trimmed.replace(/^saavn_/, '')}`);
      excludeIdSet.add(trimmed.replace(/^yt_/, ''));
      excludeIdSet.add(`yt_${trimmed.replace(/^yt_/, '')}`);
      if (trimmed.startsWith('fp_')) {
        excludeFingerprintSet.add(trimmed.replace(/^fp_/, ''));
      }
    }
  }

  if (seedId) {
    const sLower = seedId.toLowerCase();
    excludeIdSet.add(sLower);
    excludeIdSet.add(sLower.replace(/^saavn_/, ''));
    excludeIdSet.add(`saavn_${sLower.replace(/^saavn_/, '')}`);
  }
  if (title) {
    const seedFp = getTrackFingerprint({ title, artist });
    if (seedFp) excludeFingerprintSet.add(seedFp);
  }

  try {
    let saavnArtistId = null;
    let saavnPrimaryArtistName = null;
    let saavnAlbumId = null;

    // 1. If Saavn song, fetch deep metadata to get accurate language, artist IDs, album
    if (seedId.startsWith('saavn_')) {
      const rawPid = seedId.replace('saavn_', '');
      try {
        const detailsRes = await fetch(`https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${rawPid}&_format=json&_marker=0&api_version=4`, {
          signal: AbortSignal.timeout(4000)
        });
        if (detailsRes.ok) {
          const detailsData = await detailsRes.json();
          const detail = detailsData[rawPid];
          if (detail) {
            if (detail.title && !title) title = decodeHtmlEntities(detail.title);
            if (detail.language && (!language || language === 'unknown')) language = detail.language.toLowerCase().trim();
            const primaryArtists = detail.more_info?.artistMap?.primary_artists || [];
            if (primaryArtists.length > 0) {
              saavnArtistId = primaryArtists[0].id;
              saavnPrimaryArtistName = primaryArtists[0].name;
              if (!artist) artist = primaryArtists.map(a => a.name).join(', ');
            }
            if (detail.more_info?.album_id) saavnAlbumId = detail.more_info.album_id;
            if (detail.more_info?.album && !album) album = detail.more_info.album;
          }
        }
      } catch (e) {
        console.warn('Saavn seed details fetch warning:', e.message);
      }
    }

    // Determine final language & vibe
    language = detectSongLanguage(title, artist, language);
    const { mood, energy } = detectSongVibe(title, artist, album);
    const primaryArtistClean = (saavnPrimaryArtistName || artist.split(',')[0] || '').trim();

    // 2. Fetch candidates from multiple relevant streams with pagination
    const fetchPromises = [];

    // Stream A: Top songs from the primary artist (if Saavn artist ID available)
    if (saavnArtistId) {
      fetchPromises.push(
        fetch(`https://www.jiosaavn.com/api.php?__call=artist.getArtistPageDetails&artistId=${saavnArtistId}&_format=json&_marker=0&api_version=4&n=20&p=${page}`, {
          signal: AbortSignal.timeout(4000)
        })
          .then(r => r.json())
          .then(d => (d.topSongs?.songs || d.songs || []).map(transformSaavnSong).filter(t => t && t.audioUrl))
          .catch(() => [])
      );
    }

    // Stream B: Vibe and genre specific search in this language (paginated)
    const vibeQuery = `${language} ${mood} hits`;
    fetchPromises.push(searchSaavn(vibeQuery, 20, page));

    // Stream C: Primary artist in this language (paginated)
    if (primaryArtistClean) {
      const artistQuery = `${primaryArtistClean} ${language} songs`;
      fetchPromises.push(searchSaavn(artistQuery, 15, page));
    }

    // Stream D: Discovery / Trending in language (paginated)
    const discoveryQuery = `${language} top songs`;
    fetchPromises.push(searchSaavn(discoveryQuery, 15, page));

    // Stream E: Secondary seeds from seedHistory (if available)
    if (rawSeedHistory) {
      const historySeeds = rawSeedHistory.split(',').map(s => s.trim()).filter(Boolean).slice(-3);
      for (const hSeed of historySeeds) {
        if (hSeed && hSeed !== seedId && !hSeed.startsWith('fp_')) {
          fetchPromises.push(searchSaavn(`${hSeed} songs`, 10, page));
        }
      }
    }

    // Fallback: If YouTube seed or non-Saavn, also query YouTube for vibe
    if (!seedId.startsWith('saavn_') || fetchPromises.length === 0) {
      fetchPromises.push(searchYouTube(`${title} ${artist}`, 10));
    }

    let totalCandidatesFetched = 0;
    const settled = await Promise.allSettled(fetchPromises);
    const candidatePool = [];
    for (const r of settled) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        totalCandidatesFetched += r.value.length;
        candidatePool.push(...r.value);
      }
    }

    const seenCanonicalIds = new Set();
    const seenFingerprints = new Set();
    const scoredCandidates = [];
    let mashupFilteredCount = 0;
    let excludedCount = 0;

    for (const track of candidatePool) {
      if (!track || !track.title) continue;

      const canonicalId = getCanonicalTrackId(track).toLowerCase();
      const trackIdLower = (track.id || '').toLowerCase();
      const rawIdLower = String(track.originalId || track.id || '').toLowerCase().replace(/^saavn_/, '');
      const fingerprint = getTrackFingerprint(track);

      // Check ID exclusions
      if (excludeIdSet.has(canonicalId) || excludeIdSet.has(trackIdLower) || excludeIdSet.has(rawIdLower)) {
        excludedCount++;
        continue;
      }
      // Check fingerprint exclusion
      if (fingerprint && excludeFingerprintSet.has(fingerprint)) {
        excludedCount++;
        continue;
      }

      // Check internal deduplication in this batch
      if (seenCanonicalIds.has(canonicalId) || (fingerprint && seenFingerprints.has(fingerprint))) {
        continue;
      }
      seenCanonicalIds.add(canonicalId);
      if (fingerprint) seenFingerprints.add(fingerprint);

      // Strict Music & Mashup-Exclusion Eligibility Validation
      const eligibility = isEligibleForRecommendation(track, validateMusicContent);
      if (!eligibility.eligible) {
        mashupFilteredCount++;
        continue;
      }

      // Calculate Vibe Matching Score (out of 100)
      let score = 50;

      // Language Compatibility (+40 exact, +15 compatible regional, -80 incompatible)
      const candLang = (track.language || detectSongLanguage(track.title, track.artist, '')).toLowerCase();
      if (candLang === language) {
        score += 40;
      } else if (areLanguagesCompatible(language, candLang, mood)) {
        score += 15;
      } else {
        score -= 80; // Strictly avoid random language jumps
      }

      // Artist Match (+30 primary, +15 collaborating)
      const candPrimaryArtist = extractPrimaryArtist(track.artist);
      if (primaryArtistClean && candPrimaryArtist && candPrimaryArtist === primaryArtistClean.toLowerCase()) {
        score += 30;
      }

      // Vibe Match (+25)
      const candVibe = detectSongVibe(track.title, track.artist, track.album || '');
      if (candVibe.mood === mood) {
        score += 25;
      }

      // Popularity / Play Count (+15)
      if (track.playCount > 500000 || track.isVerified) {
        score += 15;
      }

      // DIVERSITY & REPETITION PENALTIES (Section 4)
      // 1. Recent artist penalty: If artist was recently recommended, apply -35 penalty
      if (candPrimaryArtist && recentArtistsSet.has(candPrimaryArtist)) {
        score -= 35;
      }

      scoredCandidates.push({
        track,
        canonicalId,
        fingerprint,
        primaryArtist: candPrimaryArtist,
        score,
        candLang,
        candMood: candVibe.mood
      });
    }

    // Sort by score descending
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Apply batch diversity limits:
    // 1. Maximum 2 tracks per artist in a single recommendation batch
    // 2. Maximum 2 tracks per album in a single recommendation batch
    const artistBatchCount = new Map();
    const albumBatchCount = new Map();
    const finalResults = [];

    for (const item of scoredCandidates) {
      if (item.score < 20) continue; // Drop low relevance tracks

      const art = item.primaryArtist || 'unknown';
      if (art !== 'unknown') {
        const aCount = artistBatchCount.get(art) || 0;
        if (aCount >= 2) continue;
        artistBatchCount.set(art, aCount + 1);
      }

      const alb = (item.track.album || 'single').toLowerCase().trim();
      if (alb && alb !== 'single') {
        const alCount = albumBatchCount.get(alb) || 0;
        if (alCount >= 2) continue;
        albumBatchCount.set(alb, alCount + 1);
      }

      finalResults.push(item.track);
      if (finalResults.length >= limit) break;
    }

    // Fallback Pagination Discovery (Section 5 & 11):
    // If fewer than limit candidates found, automatically discover next page!
    if (finalResults.length < limit) {
      try {
        const nextPage = page + 1;
        const page2Songs = await searchSaavn(`${language} ${mood} hits`, limit, nextPage);
        for (const fb of page2Songs) {
          const fbCanonical = getCanonicalTrackId(fb).toLowerCase();
          const fbFp = getTrackFingerprint(fb);
          if (excludeIdSet.has(fbCanonical) || (fbFp && excludeFingerprintSet.has(fbFp))) continue;
          if (seenCanonicalIds.has(fbCanonical) || (fbFp && seenFingerprints.has(fbFp))) continue;
          const fbEligible = isEligibleForRecommendation(fb, validateMusicContent);
          if (!fbEligible.eligible) continue;
          const candLang = (fb.language || detectSongLanguage(fb.title, fb.artist, '')).toLowerCase();
          if (candLang !== language && !areLanguagesCompatible(language, candLang, mood)) continue;

          seenCanonicalIds.add(fbCanonical);
          if (fbFp) seenFingerprints.add(fbFp);
          finalResults.push(fb);
          if (finalResults.length >= limit) break;
        }
      } catch (e) {}
    }

    res.json({
      success: true,
      vibe: mood,
      energy: energy,
      language: language,
      page: page,
      nextPage: page + 1,
      seed: {
        id: seedId,
        title,
        artist,
        language
      },
      count: finalResults.length,
      results: finalResults,
      diagnostics: {
        totalCandidatesFetched,
        uniqueCandidates: seenCanonicalIds.size,
        excludedCount,
        mashupFilteredCount,
        returnedCount: finalResults.length
      }
    });
  } catch (err) {
    console.error('Recommendations endpoint error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate recommendations' });
  }
});

// Resilient Stream Proxy with HTTP Range Support & Full Length Audio
app.get('/api/stream', async (req, res) => {
  const audioUrl = req.query.url;
  if (!audioUrl || !audioUrl.startsWith('http')) {
    return res.status(400).send('Invalid audio URL');
  }

  const controller = new AbortController();
  req.on('close', () => {
    try { controller.abort(); } catch (e) {}
  });

  try {
    const range = req.headers.range;
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    if (range) {
      fetchHeaders['Range'] = range;
    }

    const audioRes = await fetch(audioUrl, {
      headers: fetchHeaders,
      signal: controller.signal
    });
    if (!audioRes.ok && audioRes.status !== 206) {
      return res.status(audioRes.status).send('Streaming upstream error');
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', audioRes.headers.get('content-type') || 'audio/mp4');

    if (audioRes.headers.get('content-range')) {
      res.setHeader('Content-Range', audioRes.headers.get('content-range'));
      res.status(206);
    } else {
      res.status(audioRes.status);
    }

    if (audioRes.headers.get('content-length')) {
      res.setHeader('Content-Length', audioRes.headers.get('content-length'));
    }

    const { Readable } = require('stream');
    const stream = Readable.fromWeb(audioRes.body);
    stream.on('error', (err) => {
      if (!res.headersSent) res.status(500).send('Stream error');
    });
    stream.pipe(res);
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Stream proxy error:', err.message);
    if (!res.headersSent) res.status(500).send('Stream error');
  }
});

// Audio Silence Bounds Endpoint (Edge-only dead silence removal)
app.get('/api/audio/silence-bounds', async (req, res) => {
  const trackId = (req.query.trackId || req.query.id || '').trim();
  const url = (req.query.url || '').trim();
  const duration = parseFloat(req.query.duration) || 0;

  try {
    const result = await analyzeTrackSilence({
      trackId,
      url,
      duration,
      ytdlGetter: getYtdl
    });
    res.json(result);
  } catch (err) {
    console.warn('[SilenceBounds] Endpoint error:', err.message);
    res.json({
      success: true,
      trackId,
      effectiveStart: 0,
      effectiveEnd: duration > 0 ? duration : 200,
      duration: duration > 0 ? duration : 200,
      source: 'fallback'
    });
  }
});

// Same-Origin Audio Stream Proxy with HTTP Range Support (CORS-enabled Tier A fallback)
app.get('/api/audio/stream-proxy', async (req, res) => {
  const audioUrl = req.query.url;
  if (!audioUrl || !audioUrl.startsWith('http')) {
    return res.status(400).send('Invalid audio URL');
  }

  const controller = new AbortController();
  req.on('close', () => {
    try { controller.abort(); } catch (e) {}
  });

  try {
    const range = req.headers.range;
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    if (range) {
      fetchHeaders['Range'] = range;
    }

    const audioRes = await fetch(audioUrl, {
      headers: fetchHeaders,
      signal: controller.signal
    });
    if (!audioRes.ok && audioRes.status !== 206) {
      return res.status(audioRes.status).send('Streaming upstream error');
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', audioRes.headers.get('content-type') || 'audio/mp4');

    if (audioRes.headers.get('content-range')) {
      res.setHeader('Content-Range', audioRes.headers.get('content-range'));
      res.status(206);
    } else {
      res.status(audioRes.status);
    }

    if (audioRes.headers.get('content-length')) {
      res.setHeader('Content-Length', audioRes.headers.get('content-length'));
    }

    const { Readable } = require('stream');
    const stream = Readable.fromWeb(audioRes.body);
    stream.on('error', (err) => {
      if (!res.headersSent) res.status(500).send('Stream error');
    });
    stream.pipe(res);
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Audio stream proxy error:', err.message);
    if (!res.headersSent) res.status(500).send('Stream error');
  }
});

// YouTube Content Validation (Strictly permits pure Music - Category 10; rejects podcasts & non-music)
app.get('/api/validate-content', async (req, res) => {
  const ytId = (req.query.id || '').trim();
  const title = (req.query.title || '').trim();
  const channel = (req.query.channel || req.query.artist || '').trim();

  if (!ytId) return res.status(400).json({ allowed: false, error: 'Missing id' });

  const result = await validateYouTubeVideoMetadata(ytId, title, channel);
  res.json({
    allowed: Boolean(result.allowed),
    categoryId: result.categoryId || '0',
    category: result.category || 'Unknown',
    isPodcast: Boolean(result.reason && result.reason.includes('Podcast')),
    reason: result.reason || (result.allowed ? 'Verified Music Content' : 'Non-Music Content')
  });
});

// YouTube Direct Audio Streaming Endpoint (Ad-Free Background Audio Stream)
app.get('/api/yt-stream', async (req, res) => {
  const ytId = (req.query.id || '').trim();
  if (!ytId) return res.status(400).send('Missing id');

  try {
    const ytdl = await getYtdl();
    if (!ytdl) return res.status(500).send('Audio extractor unavailable');

    // Fetch video info to select native AAC / MP4 format (vital for iOS/Android background tab playback)
    // Parse HTTP Range header for seamless HTML5 Audio seek, pause & resume
    const rangeHeader = req.headers.range;
    let rangeOptions = undefined;
    let startByte = 0;
    let endByte = undefined;

    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const parts = rangeHeader.replace('bytes=', '').split('-');
      startByte = parseInt(parts[0], 10) || 0;
      if (parts[1]) {
        endByte = parseInt(parts[1], 10);
      }
      rangeOptions = { start: startByte };
      if (endByte !== undefined && !isNaN(endByte)) {
        rangeOptions.end = endByte;
      }
    }

    let stream;
    let contentType = 'audio/mp4';
    let contentLength = undefined;

    try {
      const info = await ytdl.getInfo(ytId);
      const audioFormats = info.formats.filter(f => f.hasAudio && !f.hasVideo);
      
      // Prioritize mp4/aac format (itag 140 or similar) for 100% universal mobile lockscreen & background compatibility
      const chosenFormat = audioFormats.find(f => f.container === 'mp4' && f.audioBitrate >= 120) ||
                           audioFormats.find(f => f.container === 'mp4') ||
                           audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0];

      if (chosenFormat) {
        contentType = chosenFormat.mimeType ? chosenFormat.mimeType.split(';')[0] : (chosenFormat.container === 'mp4' ? 'audio/mp4' : 'audio/webm');
        if (chosenFormat.contentLength) {
          contentLength = parseInt(chosenFormat.contentLength, 10);
        }
        stream = await ytdl.download(info, {
          format: chosenFormat,
          range: rangeOptions,
          highWaterMark: 1 << 22
        });
      }
    } catch (infoErr) {
      console.warn('ytdl.getInfo note, using fallback download:', infoErr.message);
    }

    if (!stream) {
      stream = await ytdl.download(ytId, {
        filter: { hasAudio: true, hasVideo: false },
        range: rangeOptions,
        highWaterMark: 1 << 22
      });
      contentType = 'audio/mp4';
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (rangeOptions) {
      const finalEnd = endByte !== undefined ? endByte : (contentLength ? contentLength - 1 : undefined);
      if (finalEnd !== undefined) {
        res.setHeader('Content-Range', `bytes ${startByte}-${finalEnd}/${contentLength || '*'}`);
        res.setHeader('Content-Length', finalEnd - startByte + 1);
      } else {
        res.setHeader('Content-Range', `bytes ${startByte}-*/*`);
      }
      res.status(206);
    } else if (contentLength) {
      res.setHeader('Content-Length', contentLength);
      res.status(200);
    } else {
      res.status(200);
    }

    req.on('close', () => {
      try { if (stream && typeof stream.destroy === 'function') stream.destroy(); } catch (e) {}
    });

    stream.on('error', (err) => {
      console.warn('YT audio stream pipe note:', err.message);
      if (!res.headersSent) res.status(500).send('Audio stream error');
    });

    stream.pipe(res);
  } catch (err) {
    console.error('YT stream error:', err.message);
    if (!res.headersSent) res.status(500).send('Failed to stream audio');
  }
});

// ============================================================================
// MUSISURF - ADVANCED MULTI-STAGE AUTOMATIC LYRICS DISCOVERY ENGINE
// 1. Persistent Verified DB -> 2. Contributed Store -> 3. LRCLIB (Exact + Scored + Title)
// -> 4. JioSaavn Lyrics API -> 5. Lyrics.ovh -> 6. Legitimate Internet Fallback
// ============================================================================
app.get('/api/lyrics', async (req, res) => {
  const track = (req.query.track || req.query.title || '').trim();
  const artist = (req.query.artist || '').trim();
  const album = (req.query.album || '').trim();
  const duration = req.query.duration ? parseInt(req.query.duration, 10) : null;
  const trackId = (req.query.trackId || '').trim();

  if (!track) {
    return res.json({ success: false, message: 'Track name is required' });
  }

  try {
    const result = await lyricsDiscoveryEngine.findLyrics({
      rawTitle: track,
      title: track,
      artist,
      album,
      duration,
      trackId
    });
    return res.json(result);
  } catch (err) {
    console.error('Lyrics discovery error:', err.message);
    return res.json({ success: false, verified: false, message: "Lyrics aren't available for this track yet." });
  }
});

// User-Contributed Verified Lyrics Endpoint
app.post('/api/lyrics/contribute', (req, res) => {
  const { track, artist, album, lyrics } = req.body || {};
  if (!track || !lyrics || lyrics.trim().length < 20) {
    return res.status(400).json({ success: false, message: 'Track title and valid lyrics (at least 20 characters) are required.' });
  }

  try {
    const contribData = lyricsDiscoveryEngine.contributeLyrics({ track, artist, album, lyrics });
    return res.json({ success: true, message: 'Lyrics contributed and verified successfully!', data: contribData });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// Lyrics Discovery Status & Diagnostics Endpoint
app.get('/api/lyrics/status', (req, res) => {
  res.json({
    success: true,
    verifiedCount: Object.keys(lyricsDiscoveryEngine.verifiedDb || {}).length,
    contributedCount: Object.keys(lyricsDiscoveryEngine.contributedDb || {}).length
  });
});

// Legacy / Optional AI lyrics route - Returns honest disabled status
app.post('/api/ai-lyrics', (req, res) => {
  res.json({
    success: false,
    message: "AI-generated fictional lyrics have been permanently disabled in MusiSurf to ensure authentic verified lyrics."
  });
});

// Image Proxy for Canvas Color Extraction (Zero CORS Issues)
app.get('/api/image-proxy', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).send('Invalid url');
  }
  try {
    const upstream = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!upstream.ok) return res.status(upstream.status).send('Failed to fetch image');
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const arrayBuffer = await upstream.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (e) {
    res.status(500).send('Proxy error');
  }
});

// Direct Song Downloader for Mobile and Desktop (Downloads files into user's Downloads folder)
app.get('/api/download', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  const audioUrl = req.query.url;
  const ytId = req.query.ytId;
  const rawTitle = req.query.title || 'song';
  const rawArtist = req.query.artist || '';
  
  let cleanName = rawTitle.replace(/[\\/:*?"<>|]/g, '').trim();
  if (rawArtist) {
    cleanName = `${cleanName} - ${rawArtist.replace(/[\\/:*?"<>|]/g, '').trim()}`;
  }
  const filename = `${cleanName || 'MusiSurf-Track'}.mp3`;
  const encodedFilename = encodeURIComponent(filename);

  // 1. If direct 320kbps audioUrl is provided (JioSaavn)
  if (audioUrl && audioUrl.startsWith('http')) {
    try {
      const audioRes = await fetch(audioUrl);
      if (audioRes.ok) {
        res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
        res.setHeader('Content-Type', 'audio/mpeg');
        if (audioRes.headers.get('content-length')) {
          res.setHeader('Content-Length', audioRes.headers.get('content-length'));
        }

        const { Readable } = require('stream');
        const stream = Readable.fromWeb(audioRes.body);
        return stream.pipe(res);
      }
    } catch (err) {
      console.warn('Direct stream download note:', err.message);
    }
  }

  // 2. High-quality studio audio search on Saavn using song title and artist
  if (rawTitle) {
    try {
      const matchTracks = await searchSaavn(`${rawTitle} ${rawArtist}`.trim(), 5);
      if (matchTracks && matchTracks.length > 0 && matchTracks[0].audioUrl) {
        const audioRes = await fetch(matchTracks[0].audioUrl);
        if (audioRes.ok) {
          res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
          res.setHeader('Content-Type', 'audio/mpeg');
          const { Readable } = require('stream');
          const stream = Readable.fromWeb(audioRes.body);
          return stream.pipe(res);
        }
      }
    } catch (err) {
      console.warn('Saavn fallback search note:', err.message);
    }
  }

  // 3. YouTube audio stream via ytId using safe lazy-loaded extractor
  if (ytId) {
    try {
      const ytdl = await getYtdl();
      if (ytdl) {
        res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
        res.setHeader('Content-Type', 'audio/mpeg');

        const stream = await ytdl.download(ytId, {
          filter: { hasAudio: true, hasVideo: false }
        });
        return stream.pipe(res);
      }
    } catch (err) {
      console.warn('YouTube audio stream download note:', err.message);
    }
  }

  res.status(404).send('Audio stream unavailable for download');
});

// ==========================================================================
// NEON BUILT-IN AUTH & USER LIBRARY PERSISTENCE API
// ==========================================================================

// Client Auth Configuration
app.get('/api/auth/config', (req, res) => {
  res.json({
    authBaseUrl: process.env.NEON_AUTH_BASE_URL || '',
    jwksUrl: process.env.NEON_AUTH_JWKS_URL || '',
    googleEnabled: true
  });
});

// Current User Session
app.get('/api/auth/me', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    res.json({
      authenticated: Boolean(user),
      user: user || null
    });
  } catch (err) {
    res.json({ authenticated: false, user: null });
  }
});

// Proxy Sign-Up to Neon Auth
app.post('/api/auth/sign-up', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const remoteRes = await fetch(`${process.env.NEON_AUTH_BASE_URL}/sign-up/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': origin,
        'User-Agent': req.headers['user-agent'] || 'MusiSurf'
      },
      body: JSON.stringify({
        email,
        password,
        name: name || (email ? email.split('@')[0] : 'User'),
        callbackURL: `${origin}/`
      })
    });

    const setCookies = remoteRes.headers.getSetCookie ? remoteRes.headers.getSetCookie() : [remoteRes.headers.get('set-cookie')].filter(Boolean);
    for (const sc of setCookies) {
      res.append('Set-Cookie', sc);
    }

    const data = await remoteRes.json().catch(() => ({}));
    if (!remoteRes.ok) {
      return res.status(remoteRes.status).json(data);
    }

    // Automatically trigger verification OTP email
    try {
      await fetch(`${process.env.NEON_AUTH_BASE_URL}/email-otp/send-verification-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': origin
        },
        body: JSON.stringify({ email, type: 'email-verification' })
      });
    } catch (e) {}

    res.json({
      success: true,
      requiresVerification: true,
      user: data.user || null,
      message: 'Account created. Please enter the 6-digit verification code sent to your email.'
    });
  } catch (err) {
    console.error('[Auth API] Sign-up error:', err.message);
    res.status(500).json({ error: 'Sign-up failed. Please try again.' });
  }
});

// Proxy Sign-In to Neon Auth
app.post('/api/auth/sign-in', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const remoteRes = await fetch(`${process.env.NEON_AUTH_BASE_URL}/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': origin,
        'User-Agent': req.headers['user-agent'] || 'MusiSurf'
      },
      body: JSON.stringify({ email, password })
    });

    const setCookies = remoteRes.headers.getSetCookie ? remoteRes.headers.getSetCookie() : [remoteRes.headers.get('set-cookie')].filter(Boolean);
    for (const sc of setCookies) {
      res.append('Set-Cookie', sc);
    }

    const data = await remoteRes.json().catch(() => ({}));
    if (!remoteRes.ok) {
      return res.status(remoteRes.status).json(data);
    }

    res.json({
      success: true,
      user: data.user || null,
      token: data.token || null
    });
  } catch (err) {
    console.error('[Auth API] Sign-in error:', err.message);
    res.status(500).json({ error: 'Sign-in failed. Please try again.' });
  }
});

// Verify 6-digit Email Verification Code
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and 6-digit OTP code are required' });
    }

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const remoteRes = await fetch(`${process.env.NEON_AUTH_BASE_URL}/email-otp/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': origin,
        'User-Agent': req.headers['user-agent'] || 'MusiSurf'
      },
      body: JSON.stringify({ email, otp: String(otp).trim() })
    });

    const setCookies = remoteRes.headers.getSetCookie ? remoteRes.headers.getSetCookie() : [remoteRes.headers.get('set-cookie')].filter(Boolean);
    for (const sc of setCookies) {
      res.append('Set-Cookie', sc);
    }

    const data = await remoteRes.json().catch(() => ({}));
    if (!remoteRes.ok) {
      return res.status(remoteRes.status).json(data);
    }

    res.json({
      success: true,
      user: data.user || null,
      token: data.token || null,
      message: 'Email verified successfully!'
    });
  } catch (err) {
    console.error('[Auth API] Verify OTP error:', err.message);
    res.status(500).json({ error: 'Verification failed. Please check the code and try again.' });
  }
});

// Resend Verification Code
app.post('/api/auth/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const remoteRes = await fetch(`${process.env.NEON_AUTH_BASE_URL}/email-otp/send-verification-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': origin
      },
      body: JSON.stringify({ email, type: 'email-verification' })
    });

    const data = await remoteRes.json().catch(() => ({}));
    res.status(remoteRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to resend code.' });
  }
});

// Sign-Out
app.post('/api/auth/sign-out', async (req, res) => {
  try {
    const cookieHeader = req.headers.cookie || '';
    if (process.env.NEON_AUTH_BASE_URL && cookieHeader) {
      await fetch(`${process.env.NEON_AUTH_BASE_URL}/sign-out`, {
        method: 'POST',
        headers: { cookie: cookieHeader }
      }).catch(() => {});
    }
  } catch (e) {}

  res.clearCookie('better-auth.session_token', { path: '/' });
  res.clearCookie('session_token', { path: '/' });
  res.json({ success: true, message: 'Signed out successfully' });
});

// Social Login URL (Google)
app.get('/api/auth/social-url', (req, res) => {
  const provider = req.query.provider || 'google';
  const callbackUrl = req.query.callbackURL || `${req.protocol}://${req.get('host')}/`;
  const url = `${process.env.NEON_AUTH_BASE_URL}/sign-in/social?provider=${encodeURIComponent(provider)}&callbackURL=${encodeURIComponent(callbackUrl)}`;
  res.json({ url });
});

// --------------------------------------------------------------------------
// USER LIBRARY PERSISTENCE (LIKED TRACKS & PLAYLISTS)
// --------------------------------------------------------------------------

// Get Liked Tracks
app.get('/api/library/likes', requireAuth, async (req, res) => {
  try {
    const tracks = await libraryService.getUserLikes(req.user.id);
    res.json({ success: true, tracks });
  } catch (err) {
    console.error('[Library API] Get likes error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Toggle Liked Track
app.post('/api/library/likes/toggle', requireAuth, async (req, res) => {
  try {
    const track = req.body.track || req.body;
    if (!track) return res.status(400).json({ error: 'Track payload required' });

    const result = await libraryService.toggleUserLike(req.user.id, track);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Library API] Toggle like error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get User Playlists
app.get('/api/library/playlists', requireAuth, async (req, res) => {
  try {
    const playlists = await libraryService.getUserPlaylists(req.user.id);
    res.json({ success: true, playlists });
  } catch (err) {
    console.error('[Library API] Get playlists error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create Playlist
app.post('/api/library/playlists', requireAuth, async (req, res) => {
  try {
    const { name, description, cover_url, is_public } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }

    const playlist = await libraryService.createUserPlaylist(req.user.id, {
      name,
      description,
      cover_url,
      is_public
    });
    res.json({ success: true, playlist });
  } catch (err) {
    console.error('[Library API] Create playlist error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Single Playlist and its Tracks
app.get('/api/library/playlists/:id', requireAuth, async (req, res) => {
  try {
    const playlist = await libraryService.getPlaylistById(req.params.id, req.user.id);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }
    res.json({ success: true, playlist });
  } catch (err) {
    console.error('[Library API] Get playlist error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add Track to Playlist
app.post('/api/library/playlists/:id/tracks', requireAuth, async (req, res) => {
  try {
    const track = req.body.track || req.body;
    if (!track) return res.status(400).json({ error: 'Track payload required' });

    const trackRecord = await libraryService.addTrackToPlaylist(req.params.id, req.user.id, track);
    res.json({ success: true, track: trackRecord });
  } catch (err) {
    console.error('[Library API] Add track error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Remove Track from Playlist
app.delete('/api/library/playlists/:id/tracks/:trackId', requireAuth, async (req, res) => {
  try {
    await libraryService.removeTrackFromPlaylist(req.params.id, req.user.id, req.params.trackId);
    res.json({ success: true, removed: true, trackId: req.params.trackId });
  } catch (err) {
    console.error('[Library API] Remove track error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Playlist
app.delete('/api/library/playlists/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await libraryService.deletePlaylist(req.params.id, req.user.id);
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('[Library API] Delete playlist error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------------------------------------------------------------
// ACCOUNT-SYNCED PLAYLIST PLAYBACK PROGRESS (CONTINUE LISTENING / RESUME)
// --------------------------------------------------------------------------

// Get progress for all user playlists in a single batch
app.get('/api/library/playlists-progress', requireAuth, async (req, res) => {
  try {
    const progressMap = await libraryService.getAllPlaylistsProgress(req.user.id);
    res.json({ success: true, progress: progressMap });
  } catch (err) {
    console.error('[Progress API] Get all progress error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get playback progress for a specific playlist
app.get('/api/library/playlists/:id/progress', requireAuth, async (req, res) => {
  try {
    const progress = await libraryService.getPlaylistProgress(req.user.id, req.params.id);
    res.json({ success: true, progress });
  } catch (err) {
    console.error('[Progress API] Get playlist progress error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save / update playback progress for a specific playlist
const handleSaveProgress = async (req, res) => {
  try {
    const playlistId = req.params.id;
    const data = req.body || {};
    if (!data.trackId && !data.track_id) {
      return res.status(400).json({ success: false, error: 'trackId is required' });
    }

    const saved = await libraryService.savePlaylistProgress(req.user.id, playlistId, data);
    res.json({ success: true, progress: saved });
  } catch (err) {
    console.error('[Progress API] Save playlist progress error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

app.post('/api/library/playlists/:id/progress', requireAuth, handleSaveProgress);
app.put('/api/library/playlists/:id/progress', requireAuth, handleSaveProgress);

// Status and Info
app.get('/api/status', (req, res) => {
  res.json({
    app: 'MusiSurf',
    version: '1.0.0',
    adFree: true,
    fullLengthAudio: true,
    status: 'online',
    uptime: process.uptime()
  });
});

// Fallback all routes to index.html for SPA routing
app.use((req, res) => {
  const indexPath = path.resolve(__dirname, 'public', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err && !res.headersSent) {
      try {
        if (fs.existsSync(indexPath)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.status(200).send(fs.readFileSync(indexPath, 'utf8'));
        }
      } catch (e) {}
      res.status(500).send('<h1>MusiSurf</h1><p>Application loading error. Please refresh.</p>');
    }
  });
});

// Centralized error handler to prevent unhandled 500 FUNCTION_INVOCATION_FAILED on Vercel
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message || 'Unknown error' });
  }
});

// Start standalone server locally; never call app.listen() inside Vercel serverless functions
if (!process.env.VERCEL && require.main === module) {
  initDailyTrendingScheduler();
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🌊 MusiSurf Music Streaming Server Active!`);
    console.log(`🎵 Ad-Free & Full-Length Song Streaming Ready`);
    console.log(`🌐 Local URL: http://localhost:${PORT}`);
    console.log(`===============================================`);
  });
}

app.searchSaavn = searchSaavn;
app.searchYouTube = searchYouTube;
app.validateMusicContent = validateMusicContent;
app.validateYouTubeVideoMetadata = validateYouTubeVideoMetadata;

module.exports = app;
module.exports.searchSaavn = searchSaavn;
module.exports.searchYouTube = searchYouTube;
module.exports.validateMusicContent = validateMusicContent;
module.exports.validateYouTubeVideoMetadata = validateYouTubeVideoMetadata;


