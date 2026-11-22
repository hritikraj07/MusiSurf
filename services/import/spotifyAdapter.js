/**
 * Spotify Playlist Provider Adapter for MusiSurf
 * Handles Spotify URL validation, identifier extraction, Web API pagination,
 * and public embed fallback extraction with zero configuration required.
 */

const { sanitizeString } = require('./playlistParser');

// Spotify playlist identifier regex: typically 22 alphanumeric characters
const SPOTIFY_ID_REGEX = /^[a-zA-Z0-9]{15,35}$/;

/**
 * Validates a Spotify playlist URL or URI and extracts the clean playlist ID.
 */
function extractSpotifyPlaylistId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // 1. Spotify URI format: spotify:playlist:PLAYLIST_ID
  if (trimmed.startsWith('spotify:playlist:')) {
    const id = trimmed.replace('spotify:playlist:', '').split('?')[0].trim();
    return SPOTIFY_ID_REGEX.test(id) ? id : null;
  }

  // 2. Spotify Web URL format: https://open.spotify.com/playlist/PLAYLIST_ID?...
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'open.spotify.com' && host !== 'play.spotify.com' && host !== 'spotify.com') {
      return null;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const playlistIdx = segments.indexOf('playlist');
    if (playlistIdx !== -1 && segments[playlistIdx + 1]) {
      const id = segments[playlistIdx + 1].trim();
      return SPOTIFY_ID_REGEX.test(id) ? id : null;
    }
  } catch (err) {
    // Not a valid URL
    return null;
  }

  return null;
}

/**
 * Retrieves client credentials access token if SPOTIFY_CLIENT_ID & SECRET are configured.
 */
async function getSpotifyApiToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch (err) {
    console.warn('[SpotifyAdapter] Client credentials token error:', err.message);
    return null;
  }
}

/**
 * Fetches playlist tracks via official Spotify Web API using client credentials.
 */
async function fetchViaWebApi(playlistId, token) {
  const metaRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(8000)
  });

  if (metaRes.status === 404) {
    throw new Error('Spotify playlist not found or has been deleted');
  }
  if (metaRes.status === 401 || metaRes.status === 403) {
    throw new Error('Spotify playlist is private and requires user authorization');
  }
  if (!metaRes.ok) {
    throw new Error(`Spotify Web API error (${metaRes.status})`);
  }

  const meta = await metaRes.json();
  const playlistName = sanitizeString(meta.name || 'Spotify Playlist');
  const playlistDesc = sanitizeString(meta.description || '');
  const creator = sanitizeString(meta.owner?.display_name || 'Spotify');
  const artwork = meta.images?.[0]?.url || '';
  const totalTracks = meta.tracks?.total || 0;

  let allItems = meta.tracks?.items || [];
  let nextUrl = meta.tracks?.next;

  // Page through paginated track results (up to 1,000 tracks max safety limit)
  while (nextUrl && allItems.length < 1000) {
    try {
      const pageRes = await fetch(nextUrl, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(8000)
      });
      if (!pageRes.ok) break;
      const pageData = await pageRes.json();
      if (Array.isArray(pageData.items)) {
        allItems.push(...pageData.items);
      }
      nextUrl = pageData.next;
    } catch (err) {
      console.warn('[SpotifyAdapter] Pagination fetch interrupted:', err.message);
      break;
    }
  }

  const tracks = [];
  allItems.forEach((item, idx) => {
    const t = item.track;
    if (!t || !t.name) return;

    const title = sanitizeString(t.name);
    const artist = sanitizeString(
      (t.artists || []).map(a => a.name).join(', ') || 'Various Artists'
    );
    const album = sanitizeString(t.album?.name || '');
    const duration = Math.round((t.duration_ms || 0) / 1000);
    const isrc = sanitizeString(t.external_ids?.isrc || '');
    const externalUrl = t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`;
    const trackArt = t.album?.images?.[0]?.url || '';

    tracks.push({
      position: idx + 1,
      title,
      artist,
      album,
      duration,
      isrc,
      externalId: t.id || '',
      externalUrl,
      artwork: trackArt,
      isLocal: Boolean(t.is_local)
    });
  });

  return {
    provider: 'spotify',
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
 * Fetches playlist metadata & tracks via public Spotify Embed (zero-config fallback).
 */
async function fetchViaPublicEmbed(playlistId) {
  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;

  const res = await fetch(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    signal: AbortSignal.timeout(10000)
  });

  if (res.status === 404) {
    throw new Error('Spotify playlist not found or has been deleted');
  }
  if (!res.ok) {
    throw new Error(`Failed to retrieve Spotify playlist (HTTP ${res.status})`);
  }

  const html = await res.text();
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!nextDataMatch) {
    throw new Error('Unable to extract Spotify playlist data from public embed');
  }

  let json;
  try {
    json = JSON.parse(nextDataMatch[1]);
  } catch (err) {
    throw new Error('Failed to parse Spotify embed playlist payload');
  }

  const entity = json.props?.pageProps?.state?.data?.entity;
  if (!entity) {
    throw new Error('Spotify playlist contains no accessible entity data or is private');
  }

  const playlistName = sanitizeString(entity.title || entity.name || 'Spotify Playlist');
  const playlistDesc = sanitizeString(entity.subtitle || entity.description || '');
  const creator = sanitizeString(entity.authors?.[0]?.name || 'Spotify');
  const artwork = entity.coverArt?.sources?.[0]?.url || '';
  const rawList = Array.isArray(entity.trackList) ? entity.trackList : [];

  const tracks = [];
  rawList.forEach((t, idx) => {
    if (!t || !t.title) return;

    const title = sanitizeString(t.title);
    const artist = sanitizeString(t.subtitle || 'Various Artists');
    const duration = Math.round((t.duration || 0) / 1000);
    const uri = t.uri || '';
    const trackId = uri.replace('spotify:track:', '').trim();
    const externalUrl = trackId ? `https://open.spotify.com/track/${trackId}` : '';

    tracks.push({
      position: idx + 1,
      title,
      artist,
      album: '',
      duration,
      isrc: '',
      externalId: trackId,
      externalUrl,
      artwork: '',
      isPlayable: t.isPlayable !== false
    });
  });

  return {
    provider: 'spotify',
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
 * Universal Spotify Playlist Fetcher.
 * Tries official Web API first (if credentials exist), then seamlessly falls back
 * to high-fidelity public embed extraction.
 */
async function fetchSpotifyPlaylist(input) {
  const playlistId = extractSpotifyPlaylistId(input);
  if (!playlistId) {
    throw new Error("This doesn't look like a supported Spotify playlist link. Check the URL and try again.");
  }

  // 1. Try official Web API if credentials configured
  const token = await getSpotifyApiToken();
  if (token) {
    try {
      return await fetchViaWebApi(playlistId, token);
    } catch (apiErr) {
      console.warn('[SpotifyAdapter] Web API fetch error, falling back to public embed:', apiErr.message);
    }
  }

  // 2. Fallback to public embed extractor
  return await fetchViaPublicEmbed(playlistId);
}

module.exports = {
  extractSpotifyPlaylistId,
  fetchSpotifyPlaylist,
  fetchViaPublicEmbed,
  fetchViaWebApi
};
