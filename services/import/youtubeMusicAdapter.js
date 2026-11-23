/**
 * YouTube Music Playlist Provider Adapter for MusiSurf
 * Handles YouTube Music & YouTube playlist URL extraction,
 * InnerTube (WEB_REMIX) browse API pagination, and track normalization.
 */

const { sanitizeString } = require('./playlistParser');

// Regular expression to identify valid YouTube playlist IDs (PL, OLAK, RD, etc.)
const YT_PLAYLIST_ID_REGEX = /^(PL|OLAK5uy_|RDCLAK5uy_|RD|UU|FL|LL|TL|VL)[a-zA-Z0-9_\-]{8,120}$/i;

/**
 * Extracts the YouTube / YouTube Music playlist ID from any supported URL or raw ID.
 */
function extractYouTubePlaylistId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // 1. Direct ID match
  if (YT_PLAYLIST_ID_REGEX.test(trimmed)) {
    return trimmed.replace(/^VL/i, '');
  }

  // 2. URL parsing
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();

    const isYtHost = host === 'music.youtube.com' ||
                     host === 'www.youtube.com' ||
                     host === 'youtube.com' ||
                     host === 'm.youtube.com' ||
                     host === 'youtu.be';

    if (!isYtHost) return null;

    // Check query params: ?list=...
    const listParam = parsed.searchParams.get('list');
    if (listParam) {
      const clean = listParam.replace(/^VL/i, '').trim();
      if (clean.length >= 8) return clean;
    }

    // Check path: /browse/VL... or /playlist?list=...
    const segments = parsed.pathname.split('/').filter(Boolean);
    const browseIdx = segments.indexOf('browse');
    if (browseIdx !== -1 && segments[browseIdx + 1]) {
      const target = segments[browseIdx + 1].replace(/^VL/i, '').trim();
      if (target.length >= 8) return target;
    }
  } catch (err) {
    // Not a valid URL, test regex again
    if (YT_PLAYLIST_ID_REGEX.test(trimmed)) {
      return trimmed.replace(/^VL/i, '');
    }
  }

  return null;
}

/**
 * Converts duration string (e.g. "3:42", "1:15:20") into total seconds.
 */
function parseDurationToSeconds(durationStr) {
  if (!durationStr || typeof durationStr !== 'string') return 0;
  const parts = durationStr.trim().split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

/**
 * Clean clutter from song titles
 */
function cleanSongTitle(rawTitle = '') {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/\s*\(Official\s*(Music\s*)?Video\)/gi, '')
    .replace(/\s*\(Video\)/gi, '')
    .replace(/\s*\(Full\s*(Song|Video)\)/gi, '')
    .replace(/\s*\(Visualizer\)/gi, '')
    .replace(/\s*\(Lyrical(\s*Video)?\)/gi, '')
    .replace(/\s*\(Audio\)/gi, '')
    .replace(/\s*\[Official\s*(Music\s*)?Video\]/gi, '')
    .replace(/\s*\[Full\s*(Song|Video)\]/gi, '')
    .replace(/\s*\[Hindi\]/gi, '')
    .replace(/\s*4K(\s*HDR)?/gi, '')
    .replace(/\s*\|\s*202[0-9]/gi, '')
    .replace(/\s*\|\s*New\s*Song\s*202[0-9]/gi, '')
    .replace(/\s*\|\s*Trending(\s*Song)?/gi, '')
    .trim();
}

/**
 * Clean clutter from artist strings
 */
function cleanArtist(rawArtist = '') {
  if (!rawArtist) return '';
  return rawArtist
    .replace(/\s*•\s*YouTube Charts/gi, '')
    .replace(/\s*-\s*Topic/gi, '')
    .replace(/\s*VEVO/gi, '')
    .trim();
}

/**
 * Fetches playlist metadata and tracks via YouTubei WEB_REMIX browse API.
 */
