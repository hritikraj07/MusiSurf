/**
 * MusiSurf Playback Initialization & Refresh Audio Test Suite
 * Validates immediate audio start after website refresh without tab/application switching.
 */

const assert = require('assert');

// Mock browser environment for Audio, DOM, and MediaSession
class MockAudioElement {
  constructor(id) {
    this.id = id;
    this._src = '';
    this.paused = true;
    this.ended = false;
    this.currentTime = 0;
    this.duration = 240;
    this.volume = 0.8;
    this.readyState = 0; // HAVE_NOTHING initially
    this.preload = 'metadata';
    this._listeners = {};
    this.playCallCount = 0;
  }

  get src() {
    return this._src;
  }

  set src(val) {
    this._src = val;
    this.readyState = 0;
  }

  get currentSrc() {
    return this._src;
  }

  addEventListener(event, fn, options = {}) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push({ fn, once: Boolean(options && options.once) });
  }

  removeEventListener(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(l => l.fn !== fn);
  }

  dispatchEvent(event) {
    const list = this._listeners[event] || [];
    const toRun = [...list];
    this._listeners[event] = list.filter(l => !l.once);
    toRun.forEach(l => {
      try { l.fn({ type: event, target: this }); } catch (e) {}
    });
  }

  load() {
    // Media loading begins
    this.readyState = 1; // HAVE_METADATA
    setTimeout(() => {
      this.readyState = 4; // HAVE_ENOUGH_DATA
      this.dispatchEvent('loadedmetadata');
      this.dispatchEvent('canplay');
    }, 10);
  }

  play() {
    this.playCallCount++;
    return new Promise((resolve, reject) => {
      if (!this._src || this._src === '') {
        const err = new Error('The element has no supported sources.');
        err.name = 'NotSupportedError';
        return reject(err);
      }
      this.paused = false;
      this.readyState = Math.max(this.readyState, 2);
      this.dispatchEvent('play');
      this.dispatchEvent('playing');
      resolve();
    });
  }

  pause() {
    this.paused = true;
    this.dispatchEvent('pause');
  }
}

