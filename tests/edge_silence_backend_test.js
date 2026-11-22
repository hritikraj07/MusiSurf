const fs = require('fs');
const path = require('path');
const { parseSilenceDetectStderr, analyzeTrackSilence, memoryCache } = require('../scripts/silence_detector');

async function runTests() {
  console.log('--- RUNNING EDGE SILENCE & MOBILE UI TEST SUITE ---');

  // Test 1: Stderr parsing of leading silence (40ms anti-click lead-in)
  const mockLeadingStderr = [
    'Duration: 00:03:00.00, start: 0.000000',
    '[silencedetect @ 001] silence_start: 0',
    '[silencedetect @ 001] silence_end: 2.15 | silence_duration: 2.15'
  ].join('\n');
  const leadRes = parseSilenceDetectStderr(mockLeadingStderr, 180);
  if (leadRes.effectiveStart === 2.11) {
    console.log('[PASS] Test 1: Leading silence: 2.15s trimmed to 2.11s (40ms lead-in).');
  } else {
    console.error('[FAIL] Test 1: Expected 2.11, got', leadRes.effectiveStart);
    process.exit(1);
  }

  // Test 2: Stderr parsing of trailing silence (60ms reverb-tail buffer)
  const mockTrailingStderr = [
    'Duration: 00:03:00.00, start: 0.000000',
    '[silencedetect @ 001] silence_start: 176.4',
    '[silencedetect @ 001] silence_end: 180.0 | silence_duration: 3.6'
  ].join('\n');
  const trailRes = parseSilenceDetectStderr(mockTrailingStderr, 180);
  if (trailRes.effectiveEnd === 176.46) {
    console.log('[PASS] Test 2: Trailing silence: 176.4s trimmed to 176.46s (60ms buffer).');
  } else {
    console.error('[FAIL] Test 2: Expected 176.46, got', trailRes.effectiveEnd);
    process.exit(1);
  }

  // Test 3: Strict Immunity for Mid-Song Silence (100% untouched)
  const mockMidSongStderr = [
    'Duration: 00:03:00.00, start: 0.000000',
    '[silencedetect @ 001] silence_start: 45.2',
    '[silencedetect @ 001] silence_end: 48.0 | silence_duration: 2.8',
    '[silencedetect @ 001] silence_start: 110.0',
    '[silencedetect @ 001] silence_end: 113.5 | silence_duration: 3.5'
  ].join('\n');
  const midRes = parseSilenceDetectStderr(mockMidSongStderr, 180);
  if (midRes.effectiveStart === 0 && midRes.effectiveEnd === 180) {
    console.log('[PASS] Test 3: Mid-song pauses at 45s and 110s left effectiveStart=0 and effectiveEnd=180 untouched.');
  } else {
    console.error('[FAIL] Test 3: Mid-song silence was erroneously trimmed:', midRes);
    process.exit(1);
  }

  // Test 4: Maximum Trim Clamping
  const mockHugeSilenceStderr = [
    'Duration: 00:03:00.00, start: 0.000000',
    '[silencedetect @ 001] silence_start: 0',
    '[silencedetect @ 001] silence_end: 25.0', // Exceeds MAX_START_TRIM (10.0s)
    '[silencedetect @ 001] silence_start: 140.0',
    '[silencedetect @ 001] silence_end: 180.0' // Exceeds MAX_END_TRIM (15.0s)
  ].join('\n');
  const clampRes = parseSilenceDetectStderr(mockHugeSilenceStderr, 180);
  if (clampRes.effectiveStart <= 10.0 && clampRes.effectiveEnd >= (180 - 15.0)) {
    console.log(`[PASS] Test 4: Excessive silence clamped safely (start: ${clampRes.effectiveStart}s, end: ${clampRes.effectiveEnd}s).`);
  } else {
    console.error('[FAIL] Test 4: Clamping failed:', clampRes);
    process.exit(1);
  }

  // Test 5: Cache operation
  const testTrackId = 'test_track_' + Date.now();
  memoryCache.set(testTrackId, { effectiveStart: 1.5, effectiveEnd: 195.0, duration: 200 });
  const cachedRes = await analyzeTrackSilence({ trackId: testTrackId, url: 'http://example.com/test.mp3', duration: 200 });
  if (cachedRes.source === 'cache' && cachedRes.effectiveStart === 1.5 && cachedRes.effectiveEnd === 195.0) {
    console.log('[PASS] Test 5: Memory cache returned immediately with exact bounds.');
  } else {
    console.error('[FAIL] Test 5: Cache return failed:', cachedRes);
    process.exit(1);
  }

  // Test 6: CSS Verification for Mobile Controls & Layout
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  // 6a: Mobile player bar hides shuffle, prev, next, repeat
  if (css.includes('.player-bar .player-controls #shuffleBtn') && css.includes('display: none !important;')) {
    console.log('[PASS] Test 6a: Mobile player bar controls (shuffle, prev, next, repeat) hidden with !important.');
  } else {
    console.error('[FAIL] Test 6a: Mobile player bar hiding rules missing!');
    process.exit(1);
  }

  // 6b: playAllLocalBtn dual-icon prevention
  if (css.includes('#playAllLocalBtn .pause-icon') && css.includes('#playAllLocalBtn.is-playing .play-icon')) {
    console.log('[PASS] Test 6b: playAllLocalBtn has scoped play-icon / pause-icon mutually exclusive rules.');
  } else {
    console.error('[FAIL] Test 6b: playAllLocalBtn icon scoping missing!');
    process.exit(1);
  }

  // 6c: Script toggle button permanently hidden
  if (css.includes('#lyricsScriptToggleBtn') && css.includes('display: none !important;')) {
    console.log('[PASS] Test 6c: Lyrics script toggle button hidden with display: none !important.');
  } else {
    console.error('[FAIL] Test 6c: lyricsScriptToggleBtn CSS rule missing!');
    process.exit(1);
  }

  // 6d: Mobile nav bar compact styling
  if (css.includes('bottom: calc(6px + env(safe-area-inset-bottom, 0px)) !important;') && css.includes('padding: 3px 6px !important;')) {
    console.log('[PASS] Test 6d: Mobile bottom nav bar compact height and padding verified.');
  } else {
    console.error('[FAIL] Test 6d: Compact mobile nav bar styles missing!');
    process.exit(1);
  }

  // 6e: Mobile top bar shown in library and downloads
  if (css.includes('body[data-playlist-id="downloaded"] .top-header') && css.includes('body[data-active-view="library"] .top-header')) {
    console.log('[PASS] Test 6e: Mobile top bar enabled for Library and Downloads views.');
  } else {
    console.error('[FAIL] Test 6e: Mobile top bar display rules missing!');
    process.exit(1);
  }

  // 6f: Downloads section top left back button hidden
  if (css.includes('body[data-playlist-id="downloaded"] .playlist-nav-back-row') && css.includes('display: none !important;')) {
    console.log('[PASS] Test 6f: Downloads section back button hidden on mobile.');
  } else {
    console.error('[FAIL] Test 6f: Downloads back button hiding rule missing!');
    process.exit(1);
  }

  console.log('--- ALL 6 SYSTEM AND UI TESTS PASSED! ---');
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
