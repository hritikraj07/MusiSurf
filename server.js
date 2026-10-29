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

  return {
    id: 'saavn_' + item.id,
    originalId: item.id,
    title: decodeHtmlEntities(item.title || item.song || 'Unknown Title'),
    artist: decodeHtmlEntities(artist),
    album: decodeHtmlEntities(more.album || item.album || 'Single'),
    year: item.year || more.release_date?.substring(0, 4) || '',
    image: image,
    audioUrl: audioUrl, // 320kbps direct ad-free audio stream
    duration: durationSec,
    durationStr: formatDuration(durationSec),
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

// Search YouTube as universal full-length fallback
async function searchYouTube(query, limit = 10) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' audio')}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.+?});/);
    if (!match) return [];
    
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

          const title = v.title?.runs?.[0]?.text || 'Unknown Title';
          const channel = v.ownerText?.runs?.[0]?.text || 'YouTube Music';
          const durationStr = v.lengthText?.simpleText || '3:30';
          const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

          // Parse duration to seconds
          const parts = durationStr.split(':').map(Number);
          let durationSec = 210;
          if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
          else if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];

          results.push({
            id: 'yt_' + videoId,
            ytId: videoId,
            title: decodeHtmlEntities(title),
            artist: decodeHtmlEntities(channel),
            album: 'YouTube Universal Stream',
            year: '',
            image: thumb,
            audioUrl: null, // Played via unified YouTube Player controller
            duration: durationSec,
            durationStr: durationStr,
            source: 'youtube',
            hasDirectAudio: false
          });

          if (results.length >= limit) break;
        }
      }
      if (results.length >= limit) break;
    }
    return results;
  } catch (err) {
    console.error('YouTube search error:', err.message);
    return [];
  }
}

// Unified Search Route
app.get('/api/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  const source = req.query.source || 'all'; // 'all', 'saavn', 'youtube'

  if (!query) {
    return res.json({ success: true, results: [] });
  }

  try {
    let results = [];

    if (source === 'saavn') {
      results = await searchSaavn(query, 25);
    } else if (source === 'youtube') {
      results = await searchYouTube(query, 15);
    } else {
      // Fast search: Query Saavn first (instant direct audio)
      const saavnSongs = await searchSaavn(query, 25);
      if (saavnSongs && saavnSongs.length >= 8) {
        results = saavnSongs;
      } else {
        // Parallel fallback to YouTube with a 2.5s safety timeout
        const ytPromise = searchYouTube(query, 10);
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve([]), 2500));
        const ytSongs = await Promise.race([ytPromise, timeoutPromise]);
        results = [...(saavnSongs || []), ...(ytSongs || [])];
      }
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

// Curated Trending & Discover Categories
const TRENDING_CATEGORIES = [
  {
    id: 'global-hits',
    title: "Global Top Hits",
    subtitle: "The most played anthems worldwide right now",
    query: "Top Hits Global"
  },
  {
    id: 'chill-lofi',
    title: "Chill & Lo-Fi Waves",
    subtitle: "Relax, study, code, and surf the mellow beats",
    query: "Lofi Beats Chill Study"
  },
  {
    id: 'electronic-energy',
    title: "Electronic & Gym Energy",
    subtitle: "High octane basslines and peak workout motivation",
    query: "EDM Dance Party Hits"
  },
  {
    id: 'acoustic-soul',
    title: "Acoustic & Midnight R&B",
    subtitle: "Soulful vocals, late night drives, and warm vibes",
    query: "Acoustic Pop Romance"
  },
  {
    id: 'bollywood-pop',
    title: "Desi & Bollywood Beats",
    subtitle: "Trending charts, romantic melodies, and festive vibes",
    query: "Trending Bollywood Hits"
  }
];

let trendingCache = null;
let trendingCacheTime = 0;

async function fetchTrendingData() {
  const sections = await Promise.all(
    TRENDING_CATEGORIES.map(async (cat) => {
      const tracks = await searchSaavn(cat.query, 8);
      return {
        id: cat.id,
        title: cat.title,
        subtitle: cat.subtitle,
        tracks: tracks || []
      };
    })
  );
  return sections.filter(s => s.tracks.length > 0);
}

// Pre-warm cache on server startup
fetchTrendingData().then(data => {
  if (data && data.length > 0) {
    trendingCache = data;
    trendingCacheTime = Date.now();
    console.log(`⚡ Pre-cached ${data.length} trending music sections in memory!`);
  }
}).catch(err => console.warn('Preload trending warning:', err.message));

app.get('/api/trending', async (req, res) => {
  const now = Date.now();
  if (trendingCache && now - trendingCacheTime < 1000 * 60 * 30) {
    return res.json({ success: true, sections: trendingCache });
  }

  try {
    const sections = await fetchTrendingData();
    if (sections && sections.length > 0) {
      trendingCache = sections;
      trendingCacheTime = now;
    }
    res.json({ success: true, sections: trendingCache || sections });
  } catch (err) {
    console.error('Trending fetch error:', err);
    if (trendingCache) {
      return res.json({ success: true, sections: trendingCache });
    }
    res.status(500).json({ success: false, error: 'Failed to load trending music' });
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

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🌊 MusiSurf Music Streaming Server Active!`);
  console.log(`🎵 Ad-Free & Full-Length Song Streaming Ready`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
