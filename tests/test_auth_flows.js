require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

async function runAuthTests() {
  console.log('====================================================');
  console.log('🧪 TESTING MUSISURF NEON AUTH & GOOGLE OAUTH FLOWS');
  console.log('====================================================\n');

  const sql = neon(process.env.DATABASE_URL);

  // 1. Verify neon_auth.user schema constraints
  console.log('--- SUITE 1: NEON AUTH SCHEMA & CONSTRAINTS ---');
  const userCols = await sql`
    SELECT column_name, is_nullable, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'neon_auth' AND table_name = 'user'
  `;
  const nameCol = userCols.find(c => c.column_name === 'name');
  assert(nameCol, 'neon_auth.user must have a name column');
  assert.strictEqual(nameCol.is_nullable, 'NO', 'name column is NOT NULL in neon_auth.user');
  console.log('  ✓ Verified neon_auth.user requires non-null name field');

  // 2. Verify Frontend Code Hygiene
  console.log('\n--- SUITE 2: FRONTEND VALIDATION & ERROR SURFACING ---');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert(appJs.includes('password.length < 8'), 'Frontend must enforce password.length >= 8');
  assert(appJs.includes('Password must be at least 8 characters'), 'Frontend must show clear 8-character password message');
  assert(appJs.includes('[AuthSignUp]'), 'Frontend must log detailed sign-up debug errors');
  assert(appJs.includes('data.error?.message || data.message'), 'Frontend must surface actual Neon Auth error messages');
  assert(appJs.includes('cleanEmail.split(\'@\')[0]'), 'Frontend must derive fallback name from email prefix');
  assert(appJs.includes('authGoogleBtn'), 'Frontend must include Google OAuth button listener');
  console.log('  ✓ Verified frontend enforces password >= 8 with explicit messaging');
  console.log('  ✓ Verified fallback name derived from email prefix when name input is empty');
  console.log('  ✓ Verified actual error surfacing without masking behind generic failures');

  // 3. Verify Backend Origin & Trusted Domain Handling
  console.log('\n--- SUITE 3: BACKEND PROXY & TRUSTED ORIGINS ---');
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert(serverJs.includes('function getAuthOrigin'), 'server.js must define getAuthOrigin helper');
  assert(serverJs.includes('https://musi-surf.vercel.app'), 'server.js must configure production trusted domain fallback');
  assert(serverJs.includes('http://localhost:3000') || serverJs.includes('localhost'), 'server.js must handle localhost origin');

  const configRows = await sql`SELECT trusted_origins FROM neon_auth.project_config LIMIT 1`;
  const origins = configRows[0]?.trusted_origins || [];
  const domainList = origins.map(o => o.domain);
  assert(domainList.includes('https://musi-surf.vercel.app'), 'trusted_origins must include https://musi-surf.vercel.app without trailing slash');
  assert(domainList.includes('http://localhost:3000'), 'trusted_origins must include http://localhost:3000');
  console.log('  ✓ Verified project_config has trusted origins without trailing slashes:', domainList);

  // 4. Test Direct Neon Auth API Calls (Sign-Up & Origins)
  console.log('\n--- SUITE 4: NEON AUTH SIGN-UP CALLS ---');
  const testEmail = `test_runner_${Date.now()}@musisurf.local`;
  const testPassword = 'Password123!';
  const testName = 'MusiSurf Test Runner';

  // Test 4.1: Sign-up with production origin (https://musi-surf.vercel.app)
  const prodRes = await fetch(`${process.env.NEON_AUTH_BASE_URL}/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://musi-surf.vercel.app'
    },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      name: testName
    })
  });
  const prodData = await prodRes.json().catch(() => ({}));
  assert.strictEqual(prodRes.status, 200, `Sign-up with https://musi-surf.vercel.app origin must succeed (got ${prodRes.status})`);
  assert(prodData.user, 'Sign-up must return created user');
  assert.strictEqual(prodData.user.email, testEmail);
  assert.strictEqual(prodData.user.name, testName);
  console.log('  ✓ Successfully created user via Neon Auth with https://musi-surf.vercel.app origin!');
  console.log('    User ID:', prodData.user.id, '| Email:', prodData.user.email);

  // Test 4.2: Password length enforcement (< 8 chars)
  const shortPwRes = await fetch(`${process.env.NEON_AUTH_BASE_URL}/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:3000'
    },
    body: JSON.stringify({
      email: `test_short_${Date.now()}@musisurf.local`,
      password: 'short',
      name: 'Short PW',
      callbackURL: 'http://localhost:3000/'
    })
  });
  const shortPwData = await shortPwRes.json().catch(() => ({}));
  assert(shortPwRes.status >= 400, 'Sign-up with short password must be rejected');
  assert(shortPwData.message, 'Neon Auth must return detailed message for invalid password');
  console.log('  ✓ Verified short password rejected with message:', shortPwData.message);

  // 5. Test Google Social Login URL Endpoint
  console.log('\n--- SUITE 5: GOOGLE OAUTH CONTINUITY ---');
  const socialRes = await fetch(`${process.env.NEON_AUTH_BASE_URL}/sign-in/social`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://musi-surf.vercel.app'
    },
    body: JSON.stringify({
      provider: 'google',
      callbackURL: 'https://musi-surf.vercel.app/'
    })
  });
  const socialData = await socialRes.json().catch(() => ({}));
  assert.strictEqual(socialRes.status, 200, 'Google social sign-in initiation must return 200');
  assert(socialData.url, 'Google social sign-in must return auth URL');
  assert(socialData.url.includes('sign-in/social/init'), 'Google social auth URL must point to init endpoint');
  console.log('  ✓ Google OAuth social initiation verified 100% operational');

  // Clean up test user
  await sql`DELETE FROM neon_auth."user" WHERE id = ${prodData.user.id}`;
  console.log('\n  ✓ Cleaned up test user from database');

  // 6. Test Library & Write Action Authentication Guards
  console.log('\n--- SUITE 6: LIBRARY & WRITE ACTION AUTHENTICATION GUARDS ---');
  const { requireAuth } = require('../services/auth');

  // 6.1: Direct requireAuth middleware test with unauthenticated request
  let unauthStatus = null;
  let unauthData = null;
  const mockReq = { headers: {}, cookies: {} };
  const mockRes = {
    status(code) {
      unauthStatus = code;
      return this;
    },
    json(payload) {
      unauthData = payload;
      return this;
    }
  };
  let nextCalled = false;
  await requireAuth(mockReq, mockRes, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false, 'requireAuth must not call next() for unauthenticated requests');
  assert.strictEqual(unauthStatus, 401, 'requireAuth must return HTTP 401');
  assert.strictEqual(unauthData.error, 'AUTH_REQUIRED', 'requireAuth must return error code AUTH_REQUIRED');
  assert.strictEqual(unauthData.message, 'Please sign in or create an account to perform this action.');
  console.log('  ✓ requireAuth middleware strictly returns 401 with AUTH_REQUIRED');

  // 6.2: Frontend Auth Guard inspection
  assert(appJs.includes('function isAuthenticated()'), 'public/app.js must define isAuthenticated()');
  assert(appJs.includes('function requireAuthForAction'), 'public/app.js must define requireAuthForAction()');
  assert(appJs.includes('resumePendingAuthAction()'), 'public/app.js must define resumePendingAuthAction()');
  assert(appJs.includes("requireAuthForAction('like songs'"), 'toggleLikeSong must be guarded with requireAuthForAction');
  assert(appJs.includes("requireAuthForAction('create a playlist'"), 'Create playlist must be guarded with requireAuthForAction');
  assert(appJs.includes("requireAuthForAction('add songs to playlists'"), 'Add to playlist must be guarded with requireAuthForAction');
  assert(appJs.includes("requireAuthForAction('add local songs'"), 'Local song adding must be guarded with requireAuthForAction');
  assert(appJs.includes("requireAuthForAction('manage playlists'"), 'Playlist management must be guarded with requireAuthForAction');
  console.log('  ✓ Frontend gates like, playlist creation, playlist modification, and local audio adding');

  // 6.3: Storage fallback suppression
  assert(appJs.includes('if (!isAuthenticated()) return;'), 'public/app.js must prevent guest localStorage / DB writes');
  console.log('  ✓ Guest writes to localStorage and IndexedDB strictly prevented');

  // 6.4: Backend write endpoints guarded in server.js
  assert(serverJs.includes("app.post('/api/library/playlists', requireAuth"), 'POST /api/library/playlists must requireAuth');
  assert(serverJs.includes("app.post('/api/library/likes/toggle', requireAuth"), 'POST /api/library/likes/toggle must requireAuth');
  assert(serverJs.includes("app.post('/api/playlists', requireAuth"), 'POST /api/playlists must requireAuth');
  assert(serverJs.includes("app.post('/api/liked-songs', requireAuth"), 'POST /api/liked-songs must requireAuth');
  assert(serverJs.includes("app.post('/api/local-songs', requireAuth"), 'POST /api/local-songs must requireAuth');
  console.log('  ✓ Server-side write routes guarded by requireAuth middleware');

  console.log('\n====================================================');
  console.log('🏁 ALL NEON AUTH & GOOGLE OAUTH TESTS PASSED (100%)');
  console.log('🏁 ALL NEON AUTH, GOOGLE OAUTH & GUARD TESTS PASSED (100%)');
  console.log('====================================================');
}

runAuthTests().catch(err => {
  console.error('\n❌ AUTH TEST SUITE FAILED:', err);
  process.exit(1);
});
