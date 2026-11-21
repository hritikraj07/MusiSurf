require('dotenv').config();
const { sql, pool } = require('../services/db');
const libraryService = require('../services/library');
const fs = require('fs');
const assert = require('assert');

async function runTests() {
  console.log('--- 1. Testing Neon Postgres Connectivity & Schema ---');
  const dbResult = await sql`SELECT NOW() as current_time, current_database() as db_name`;
  console.log('Neon connected successfully! Database:', dbResult[0].db_name, 'Time:', dbResult[0].current_time);

  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema IN ('public', 'neon_auth')
  `;
  const tableNames = tables.map(t => t.table_name);
  console.log('Tables found in database:', tableNames.filter(t => ['playlists', 'playlist_tracks', 'liked_tracks', 'user', 'session'].includes(t)));
  assert(tableNames.includes('playlists'), 'playlists table must exist');
  assert(tableNames.includes('playlist_tracks'), 'playlist_tracks table must exist');
  assert(tableNames.includes('liked_tracks'), 'liked_tracks table must exist');

  console.log('\n--- 2. Testing User Library Persistence CRUD against Neon ---');
  // Create a temporary test user in neon_auth."user"
  const testUserId = require('crypto').randomUUID();
  const testEmail = `musisurf.test.${Date.now()}@example.com`;
  
  await sql`
    INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    VALUES (${testUserId}, 'Test Listener', ${testEmail}, true, NOW(), NOW())
  `;
  console.log('Created temporary test user:', testUserId);

  try {
    // 2.1 Likes
    console.log('Testing likes toggle (add)...');
    const mockTrack = {
      id: 'test_track_123',
      title: 'Neon Echoes',
      artist: 'MusiSurf Audio Lab',
      album: 'Midnight Velocity',
      image: 'https://images.unsplash.com/photo-test',
      duration: 215
    };
    const likeAdd = await libraryService.toggleUserLike(testUserId, mockTrack);
    assert.strictEqual(likeAdd.liked, true, 'Track should be liked');

    const userLikes = await libraryService.getUserLikes(testUserId);
    assert.strictEqual(userLikes.length, 1, 'User should have 1 liked track');
    assert.strictEqual(userLikes[0].title, 'Neon Echoes');
    console.log('Likes add verified:', userLikes[0].title);

    const likeRemove = await libraryService.toggleUserLike(testUserId, mockTrack);
    assert.strictEqual(likeRemove.liked, false, 'Track should be unliked');
    const userLikesAfter = await libraryService.getUserLikes(testUserId);
    assert.strictEqual(userLikesAfter.length, 0, 'User should have 0 liked tracks after toggle');
    console.log('Likes remove verified!');

    // 2.2 Playlists
    console.log('Testing playlist creation...');
    const createdPl = await libraryService.createUserPlaylist(testUserId, {
      name: 'Synthwave Night Drive',
      description: 'Cruising through the night neon streets'
    });
    assert(createdPl.id, 'Playlist must have an ID');
    assert.strictEqual(createdPl.name, 'Synthwave Night Drive');
    console.log('Playlist created:', createdPl.id, createdPl.name);

    console.log('Testing playlist track addition...');
    const addedTrack = await libraryService.addTrackToPlaylist(createdPl.id, testUserId, mockTrack);
    assert(addedTrack.id, 'Added track must have an ID');
    assert.strictEqual(addedTrack.track_id, 'test_track_123');

    const fetchedPl = await libraryService.getPlaylistById(createdPl.id, testUserId);
    assert(fetchedPl, 'Playlist should be fetched');
    assert.strictEqual(fetchedPl.tracks.length, 1);
    assert.strictEqual(fetchedPl.tracks[0].title, 'Neon Echoes');
    console.log('Playlist track verified:', fetchedPl.tracks[0].title);

    console.log('Testing playlist track removal...');
    await libraryService.removeTrackFromPlaylist(createdPl.id, testUserId, 'test_track_123');
    const fetchedPlAfterRemove = await libraryService.getPlaylistById(createdPl.id, testUserId);
    assert.strictEqual(fetchedPlAfterRemove.tracks.length, 0, 'Playlist tracks should be empty');
    console.log('Playlist track removed successfully!');

    console.log('Testing playlist deletion...');
    const deleted = await libraryService.deletePlaylist(createdPl.id, testUserId);
    assert.strictEqual(deleted, true, 'Playlist should be deleted');
    const userPlaylists = await libraryService.getUserPlaylists(testUserId);
    assert.strictEqual(userPlaylists.length, 0, 'User should have 0 playlists left');
    console.log('Playlist deleted successfully!');
  } finally {
    // Cleanup temporary test user
    await sql`DELETE FROM neon_auth."user" WHERE id = ${testUserId}`;
    console.log('Cleaned up temporary test user.');
  }

  console.log('\n--- 3. Verifying Frontend Assets ---');
  const indexHtml = fs.readFileSync('public/index.html', 'utf8');
  assert(indexHtml.includes('id="authGoogleBtn"'), 'Index HTML must include authGoogleBtn');
  assert(indexHtml.includes('id="authOtpContainer"'), 'Index HTML must include authOtpContainer');
  assert(indexHtml.includes('id="userProfileDropdown"'), 'Index HTML must include userProfileDropdown');
  assert(indexHtml.includes('id="authTabSignIn"'), 'Index HTML must include authTabSignIn');
  assert(indexHtml.includes('id="authTabSignUp"'), 'Index HTML must include authTabSignUp');
  console.log('public/index.html contains all required Auth elements!');

  const stylesCss = fs.readFileSync('public/styles.css', 'utf8');
  assert(stylesCss.includes('.auth-google-btn'), 'Styles must include .auth-google-btn');
  assert(stylesCss.includes('.auth-otp-input'), 'Styles must include .auth-otp-input');
  assert(stylesCss.includes('.user-profile-dropdown'), 'Styles must include .user-profile-dropdown');
  console.log('public/styles.css contains all required Auth & Dropdown styles!');

  const appJs = fs.readFileSync('public/app.js', 'utf8');
  assert(appJs.includes('/api/auth/sign-in'), 'App.js must call sign-in endpoint');
  assert(appJs.includes('/api/auth/sign-up'), 'App.js must call sign-up endpoint');
  assert(appJs.includes('/api/auth/verify-otp'), 'App.js must call verify-otp endpoint');
  assert(appJs.includes('/api/auth/social-url'), 'App.js must call social-url endpoint');
  assert(appJs.includes('/api/library/likes'), 'App.js must call library likes endpoint');
  assert(appJs.includes('/api/library/playlists'), 'App.js must call library playlists endpoint');
  console.log('public/app.js contains all required Neon Auth & Library Persistence calls!');

  console.log('\nALL END-TO-END VERIFICATION CHECKS PASSED PERFECTLY!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