// Minimal reproduction harness mimicking public/app.js state & audio controller
function createPlaybackHarness() {
  const primaryAudioDeck = new MockAudioElement('audioPlayer');
  const secondaryAudioDeck = new MockAudioElement('audioPlayerSecondary');
  let activeDeckIndex = 0;

  function getActiveDeck() {
    return activeDeckIndex === 0 ? primaryAudioDeck : secondaryAudioDeck;
  }

  const state = {
    currentTrack: null,
    isPlaying: false,
    isTrackLoading: false,
    activePlayerEngine: 'audio',
    queue: [],
    contextQueue: [],
    contextIndex: 0,
    restoredResumeTime: 0,
    volume: 0.8,
    isMuted: false,
    settings: {
      autoMixDuration: 5,
      removeDeadSilence: true,
      get crossfade() { return this.autoMixDuration; }
    }
  };

  let activePlayToken = 0;
  let crossfadeFadeInTimer = null;
  const diagnosticsLog = [];

  function logPlaybackDiagnostic(event, details = {}) {
    diagnosticsLog.push({ event, ...details, timestamp: Date.now() });
  }

  function updatePlayPauseButton() {
    // Reflects UI state
  }

  function isSameTrack(t1, t2) {
    if (!t1 || !t2) return false;
    if (t1.id && t2.id && String(t1.id) === String(t2.id)) return true;
    if (t1.audioUrl && t2.audioUrl && t1.audioUrl === t2.audioUrl) return true;
    return false;
  }

  function applyCrossfadeIn() {
    const act = getActiveDeck();
    const targetVol = state.isMuted ? 0 : (state.volume || 0.8);
    if (act) act.volume = targetVol;
  }

  async function playTrack(track, queueList = null, addToHistory = true, customStartTime = 0) {
    if (!track) return;
    const previousTrack = state.currentTrack;

    // Guard: If clicking the CURRENTLY PLAYING song without explicit custom seek
    const actForGuard = getActiveDeck();
    const currentDeckSrc = actForGuard ? (actForGuard.currentSrc || actForGuard.src || '') : '';
    const hasValidDeckSource = Boolean(currentDeckSrc && currentDeckSrc !== '' && !currentDeckSrc.startsWith('data:audio') && !currentDeckSrc.endsWith('/'));

    if (previousTrack && isSameTrack(track, previousTrack) && customStartTime === 0 && hasValidDeckSource && actForGuard && actForGuard.readyState >= 1) {
      logPlaybackDiagnostic('same-track-resume-guard', { trackId: track.id });
      if (!state.isPlaying || actForGuard.paused) {
        state.isTrackLoading = true;
        updatePlayPauseButton();
        const playPromise = actForGuard.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            state.isPlaying = true;
            state.isTrackLoading = false;
            updatePlayPauseButton();
            logPlaybackDiagnostic('same-track-resume-success', { trackId: track.id });
          }).catch(err => {
            state.isPlaying = false;
            state.isTrackLoading = false;
            updatePlayPauseButton();
          });
        }
      }
      return;
    }

    const currentToken = ++activePlayToken;
    state.isTrackLoading = true;
    updatePlayPauseButton();
    logPlaybackDiagnostic('play-track-start', { trackId: track.id, customStartTime });

    state.currentTrack = track;
    const act = getActiveDeck();

    const streamUrl = track.streamUrl || (track.audioUrl ? `/api/stream?url=${encodeURIComponent(track.audioUrl)}` : null);
    const audioSrc = track.audioUrl || streamUrl;

    if (audioSrc) {
      state.activePlayerEngine = 'audio';
      logPlaybackDiagnostic('source-assigned', { trackId: track.id, audioSrc });

      if (act.src !== audioSrc) {
        act.src = audioSrc;
        act.load();
      }

      if (customStartTime > 0) {
        if (act.readyState >= 1) {
          act.currentTime = customStartTime;
        } else {
          act.addEventListener('loadedmetadata', () => { act.currentTime = customStartTime; }, { once: true });
        }
      }

      const onAudioReady = () => {
        if (currentToken === activePlayToken) {
          if (act.paused && (state.isPlaying || state.isTrackLoading)) {
            act.play().then(() => {
              if (currentToken === activePlayToken) {
                state.isPlaying = true;
                state.isTrackLoading = false;
                updatePlayPauseButton();
              }
            }).catch(() => {});
          }
        }
      };
      act.addEventListener('playing', onAudioReady, { once: true });
      act.addEventListener('canplay', onAudioReady, { once: true });

      applyCrossfadeIn();

      logPlaybackDiagnostic('play-invoked', { trackId: track.id });
      const playPromise = act.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          if (currentToken === activePlayToken) {
            state.isPlaying = true;
            state.isTrackLoading = false;
            updatePlayPauseButton();
            logPlaybackDiagnostic('play-resolved', { trackId: track.id });
          }
        }).catch(err => {
          if (currentToken !== activePlayToken) return;
          logPlaybackDiagnostic('play-rejected', { trackId: track.id, errorName: err.name });
          if (err.name === 'AbortError') {
            const retryPlay = () => {
              if (currentToken === activePlayToken && act.paused) {
                act.play().then(() => {
                  if (currentToken === activePlayToken) {
                    state.isPlaying = true;
                    state.isTrackLoading = false;
                    updatePlayPauseButton();
                  }
                }).catch(() => {});
              }
            };
            if (act.readyState >= 2) {
              retryPlay();
            } else {
              act.addEventListener('canplay', retryPlay, { once: true });
              act.addEventListener('loadeddata', retryPlay, { once: true });
            }
            return;
          }
        });
      }
    }

    if (!state.isPlaying) {
      state.isTrackLoading = true;
    }
    updatePlayPauseButton();
  }

  function togglePlayPause() {
    if (!state.currentTrack) return;
    const currentDeck = getActiveDeck();
    const isActuallyPlaying = currentDeck && !currentDeck.paused && !currentDeck.ended;

    if (state.isPlaying || isActuallyPlaying) {
      state.isPlaying = false;
      currentDeck.pause();
      updatePlayPauseButton();
    } else {
      logPlaybackDiagnostic('togglePlayPause-resume-initiated');
      const resumeTime = state.restoredResumeTime || 0;
      const act = getActiveDeck();
      const currentSrc = act ? (act.currentSrc || act.src || '') : '';
      const hasValidSrc = Boolean(currentSrc && currentSrc !== '' && !currentSrc.startsWith('data:audio') && !currentSrc.endsWith('/'));

      // If active audio deck has no loaded source or is uninitialized (e.g. freshly restored after page refresh),
      // route to full authoritative playTrack with resume position!
      if (!hasValidSrc || act.readyState === 0) {
        logPlaybackDiagnostic('togglePlayPause-delegating-to-playTrack', { resumeTime, hasValidSrc, readyState: act ? act.readyState : null });
        playTrack(state.currentTrack, state.queue, false, resumeTime);
        return;
      }

      state.isTrackLoading = true;
      updatePlayPauseButton();

      const resumePromise = act.play();
      if (resumePromise !== undefined) {
        resumePromise.then(() => {
          state.isPlaying = true;
          state.isTrackLoading = false;
          updatePlayPauseButton();
          logPlaybackDiagnostic('togglePlayPause-resume-success');
        }).catch(err => {
          state.isPlaying = false;
          state.isTrackLoading = false;
          updatePlayPauseButton();
          playTrack(state.currentTrack, state.queue, false, resumeTime);
        });
      }
    }
  }

  function simulateWebsiteRefresh(savedTrack, resumeTime = 0) {
    // Reset browser audio elements as happens on page reload
    primaryAudioDeck.src = '';
    primaryAudioDeck.paused = true;
    primaryAudioDeck.readyState = 0;
    secondaryAudioDeck.src = '';
    secondaryAudioDeck.paused = true;
    secondaryAudioDeck.readyState = 0;
    activeDeckIndex = 0;

    // Restore last state in localStorage (restoreLastPlayedState)
    state.currentTrack = savedTrack;
    state.isPlaying = false;
    state.isTrackLoading = false;
    state.restoredResumeTime = resumeTime;
    diagnosticsLog.length = 0;
  }

  return {
    primaryAudioDeck,
    secondaryAudioDeck,
    getActiveDeck,
    state,
    playTrack,
    togglePlayPause,
    simulateWebsiteRefresh,
    diagnosticsLog
  };
}

