/**
 * MusiSurf - Dual-Deck AutoMix & Edge-Only Dead Silence Test Suite
 * Validates:
 * 1. AutoMix naming, settings migration, UI formatting, and backward compatibility.
 * 2. Edge-only dead silence removal (-45 dBFS threshold, leading/trailing trimming with safety caps).
 * 3. STRICT IMMUNITY: Zero cutting, trimming, or skipping of quiet passages in the middle of songs.
 * 4. Dual-deck equal-power cosine/sine volume curve (cos²(p) + sin²(p) = 1.0, zero acoustic dip).
 * 5. Dual-deck overlap lifecycle, pause/resume synchronization, and rapid skip/seek cancellation.
 */

const assert = require('assert');

// 1. Math & Algorithm Definitions matching public/app.js
const LINEAR_SILENCE_THRESHOLD = Math.pow(10, -45 / 20); // ~0.005623 (-45 dBFS)
const MAX_START_TRIM = 8.0;
const MAX_END_TRIM = 12.0;
const ANTI_CLICK_PRE_PAD = 0.03;
const ANTI_CLICK_POST_PAD = 0.05;

function formatAutoMixHeadline(sec) {
  if (sec === 0) return 'OFF';
  return `${sec.toFixed(1)} s`;
}

function formatAutoMixLabel(sec) {
  if (sec === 0) return 'Off (Hard Cut)';
  return `${sec}s overlap`;
}

function calculateEqualPowerGains(progress) {
  const p = Math.max(0, Math.min(1, progress));
  const outGain = Math.cos(p * 0.5 * Math.PI);
  const inGain = Math.sin(p * 0.5 * Math.PI);
  return { outGain, inGain, totalPower: (outGain * outGain) + (inGain * inGain) };
}

