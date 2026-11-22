/**
 * MusiSurf — Lyrics Discovery, Scoring, Timestamp Validation & Persistent DB Test Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  cleanTrackTitle,
  extractArtists,
  extractSongVersion,
  computeLyricsMatchScore,
  validateLrcTimestamps,
  normalizeLyricsText
} = require('../scripts/lyrics_matcher');
const lyricsDiscoveryEngine = require('../scripts/lyrics_discovery_engine');
const { detectLyricsLanguage, transliterateTextToDevanagari } = require('../scripts/lyrics_transliteration');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAllTests() {
  console.log('--- 1. TRACK TITLE CLEANING & METADATA STRIPPING ---');
  
  runTest('Strips YouTube music video suffixes and official tags', () => {
    const raw = 'Tuu (Official Music Video) - Harrdy Sandhu | Jaani';
    const cleaned = cleanTrackTitle(raw);
    assert.strictEqual(cleaned, 'Tuu');
  });

  runTest('Strips bracketed video visualizer metadata', () => {
    const raw = 'Bijlee Bijlee [Visualizer 4K HD]';
    const cleaned = cleanTrackTitle(raw);
    assert.strictEqual(cleaned, 'Bijlee Bijlee');
  });

  runTest('Strips (From "Movie Name") Bollywood soundtrack tags', () => {
    const raw = 'Yeh Dil Deewana (From "Pardes")';
    const cleaned = cleanTrackTitle(raw);
    assert.strictEqual(cleaned, 'Yeh Dil Deewana');
  });

  runTest('Strips trailing featured artists in title', () => {
    const raw = 'Kesariya ft. Arijit Singh';
    const cleaned = cleanTrackTitle(raw);
    assert.strictEqual(cleaned, 'Kesariya');
  });

  console.log('\n--- 2. ARTIST EXTRACTION & SONG VERSION DETECTION ---');

  runTest('Splits multiple collaborating artists', () => {
    const artists = extractArtists('Harrdy Sandhu, Rony Ajnali, Gill Machhrai');
    assert.strictEqual(artists.primary, 'harrdy sandhu');
    assert.ok(artists.all.includes('harrdy sandhu'));
    assert.ok(artists.all.includes('rony ajnali'));
    assert.ok(artists.all.includes('gill machhrai'));
  });

  runTest('Identifies song versions (remix, acoustic, live, slowed)', () => {
    assert.strictEqual(extractSongVersion('Shape of You (Acoustic Version)'), 'acoustic');
    assert.strictEqual(extractSongVersion('Stay (Club Remix)'), 'remix');
    assert.strictEqual(extractSongVersion('Hotel California (Live at The Forum)'), 'live');
    assert.strictEqual(extractSongVersion('Tum Hi Ho (Slowed + Reverb)'), 'slowed');
    assert.strictEqual(extractSongVersion('Yeh Dil Deewana'), 'standard');
  });

  console.log('\n--- 3. CANDIDATE MATCHING SCORE & ANTI-WRONG-LYRICS REJECTION ---');

  runTest('CRITICAL: Hard rejects candidate with different artist (Tuu by Darshan Raval vs Harrdy Sandhu)', () => {
    const target = { title: 'Tuu', artist: 'Harrdy Sandhu', duration: 180 };
    const wrongCandidate = { trackName: 'Tuu', artistName: 'Darshan Raval', duration: 180 };
    const score = computeLyricsMatchScore(wrongCandidate, target);
    assert.strictEqual(score, 0, 'Must hard reject different artist even if track title matches perfectly!');
  });

  runTest('CRITICAL: Hard rejects candidate with version mismatch (Remix vs Standard)', () => {
    const target = { title: 'Tuu', artist: 'Harrdy Sandhu', duration: 180 };
    const wrongVersionCandidate = { trackName: 'Tuu (Club Remix)', artistName: 'Harrdy Sandhu', duration: 240 };
    const score = computeLyricsMatchScore(wrongVersionCandidate, target);
    assert.strictEqual(score, 0, 'Must hard reject remix candidate when standard track was requested!');
  });

  runTest('Assigns high match score for exact track and matching primary artist', () => {
    const target = { title: 'Bijlee Bijlee', artist: 'Harrdy Sandhu', duration: 168 };
    const candidate = { trackName: 'Bijlee Bijlee', artistName: 'Harrdy Sandhu', duration: 168 };
    const score = computeLyricsMatchScore(candidate, target);
    assert.ok(score >= 85, `Score should be >= 85, got ${score}`);
  });

  console.log('\n--- 4. LRC TIMESTAMP VALIDATION ---');

  runTest('Validates monotonic real LRC timestamps', () => {
    const validLrc = `
[00:12.50]Line 1
[00:18.20]Line 2
[00:25.80]Line 3
[00:34.10]Line 4
    `.trim();
    const result = validateLrcTimestamps(validLrc, 180);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.lineCount, 4);
  });

  runTest('Rejects non-monotonic timestamps (time going backwards)', () => {
    const invalidLrc = `
[00:15.00]Line 1
[00:25.00]Line 2
[00:12.00]Line 3 going back
[00:40.00]Line 4
    `.trim();
    const result = validateLrcTimestamps(invalidLrc, 180);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason.includes('Monotonicity') || result.reason.includes('out-of-order'));
  });

  runTest('Rejects artificial constant-interval timestamps (fake generated sync)', () => {
    const fakeLrc = `
[00:05.00]Line 1
[00:10.00]Line 2
[00:15.00]Line 3
[00:20.00]Line 4
[00:25.00]Line 5
    `.trim();
    const result = validateLrcTimestamps(fakeLrc, 180);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason.includes('Constant-interval') || result.reason.includes('artificial'));
  });

  runTest('Rejects timestamps that exceed song duration by a large margin', () => {
    const outOfBoundsLrc = `
[00:10.00]Line 1
[00:30.00]Line 2
[05:30.00]Line 3 at 5m30s
    `.trim();
    const result = validateLrcTimestamps(outOfBoundsLrc, 120); // 2 min duration
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason.includes('duration'));
  });

  console.log('\n--- 5. MULTILINGUAL & NATIVE SCRIPT VERIFICATION ---');

  runTest('Detects Hindi Devanagari script', () => {
    const text = 'दिल दीवाना बिन सजना के माने ना';
    const lang = detectLyricsLanguage(text, 'Dil Deewana', 'Lata Mangeshkar');
    assert.strictEqual(lang.language, 'Hindi');
    assert.strictEqual(lang.script, 'Devanagari');
  });

  runTest('Detects Punjabi Gurmukhi script', () => {
    const text = 'ਚਿੱਟਾ ਕੁੜਤਾ ਪਜਾਮਾ ਸਾਡਾ';
    const lang = detectLyricsLanguage(text, 'Chitta', 'Karan Aujla');
    assert.strictEqual(lang.language, 'Punjabi');
    assert.strictEqual(lang.script, 'Gurmukhi');
  });

  runTest('Transliterates Romanized Hindi to Devanagari when requested', () => {
    const romanized = 'Yeh dil deewana';
    const devanagari = transliterateTextToDevanagari(romanized);
    assert.ok(devanagari.includes('दिल') || devanagari.includes('दीवाना'), `Devanagari transliteration failed: ${devanagari}`);
  });

  console.log('\n--- 6. PERSISTENT DISK DATABASE & CONTRIBUTION ENGINE ---');

  await runAsyncTest('User can contribute lyrics and save to persistent store', async () => {
    const testTitle = 'Test MusiSurf Song ' + Date.now();
    const testArtist = 'MusiSurf Artist';
    const testLyrics = `
[00:08.50]First line of the test song
[00:16.20]Second line of the test song
[00:24.80]Third line of the test song
    `.trim();

    const contrib = lyricsDiscoveryEngine.contributeLyrics({
      track: testTitle,
      artist: testArtist,
      album: 'Test Album',
      lyrics: testLyrics
    });

    assert.ok(contrib);
    assert.strictEqual(contrib.verified, true);
    assert.strictEqual(contrib.isUserContributed, true);

    // Verify lookup finds it immediately
    const lookup = await lyricsDiscoveryEngine.findLyrics({
      rawTitle: testTitle,
      title: testTitle,
      artist: testArtist
    });

    assert.strictEqual(lookup.success, true);
    assert.strictEqual(lookup.provider, 'user_contributed');
    assert.ok(lookup.syncedLyrics.includes('First line'));
  });

  await runAsyncTest('Negative lookup for non-existent track returns honest unavailable message with zero AI hallucination', async () => {
    const lookup = await lyricsDiscoveryEngine.findLyrics({
      rawTitle: 'A Totally Nonexistent Random Track 999xyzabc',
      title: 'A Totally Nonexistent Random Track 999xyzabc',
      artist: 'Unknown Artist 999xyzabc',
      duration: 180
    });

    assert.strictEqual(lookup.success, false);
    assert.strictEqual(lookup.verified, false);
    assert.strictEqual(lookup.message, "Lyrics aren't available for this track yet.");
    assert.strictEqual(lookup.syncedLyrics, undefined);
    assert.strictEqual(lookup.plainLyrics, undefined);
  });

  console.log(`\n========================================`);
  console.log(`Tests finished: ${passedTests}/${totalTests} passed`);
  console.log(`========================================`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
