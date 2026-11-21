const { parseSilenceDetectStderr } = require('../scripts/silence_detector');

const testStderr = [
  'Duration: 00:03:20.50, start: 0.000000, bitrate: 320 kb/s',
  '[silencedetect @ 000001] silence_start: 0',
  '[silencedetect @ 000001] silence_end: 2.38 | silence_duration: 2.38',
  '[silencedetect @ 000001] silence_start: 60.1',
  '[silencedetect @ 000001] silence_end: 62.4 | silence_duration: 2.3',
  '[silencedetect @ 000001] silence_start: 196.2',
  '[silencedetect @ 000001] silence_end: 200.5 | silence_duration: 4.3'
].join('\n');

const res = parseSilenceDetectStderr(testStderr, 200.5);
console.log('Result:', JSON.stringify(res, null, 2));

// Invariant 1: Leading silence properly trimmed (2.38 - 0.04 = 2.34)
if (res.effectiveStart === 2.34) {
  console.log('[PASS] Invariant 1: Leading silence trimmed with 40ms lead-in: 2.34s');
} else {
  console.error('[FAIL] Invariant 1: Expected 2.34, got', res.effectiveStart);
  process.exit(1);
}

// Invariant 2: Trailing silence properly trimmed (196.2 + 0.06 = 196.26)
if (res.effectiveEnd === 196.26) {
  console.log('[PASS] Invariant 2: Trailing silence trimmed with 60ms buffer: 196.26s');
} else {
  console.error('[FAIL] Invariant 2: Expected 196.26, got', res.effectiveEnd);
  process.exit(1);
}

// Invariant 3: Middle silence (60.1s - 62.4s) completely ignored
const midUntouched = res.effectiveStart < 60.1 && res.effectiveEnd > 62.4;
if (midUntouched) {
  console.log('[PASS] Invariant 3: Mid-song silence completely untouched.');
} else {
  console.error('[FAIL] Invariant 3: Mid-song was touched!');
  process.exit(1);
}

// Test case 2: Song with NO silence at edges
const noSilenceStderr = [
  'Duration: 00:03:00.00, start: 0.000000, bitrate: 320 kb/s',
  '[silencedetect @ 000001] silence_start: 45.0',
  '[silencedetect @ 000001] silence_end: 47.0 | silence_duration: 2.0'
].join('\n');

const res2 = parseSilenceDetectStderr(noSilenceStderr, 180);
if (res2.effectiveStart === 0 && res2.effectiveEnd === 180) {
  console.log('[PASS] Test 2: Song with only mid-song pause leaves edges at 0 and 180.');
} else {
  console.error('[FAIL] Test 2: Expected 0 and 180, got', res2);
  process.exit(1);
}

console.log('ALL SILENCE DETECTOR TESTS PASSED SUCCESSFULLY!');
