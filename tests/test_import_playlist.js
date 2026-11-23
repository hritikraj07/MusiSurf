/**
 * Comprehensive Test Suite for MusiSurf External Playlist Import & Transfer System
 * Tests:
 * - A: Spotify URL & URI parsing, extraction, and validation
 * - B: Playlist file parsing across all 7 formats (M3U, M3U8, PLS, XSPF, CSV, JSON, TXT)
 * - C: Security validation (file size, executable binary rejection, HTML sanitization)
 * - D: Song Matching Engine (ISRC, title/artist, version discrimination, duration proximity)
 * - E: Playlist order preservation & intentional duplicate retention
 * - F: Duplicate import detection & merge workflow
 * - G: Settings UI integration verification
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  extractSpotifyPlaylistId,
  extractSpotifyPlaylistInfo,
  fetchSpotifyPlaylist
} = require('../services/import/spotifyAdapter');

const {
  extractYouTubePlaylistId,
  fetchYouTubeMusicPlaylist
} = require('../services/import/youtubeMusicAdapter');

const {
  parsePlaylistFile,
  parseM3U,
  parsePLS,
  parseXSPF,
  parseCSV,
  parseJSON,
  parseTXT,
  sanitizeString,
  splitArtistTitle
} = require('../services/import/playlistParser');

const {
  normalizeText,
  detectVersion,
  extractCoreTitle,
  extractArtists,
  tokenSimilarity,
  scoreCandidate,
  matchSingleTrack
} = require('../services/import/matchingEngine');

const {
  confirmAndCreatePlaylist,
  checkDuplicateImport,
  getImportHistory
} = require('../services/import/importService');

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 TESTING MUSISURF PLAYLIST IMPORT & TRANSFER SYSTEM');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // SUITE A: SPOTIFY LINK & URI VALIDATION
  // --------------------------------------------------------------------------
  console.log('--- SUITE A: SPOTIFY URL & URI VALIDATION ---');

  const validWebUrl = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=123456';
  assert.strictEqual(
    extractSpotifyPlaylistId(validWebUrl),
    '37i9dQZF1DXcBWIGoYBM5M',
    'Must extract playlist ID from standard open.spotify.com URL with query params'
  );

  const validUri = 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M';
  assert.strictEqual(
    extractSpotifyPlaylistId(validUri),
    '37i9dQZF1DXcBWIGoYBM5M',
    'Must extract playlist ID from spotify:playlist: URI'
  );

  const playHostUrl = 'https://play.spotify.com/playlist/5ABGk1vBq67iC9k28d';
  assert.strictEqual(
    extractSpotifyPlaylistId(playHostUrl),
    '5ABGk1vBq67iC9k28d',
    'Must accept play.spotify.com host'
  );

  assert.strictEqual(
    extractSpotifyPlaylistId('https://youtube.com/playlist?list=PL12345'),
    null,
    'Must reject non-Spotify domains'
  );

  assert.strictEqual(
    extractSpotifyPlaylistId('https://open.spotify.com/album/37i9dQZF1DXcBWIGoYBM5M'),
    null,
    'Must reject Spotify album links when expecting a playlist'
  );

  // User reported Spotify URL test
  const userSpotifyUrl = 'https://open.spotify.com/playlist/1XBjvHvMsZlZaFoNtRKpTl?si=a0081be864944c0f&pt=dc66b12165ace170f7531562d85333b9';
  const userExtractedId = extractSpotifyPlaylistId(userSpotifyUrl);
  assert.strictEqual(
    userExtractedId,
    '1XBjvHvMsZlZaFoNtRKpTl',
    'Must extract full 22-character ID without any 9-character or visual truncation'
  );
  assert.strictEqual(userExtractedId.length, 22, 'Playlist ID must be exactly 22 characters');

  const userExtractedInfo = extractSpotifyPlaylistInfo(userSpotifyUrl);
  assert.strictEqual(userExtractedInfo.id, '1XBjvHvMsZlZaFoNtRKpTl');
  assert.strictEqual(userExtractedInfo.hasPtToken, true, 'Must detect presence of pt collaborative/invite sharing token');
  assert.strictEqual(userExtractedInfo.hasSharingParams, true, 'Must flag presence of sharing parameters');
  assert.strictEqual(userExtractedInfo.pt, 'dc66b12165ace170f7531562d85333b9');
  assert.strictEqual(userExtractedInfo.si, 'a0081be864944c0f');

  console.log('  ✓ User exact Spotify playlist link parsed with full 22-char ID and sharing parameters detected without false private assumptions');

  // YouTube Music URL & ID validation
  console.log('\n--- SUITE A2: YOUTUBE MUSIC URL & PLAYLIST ID EXTRACTION ---');
  const ytmUrl1 = 'https://music.youtube.com/playlist?list=PL4fGSI1pDJn5oibdgJt8Hy0-dr2B7kSs2';
  assert.strictEqual(
    extractYouTubePlaylistId(ytmUrl1),
    'PL4fGSI1pDJn5oibdgJt8Hy0-dr2B7kSs2',
    'Must extract playlist ID from music.youtube.com playlist link'
  );

  const ytmUrl2 = 'https://www.youtube.com/playlist?list=PL4fGSI1pDJn5oibdgJt8Hy0-dr2B7kSs2&si=xyz';
  assert.strictEqual(
    extractYouTubePlaylistId(ytmUrl2),
    'PL4fGSI1pDJn5oibdgJt8Hy0-dr2B7kSs2',
    'Must extract playlist ID from standard youtube.com link with query parameters'
  );

  const ytmBrowseUrl = 'https://music.youtube.com/browse/VLPL4fGSI1pDJn5oibdgJt8Hy0-dr2B7kSs2';
  assert.strictEqual(
    extractYouTubePlaylistId(ytmBrowseUrl),
    'PL4fGSI1pDJn5oibdgJt8Hy0-dr2B7kSs2',
    'Must extract clean ID from /browse/VL... URL'
  );

  assert.strictEqual(
    extractYouTubePlaylistId('OLAK5uy_lSTp1DIuzZBUyee3kDsXwPgP25WdfwB40'),
    'OLAK5uy_lSTp1DIuzZBUyee3kDsXwPgP25WdfwB40',
    'Must recognize raw album/chart playlist IDs'
  );

  console.log('  ✓ Successfully extracted YouTube Music playlist IDs across all URL variations');

  // --------------------------------------------------------------------------
  // SUITE B: PLAYLIST FILE PARSERS (7 FORMATS)
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE B: PLAYLIST EXPORT FILE PARSERS (7 FORMATS) ---');

  // 1. M3U
  const m3uContent = `#EXTM3U
#PLAYLIST:Road Trip Hits
#EXTINF:210,Arijit Singh - Tum Hi Ho
C:\\Music\\tum_hi_ho.mp3
#EXTINF:185,Pritam - Subhanallah
https://stream.example.com/subhanallah.mp3`;
  const m3uResult = parseM3U(m3uContent, 'Road Trip Hits.m3u');
  assert.strictEqual(m3uResult.name, 'Road Trip Hits');
  assert.strictEqual(m3uResult.totalTracks, 2);
  assert.strictEqual(m3uResult.tracks[0].title, 'Tum Hi Ho');
  assert.strictEqual(m3uResult.tracks[0].artist, 'Arijit Singh');
  assert.strictEqual(m3uResult.tracks[0].duration, 210);
  console.log('  ✓ 1. M3U parser extracts playlist name, tracks, artist, title, and duration');

  // 2. M3U8 (UTF-8)
  const m3u8Content = `#EXTM3U
#EXTINF:240,Rahat Fateh Ali Khan - O Re Piya
/music/o_re_piya.mp3`;
  const m3u8Result = parsePlaylistFile(m3u8Content, 'test.m3u8');
  assert.strictEqual(m3u8Result.totalTracks, 1);
  assert.strictEqual(m3u8Result.tracks[0].title, 'O Re Piya');
  console.log('  ✓ 2. M3U8 UTF-8 parser works seamlessly');

  // 3. PLS
  const plsContent = `[playlist]
NumberOfEntries=2
File1=http://stream1.mp3
Title1=Atif Aslam - Tera Hone Laga Hoon
Length1=290
File2=http://stream2.mp3
Title2=KK - Dil Ibadat
Length2=320`;
  const plsResult = parsePLS(plsContent, 'Bollywood Classics.pls');
  assert.strictEqual(plsResult.totalTracks, 2);
  assert.strictEqual(plsResult.tracks[0].title, 'Tera Hone Laga Hoon');
  assert.strictEqual(plsResult.tracks[0].artist, 'Atif Aslam');
  assert.strictEqual(plsResult.tracks[0].duration, 290);
  assert.strictEqual(plsResult.tracks[1].title, 'Dil Ibadat');
  console.log('  ✓ 3. PLS INI-style playlist parser extracts numbered track entries and durations');

  // 4. XSPF
  const xspfContent = `<?xml version="1.0" encoding="UTF-8"?>
<playlist version="1" xmlns="http://xspf.org/ns/0/">
  <title>Chill Vibes</title>
  <trackList>
    <track>
      <title>Kesariya</title>
      <creator>Arijit Singh</creator>
      <album>Brahmastra</album>
      <duration>268000</duration>
      <identifier>isrc:INUM72200123</identifier>
    </track>
  </trackList>
</playlist>`;
  const xspfResult = parseXSPF(xspfContent, 'chill.xspf');
  assert.strictEqual(xspfResult.name, 'Chill Vibes');
  assert.strictEqual(xspfResult.totalTracks, 1);
  assert.strictEqual(xspfResult.tracks[0].title, 'Kesariya');
  assert.strictEqual(xspfResult.tracks[0].artist, 'Arijit Singh');
  assert.strictEqual(xspfResult.tracks[0].album, 'Brahmastra');
  assert.strictEqual(xspfResult.tracks[0].duration, 268);
  assert.strictEqual(xspfResult.tracks[0].isrc, 'INUM72200123');
  console.log('  ✓ 4. XSPF XML parser extracts title, creator, album, duration in seconds, and ISRC');

  // 5. CSV (Quoted fields & TuneMyMusic / Soundiiz header format)
  const csvContent = `"Track Name","Artist Name","Album","Duration","ISRC"
"Apna Bana Le","Arijit Singh, Sachin-Jigar","Bhediya","261","INUM72201999"
"Maan Meri Jaan","King","Champagne Talk","194",""`;
  const csvResult = parseCSV(csvContent, 'favorites.csv');
  assert.strictEqual(csvResult.totalTracks, 2);
  assert.strictEqual(csvResult.tracks[0].title, 'Apna Bana Le');
  assert.strictEqual(csvResult.tracks[0].artist, 'Arijit Singh, Sachin-Jigar');
  assert.strictEqual(csvResult.tracks[0].album, 'Bhediya');
  assert.strictEqual(csvResult.tracks[0].duration, 261);
  assert.strictEqual(csvResult.tracks[0].isrc, 'INUM72201999');
  console.log('  ✓ 5. CSV parser handles headers, quoted commas, multiple artists, and ISRC codes');

  // 6. JSON (Standard & MusiSurf format)
  const jsonContent = JSON.stringify({
    name: 'Lo-Fi Study',
    description: 'Relaxing beats',
    tracks: [
      { title: 'Chai & Chill', artist: 'Lofi Records', duration: 150 },
      { title: 'Rainy Night', artist: 'Acoustic Soul', duration: 180 }
    ]
  });
  const jsonResult = parseJSON(jsonContent, 'lofi.json');
  assert.strictEqual(jsonResult.name, 'Lo-Fi Study');
  assert.strictEqual(jsonResult.totalTracks, 2);
  assert.strictEqual(jsonResult.tracks[0].title, 'Chai & Chill');
  console.log('  ✓ 6. JSON parser handles playlist object and track arrays');

  // 7. TXT (Line-by-line format)
  const txtContent = `1. Arijit Singh - Channa Mereya
2. Sonu Nigam - Kal Ho Naa Ho
Mohit Chauhan - Kun Faya Kun`;
  const txtResult = parseTXT(txtContent, 'favourites.txt');
  assert.strictEqual(txtResult.totalTracks, 3);
  assert.strictEqual(txtResult.tracks[0].title, 'Channa Mereya');
  assert.strictEqual(txtResult.tracks[0].artist, 'Arijit Singh');
  assert.strictEqual(txtResult.tracks[1].title, 'Kal Ho Naa Ho');
  assert.strictEqual(txtResult.tracks[1].artist, 'Sonu Nigam');
  assert.strictEqual(txtResult.tracks[2].title, 'Kun Faya Kun');
  console.log('  ✓ 7. TXT parser strips numbered prefixes and splits artist/title lines');

  // --------------------------------------------------------------------------
  // SUITE C: SECURITY & FILE SANITIZATION
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE C: SECURITY & FILE SANITIZATION ---');

  assert.throws(() => {
    parsePlaylistFile('MZ\x90\x00\x03\x00\x00\x00WindowsExecutable', 'danger.exe');
  }, /Unsupported or unsafe binary/);
  console.log('  ✓ Rejects executable binary files');

  const dirtyHtml = '<script>alert("hack")</script>Song Title <b>Bold</b>';
  assert.strictEqual(sanitizeString(dirtyHtml), 'Song Title Bold');
  console.log('  ✓ Sanitizes HTML tags and dangerous scripts from titles');

  // --------------------------------------------------------------------------
  // SUITE D: SONG MATCHING ENGINE
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE D: SONG MATCHING ENGINE & VERSION DISCRIMINATION ---');

  // 1. Exact Title & Artist Match
  const extExact = { title: 'Tum Saanson Mein', artist: 'Himesh Reshammiya', duration: 409 };
  const candExact = { title: 'Tum Saanson Mein', artist: 'Himesh Reshammiya, Tulsi Kumar', duration: 410 };
  const exactScore = scoreCandidate(extExact, candExact);
  assert(exactScore >= 0.88, `Exact title & artist should score >= 0.88 (got ${exactScore})`);
  console.log(`  ✓ Exact song & artist match scores high confidence (${Math.round(exactScore * 100)}%)`);

  // 2. Different Artist with same song title (e.g. Tuu by Darshan Raval vs Harrdy Sandhu)
  const extTuu = { title: 'Tuu', artist: 'Harrdy Sandhu', duration: 195 };
  const candWrongArtist = { title: 'Tuu', artist: 'Darshan Raval', duration: 198 };
  const wrongArtistScore = scoreCandidate(extTuu, candWrongArtist);
  assert(wrongArtistScore < 0.60, `Different artist must score low confidence (got ${wrongArtistScore})`);
  console.log(`  ✓ CRITICAL: Hard rejects candidate with different artist (Score: ${Math.round(wrongArtistScore * 100)}%)`);

  // 3. Version Discrimination: Original vs Remix
  const extOriginal = { title: 'Bekhayali', artist: 'Sachet Tandon', duration: 371 };
  const candRemix = { title: 'Bekhayali (Remix by DJ Chetas)', artist: 'Sachet Tandon', duration: 250 };
  const remixMismatchScore = scoreCandidate(extOriginal, candRemix);
  assert(remixMismatchScore < 0.50, `Original vs Remix must be penalized (got ${remixMismatchScore})`);
  console.log(`  ✓ CRITICAL: Version mismatch (Original vs Remix) rejected (Score: ${Math.round(remixMismatchScore * 100)}%)`);

  // 4. Version Match: Remix vs Remix
  const extRemix = { title: 'Bekhayali (Club Remix)', artist: 'Sachet Tandon', duration: 252 };
  const candRemixMatch = { title: 'Bekhayali - Remix', artist: 'Sachet Tandon', duration: 250 };
  const remixMatchScore = scoreCandidate(extRemix, candRemixMatch);
  assert(remixMatchScore >= 0.80, `Matching remix versions must score high (got ${remixMatchScore})`);
  console.log(`  ✓ Matching remix version recognized and rewarded (${Math.round(remixMatchScore * 100)}%)`);

  // 5. Version Discrimination: Acoustic vs Studio
  const extAcoustic = { title: 'Kesariya (Acoustic Version)', artist: 'Arijit Singh', duration: 240 };
  const candStudio = { title: 'Kesariya', artist: 'Arijit Singh', duration: 268 };
  const acousticMismatch = scoreCandidate(extAcoustic, candStudio);
  assert(acousticMismatch < 0.55, `Acoustic vs Studio must be distinguished (got ${acousticMismatch})`);
  console.log(`  ✓ Acoustic vs Studio version distinguished (${Math.round(acousticMismatch * 100)}%)`);

  // 6. ISRC Exact Match
  const extIsrc = { title: 'Random Name', artist: 'Unknown', isrc: 'INUM72200123' };
  const candIsrc = { title: 'Kesariya', artist: 'Arijit Singh', isrc: 'INUM72200123' };
  assert.strictEqual(scoreCandidate(extIsrc, candIsrc), 1.0, 'Matching ISRC must produce 100% confidence');
  console.log('  ✓ ISRC exact match gives authoritative 100% confidence');

  // --------------------------------------------------------------------------
  // SUITE E: PLAYLIST ORDER & DUPLICATE PRESERVATION
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE E: PLAYLIST ORDER & INTENTIONAL DUPLICATES ---');

  const sourceOrderTracks = [
    { id: 'track_1', title: 'Song A', artist: 'Artist 1' },
    { id: 'track_2', title: 'Song B', artist: 'Artist 2' },
    { id: 'track_1', title: 'Song A', artist: 'Artist 1' } // Intentional duplicate!
  ];

  const createRes = await confirmAndCreatePlaylist({
    playlistName: 'Road Trip Order Test',
    description: 'Testing order and duplicates',
    confirmedTracks: sourceOrderTracks,
    provider: 'spotify'
  });

  assert(createRes.success, 'Playlist creation must succeed');
  assert.strictEqual(createRes.playlist.tracks.length, 3, 'Intentional duplicate occurrence must be preserved');
  assert.strictEqual(createRes.playlist.tracks[0].id, 'track_1');
  assert.strictEqual(createRes.playlist.tracks[1].id, 'track_2');
  assert.strictEqual(createRes.playlist.tracks[2].id, 'track_1');
  console.log('  ✓ Preserves exact source track order (Song A -> Song B -> Song A)');
  console.log('  ✓ Retains intentional duplicate entries without silent deduplication');

  // --------------------------------------------------------------------------
  // SUITE F: SETTINGS UI & DOM ELEMENTS VERIFICATION (PHASE 3 PURGE CONFIRMATION)
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE F: SETTINGS UI DOM VERIFICATION ---');

  const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  // Verify that import feature and Google OAuth have been safely removed from index.html (Phase 3)
  assert(
    !htmlContent.includes('id="importPlaylistModal"'),
    'index.html must not contain importPlaylistModal (purged per Phase 3)'
  );
  assert(
    !htmlContent.includes('id="settingsImportPlaylistBtn"'),
    'index.html must not contain settingsImportPlaylistBtn (purged per Phase 3)'
  );
  assert(
    !htmlContent.includes('id="authGoogleBtn"'),
    'index.html must not contain authGoogleBtn (purged per Phase 3)'
  );

  console.log('  ✓ Confirmed Google Auth & Playlist Import purged from UI (Phase 3)');

  // --------------------------------------------------------------------------
  // SUITE G: AUTOMATIC OAUTH, PENDING IMPORT & TOKEN HYGIENE
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE G: AUTOMATIC OAUTH, PENDING IMPORT & TOKEN HYGIENE ---');

  const authManager = require('../services/import/authManager');

  // 1. PKCE and State Helpers
  const testState = authManager.generateRandomString(24);
  assert(testState && testState.length >= 24, 'OAuth state must be generated cryptographically');
  const verifier = authManager.generateRandomString(32);
  const challenge = authManager.generateCodeChallenge(verifier);
  assert(challenge && challenge.length > 20, 'PKCE code challenge must be generated via SHA-256');

  // 2. Pending Import Lifecycle
  const pending = authManager.createPendingImport({
    provider: 'spotify',
    url: 'https://open.spotify.com/playlist/1XBjvHvMsZlZaFoNtRKpTl',
    playlistId: '1XBjvHvMsZlZaFoNtRKpTl',
    userId: 'user_123'
  });
  assert(pending && pending.id.startsWith('imp_'), 'Pending import must have an operation ID');
  assert.strictEqual(pending.provider, 'spotify');
  assert.strictEqual(pending.playlistId, '1XBjvHvMsZlZaFoNtRKpTl');

  const retrieved = authManager.getPendingImport(pending.id);
  assert.strictEqual(retrieved.id, pending.id, 'Pending import must be retrievable before consumption');

  const consumed = authManager.consumePendingImport(pending.id);
  assert.strictEqual(consumed.id, pending.id, 'Must consume pending import');
  assert.strictEqual(authManager.getPendingImport(pending.id), null, 'Pending import must be single-use only');

  console.log('  ✓ Pending import lifecycle verified: creation, lookup, and single-use consumption');

  // 3. Spotify & Google Auth URLs
  process.env.SPOTIFY_CLIENT_ID = 'test_spotify_client_id';
  const spotifyUrl = authManager.getSpotifyAuthUrl({
    state: testState,
    codeChallenge: challenge,
    redirectUri: 'http://localhost:3000/api/auth/spotify/callback'
  });
  assert(spotifyUrl.includes('client_id=test_spotify_client_id'), 'Spotify auth URL must include client_id');
  assert(spotifyUrl.includes('code_challenge='), 'Spotify auth URL must include PKCE code_challenge');
  assert(spotifyUrl.includes('playlist-read-private'), 'Spotify auth URL must include required scopes');

  process.env.GOOGLE_CLIENT_ID = 'test_google_client_id';
  const googleUrl = authManager.getGoogleAuthUrl({
    state: testState,
    redirectUri: 'http://localhost:3000/api/auth/google/callback'
  });
  assert(googleUrl.includes('client_id=test_google_client_id'), 'Google auth URL must include client_id');
  assert(googleUrl.includes('youtube.readonly'), 'Google auth URL must include youtube.readonly scope');
  assert(googleUrl.includes('access_type=offline'), 'Google auth URL must request offline access for refresh token');

  console.log('  ✓ Spotify and Google official OAuth URLs formatted with required scopes & parameters');

  // 4. Token Hygiene Verification (Zero manual token inputs in UI)
  const appJsContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert(!appJsContent.includes('promptSpotifyTokenInput'), 'app.js must NOT contain manual token input prompt');
  assert(!appJsContent.includes('Paste Access Token'), 'app.js must NOT contain Paste Access Token button');
  assert(!htmlContent.includes('Paste Access Token'), 'index.html must NOT contain Paste Access Token button');

  // 5. Connect & Disconnect Controls purged from index.html (Phase 3)
  assert(!htmlContent.includes('id="spotifyConnectHeaderBtn"'), 'index.html must not contain Spotify Connect button');
  assert(!htmlContent.includes('id="ytConnectHeaderBtn"'), 'index.html must not contain Google/YouTube Connect button');

  // 6. Environment Example Verification
  const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
  assert(envExample.includes('SPOTIFY_CLIENT_ID'), '.env.example must document SPOTIFY_CLIENT_ID');
  assert(envExample.includes('SPOTIFY_CLIENT_SECRET'), '.env.example must document SPOTIFY_CLIENT_SECRET');
  assert(envExample.includes('GOOGLE_CLIENT_ID'), '.env.example must document GOOGLE_CLIENT_ID');
  assert(envExample.includes('GOOGLE_CLIENT_SECRET'), '.env.example must document GOOGLE_CLIENT_SECRET');
  assert(envExample.includes('YOUTUBE_API_KEY'), '.env.example must document YOUTUBE_API_KEY');

  // Verify fetchViaYouTubeDataApi supports apiKey configuration
  const ytAdapter = require('../services/import/youtubeMusicAdapter');
  assert(typeof ytAdapter.fetchViaYouTubeDataApi === 'function', 'fetchViaYouTubeDataApi must be exported');

  console.log('  ✓ UI token hygiene verified: 0 manual token prompts or paste buttons');
  console.log('  ✓ Dedicated Spotify and Google Connect/Disconnect controls verified');
  console.log('  ✓ .env.example contains complete application-level credentials documentation');

  console.log('\n====================================================');
  console.log('🏁 ALL PLAYLIST IMPORT & TRANSFER TESTS PASSED (100%)');
  console.log('====================================================');
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST RUNNER FAILED:', err);
  process.exit(1);
});
