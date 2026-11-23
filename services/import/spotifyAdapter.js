/**
 * Spotify Playlist Provider Adapter for MusiSurf
 * Handles Spotify URL validation, identifier extraction, Web API pagination,
 * and public embed fallback extraction with zero configuration required.
 *
 * Implements Spotify Web API standards:
 * - Playlist metadata: GET https://api.spotify.com/v1/playlists/{playlist_id}
 * - Playlist items: GET https://api.spotify.com/v1/playlists/{playlist_id}/items
 * - Never infers privacy from URL sharing parameters (pt, si).
 * - Discrete error codes for Scenarios A through H.
 */

const { sanitizeString } = require('./playlistParser');

// Spotify playlist identifier regex: typically 22 alphanumeric characters
const SPOTIFY_ID_REGEX = /^[a-zA-Z0-9]{15,35}$/;

/**
 * Validates a Spotify playlist URL or URI and extracts clean identifier and diagnostic parameters.
 * Note: Sharing tokens (pt, si) are URL metadata only and must NEVER be used to infer privacy.
 */
function extractSpotifyPlaylistInfo(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // 1. Spotify URI format: spotify:playlist:PLAYLIST_ID
  if (trimmed.startsWith('spotify:playlist:')) {
    const withoutPrefix = trimmed.replace('spotify:playlist:', '').trim();
    const [rawId, rawQuery] = withoutPrefix.split('?');
    const id = rawId.trim();
    if (!SPOTIFY_ID_REGEX.test(id)) return null;

    const params = new URLSearchParams(rawQuery || '');
    const pt = params.get('pt') || '';
    const si = params.get('si') || '';

    return {
      id,
      hasPtToken: Boolean(pt),
      hasSharingParams: Boolean(pt || si),
      pt,
      si,
      originalUrl: trimmed
    };
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
      if (!SPOTIFY_ID_REGEX.test(id)) return null;

      const pt = parsed.searchParams.get('pt') || '';
      const si = parsed.searchParams.get('si') || '';

      return {
        id,
        hasPtToken: Boolean(pt),
        hasSharingParams: Boolean(pt || si),
        pt,
        si,
        originalUrl: trimmed
      };
    }
  } catch (err) {
    return null;
  }

  return null;
}

/**
 * Validates a Spotify playlist URL or URI and extracts the clean playlist ID.
 */
