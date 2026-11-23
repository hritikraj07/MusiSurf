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
    throw new Error('This YouTube Music playlist contains no accessible songs or is set to private');
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
 */
async function fetchYouTubeMusicPlaylist(input) {
  const playlistId = extractYouTubePlaylistId(input);
  if (!playlistId) {
    throw new Error("This doesn't look like a supported YouTube Music playlist link. Check the URL and try again.");
  }

  return await fetchViaInnerTube(playlistId);
}

module.exports = {
  extractYouTubePlaylistId,
  fetchYouTubeMusicPlaylist,
  parseDurationToSeconds
};