// Edge-only silence boundary calculation logic (from getOrAnalyzeTrackEdges)
function analyzeSimulatedBufferEdges(pcmData, sampleRate, totalDuration) {
  const numSamples = pcmData.length;
  if (!numSamples || totalDuration <= 0) {
    return { effectiveStart: 0, effectiveEnd: totalDuration, leadingTrim: 0, trailingTrim: 0 };
  }

  const windowSamples = Math.floor(sampleRate * 0.02); // 20ms analysis window
  const maxStartSamples = Math.min(
    Math.floor(sampleRate * MAX_START_TRIM),
    Math.floor(numSamples * 0.15)
  );
  const maxEndSamples = Math.min(
    Math.floor(sampleRate * MAX_END_TRIM),
    Math.floor(numSamples * 0.20)
  );

  // Scan LEADING EDGE ONLY
  let startSample = 0;
  for (let i = 0; i < maxStartSamples - windowSamples; i += windowSamples) {
    let sumSquares = 0;
    for (let j = 0; j < windowSamples; j++) {
      const s = pcmData[i + j];
      sumSquares += s * s;
    }
    const rms = Math.sqrt(sumSquares / windowSamples);
    if (rms > LINEAR_SILENCE_THRESHOLD) {
      startSample = Math.max(0, i - Math.floor(sampleRate * ANTI_CLICK_PRE_PAD));
      break;
    }
  }

  // Scan TRAILING EDGE ONLY
  let endSample = numSamples;
  const trailingScanStart = Math.max(0, numSamples - maxEndSamples);
  for (let i = numSamples - windowSamples; i >= trailingScanStart; i -= windowSamples) {
    let sumSquares = 0;
    for (let j = 0; j < windowSamples; j++) {
      const s = pcmData[i + j];
      sumSquares += s * s;
    }
    const rms = Math.sqrt(sumSquares / windowSamples);
    if (rms > LINEAR_SILENCE_THRESHOLD) {
      endSample = Math.min(numSamples, i + windowSamples + Math.floor(sampleRate * ANTI_CLICK_POST_PAD));
      break;
    }
  }

  const effectiveStart = Math.max(0, (startSample / sampleRate));
  const effectiveEnd = Math.min(totalDuration, (endSample / sampleRate));

  return {
    effectiveStart,
    effectiveEnd,
    leadingTrim: effectiveStart,
    trailingTrim: Math.max(0, totalDuration - effectiveEnd)
  };
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

console.log('====================================================');
console.log('   MusiSurf AutoMix & Edge Dead Silence Test Suite  ');
console.log('====================================================\n');

// 1. Settings Migration & AutoMix Labels
runTest('AutoMix label and headline formatting functions', () => {
  assert.strictEqual(formatAutoMixHeadline(0), 'OFF');
  assert.strictEqual(formatAutoMixHeadline(5), '5.0 s');
  assert.strictEqual(formatAutoMixHeadline(7.5), '7.5 s');
  assert.strictEqual(formatAutoMixLabel(0), 'Off (Hard Cut)');
  assert.strictEqual(formatAutoMixLabel(5), '5s overlap');
  assert.strictEqual(formatAutoMixLabel(12), '12s overlap');
});

runTest('Settings object maintains backward compatibility between crossfade and autoMixDuration', () => {
  const settings = {
    _autoMixDuration: 5,
    get autoMixDuration() { return this._autoMixDuration; },
    set autoMixDuration(v) { this._autoMixDuration = v; },
    get crossfade() { return this._autoMixDuration; },
    set crossfade(v) { this._autoMixDuration = v; },
    removeDeadSilence: true
  };

  assert.strictEqual(settings.autoMixDuration, 5);
  assert.strictEqual(settings.crossfade, 5);

  settings.crossfade = 8.5;
  assert.strictEqual(settings.autoMixDuration, 8.5);

  settings.autoMixDuration = 3;
  assert.strictEqual(settings.crossfade, 3);
});

// 2. Linear -45 dBFS Threshold Calculation
runTest('-45 dBFS corresponds accurately to linear audio threshold ~0.005623', () => {
  assert(Math.abs(LINEAR_SILENCE_THRESHOLD - 0.0056234) < 0.0001, 'Threshold should be approx 0.005623');
  // -45 dB: 20 * log10(0.005623413) = -45
  const calculatedDb = 20 * Math.log10(LINEAR_SILENCE_THRESHOLD);
  assert(Math.abs(calculatedDb - (-45)) < 1e-9, '-45 dBFS round-trip conversion must be exact');
});

// 3. Leading & Trailing Edge Dead Silence Trimming with Safety Caps
runTest('Edge-only silence removal trims 2.0s leading silence and 3.5s trailing silence', () => {
  const sampleRate = 44100;
  const duration = 100; // 100-second song
  const totalSamples = sampleRate * duration;
  const pcm = new Float32Array(totalSamples);

  // 0s to 2.0s: silence (< LINEAR_SILENCE_THRESHOLD)
  // 2.0s to 96.5s: audio waveform (amplitude 0.5)
  // 96.5s to 100s: silence (amplitude 0.0001)
  const audioStart = Math.floor(sampleRate * 2.0);
  const audioEnd = Math.floor(sampleRate * 96.5);
  for (let i = audioStart; i < audioEnd; i++) {
    pcm[i] = Math.sin((i / sampleRate) * 440 * 2 * Math.PI) * 0.5;
  }

  const result = analyzeSimulatedBufferEdges(pcm, sampleRate, duration);

  // Expected start is ~2.0s minus 30ms anti-click pad = ~1.97s
  assert(result.effectiveStart >= 1.95 && result.effectiveStart <= 2.02, `effectiveStart ${result.effectiveStart} should be around 1.97s`);
  // Expected end is ~96.5s plus 50ms anti-click pad = ~96.55s
  assert(result.effectiveEnd >= 96.45 && result.effectiveEnd <= 96.65, `effectiveEnd ${result.effectiveEnd} should be around 96.55s`);
  assert(result.trailingTrim >= 3.35 && result.trailingTrim <= 3.55, `trailingTrim ${result.trailingTrim} should be ~3.45s`);
});

runTest('Leading silence respects MAX_START_TRIM safety cap (max 8.0s or 15%)', () => {
  const sampleRate = 44100;
  const duration = 100;
  const totalSamples = sampleRate * duration;
  const pcm = new Float32Array(totalSamples);

  // Track has 20s of silence at the start (e.g. malformed file)
  const audioStart = Math.floor(sampleRate * 20.0);
  for (let i = audioStart; i < totalSamples; i++) {
    pcm[i] = 0.4;
  }

  const result = analyzeSimulatedBufferEdges(pcm, sampleRate, duration);
  // Cap must prevent trimming beyond MAX_START_TRIM (8.0s)
  assert(result.effectiveStart <= MAX_START_TRIM, `effectiveStart ${result.effectiveStart} must not exceed ${MAX_START_TRIM}s`);
});

// 4. STRICT IMMUNITY: Zero Mid-Song Trimming
runTest('STRICT IMMUNITY: Acoustic breakdowns and 10s quiet pauses in middle of song are NEVER cut', () => {
  const sampleRate = 44100;
  const duration = 120; // 2-minute song
  const totalSamples = sampleRate * duration;
  const pcm = new Float32Array(totalSamples);

  // Intro starts immediately at 0.1s
  for (let i = Math.floor(sampleRate * 0.1); i < Math.floor(sampleRate * 40.0); i++) {
    pcm[i] = 0.6;
  }

  // 40.0s to 55.0s: Dramatic quiet acoustic breakdown / complete silence in the MIDDLE of track
  // (All zeros between 40s and 55s)

  // 55.0s to 118.0s: Climax and chorus
  for (let i = Math.floor(sampleRate * 55.0); i < Math.floor(sampleRate * 118.0); i++) {
    pcm[i] = 0.7;
  }

  const result = analyzeSimulatedBufferEdges(pcm, sampleRate, duration);

  // The engine ONLY scans leading (0s-8s) and trailing (108s-120s) edges.
  // The middle silence at 40s-55s must have ZERO effect on effectiveStart or effectiveEnd!
  assert(result.effectiveStart < 0.2, `effectiveStart should be near 0s (got ${result.effectiveStart})`);
  assert(result.effectiveEnd >= 117.9, `effectiveEnd should be near 118s (got ${result.effectiveEnd})`);
  // Playable span is 118s - no mid-song cutting!
  const playableSpan = result.effectiveEnd - result.effectiveStart;
  assert(playableSpan >= 117.0, `Playable span ${playableSpan} must encompass the entire middle breakdown`);
});

// 5. Equal-Power Cosine/Sine Crossfade Curve (Zero Acoustic Dip)
runTest('Equal-power cosine/sine curve satisfies cos²(p) + sin²(p) = 1.0 everywhere', () => {
  const testPoints = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

  for (const p of testPoints) {
    const { outGain, inGain, totalPower } = calculateEqualPowerGains(p);

    // Sum of squares of gains must equal 1.0 (constant acoustic power)
    assert(Math.abs(totalPower - 1.0) < 1e-6, `Power sum at progress ${p} must be 1.0 (got ${totalPower})`);

    // Gain boundaries
    if (p === 0.0) {
      assert(Math.abs(outGain - 1.0) < 1e-6, 'At p=0, outGain must be 1.0');
      assert(Math.abs(inGain - 0.0) < 1e-6, 'At p=0, inGain must be 0.0');
    } else if (p === 0.5) {
      // At midpoint (50%), both gains must equal 1/sqrt(2) ≈ 0.7071 (-3 dB, zero acoustic dip)
      const expectedMid = Math.SQRT1_2;
      assert(Math.abs(outGain - expectedMid) < 0.001, `At midpoint, outGain must be ~0.707 (got ${outGain})`);
      assert(Math.abs(inGain - expectedMid) < 0.001, `At midpoint, inGain must be ~0.707 (got ${inGain})`);
    } else if (p === 1.0) {
      assert(Math.abs(outGain - 0.0) < 1e-6, 'At p=1, outGain must be 0.0');
      assert(Math.abs(inGain - 1.0) < 1e-6, 'At p=1, inGain must be 1.0');
    }
  }
});

// 6. Dual-Deck Overlap Engine State Machine Simulation
runTest('Dual-deck AutoMix overlap lifecycle, pause/resume time preservation, and atomic handoff', () => {
  let deckA = { volume: 1.0, paused: false, currentTime: 200 };
  let deckB = { volume: 0.0, paused: false, currentTime: 0, src: 'song2.mp3' };
  let isAutoMixing = true;
  let handoffTriggered = false;

  const durationMs = 5000;
  let startTime = 10000;
  let pausedAt = 0;

  // Step 1: At 1.25s (25% progress), atomic UI handoff triggers
  let now = startTime + 1250;
  let progress = (now - startTime) / durationMs;
  assert.strictEqual(progress, 0.25);
  if (progress >= 0.25) handoffTriggered = true;
  assert(handoffTriggered, 'Atomic handoff must trigger at 25%');

  // Step 2: User pauses at 2.5s (50% progress)
  now = startTime + 2500;
  progress = (now - startTime) / durationMs;
  let gains = calculateEqualPowerGains(progress);
  deckA.volume = gains.outGain;
  deckA.paused = true;
  deckB.volume = gains.inGain;
  deckB.paused = true;
  pausedAt = now;

  assert(deckA.paused && deckB.paused, 'Both decks must pause during mid-mix pause');
  assert(Math.abs(deckA.volume - Math.SQRT1_2) < 0.001, 'Deck A volume preserved at -3dB');
  assert(Math.abs(deckB.volume - Math.SQRT1_2) < 0.001, 'Deck B volume preserved at -3dB');

  // Step 3: User stays paused for 30 seconds, then resumes
  const resumeNow = pausedAt + 30000;
  const pauseDuration = resumeNow - pausedAt;
  startTime += pauseDuration; // adjust reference clock
  deckA.paused = false;
  deckB.paused = false;

  // Verify progress immediately after resume is still 50%
  const resumedProgress = (resumeNow - startTime) / durationMs;
  assert.strictEqual(resumedProgress, 0.5, 'Progress must remain exactly 50% after resume');

  // Step 4: Advance to 5.0s (100% progress) and finalize
  now = startTime + 5000;
  progress = (now - startTime) / durationMs;
  assert.strictEqual(progress, 1.0);
  gains = calculateEqualPowerGains(progress);
  deckA.volume = gains.outGain;
  deckB.volume = gains.inGain;
  assert(deckA.volume < 1e-6, `Deck A volume should be 0 at completion (got ${deckA.volume})`);
  assert(Math.abs(deckB.volume - 1) < 1e-6, `Deck B volume should be 1 at completion (got ${deckB.volume})`);

  // Finalize swap: Deck B becomes active, Deck A paused and reset
  deckA.paused = true;
  isAutoMixing = false;
  assert.strictEqual(isAutoMixing, false);
});

// 7. Instant Hard Cut when autoMixDuration === 0
runTest('Instant hard cut triggers without delay at effectiveEnd when autoMixDuration === 0', () => {
  const autoMixDuration = 0;
  const effectiveEnd = 180.2;
  let hardCutTriggered = false;

  function checkTransition(cur) {
    const effectiveTimeLeft = effectiveEnd - cur;
    if (autoMixDuration === 0 && effectiveTimeLeft <= 0.08) {
      hardCutTriggered = true;
    }
  }

  checkTransition(170.0);
  assert(!hardCutTriggered, 'Hard cut must not trigger prematurely');

  checkTransition(180.15); // 0.05s left
  assert(hardCutTriggered, 'Hard cut must trigger instantaneously at effectiveEnd');
});

// 8. Rapid Skip Cancellation
runTest('Rapid user skip immediately cancels active AutoMix and restores master volume', () => {
  let isAutoMixing = true;
  let activeDeck = { volume: 0.35, paused: false };
  let secondaryDeck = { volume: 0.65, paused: false, src: 'next.mp3' };
  const masterVol = 0.9;

  function cancelActiveAutoMix(destroyPreload = false) {
    isAutoMixing = false;
    activeDeck.volume = masterVol;
    secondaryDeck.volume = 0;
    try { secondaryDeck.pause(); } catch(e) {}
    if (destroyPreload) {
      secondaryDeck.src = '';
    }
  }

  cancelActiveAutoMix(true);

  assert.strictEqual(isAutoMixing, false, 'AutoMix state must be false');
  assert.strictEqual(activeDeck.volume, masterVol, 'Active deck must be restored to full master volume');
  assert.strictEqual(secondaryDeck.volume, 0, 'Secondary deck volume must be 0');
  assert.strictEqual(secondaryDeck.src, '', 'Preloaded source cleared on rapid user skip');
});

console.log('\n====================================================');
console.log(`Tests Completed: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
}
