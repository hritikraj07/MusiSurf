require('dotenv').config();
const { sql } = require('./db');

const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL;
const NEON_AUTH_JWKS_URL = process.env.NEON_AUTH_JWKS_URL;

let joseLib = null;
let remoteJWKS = null;

// Lazy dynamic import of 'jose' to avoid ERR_REQUIRE_ESM on Node 18/20 in CommonJS runtimes (Vercel)
async function getJose() {
  if (joseLib) return joseLib;
  try {
    joseLib = await import('jose');
    if (NEON_AUTH_JWKS_URL && !remoteJWKS) {
      try {
        remoteJWKS = joseLib.createRemoteJWKSet(new URL(NEON_AUTH_JWKS_URL));
      } catch (e) {
        console.warn('[Auth] JWKS init note:', e.message);
      }
    }
    return joseLib;
  } catch (err) {
    console.warn('[Auth] Dynamic jose import note:', err.message);
    return null;
  }
}

/**
 * Extracts session token from request cookies or Authorization header.
 */
function extractToken(req) {
  if (req.cookies && req.cookies['better-auth.session_token']) {
    return req.cookies['better-auth.session_token'];
  }
  if (req.cookies && req.cookies['session_token']) {
    return req.cookies['session_token'];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

/**
 * Resolves active authenticated user from request.
 * Layer 1: Direct low-latency Postgres query on neon_auth.session.
 * Layer 2: Remote /get-session on Neon Auth base URL.
 * Layer 3: JWKS verification for JWT access tokens.
 */
async function getAuthenticatedUser(req) {
  const token = extractToken(req);
  const cookieHeader = req.headers.cookie || '';
  const authHeader = req.headers.authorization || '';

  // 1. Direct PostgreSQL Session Verification (fastest, < 5ms)
  if (token && sql) {
    try {
      const rows = await sql`
        SELECT 
          u.id, 
          u.name, 
          u.email, 
          u.image, 
          u."emailVerified",
          s."expiresAt"
        FROM neon_auth.session s
        JOIN neon_auth."user" u ON s."userId" = u.id
        WHERE s.token = ${token} AND s."expiresAt" > NOW()
        LIMIT 1
      `;
      if (rows && rows.length > 0) {
        return {
          id: rows[0].id,
          name: rows[0].name || (rows[0].email ? rows[0].email.split('@')[0] : 'User'),
          email: rows[0].email,
          image: rows[0].image,
          emailVerified: rows[0].emailVerified
        };
      }
    } catch (dbErr) {
      console.warn('[Auth] DB session lookup note:', dbErr.message);
    }
  }

  // 2. Remote Neon Auth Endpoint (/get-session) Fallback
  if (NEON_AUTH_BASE_URL && (cookieHeader || authHeader)) {
    try {
      const res = await fetch(`${NEON_AUTH_BASE_URL}/get-session`, {
        headers: {
          ...(cookieHeader ? { cookie: cookieHeader } : {}),
          ...(authHeader ? { authorization: authHeader } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.user) {
          return {
            id: data.user.id,
            name: data.user.name || (data.user.email ? data.user.email.split('@')[0] : 'User'),
            email: data.user.email,
            image: data.user.image,
            emailVerified: data.user.emailVerified
          };
        }
      }
    } catch (netErr) {
      console.warn('[Auth] Remote get-session note:', netErr.message);
    }
  }

  // 3. JWKS Verification Fallback for signed JWTs
  if (token && NEON_AUTH_JWKS_URL) {
    try {
      const jose = await getJose();
      if (jose && remoteJWKS) {
        const { payload } = await jose.jwtVerify(token, remoteJWKS);
        if (payload && (payload.sub || payload.userId || payload.id)) {
          return {
            id: payload.sub || payload.userId || payload.id,
            name: payload.name || 'User',
            email: payload.email || '',
            image: payload.image || null
          };
        }
      }
    } catch (jwtErr) {
      // Not a valid JWT or expired
    }
  }

  return null;
}

/**
 * Middleware requiring authenticated user for protected routes.
 */
async function requireAuth(req, res, next) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Please sign in to access your library.'
    });
  }
  req.user = user;
  next();
}

/**
 * Optional auth middleware: attaches req.user if valid session exists.
 */
async function optionalAuth(req, res, next) {
  req.user = await getAuthenticatedUser(req);
  next();
}

module.exports = {
  getAuthenticatedUser,
  requireAuth,
  optionalAuth,
  extractToken
};
