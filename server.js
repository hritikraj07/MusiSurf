const express = require('express');
const cors = require('cors');
const path = require('path');
const CryptoJS = require('crypto-js');

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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// Search JioSaavn (Queries general & dedicated song engines in parallel for 100% catalog coverage)
async function searchSaavn(query, limit = 25) {
  try {
    const urls = [
      `https://www.jiosaavn.com/api.php?__call=search.getResults&q=${encodeURIComponent(query)}&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=${limit}&p=1`,
      `https://www.jiosaavn.com/api.php?__call=search.getSongSearchResults&q=${encodeURIComponent(query)}&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=${limit}&p=1`
    ];

    const responses = await Promise.allSettled(urls.map(u => fetch(u, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
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
      if (item && item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        const transformed = transformSaavnSong(item);
        if (transformed && transformed.audioUrl) {
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

// Strict Content Filter: Strictly return only Music and Podcasts (Zero gaming, vlogs, reactions, etc.)
function validateStrictMusicOrPodcast(rawTitle, rawChannel) {
  const t = (rawTitle || '').toLowerCase();
  const c = (rawChannel || '').toLowerCase();

  // Podcasts and episodes are explicitly allowed
  const isPodcast = t.includes('podcast') || t.includes('episode') || c.includes('podcast') || /\b(ep\s*\d+|ep\.\s*\d+)\b/i.test(t);
  if (isPodcast) {
    return { allowed: true, categoryId: '10', isPodcast: true };
  }

  // Blacklist standard non-music YouTube content (gaming, vlogs, reactions, tech, unboxing, tutorials, etc.)
  const isBlocked = /\b(gameplay|walkthrough|playthrough|let'?s play|gaming|gamer|fortnite|minecraft|roblox|gta\s*[v5]?|valorant|cod|warzone|apex legends|pubg|speedrun|vlog|daily vlog|prank|reaction to|reacting to|reacts to|unboxing|tech review|phone review|tutorial|how to fix|news live|breaking news|mukbang|haul|storytime|makeup tutorial|grwm|tiktok compilation|fails compilation)\b/i.test(t) ||
                    /\b(gaming|gamer|walkthrough|playthrough|vlogs|vlogger|news live)\b/i.test(c);

  if (isBlocked) {
    return { allowed: false, categoryId: '0', isPodcast: false };
  }

  // Allowed Music (YouTube Music Category 10)
  return { allowed: true, categoryId: '10', isPodcast: false };
}

// Universal Multi-Source YouTube Search Engine (Innertube JSON API + Cookie Scraper Fallback)
async function searchYouTube(query, limit = 30) {
  if (!query) return [];

  // Strategy 1: YouTube Innertube API (Official internal pure JSON API - ultra fast, zero HTML parsing)
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20240301.00.00'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240301.00.00',
            hl: 'en',
            gl: 'US'
          }
        },
        query: query
      })
    });

    if (res.ok) {
      const data = await res.json();
      const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
      const results = [];

      for (const section of contents) {
        const items = section?.itemSectionRenderer?.contents || [];
        for (const item of items) {
          if (item.videoRenderer) {
            const v = item.videoRenderer;
            const videoId = v.videoId;
            if (!videoId) continue;

            const rawTitle = v.title?.runs?.[0]?.text || 'Unknown Title';
            const rawChannel = v.ownerText?.runs?.[0]?.text || 'Universal Audio';

            // Strict Content Filter check: Zero gaming, vlogs, reactions allowed
            const filterCheck = validateStrictMusicOrPodcast(rawTitle, rawChannel);
            if (!filterCheck.allowed) continue;

            const durationStr = v.lengthText?.simpleText || '3:30';
            const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            const viewStr = v.viewCountText?.simpleText || v.shortViewCountText?.simpleText || '';
            const playCount = parseViewCount(viewStr);
            const isVerified = Boolean(v.ownerBadges && v.ownerBadges.length > 0) ||
              /official|tips|t-series|sony|zee|yrf|speed|saregama|vevo/i.test(rawChannel);

            const parts = durationStr.split(':').map(Number);
            let durationSec = 210;
            if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
            else if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];

            const { title, artist, album } = parseYouTubeMusicTitle(rawTitle, rawChannel);

            results.push({
              id: 'yt_' + videoId,
              ytId: videoId,
              title: title,
              artist: artist,
              album: album,
              year: '',
              image: thumb,
              audioUrl: `/api/yt-stream?id=${videoId}`,
              streamUrl: `/api/yt-stream?id=${videoId}`,
              duration: durationSec,
              durationStr: durationStr,
              playCount: playCount,
              isVerified: isVerified,
              source: 'youtube',
              categoryId: filterCheck.categoryId,
              isPodcast: filterCheck.isPodcast,
              hasDirectAudio: true
            });

            if (results.length >= limit) break;
          }
        }
        if (results.length >= limit) break;
      }

      if (results.length > 0) return results;
    }
  } catch (err) {
    console.warn('Innertube search note:', err.message);
  }

  // Strategy 2: Web Scraper with Consent & Cookie Bypass
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+478; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg;'
      }
    });

    if (res.ok) {
      const html = await res.text();
      const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.+?});/);
      if (match) {
        const data = JSON.parse(match[1]);
        const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
        const results = [];

        for (const section of contents) {
          const items = section?.itemSectionRenderer?.contents || [];
          for (const item of items) {
            if (item.videoRenderer) {
              const v = item.videoRenderer;
              const videoId = v.videoId;
              if (!videoId) continue;

              const rawTitle = v.title?.runs?.[0]?.text || 'Unknown Title';
              const rawChannel = v.ownerText?.runs?.[0]?.text || 'Universal Audio';

              // Strict Content Filter check: Zero gaming, vlogs, reactions allowed
              const filterCheck = validateStrictMusicOrPodcast(rawTitle, rawChannel);
              if (!filterCheck.allowed) continue;

              const durationStr = v.lengthText?.simpleText || '3:30';
              const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
              const viewStr = v.viewCountText?.simpleText || v.shortViewCountText?.simpleText || '';
              const playCount = parseViewCount(viewStr);
              const isVerified = Boolean(v.ownerBadges && v.ownerBadges.length > 0) ||
                /official|tips|t-series|sony|zee|yrf|speed|saregama|vevo/i.test(rawChannel);

              const parts = durationStr.split(':').map(Number);
              let durationSec = 210;
              if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
              else if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];

              const { title, artist, album } = parseYouTubeMusicTitle(rawTitle, rawChannel);

              results.push({
                id: 'yt_' + videoId,
                ytId: videoId,
                title: title,
                artist: artist,
                album: album,
                year: '',
                image: thumb,
                audioUrl: `/api/yt-stream?id=${videoId}`,
                streamUrl: `/api/yt-stream?id=${videoId}`,
                duration: durationSec,
                durationStr: durationStr,
                playCount: playCount,
                isVerified: isVerified,
                source: 'youtube',
                categoryId: filterCheck.categoryId,
                isPodcast: filterCheck.isPodcast,
                hasDirectAudio: true
              });

              if (results.length >= limit) break;
            }
          }
          if (results.length >= limit) break;
        }

        if (results.length > 0) return results;
      }
    }
  } catch (err) {
    console.warn('YouTube scraper note:', err.message);
  }

  return [];
}