async function fetchViaInnerTube(playlistId) {
  const browseId = playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;

  const res = await fetch('https://music.youtube.com/youtubei/v1/browse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: '1.20240301.01.00',
          hl: 'en',
          gl: 'IN'
        }
      },
      browseId
    }),
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('YouTube Music playlist not found or has been deleted');
    }
    throw new Error(`Failed to retrieve YouTube Music playlist (HTTP ${res.status})`);
  }

  const data = await res.json();

  // Extract Playlist Metadata
  const micro = data.microformat?.microformatDataRenderer;
  const header = data.header?.musicDetailHeaderRenderer ||
                 data.header?.musicResponsiveHeaderRenderer ||
                 data.header?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicDetailHeaderRenderer;

  const playlistName = sanitizeString(
    micro?.title ||
    header?.title?.runs?.[0]?.text ||
    'YouTube Music Playlist'
  );

  const playlistDesc = sanitizeString(
    micro?.description ||
    header?.description?.runs?.[0]?.text ||
    ''
  );

  const creator = sanitizeString(
    header?.subtitle?.runs?.map(r => r.text).join('') ||
    micro?.description?.split('•')?.[0]?.trim() ||
    'YouTube Music'
  );

  const artwork = micro?.thumbnail?.thumbnails?.[0]?.url ||
                  header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url ||
                  '';

  const twoCol = data.contents?.twoColumnBrowseResultsRenderer;
  const sectionList = twoCol?.secondaryContents?.sectionListRenderer?.contents;
  const shelf = sectionList?.[0]?.musicPlaylistShelfRenderer ||
                sectionList?.[0]?.musicShelfRenderer;

  let rawItems = Array.isArray(shelf?.contents) ? shelf.contents : [];
  let continuationToken = shelf?.continuations?.[0]?.nextContinuationData?.continuation;

  // Pagination for large playlists (up to 1,000 tracks)
  while (continuationToken && rawItems.length < 1000) {
    try {
      const contRes = await fetch(`https://music.youtube.com/youtubei/v1/browse?continuation=${continuationToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20240301.01.00',
              hl: 'en',
              gl: 'IN'
            }
          }
        }),
        signal: AbortSignal.timeout(8000)
      });
      if (!contRes.ok) break;
      const contData = await contRes.json();
      const contShelf = contData.continuationContents?.musicPlaylistShelfContinuation ||
                        contData.continuationContents?.musicShelfContinuation;
      if (Array.isArray(contShelf?.contents)) {
        rawItems.push(...contShelf.contents);
      }
      continuationToken = contShelf?.continuations?.[0]?.nextContinuationData?.continuation;
    } catch (err) {
      console.warn('[YouTubeMusicAdapter] Continuation interrupted:', err.message);
      break;
    }
  }

  const tracks = [];
  rawItems.forEach((it, idx) => {
    const r = it.musicResponsiveListItemRenderer;
    if (!r) return;

    const flexCols = r.flexColumns || [];
    const fixedCols = r.fixedColumns || [];

    // Title from flexColumn 0
    const rawTitle = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
    if (!rawTitle) return;

    // Video ID
    const videoId = r.playlistItemData?.videoId ||
      flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

    // Artists from flexColumn 1 runs
    const artistRuns = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    let rawArtist = '';
    let rawAlbum = '';

    // First run or runs with browseEndpoint are usually artists
    const artistParts = [];
    artistRuns.forEach(run => {
      const pageType = run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
      if (pageType === 'MUSIC_PAGE_TYPE_ARTIST' || (!pageType && run.text !== ' • ' && run.text !== ' & ' && run.text !== ', ')) {
        artistParts.push(run.text.trim());
      } else if (pageType === 'MUSIC_PAGE_TYPE_ALBUM') {
        rawAlbum = run.text.trim();
      }
    });

    rawArtist = artistParts.join(', ') || artistRuns.map(r => r.text).join('').trim();

    // Duration from fixedColumn 0
    const durationText = fixedCols[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text || '';
    const duration = parseDurationToSeconds(durationText);

    // Thumbnail
    const thumbs = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
    const trackArtwork = thumbs && thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '';

    const cleanTitle = cleanSongTitle(rawTitle);
    const cleanedArtist = cleanArtist(rawArtist) || 'Various Artists';

    tracks.push({
      position: idx + 1,
      title: cleanTitle,
      artist: cleanedArtist,
      album: sanitizeString(rawAlbum),
      duration: duration || 210,
      isrc: '',
      externalId: videoId || '',
      externalUrl: videoId ? `https://music.youtube.com/watch?v=${videoId}` : '',
      artwork: trackArtwork,
      videoId: videoId || ''
    });
  });

  if (tracks.length === 0) {
    const err = new Error('This YouTube Music playlist contains no accessible songs or is set to private. Connect your Google account to import private playlists.');
    err.code = 'ERR_YTMUSIC_AUTH_REQUIRED';
    err.requiresAuth = true;
    err.playlistId = playlistId;
    throw err;
  }

  return {
    provider: 'youtube_music',
    externalPlaylistId: playlistId,
    name: playlistName,
    playlistName: playlistName,
    description: playlistDesc,
    creator,
    artwork,
    totalTracks: tracks.length,
    tracks
  };
}

