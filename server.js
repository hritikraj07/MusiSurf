const express = require('express');
const cors = require('cors');
const path = require('path');
const CryptoJS = require('crypto-js');

const app = express();
const PORT = process.env.PORT || 3000;

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
    source: 'saavn',
    hasDirectAudio: true
  };
}

// Search JioSaavn
async function searchSaavn(query, limit = 20) {
  try {
    const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&q=${encodeURIComponent(query)}&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=${limit}&p=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) return [];

    return data.results
      .map(transformSaavnSong)
      .filter(item => item.audioUrl); // only return tracks with direct audio
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

function calculateRelevanceScore(track, query) {
  const normQ = query.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');
  const qWords = normQ.split(/\s+/).filter(Boolean);
  const normTitle = (track.title || '').toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');
  const normArtist = (track.artist || '').toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');

  let score = 0;

  // Title / Artist Matching Gate: track must match at least one query term
  const matchedWords = qWords.filter(w => normTitle.includes(w) || normArtist.includes(w));
  if (matchedWords.length === 0) {
    return 0; // completely irrelevant track
  }

  // Exact Title Matching (Normalized)
  if (normTitle === normQ) {
    score += 55000;
  } else if (normTitle.startsWith(normQ)) {
    score += 38000;
  } else if (qWords.every(w => normTitle.includes(w))) {
    score += 28000;
  } else {
    score += (matchedWords.length / qWords.length) * 15000;
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
    score += 15000;
  }

  // Penalize covers, karaoke, ringtones, remake unless specifically queried
  const isCoverOrRemake = /cover|karaoke|instrumental|remake|tribute|ringtone|status/i.test(track.title);
  const wantsCover = /cover|karaoke|instrumental|remake|tribute|ringtone|status/i.test(query);
  if (isCoverOrRemake && !wantsCover) {
    score -= 35000;
  }

  // Bonus for direct 320kbps audio when scores are competitive
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
              audioUrl: null, // Full-length stream managed by YouTube engine
              duration: durationSec,
              durationStr: durationStr,
              playCount: playCount,
              isVerified: isVerified,
              source: 'youtube',
              hasDirectAudio: false
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
                audioUrl: null,
                duration: durationSec,
                durationStr: durationStr,
                playCount: playCount,
                isVerified: isVerified,
                source: 'youtube',
                hasDirectAudio: false
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

// Curated Trending & Discover Categories with Diverse Multi-Artist Queries
const TRENDING_CATEGORIES = [
  {
    id: 'global-hits',
    title: "Global Top Hits",
    subtitle: "The most played anthems worldwide right now",
    queries: ["Dua Lipa", "The Weeknd", "Taylor Swift", "Post Malone", "Ed Sheeran", "Billie Eilish", "Harry Styles", "Bruno Mars"]
  },
  {
    id: 'chill-lofi',
    title: "Chill & Lo-Fi Waves",
    subtitle: "Relax, study, code, and surf the mellow beats",
    queries: ["Lofi Hip Hop", "Chillhop Beats", "Coffee Lofi", "Late Night Lofi", "Peaceful Piano", "Study Beats Instrumentals"]
  },
  {
    id: 'electronic-energy',
    title: "Electronic & Gym Energy",
    subtitle: "High octane basslines and peak workout motivation",
    queries: ["Avicii", "Martin Garrix", "David Guetta", "Calvin Harris", "Alan Walker", "Tiësto", "Swedish House Mafia"]
  },
  {
    id: 'acoustic-soul',
    title: "Acoustic & Midnight R&B",
    subtitle: "Soulful vocals, late night drives, and warm vibes",
    queries: ["Acoustic Hits", "Adele", "John Legend", "Sam Smith", "Lewis Capaldi", "Norah Jones", "Coldplay Acoustic"]
  },
  {
    id: 'bollywood-pop',
    title: "Desi & Bollywood Beats",
    subtitle: "Trending charts, romantic melodies, and festive vibes",
    queries: ["Arijit Singh", "Diljit Dosanjh", "Shreya Ghoshal", "Atif Aslam", "Badshah", "Pritam", "Sidhu Moose Wala", "A.R. Rahman"]
  }
];

let trendingSectionsCache = null;
let trendingCacheTime = 0;

async function fetchTrendingData() {
  const sections = await Promise.all(
    TRENDING_CATEGORIES.map(async (cat) => {
      // Query multiple diverse artists/queries to guarantee distinct albums & thumbnails
      const queryPromises = cat.queries.slice(0, 4).map(q => searchSaavn(q, 6));
      const resultsArray = await Promise.all(queryPromises);
      const combinedTracks = resultsArray.flat();

      const uniqueTracks = deduplicateAndShuffle(combinedTracks, 10);
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

// Pre-warm cache on server startup
fetchTrendingData().then(data => {
  if (data && data.length > 0) {
    trendingSectionsCache = data;
    trendingCacheTime = Date.now();
    console.log(`⚡ Pre-cached ${data.length} trending music sections with unique albums!`);
  }
}).catch(err => console.warn('Preload trending warning:', err.message));

app.get('/api/trending', async (req, res) => {
  const now = Date.now();
  if (trendingSectionsCache && now - trendingCacheTime < 1000 * 60 * 20) {
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
      return res.json({
        success: true,
        trackName: data.trackName,
        artistName: data.artistName,
        syncedLyrics: data.syncedLyrics,
        plainLyrics: data.plainLyrics
      });
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

// Direct Song Downloader for Mobile and Desktop
app.get('/api/download', async (req, res) => {
  const audioUrl = req.query.url;
  const rawTitle = req.query.title || 'song';
  const rawArtist = req.query.artist || '';
  
  let cleanName = rawTitle.replace(/[\\/:*?"<>|]/g, '').trim();
  if (rawArtist) {
    cleanName = `${cleanName} - ${rawArtist.replace(/[\\/:*?"<>|]/g, '').trim()}`;
  }
  const filename = `${cleanName || 'MusiSurf-Track'}.mp4`;

  if (!audioUrl || !audioUrl.startsWith('http')) {
    return res.status(400).send('Invalid audio URL');
  }

  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      return res.status(audioRes.status).send('Failed to stream audio file');
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', audioRes.headers.get('content-type') || 'audio/mp4');
    if (audioRes.headers.get('content-length')) {
      res.setHeader('Content-Length', audioRes.headers.get('content-length'));
    }

    const { Readable } = require('stream');
    const stream = Readable.fromWeb(audioRes.body);
    stream.pipe(res);
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).send('Download error');
  }
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