// Unified Search Route with Spotify-grade Famous Song First Ranking
app.get('/api/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  const source = req.query.source || 'all'; // 'all', 'saavn', 'youtube'

  if (!query) {
    return res.json({ success: true, results: [] });
  }

  try {
    let results = [];

    if (source === 'saavn') {
      const saavnSongs = await searchSaavn(query, 30);
      results = saavnSongs
        .map(t => ({ ...t, score: calculateRelevanceScore(t, query) }))
        .sort((a, b) => b.score - a.score);
    } else if (source === 'youtube') {
      const ytSongs = await searchYouTube(query, 30);
      results = ytSongs
        .map(t => ({ ...t, score: calculateRelevanceScore(t, query) }))
        .sort((a, b) => b.score - a.score);
    } else {
      // Parallel Multi-Source Search for 100% Comprehensive Universal Coverage
      const [saavnRes, ytRes] = await Promise.allSettled([
        searchSaavn(query, 30),
        searchYouTube(query, 30)
      ]);

      const saavnSongs = saavnRes.status === 'fulfilled' ? (saavnRes.value || []) : [];
      const ytSongs = ytRes.status === 'fulfilled' ? (ytRes.value || []) : [];

      // Combine all tracks and calculate relevance score based on:
      // - Exact title and artist match
      // - Real stream / view count popularity (millions of plays)
      // - Verified artist / official record label status
      // - Penalty for covers / karaoke / remakes unless specifically queried
      const allTracks = [...saavnSongs, ...ytSongs].map(track => ({
        ...track,
        score: calculateRelevanceScore(track, query)
      }));

      // Sort by score in descending order (FAMOUS ORIGINAL HITS ALWAYS COME FIRST)
      allTracks.sort((a, b) => b.score - a.score);

      // Smart deduplication: keep highest-scored version of each unique track
      const seen = new Map();
      const deduped = [];

      for (const track of allTracks) {
        if (!track || !track.title) continue;
        const key = getDedupeKey(track.title, track.artist);
        if (!seen.has(key)) {
          seen.set(key, true);
          deduped.push(track);
        }
      }

      results = deduped;
    }

    res.json({
      success: true,
      query,
      count: results.length,
      results
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
    queries: ["Rahat Fateh Ali Khan Sufi", "Kailash Kher Soulful", "Javed Ali Sufi Hits", "A.R. Rahman Sufi Melodies", "Nusrat Fateh Ali Khan Bollywood"]
  },
  {
    id: 'bollywood-acoustic',
    title: "Chai & Acoustic — Unplugged Bollywood Chill",
    subtitle: "Gentle acoustic guitars, cozy sunset breeze, and soft intimate unplugged melodies",
    queries: ["Bollywood Acoustic Unplugged", "Jasleen Royal Soft Melodies", "Prateek Kuhad Hindi", "Anuv Jain Melodies", "Sanam Acoustic Hits"]
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

      const uniqueTracks = deduplicateAndShuffle(combinedTracks, 12);
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

  if (!forceRefresh && trendingSectionsCache && now - trendingCacheTime < 1000 * 60 * 5) {
    // Return a fresh shuffle of the distinct album tracks so home page is always dynamic
    const dynamicSections = trendingSectionsCache.map(sec => ({
      ...sec,
      tracks: [...sec.tracks].sort(() => Math.random() - 0.5)
    }));
    return res.json({ success: true, sections: dynamicSections });
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
    res.json({ success: true, sections: dynamicSections });
  } catch (err) {
    console.error('Trending fetch error:', err);
    if (trendingSectionsCache) {
      return res.json({ success: true, sections: trendingSectionsCache });
    }
    res.status(500).json({ success: false, error: 'Failed to load trending music' });
  }
});

// Resilient Stream Proxy with HTTP Range Support & Full Length Audio
app.get('/api/stream', async (req, res) => {
  const audioUrl = req.query.url;
  if (!audioUrl || !audioUrl.startsWith('http')) {
    return res.status(400).send('Invalid audio URL');
  }

  try {
    const range = req.headers.range;
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    if (range) {
      fetchHeaders['Range'] = range;
    }

    const audioRes = await fetch(audioUrl, { headers: fetchHeaders });
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
    stream.pipe(res);
  } catch (err) {
    console.error('Stream proxy error:', err.message);
    res.status(500).send('Stream error');
  }
});

// YouTube Content Validation (Strictly permits Category 10: Music or Podcasts/Episodes)
app.get('/api/validate-content', async (req, res) => {
  const ytId = (req.query.id || '').trim();
  const title = (req.query.title || '').trim().toLowerCase();

  if (!ytId) return res.status(400).json({ allowed: false, error: 'Missing id' });

  // If title indicates podcast or episode, it is valid!
  if (title.includes('podcast') || title.includes('episode')) {
    return res.json({ allowed: true, categoryId: '10', isPodcast: true });
  }

  try {
    const resp = await fetch(`https://www.youtube.com/watch?v=${ytId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    const html = await resp.text();
    const catMatch = html.match(/"categoryId":\s*"(\d+)"/);
    const categoryId = catMatch ? catMatch[1] : '10';

    const isMusicOrPodcast = categoryId === '10' || title.includes('podcast') || title.includes('episode');
    return res.json({
      allowed: isMusicOrPodcast,
      categoryId: categoryId,
      isPodcast: title.includes('podcast') || title.includes('episode')
    });
  } catch (err) {
    // Fail-safe to avoid false blocking on network hiccups
    return res.json({ allowed: true, categoryId: '10' });
  }
});

// YouTube Direct Audio Streaming Endpoint (Ad-Free Background Audio Stream)
app.get('/api/yt-stream', async (req, res) => {
  const ytId = (req.query.id || '').trim();
  if (!ytId) return res.status(400).send('Missing id');

  try {
    const ytdl = await getYtdl();
    if (!ytdl) return res.status(500).send('Audio extractor unavailable');

    const stream = await ytdl.download(ytId, {
      filter: { hasAudio: true, hasVideo: false },
      highWaterMark: 1 << 22
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'audio/webm; codecs="opus"');
    res.setHeader('Cache-Control', 'public, max-age=3600');

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

// Synced Lyrics from lrclib.net
app.get('/api/lyrics', async (req, res) => {
  const track = (req.query.track || '').trim();
  const artist = (req.query.artist || '').trim();

  if (!track) {
    return res.json({ success: false, message: 'Track name is required' });
  }

  try {
    const cleanTrack = track.replace(/\(.*\)|\[.*\]|- .*/g, '').trim();
    const cleanArtist = artist.split(',')[0].trim();
    const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTrack)}&artist_name=${encodeURIComponent(cleanArtist)}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MusiSurf-MusicPlayer/1.0.0 (https://musisurf.app)'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.syncedLyrics) {
        return res.json({
          success: true,
          trackName: data.trackName,
          artistName: data.artistName,
          syncedLyrics: data.syncedLyrics,
          plainLyrics: data.plainLyrics
        });
      }
      // If syncedLyrics is empty, fall through to search to find a synced version!
    }

    // Fallback: search query on lrclib
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTrack + ' ' + cleanArtist)}`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'MusiSurf-MusicPlayer/1.0.0' }
    });

    if (searchRes.ok) {
      const list = await searchRes.json();
      if (Array.isArray(list) && list.length > 0) {
        const item = list.find(l => l.syncedLyrics) || list[0];
        return res.json({
          success: true,
          trackName: item.trackName,
          artistName: item.artistName,
          syncedLyrics: item.syncedLyrics,
          plainLyrics: item.plainLyrics
        });
      }
    }

    res.json({ success: false, message: 'Lyrics not found' });
  } catch (err) {
    console.error('Lyrics error:', err.message);
    res.json({ success: false, message: 'Lyrics lookup error' });
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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🌊 MusiSurf Music Streaming Server Active!`);
    console.log(`🎵 Ad-Free & Full-Length Song Streaming Ready`);
    console.log(`🌐 Local URL: http://localhost:${PORT}`);
    console.log(`===============================================`);
  });
}

module.exports = app;

