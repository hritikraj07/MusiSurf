const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 TESTING MUSISURF ADVANCED CINEMATIC LYRICS PLAYER');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}\n   Error: ${err.message}`);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}\n   Error: ${err.message}`);
    }
  }

  // --- 1. Functional Anti-Wrong-Lyrics Test ---
  await asyncTest('1. Harrdy Sandhu "Tuu" must NOT return Darshan Raval lyrics (Honest Unavailable)', async () => {
    const res = await fetchJson('http://localhost:3000/api/lyrics?title=Tuu&artist=Harrdy%20Sandhu');
    assert.strictEqual(res.status, 200, 'HTTP status should be 200');
    assert.strictEqual(res.body.success, false, 'Should report success: false when lyrics unavailable');
    assert.strictEqual(res.body.verified, false, 'Should not claim verified lyrics');
    const lyricsContent = (res.body.plainLyrics || res.body.syncedLyrics || '').toLowerCase();
    assert.ok(!lyricsContent.includes('tune chain chheena'), 'Must NEVER include Darshan Raval lyrics');
  });

  // --- 2. Darshan Raval "Tuu" Test ---
  await asyncTest('2. Darshan Raval "Tuu" must return Darshan Raval lyrics', async () => {
    const res = await fetchJson('http://localhost:3000/api/lyrics?title=Tuu&artist=Darshan%20Raval');
    assert.strictEqual(res.status, 200, 'HTTP status should be 200');
    assert.strictEqual(res.body.success, true, 'Should find Darshan Raval lyrics');
    const artist = (res.body.artistName || '').toLowerCase();
    assert.ok(artist.includes('darshan'), `Artist should be Darshan Raval, got: ${res.body.artistName}`);
  });

  // --- 3. Hindi Song "Yeh Fitoor Mera" Test ---
  await asyncTest('3. Hindi Song "Yeh Fitoor Mera" by Arijit Singh returns Devanagari lyrics', async () => {
    const res = await fetchJson('http://localhost:3000/api/lyrics?title=Yeh%20Fitoor%20Mera&artist=Arijit%20Singh');
    assert.strictEqual(res.status, 200, 'HTTP status should be 200');
    assert.strictEqual(res.body.success, true, 'Should find verified lyrics');
    assert.strictEqual(res.body.script, 'Devanagari', 'Script should be Devanagari');
  });

  // --- 4. Punjabi Song "Backbone" Test ---
  await asyncTest('4. Punjabi Song "Backbone" by Harrdy Sandhu returns Gurmukhi lyrics', async () => {
    const res = await fetchJson('http://localhost:3000/api/lyrics?title=Backbone&artist=Harrdy%20Sandhu');
    assert.strictEqual(res.status, 200, 'HTTP status should be 200');
    assert.strictEqual(res.body.success, true, 'Should find verified lyrics');
    assert.strictEqual(res.body.script, 'Gurmukhi', 'Script should be Gurmukhi');
  });

  // --- 5. Verified Database Audit ---
  test('5. verified_lyrics_db.json contains zero corrupted entries', () => {
    const dbPath = path.join(__dirname, '..', 'data', 'verified_lyrics_db.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    assert.ok(!db['tuu__harrdy sandhu__standard'], 'tuu__harrdy sandhu must not exist in verified_db');
  });

  // --- 6. Lyrics Window Inside Border Animation Cleanly Removed as Requested ---
  test('6. Inside lyrics window border animation removed cleanly', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(!html.includes('id="lyrics-edge-glow"'), 'lyrics-edge-glow div must be removed from index.html');
    assert.ok(!html.includes('cinematic-border-svg'), 'cinematic-border-svg must be removed from index.html');
  });

  // --- 7. CSS Moving Border & Typography Inspection ---
  test('7. public/styles.css includes 4-edge perimeter traveling keyframes and song theme colors', () => {
    const cssPath = path.join(__dirname, '..', 'public', 'styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.ok(css.includes('@keyframes cinematicPerimeterTravel'), 'styles.css must have @keyframes cinematicPerimeterTravel');
    assert.ok(css.includes('stroke-dashoffset: -1000'), 'cinematicPerimeterTravel must animate to -1000');
    assert.ok(css.includes('.cinematic-track-rect'), 'styles.css must style cinematic-track-rect');
    assert.ok(css.includes('.cinematic-beam-rect'), 'styles.css must style cinematic-beam-rect');
    assert.ok(css.includes('var(--lyrics-theme-color'), 'Beam must match song album color var(--lyrics-theme-color)');
  });

  // --- 8. Client App.js Verification ---
  test('8. public/app.js enforces word-by-word karaoke glow and cross-device glow', () => {
    const appPath = path.join(__dirname, '..', 'public', 'app.js');
    const appJs = fs.readFileSync(appPath, 'utf8');
    assert.ok(appJs.includes('const currentWordFloat = lineProgress * numWords;'), 'Word-by-word karaoke progression must be active');
    assert.ok(appJs.includes('updateCinematicBorderDimensions'), 'app.js must include updateCinematicBorderDimensions');
    assert.ok(appJs.includes('getPersistentVerifiedLyrics(cacheKey, artist)'), 'getPersistentVerifiedLyrics must take expectedArtist');
  });

  console.log(`\n====================================================`);
  console.log(`🏁 TEST RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log(`====================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