function extractSpotifyPlaylistId(input) {
  const info = extractSpotifyPlaylistInfo(input);
  return info ? info.id : null;
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
 * Fetches playlist tracks via official Spotify Web API.
 * Uses separate requests for:
 * 1. Playlist metadata: GET https://api.spotify.com/v1/playlists/{playlist_id}
 * 2. Playlist items: GET https://api.spotify.com/v1/playlists/{playlist_id}/items
 *
 * Implements strict error code mapping (Scenarios A through H).
 */
async function fetchViaWebApi(playlistId, token) {
  // 1. Fetch Playlist Metadata
  let metaRes;
  try {
    metaRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,owner,images`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(8000)
    });
  } catch (netErr) {
    const err = new Error("We couldn't connect to Spotify. Check your connection and retry.");
    err.code = 'ERR_SPOTIFY_NETWORK';
    throw err;
  }

  if (metaRes.status === 401) {
    const err = new Error('Your Spotify connection has expired. Reconnect your account to continue.');
    err.code = 'ERR_SPOTIFY_AUTH_EXPIRED';
    err.requiresAuth = true;
    throw err;
  }
  if (metaRes.status === 404) {
    const err = new Error("We couldn't find this Spotify playlist. Check the link and try again.");
    err.code = 'ERR_SPOTIFY_NOT_FOUND';
    throw err;
  }
  if (metaRes.status === 429) {
    const err = new Error('Spotify is temporarily limiting requests. Please try again shortly.');
    err.code = 'ERR_SPOTIFY_RATE_LIMIT';
    throw err;
  }
  if (!metaRes.ok) {
    const err = new Error(`Spotify metadata request failed (HTTP ${metaRes.status})`);
    err.code = 'ERR_SPOTIFY_API_ERROR';
    throw err;
  }

  const meta = await metaRes.json();
  const playlistName = sanitizeString(meta.name || 'Spotify Playlist');
  const playlistDesc = sanitizeString(meta.description || '');
  const creator = sanitizeString(meta.owner?.display_name || 'Spotify');
  const artwork = meta.images?.[0]?.url || '';

  // 2. Fetch Playlist Items via /items endpoint (Spotify Web API 2026 standard)
  let itemsUrl = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100`;
  let allItems = [];

  while (itemsUrl && allItems.length < 1000) {
    let itemsRes;
    try {
      itemsRes = await fetch(itemsUrl, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(8000)
      });
    } catch (netErr) {
      if (allItems.length > 0) break; // If we already collected tracks, use what we have
      const err = new Error("We couldn't connect to Spotify. Check your connection and retry.");
      err.code = 'ERR_SPOTIFY_NETWORK';
      throw err;
    }

    if (itemsRes.status === 403) {
      // Scenario B: Playlist identified, but items endpoint restricted by Spotify permissions
      const err = new Error('Spotify can identify this playlist, but your connected account does not have permission to retrieve its songs through the current API. The API only permits item retrieval for playlists owned by or collaborated on by your connected account.');
      err.code = 'ERR_SPOTIFY_ITEMS_RESTRICTED';
      err.requiresAuth = true;
      err.playlistMeta = { name: playlistName, creator, artwork };
      throw err;
    }
    if (itemsRes.status === 401) {
      const err = new Error('Your Spotify connection has expired. Reconnect your account to continue.');
      err.code = 'ERR_SPOTIFY_AUTH_EXPIRED';
      err.requiresAuth = true;
      throw err;
    }
    if (itemsRes.status === 429) {
      if (allItems.length > 0) break;
      const err = new Error('Spotify is temporarily limiting requests. Please try again shortly.');
      err.code = 'ERR_SPOTIFY_RATE_LIMIT';
      throw err;
    }
    if (!itemsRes.ok) {
      if (allItems.length > 0) break;
      const err = new Error(`Spotify items request failed (HTTP ${itemsRes.status})`);
      err.code = 'ERR_SPOTIFY_API_ERROR';
      throw err;
    }

    const pageData = await itemsRes.json();
    if (Array.isArray(pageData.items)) {
      allItems.push(...pageData.items);
    }
    itemsUrl = pageData.next || null;
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

  if (tracks.length === 0) {
    const err = new Error('This playlist contains no accessible tracks.');
    err.code = 'ERR_SPOTIFY_EMPTY';
    throw err;
  }

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
 * Never assumes a playlist is private based on sharing tokens.
 */
async function fetchViaPublicEmbed(playlistId) {
  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;

  let res;
  try {
    res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(10000)
    });
  } catch (netErr) {
    const err = new Error("We couldn't connect to Spotify. Check your connection and retry.");
    err.code = 'ERR_SPOTIFY_NETWORK';
    throw err;
  }

  if (res.status === 404) {
    const err = new Error("We couldn't find this Spotify playlist. Check the link and try again.");
    err.code = 'ERR_SPOTIFY_NOT_FOUND';
    err.requiresAuth = true;
    err.playlistId = playlistId;
    throw err;
  }
  if (res.status === 429) {
    const err = new Error('Spotify is temporarily limiting requests. Please try again shortly.');
    err.code = 'ERR_SPOTIFY_RATE_LIMIT';
    throw err;
  }
  if (!res.ok) {
    const err = new Error('Connect your Spotify account to check whether you can access this playlist.');
    err.code = 'ERR_SPOTIFY_AUTH_REQUIRED';
    err.requiresAuth = true;
    err.playlistId = playlistId;
    throw err;
  }

  const html = await res.text();
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!nextDataMatch) {
    const err = new Error('Connect your Spotify account to check whether you can access this playlist.');
    err.code = 'ERR_SPOTIFY_AUTH_REQUIRED';
    err.requiresAuth = true;
    err.playlistId = playlistId;
    throw err;
  }

  let json;
  try {
    json = JSON.parse(nextDataMatch[1]);
  } catch (err) {
    const parseErr = new Error('Connect your Spotify account to check whether you can access this playlist.');
    parseErr.code = 'ERR_SPOTIFY_AUTH_REQUIRED';
    parseErr.requiresAuth = true;
    parseErr.playlistId = playlistId;
    throw parseErr;
  }

  // Check if pageProps returned a 404 or auth challenge inside Next.js payload
  if (json.props?.pageProps?.status === 404 || json.props?.pageProps?.state?.data?.entity === null) {
    const err = new Error('Connect your Spotify account to check whether you can access this playlist.');
    err.code = 'ERR_SPOTIFY_AUTH_REQUIRED';
    err.requiresAuth = true;
    err.playlistId = playlistId;
    throw err;
  }

  const entity = json.props?.pageProps?.state?.data?.entity;
  if (!entity) {
    const err = new Error('Connect your Spotify account to check whether you can access this playlist.');
    err.code = 'ERR_SPOTIFY_AUTH_REQUIRED';
    err.requiresAuth = true;
    err.playlistId = playlistId;
    throw err;
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

  if (tracks.length === 0) {
    const err = new Error('This playlist contains no accessible tracks.');
    err.code = 'ERR_SPOTIFY_EMPTY';
    throw err;
  }

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
 * Tries user OAuth token first, then official Web API client credentials (if configured),
 * then seamlessly falls back to public embed extraction.
 */
async function fetchSpotifyPlaylist(input, userToken = null) {
  const info = extractSpotifyPlaylistInfo(input);
  if (!info || !info.id) {
    throw new Error("This doesn't look like a supported Spotify playlist link. Check the URL and try again.");
  }

  const playlistId = info.id;

  // 1. If user provided an active Spotify OAuth token, use it directly (supports private & collaborative)
  if (userToken && typeof userToken === 'string') {
    return await fetchViaWebApi(playlistId, userToken);
  }

  // 2. Try official Web API with app client credentials (if configured)
  const appToken = await getSpotifyApiToken();
  if (appToken) {
    try {
      return await fetchViaWebApi(playlistId, appToken);
    } catch (apiErr) {
      // If client credentials are not permitted for user playlists, continue to embed fallback
      console.warn('[SpotifyAdapter] Web API app token returned error, trying embed fallback:', apiErr.message);
    }
  }

  // 3. Fallback to public embed extractor
  return await fetchViaPublicEmbed(playlistId);
}

module.exports = {
  extractSpotifyPlaylistId,
  extractSpotifyPlaylistInfo,
  fetchSpotifyPlaylist,
  fetchViaPublicEmbed,
  fetchViaWebApi
};
