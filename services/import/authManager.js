/**
 * MusiSurf Centralized OAuth & Pending Import Manager
 * Handles Spotify and Google/YouTube OAuth 2.0 flows, PKCE, token refresh,
 * state verification, and safe pending-import lifecycle.
 */

const crypto = require('crypto');

// In-memory pending imports store (keyed by operation ID, auto-expires after 15 minutes)
const pendingImports = new Map();
const PENDING_TTL_MS = 15 * 60 * 1000;

// Periodic cleanup of expired pending imports
setInterval(() => {
  const now = Date.now();
  for (const [id, item] of pendingImports.entries()) {
    if (now > item.expiresAt) {
      pendingImports.delete(id);
    }
  }
}, 60 * 1000).unref();

/**
 * Generates cryptographically secure random string (URL-safe base64 or hex)
 */
function generateRandomString(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Generates PKCE code_challenge from code_verifier
 */
function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// --------------------------------------------------------------------------
// SPOTIFY OAUTH
// --------------------------------------------------------------------------

function isSpotifyConfigured() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID);
}

function getSpotifyAuthUrl({ state, codeChallenge, redirectUri }) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    throw new Error('Spotify OAuth is not configured on the server. Set SPOTIFY_CLIENT_ID in your environment.');
  }

  const scope = encodeURIComponent('playlist-read-private playlist-read-collaborative user-read-private');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'playlist-read-private playlist-read-collaborative user-read-private',
    redirect_uri: redirectUri,
    state,
    show_dialog: 'true'
  });

  if (codeChallenge) {
    params.set('code_challenge_method', 'S256');
    params.set('code_challenge', codeChallenge);
  }

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeSpotifyCode({ code, codeVerifier, redirectUri }) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId) {
    throw new Error('Spotify Client ID not configured');
  }

  const bodyParams = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: redirectUri,
    client_id: clientId
  });

  if (codeVerifier) {
    bodyParams.set('code_verifier', codeVerifier);
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  // If clientSecret is provided (server-side authorization code flow), include HTTP Basic auth
  if (clientSecret) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers,
    body: bodyParams.toString(),
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Spotify token exchange failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in || 3600
  };
}

async function refreshSpotifyAccessToken(refreshToken) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !refreshToken) {
    throw new Error('Cannot refresh Spotify token: client credentials or refresh token missing');
  }

  const bodyParams = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId
  });

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  if (clientSecret) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers,
    body: bodyParams.toString(),
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Spotify token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // Spotify may or may not return a new refresh token
    expiresIn: data.expires_in || 3600
  };
}

// --------------------------------------------------------------------------
// GOOGLE / YOUTUBE OAUTH
// --------------------------------------------------------------------------

function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID);
}

function getGoogleAuthUrl({ state, redirectUri }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('Google OAuth is not configured on the server. Set GOOGLE_CLIENT_ID in your environment.');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'https://www.googleapis.com/auth/youtube.readonly',
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true'
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeGoogleCode({ code, redirectUri }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId) {
    throw new Error('Google Client ID not configured');
  }

  const bodyParams = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: redirectUri,
    client_id: clientId
  });

  if (clientSecret) {
    bodyParams.set('client_secret', clientSecret);
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString(),
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in || 3600
  };
}

async function refreshGoogleAccessToken(refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !refreshToken) {
    throw new Error('Cannot refresh Google token: client credentials or refresh token missing');
  }

  const bodyParams = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId
  });

  if (clientSecret) {
    bodyParams.set('client_secret', clientSecret);
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString(),
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in || 3600
  };
}

// --------------------------------------------------------------------------
// PENDING IMPORT LIFECYCLE
// --------------------------------------------------------------------------

function createPendingImport({ provider, url, playlistId, userId = null }) {
  const id = 'imp_' + generateRandomString(16);
  const record = {
    id,
    provider,
    url: String(url || '').trim(),
    playlistId: String(playlistId || '').trim(),
    userId: userId || null,
    createdAt: Date.now(),
    expiresAt: Date.now() + PENDING_TTL_MS
  };
  pendingImports.set(id, record);
  return record;
}

function getPendingImport(id) {
  if (!id) return null;
  const record = pendingImports.get(id);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    pendingImports.delete(id);
    return null;
  }
  return record;
}

function consumePendingImport(id) {
  if (!id) return null;
  const record = getPendingImport(id);
  if (record) {
    pendingImports.delete(id);
  }
  return record;
}

module.exports = {
  // Helpers
  generateRandomString,
  generateCodeChallenge,

  // Spotify
  isSpotifyConfigured,
  getSpotifyAuthUrl,
  exchangeSpotifyCode,
  refreshSpotifyAccessToken,

  // Google
  isGoogleConfigured,
  getGoogleAuthUrl,
  exchangeGoogleCode,
  refreshGoogleAccessToken,

  // Pending Import
  createPendingImport,
  getPendingImport,
  consumePendingImport
};