// -------------------------------------------------------------
// RUN COMPREHENSIVE TEST SUITE
// -------------------------------------------------------------
async function runTests() {
  console.log('🚀 Running MusiSurf Post-Refresh Playback Verification Suite...\n');
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✓ [TEST ${total}] ${name}`);
    } catch (err) {
      console.error(`  ✗ [TEST ${total}] ${name}\n    Error: ${err.message}`);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✓ [TEST ${total}] ${name}`);
    } catch (err) {
      console.error(`  ✗ [TEST ${total}] ${name}\n    Error: ${err.message}`);
    }
  }

  const trackA = {
    id: 'track_101',
    title: 'Vaaroon',
    artist: 'Anand Bhaskar',
    audioUrl: 'https://cdn.example.com/audio/vaaroon.mp3',
    streamUrl: '/api/stream?url=https%3A%2F%2Fcdn.example.com%2Faudio%2Fvaaroon.mp3',
    hasDirectAudio: true
  };

  const trackB = {
    id: 'track_102',
    title: 'Kesariya',
    artist: 'Arijit Singh',
    audioUrl: 'https://cdn.example.com/audio/kesariya.mp3',
    streamUrl: '/api/stream?url=https%3A%2F%2Fcdn.example.com%2Faudio%2Fkesariya.mp3',
    hasDirectAudio: true
  };

  // Test 1: After refresh, togglePlayPause immediately starts audio on current tab
  await testAsync('After refresh, togglePlayPause() starts audio immediately on current tab', async () => {
    const harness = createPlaybackHarness();
    harness.simulateWebsiteRefresh(trackA, 0);

    assert.strictEqual(harness.getActiveDeck().src, '', 'Deck src must be empty on fresh load');
    assert.strictEqual(harness.state.isPlaying, false, 'Player must be paused initially');

    // User clicks Play button on restored track
    harness.togglePlayPause();
    // Allow Promise microtasks to resolve
    await new Promise(r => setTimeout(r, 25));

    assert.strictEqual(harness.getActiveDeck().paused, false, 'Audio deck must NOT be paused');
    assert.strictEqual(harness.state.isPlaying, true, 'state.isPlaying must be true');
    assert.strictEqual(harness.state.isTrackLoading, false, 'isTrackLoading must be false after playback');
    assert.strictEqual(harness.getActiveDeck().src, trackA.audioUrl, 'Deck src must be populated with track source');
  });

  // Test 2: After refresh, selecting the same restored track starts audio immediately
  await testAsync('After refresh, selecting same restored track (isSameTrack) starts audio immediately', async () => {
    const harness = createPlaybackHarness();
    harness.simulateWebsiteRefresh(trackA, 0);

    // User clicks Track A from Quick Picks or table
    await harness.playTrack(trackA);
    await new Promise(r => setTimeout(r, 25));

    assert.strictEqual(harness.getActiveDeck().paused, false, 'Audio deck must be playing');
    assert.strictEqual(harness.state.isPlaying, true, 'state.isPlaying must be true');
    assert.strictEqual(harness.getActiveDeck().src, trackA.audioUrl, 'Deck src must be assigned');
  });

  // Test 3: After refresh, selecting a different track (Track B) plays immediately
  await testAsync('After refresh, selecting a new track (Track B) starts audio immediately', async () => {
    const harness = createPlaybackHarness();
    harness.simulateWebsiteRefresh(trackA, 0);

    // User clicks Track B from search or playlist
    await harness.playTrack(trackB);
    await new Promise(r => setTimeout(r, 25));

    assert.strictEqual(harness.state.currentTrack.id, trackB.id, 'Active track must be Track B');
    assert.strictEqual(harness.getActiveDeck().paused, false, 'Audio deck must be playing');
    assert.strictEqual(harness.state.isPlaying, true, 'state.isPlaying must be true');
    assert.strictEqual(harness.getActiveDeck().src, trackB.audioUrl, 'Deck src must match Track B');
  });

  // Test 4: Playlist Resume after refresh restores position and starts audio immediately
  await testAsync('Playlist resume after refresh restores position and starts playback without tab switch', async () => {
    const harness = createPlaybackHarness();
    harness.simulateWebsiteRefresh(trackA, 45.5); // Saved at 45.5 seconds

    harness.togglePlayPause();
    await new Promise(r => setTimeout(r, 35));

    assert.strictEqual(harness.getActiveDeck().paused, false, 'Audio deck must be playing');
    assert.strictEqual(harness.state.isPlaying, true, 'state.isPlaying must be true');
    assert.strictEqual(harness.getActiveDeck().currentTime, 45.5, 'Playback position must be restored to 45.5s');
  });

  // Test 5: No false playing state while audio is uninitialized
  test('No false playing state: state.isPlaying is false until media deck actually begins playback', () => {
    const harness = createPlaybackHarness();
    harness.simulateWebsiteRefresh(trackA, 0);

    assert.strictEqual(harness.state.isPlaying, false);
    assert.strictEqual(harness.getActiveDeck().paused, true);
  });

  // Test 6: AbortError recovery on fast browser decoder initialization
  await testAsync('AbortError during fast source assignment recovers and begins playback automatically', async () => {
    const harness = createPlaybackHarness();
    harness.simulateWebsiteRefresh(trackA, 0);

    const deck = harness.getActiveDeck();
    let originalPlay = deck.play.bind(deck);
    let abortOnce = true;

    // Simulate browser rejecting initial play() with AbortError due to concurrent load
    deck.play = function() {
      if (abortOnce) {
        abortOnce = false;
        const err = new Error('The play() request was interrupted by a new load request.');
        err.name = 'AbortError';
        return Promise.reject(err);
      }
      return originalPlay();
    };

    await harness.playTrack(trackA);
    // Wait for canplay / loadeddata microtasks
    await new Promise(r => setTimeout(r, 35));

    assert.strictEqual(deck.paused, false, 'Audio must have automatically recovered and started playing');
    assert.strictEqual(harness.state.isPlaying, true, 'state.isPlaying must be true');
  });

  // Test 7: Diagnostics tracking records all playback events
  await testAsync('Playback lifecycle diagnostics record all state transitions cleanly', async () => {
    const harness = createPlaybackHarness();
    harness.simulateWebsiteRefresh(trackA, 0);

    await harness.playTrack(trackA);
    await new Promise(r => setTimeout(r, 25));

    const events = harness.diagnosticsLog.map(d => d.event);
    assert.ok(events.includes('play-track-start'), 'Must record play-track-start');
    assert.ok(events.includes('source-assigned'), 'Must record source-assigned');
    assert.ok(events.includes('play-invoked'), 'Must record play-invoked');
    assert.ok(events.includes('play-resolved'), 'Must record play-resolved');
  });

  // Test 8: Repeated refresh and immediate play works consistently
  await testAsync('Repeated refresh cycles (3x) consistently start audio without hanging', async () => {
    const harness = createPlaybackHarness();
    for (let cycle = 1; cycle <= 3; cycle++) {
      harness.simulateWebsiteRefresh(cycle % 2 === 0 ? trackA : trackB, 0);
      await harness.playTrack(cycle % 2 === 0 ? trackA : trackB);
      await new Promise(r => setTimeout(r, 25));

      assert.strictEqual(harness.getActiveDeck().paused, false, `Cycle ${cycle} deck must be playing`);
      assert.strictEqual(harness.state.isPlaying, true, `Cycle ${cycle} state.isPlaying must be true`);
    }
  });

  // Test 9: Rapid song selection (Song A -> Song B) does not play the cancelled song
  await testAsync('Rapid song switching cancels the first track and plays the latest track', async () => {
    const harness = createPlaybackHarness();
    harness.simulateWebsiteRefresh(trackA, 0);

    harness.playTrack(trackA);
    // Rapidly switch to Track B before Track A resolves
    await harness.playTrack(trackB);
    await new Promise(r => setTimeout(r, 30));

    assert.strictEqual(harness.state.currentTrack.id, trackB.id, 'Current track must be Track B');
    assert.strictEqual(harness.getActiveDeck().src, trackB.audioUrl, 'Deck source must match Track B');
    assert.strictEqual(harness.getActiveDeck().paused, false, 'Audio deck must be playing');
  });

  // Test 10: Pause after playing works cleanly and resets isPlaying
  await testAsync('Pausing confirmed playback cleanly pauses audio and updates isPlaying to false', async () => {
    const harness = createPlaybackHarness();
    harness.simulateWebsiteRefresh(trackA, 0);

    await harness.playTrack(trackA);
    await new Promise(r => setTimeout(r, 25));
    assert.strictEqual(harness.state.isPlaying, true);

    harness.togglePlayPause();
    assert.strictEqual(harness.getActiveDeck().paused, true, 'Deck must be paused');
    assert.strictEqual(harness.state.isPlaying, false, 'state.isPlaying must be false');
  });

  console.log('\n==================================================');
  console.log(`Test Results: ${passed}/${total} Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('==================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