/**
 * Fetches playlist metadata and items via official YouTube Data API v3 using OAuth token or API key.
 */
async function fetchViaYouTubeDataApi(playlistId, auth = null) {
  const token = typeof auth === 'string' ? auth : auth?.token;
  const apiKey = (auth && typeof auth === 'object' && auth.apiKey) ? auth.apiKey : (!token ? process.env.YOUTUBE_API_KEY : null);

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const keyParam = (!token && apiKey) ? `&key=${encodeURIComponent(apiKey)}` : '';

  // 1. Fetch Playlist Metadata
  let metaRes;
  try {
    metaRes = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=${encodeURIComponent(playlistId)}${keyParam}`, {
      headers,
      signal: AbortSignal.timeout(8000)
    });
  } catch (netErr) {
    const err = new Error("We couldn't connect to Google / YouTube API. Check your connection and retry.");
    err.code = 'ERR_YTMUSIC_NETWORK';
    throw err;
  }

  if (metaRes.status === 401) {
    const err = new Error('Your Google connection has expired. Reconnect your account to continue.');
    err.code = 'ERR_GOOGLE_AUTH_EXPIRED';
    err.requiresAuth = true;
    throw err;
  }
  if (metaRes.status === 404) {
    const err = new Error("We couldn't find this YouTube Music playlist. Check the link and try again.");
    err.code = 'ERR_YTMUSIC_NOT_FOUND';
    throw err;
  }
  if (metaRes.status === 403) {
    const err = new Error('Google / YouTube API permission restriction or quota reached.');
    err.code = 'ERR_YTMUSIC_FORBIDDEN';
    err.requiresAuth = true;
    throw err;
  }
  if (!metaRes.ok) {
    const err = new Error(`YouTube API request failed (HTTP ${metaRes.status})`);
    err.code = 'ERR_YTMUSIC_API_ERROR';
    throw err;
  }

  const metaData = await metaRes.json();
  const plItem = metaData.items?.[0];
  if (!plItem) {
    const err = new Error("We couldn't find this YouTube playlist. Check the link and try again.");
    err.code = 'ERR_YTMUSIC_NOT_FOUND';
    throw err;
  }

  const snippet = plItem.snippet || {};
  const playlistName = sanitizeString(snippet.title || 'YouTube Music Playlist');
  const playlistDesc = sanitizeString(snippet.description || '');
  const creator = sanitizeString(snippet.channelTitle || 'YouTube Music');
  const thumbs = snippet.thumbnails;
  const artwork = thumbs?.maxres?.url || thumbs?.high?.url || thumbs?.medium?.url || thumbs?.default?.url || '';

  // 2. Fetch Playlist Items via playlistItems endpoint
  let pageToken = '';
  const rawItems = [];

  while (rawItems.length < 1000) {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(playlistId)}${keyParam}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    let itemsRes;
    try {
      itemsRes = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(8000)
      });
    } catch (e) {
      if (rawItems.length > 0) break;
      throw e;
    }

    if (!itemsRes.ok) {
      if (rawItems.length > 0) break;
      if (itemsRes.status === 401) {
        const err = new Error('Your Google connection has expired. Reconnect your account to continue.');
        err.code = 'ERR_GOOGLE_AUTH_EXPIRED';
        err.requiresAuth = true;
        throw err;
      }
      break;
    }

    const itemsData = await itemsRes.json();
    if (Array.isArray(itemsData.items)) {
      rawItems.push(...itemsData.items);
    }
    pageToken = itemsData.nextPageToken || '';
    if (!pageToken) break;
  }

  const tracks = [];
  rawItems.forEach((it, idx) => {
    const snip = it.snippet;
    if (!snip) return;

    const rawTitle = snip.title || '';
    if (!rawTitle || rawTitle === 'Private video' || rawTitle === 'Deleted video') return;

    const videoId = snip.resourceId?.videoId || it.contentDetails?.videoId || '';
    const channelName = snip.videoOwnerChannelTitle || snip.channelTitle || 'Various Artists';

    // Parse artist and title from YouTube video title
    let trackTitle = cleanSongTitle(rawTitle);
    let trackArtist = cleanArtist(channelName);

    if (rawTitle.includes(' - ')) {
      const parts = rawTitle.split(' - ').map(s => s.trim());
      if (parts.length >= 2 && parts[0].length < 50) {
        trackArtist = cleanArtist(parts[0]);
        trackTitle = cleanSongTitle(parts.slice(1).join(' - '));
      }
    }

    const itemThumbs = snip.thumbnails;
    const trackArt = itemThumbs?.high?.url || itemThumbs?.medium?.url || itemThumbs?.default?.url || '';

    tracks.push({
      position: idx + 1,
      title: trackTitle,
      artist: trackArtist || 'Various Artists',
      album: '',
      duration: 210, // Default duration estimate
      isrc: '',
      externalId: videoId,
      externalUrl: videoId ? `https://music.youtube.com/watch?v=${videoId}` : '',
      artwork: trackArt,
      videoId
    });
  });

  if (tracks.length === 0) {
    const err = new Error('This YouTube playlist contains no accessible videos or tracks.');
    err.code = 'ERR_YTMUSIC_EMPTY';
    throw err;
  }

  return {
    provider: 'youtube_music',
    externalPlaylistId: playlistId,
    name: playlistName,
    playlistName: playlistName,
    description: playlistDesc,
    creator,
    artwork,
    totalTracks: tracks.length,
    tracks
  };
}

