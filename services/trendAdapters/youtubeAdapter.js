/**
 * YouTube India Music Trends Adapter
 * Connects to official YouTube Music India Charts (Trending 20 India & Daily Top Music Videos India)
 * and extracts verified India-specific trending candidates with view metrics.
 */

const YOUTUBE_CHART_PLAYLISTS = [
  {
    id: 'VLOLAK5uy_lSTp1DIuzZBUyee3kDsXwPgP25WdfwB40',
    name: 'Trending 20 India',
    weight: 1.25, // Higher weight for fast-moving Trending 20
    type: 'trending_20_in'
  },
  {
    id: 'VLPL4fGSI1pDJn5oibdgJt8Hy0-dr2B7kSs2',
    name: 'Daily Top Music Videos - India',
    weight: 1.0,
    type: 'daily_top_in'
  }
];

const videoMetricsCache = new Map();

/**
 * Clean clutter from YouTube music video titles
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
 * Clean artist string
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
 * Fetch YouTube Video details (viewCount, channel, duration)
 */
async function fetchYouTubeVideoDetails(videoId) {
  if (!videoId) return null;

  const cached = videoMetricsCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60 * 12) {
    return cached.data;
  }

  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240301.00.00',
            hl: 'en',
            gl: 'IN'
          }
        },
        videoId: videoId
      }),
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return null;
    const data = await res.json();
    const details = data?.videoDetails;
    if (!details) return null;

    const micro = data?.microformat?.playerMicroformatRenderer;
    const category = (micro?.category || '').trim();

    const result = {
      viewCount: parseInt(details.viewCount || '0', 10),
      durationSec: parseInt(details.lengthSeconds || '210', 10),
      channelTitle: details.author || '',
      category: category,
      isMusicCategory: category.toLowerCase() === 'music',
      publishDate: micro?.publishDate || '',
      keywords: Array.isArray(details.keywords) ? details.keywords : []
    };

    videoMetricsCache.set(videoId, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch tracks from a YouTube Music browse playlist (e.g. Trending 20 India)
 */
async function fetchChartPlaylist(playlistConfig) {
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/browse', {
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
        },
        browseId: playlistConfig.id
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) return [];
    const data = await res.json();
    const twoCol = data.contents?.twoColumnBrowseResultsRenderer;
    const sectionList = twoCol?.secondaryContents?.sectionListRenderer?.contents;
    if (!sectionList || sectionList.length === 0) return [];

    const shelf = sectionList[0]?.musicPlaylistShelfRenderer || sectionList[0]?.musicShelfRenderer;
    const items = shelf?.contents;
    if (!Array.isArray(items)) return [];

    const candidates = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const r = it.musicResponsiveListItemRenderer;
      if (!r) continue;

      const flexCols = r.flexColumns;
      const rawTitle = flexCols?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
      const rawSubtitle = flexCols?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(x => x.text).join('') || '';

      const videoId = r.playlistItemData?.videoId ||
        flexCols?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

      if (!videoId || !rawTitle) continue;

      // Extract thumbnails
      const thumbs = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
      const thumbUrl = thumbs && thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '';

      candidates.push({
        videoId,
        rawTitle,
        cleanTitle: cleanSongTitle(rawTitle),
        rawSubtitle,
        cleanArtist: cleanArtist(rawSubtitle),
        chartRank: i + 1,
        chartName: playlistConfig.name,
        chartType: playlistConfig.type,
        weight: playlistConfig.weight,
        thumbnailUrl: thumbUrl,
        platform: 'youtube'
      });
    }

    return candidates;
  } catch (err) {
    console.warn(`[YouTube Adapter] Failed to fetch chart ${playlistConfig.name}:`, err.message);
    return [];
  }
}

/**
 * Discover YouTube India music candidates
 */
async function discoverYouTubeIndiaTrends(options = {}) {
  const allCandidates = [];
  const seenVideoIds = new Set();

  for (const playlist of YOUTUBE_CHART_PLAYLISTS) {
    const items = await fetchChartPlaylist(playlist);
    for (const item of items) {
      if (!seenVideoIds.has(item.videoId)) {
        seenVideoIds.add(item.videoId);
        allCandidates.push(item);
      }
    }
  }

  // Fetch detailed metrics for top 15 candidates
  const limitToEnrich = Math.min(15, allCandidates.length);
  for (let i = 0; i < limitToEnrich; i++) {
    const cand = allCandidates[i];
    const details = await fetchYouTubeVideoDetails(cand.videoId);
    if (details) {
      cand.metrics = {
        viewCount: details.viewCount,
        durationSec: details.durationSec,
        channel: details.channelTitle,
        category: details.category,
        isMusicCategory: details.isMusicCategory,
        publishDate: details.publishDate
      };
    } else {
      cand.metrics = {
        viewCount: 0,
        durationSec: 210,
        channel: cand.cleanArtist,
        isMusicCategory: true
      };
    }
  }

  return {
    isAvailable: allCandidates.length > 0,
    platform: 'youtube',
    region: 'IN',
    timestamp: Date.now(),
    candidates: allCandidates
  };
}

module.exports = {
  discoverYouTubeIndiaTrends,
  cleanSongTitle,
  cleanArtist,
  fetchYouTubeVideoDetails
};