/**
 * Universal YouTube Music Playlist Fetcher.
 * Tries official Google OAuth token first if provided, then falls back to zero-config public InnerTube.
 */
async function fetchYouTubeMusicPlaylist(input, googleToken = null) {
  const playlistId = extractYouTubePlaylistId(input);
  if (!playlistId) {
    throw new Error("This doesn't look like a supported YouTube Music playlist link. Check the URL and try again.");
  }

  // 1. If user provided Google OAuth token, try official YouTube Data API v3
  if (googleToken && typeof googleToken === 'string') {
    try {
      return await fetchViaYouTubeDataApi(playlistId, googleToken);
    } catch (apiErr) {
      console.warn('[YouTubeMusicAdapter] YouTube Data API token error, falling back:', apiErr.message);
      if (apiErr.code === 'ERR_GOOGLE_AUTH_EXPIRED') {
        throw apiErr;
      }
    }
  }

  // 2. If server has YOUTUBE_API_KEY configured, try official YouTube Data API v3 with API Key
  if (process.env.YOUTUBE_API_KEY) {
    try {
      return await fetchViaYouTubeDataApi(playlistId, { apiKey: process.env.YOUTUBE_API_KEY });
    } catch (apiErr) {
      console.warn('[YouTubeMusicAdapter] YouTube Data API Key error, falling back to public InnerTube:', apiErr.message);
    }
  }

  // 3. Zero-config public InnerTube fallback
  try {
    return await fetchViaInnerTube(playlistId);
  } catch (innerErr) {
    // If public access fails and no Google token was provided, offer Google authorization
    if (!googleToken) {
      const err = new Error('Connect your Google account to import this YouTube Music playlist.');
      err.code = 'ERR_YTMUSIC_AUTH_REQUIRED';
      err.requiresAuth = true;
      err.playlistId = playlistId;
      throw err;
    }
    throw innerErr;
  }
}

module.exports = {
  extractYouTubePlaylistId,
  fetchYouTubeMusicPlaylist,
  fetchViaInnerTube,
  fetchViaYouTubeDataApi,
  parseDurationToSeconds
};
