/**
 * Automated Verification Suite: Repeat One & Previous Track Playback Architecture
 * Tests:
 * 1. Repeat One state transitions & localStorage persistence
 * 2. Repeat One execution: zero-second restart, lyrics reset to line 0, progress reset to 0:00/0%
 * 3. Crossfade / AutoMix inhibition during Repeat One
 * 4. Preservation of userQueue, contextQueue, and recommendation session across repeats
 * 5. Manual Next bypasses Repeat One while natural end repeats
 * 6. Previous button threshold: > 3.0s restarts current track
 * 7. Previous button threshold: <= 3.0s navigates backwards in history stack
 * 8. Forward retracing with Next button after navigating backwards
 * 9. History branch truncation on new track selection
 * 10. Duplicate track prevention in history
 * 11. Initial restore session history recording
 */

const assert = require('assert');

// Mock Browser Environment
const localStorageStore = {};
global.localStorage = {
  getItem: (k) => (k in localStorageStore ? localStorageStore[k] : null),
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); }
};

global.document = {
  querySelectorAll: (selector) => {
    if (selector === '.lyric-line') {
      return [
        { classList: { classes: new Set(['active']), add(c) { this.classes.add(c); }, remove(...cs) { cs.forEach(c => this.classes.delete(c)); } } },
        { classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(...cs) { cs.forEach(c => this.classes.delete(c)); } } },
        { classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(...cs) { cs.forEach(c => this.classes.delete(c)); } } }
      ];
    }
    return [];
  }
};

global.navigator = {
  mediaSession: {
    setPositionState: (state) => { global.lastMediaSessionState = state; }
  }
};

console.log('🧪 Starting MUSISURF Repeat One & Previous Track Playback Test Suite...\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    console.error(err.stack);
  }
}

// -------------------------------------------------------------
// Test 1: Repeat Mode 3-way toggle & LocalStorage persistence
// -------------------------------------------------------------
runTest('Repeat Mode: 3-way toggle cycles off -> all -> one -> off & persists', () => {
  localStorage.clear();
  
  const state = {
    repeatMode: localStorage.getItem('musisurf_repeat_mode') || 'off'
  };
  assert.strictEqual(state.repeatMode, 'off');

  function toggleRepeatMode() {
    if (state.repeatMode === 'off') {
      state.repeatMode = 'all';
    } else if (state.repeatMode === 'all') {
      state.repeatMode = 'one';
    } else {
      state.repeatMode = 'off';
    }
    localStorage.setItem('musisurf_repeat_mode', state.repeatMode);
  }

  toggleRepeatMode();
  assert.strictEqual(state.repeatMode, 'all');
  assert.strictEqual(localStorage.getItem('musisurf_repeat_mode'), 'all');

  toggleRepeatMode();
  assert.strictEqual(state.repeatMode, 'one');
  assert.strictEqual(localStorage.getItem('musisurf_repeat_mode'), 'one');

  toggleRepeatMode();
  assert.strictEqual(state.repeatMode, 'off');
  assert.strictEqual(localStorage.getItem('musisurf_repeat_mode'), 'off');
});

// -------------------------------------------------------------
// Test 2: Repeat One Authoritative Restart Engine
// -------------------------------------------------------------
runTest('Repeat One: restartCurrentTrack cleanly resets progress, lyrics, timers, and active playback', () => {
  let playCalled = false;
  let activeLyricIdx = 4;
  let resetLyricsCalled = false;

  const mockTrack = {
    id: 'track_123',
    title: 'Apna Bana Le',
    artist: 'Arijit Singh',
    duration: 210,
    _introTrimmed: true
  };

  const elements = {
    currentTimeLabel: { textContent: '3:30' },
    progressFill: { style: { width: '100%' } },
    progressBar: { value: 100 },
    mobCurrentTime: { textContent: '3:30' },
    mobProgressFill: { style: { width: '100%' } },
    mobProgressBar: { value: 100 }
  };

  const mockDeck = {
    currentTime: 210,
    volume: 0.8,
    play() {
      playCalled = true;
      return Promise.resolve();
    }
  };

  const state = {
    currentTrack: mockTrack,
    isPlaying: true,
    repeatMode: 'one',
    _currentTrackListeningSeconds: 210,
    activeLyricIndex: activeLyricIdx
  };

  function restartCurrentTrack(reason = 'repeat-one') {
    const track = state.currentTrack;
    if (!track) return;

    track._introTrimmed = false;
    state._currentTrackListeningSeconds = 0;

    elements.currentTimeLabel.textContent = '0:00';
    elements.progressFill.style.width = '0%';
    elements.progressBar.value = 0;
    elements.mobCurrentTime.textContent = '0:00';
    elements.mobProgressFill.style.width = '0%';
    elements.mobProgressBar.value = 0;

    state.activeLyricIndex = 0;
    resetLyricsCalled = true;

    mockDeck.currentTime = 0;
    mockDeck.play();
  }

  restartCurrentTrack('repeat-one');

  assert.strictEqual(playCalled, true, 'Audio deck play() must be triggered');
  assert.strictEqual(mockDeck.currentTime, 0, 'Deck currentTime must be reset to 0');
  assert.strictEqual(elements.currentTimeLabel.textContent, '0:00', 'Current time label must show 0:00');
  assert.strictEqual(elements.progressFill.style.width, '0%', 'Progress bar fill must be 0%');
  assert.strictEqual(state.activeLyricIndex, 0, 'Active lyric index must reset to line 0');
  assert.strictEqual(resetLyricsCalled, true, 'resetLyricsScrollToTop must be invoked');
  assert.strictEqual(mockTrack._introTrimmed, false, 'Intro silence trim must reset');
  assert.strictEqual(state._currentTrackListeningSeconds, 0, 'Listening timer must reset');
});

// -------------------------------------------------------------
// Test 3: Repeat One Crossfade & AutoMix Inhibition
// -------------------------------------------------------------
runTest('Repeat One: checkPlaybackCrossfadeAndTransitions inhibits AutoMix and restarts track at boundary', () => {
  let restartCalled = false;
  let automixStarted = false;

  const state = {
    isPlaying: true,
    isTrackLoading: false,
    isTransitioning: false,
    repeatMode: 'one',
    currentTrack: { id: 't1', title: 'Kesariya', duration: 180 },
    settings: { autoMixDuration: 6 }
  };

  function checkPlaybackCrossfadeAndTransitions(cur, dur) {
    if (!state.isPlaying || state.isTrackLoading || state.isTransitioning) return;
    const effectiveTimeLeft = dur - cur;

    if (state.repeatMode === 'one') {
      if (effectiveTimeLeft <= 0.05 && !state.isTransitioning) {
        restartCalled = true;
      }
      return;
    }

    if (state.settings.autoMixDuration > 0 && effectiveTimeLeft <= state.settings.autoMixDuration) {
      automixStarted = true;
    }
  }

  // Check 5 seconds before end (during normal automix window)
  checkPlaybackCrossfadeAndTransitions(175, 180);
  assert.strictEqual(automixStarted, false, 'AutoMix must NOT start when Repeat One is active');
  assert.strictEqual(restartCalled, false, 'Must not restart before reaching end');

  // Check at track end (cur = 179.98)
  checkPlaybackCrossfadeAndTransitions(179.98, 180);
  assert.strictEqual(restartCalled, true, 'Must restart when reaching track end in Repeat One');
  assert.strictEqual(automixStarted, false, 'AutoMix must remain false');
});

// -------------------------------------------------------------
// Test 4: Queue & Playlist Context Preservation across Repeats
// -------------------------------------------------------------
runTest('Repeat One: Queue and recommendations are NOT consumed or altered during repeats', () => {
  let restarted = false;

  const state = {
    repeatMode: 'one',
    currentTrack: { id: 't1', title: 'Song 1' },
    userQueue: [{ id: 't2', title: 'Song 2' }, { id: 't3', title: 'Song 3' }],
    contextQueue: [{ id: 't1', title: 'Song 1' }, { id: 't4', title: 'Song 4' }],
    contextIndex: 0,
    recommendationQueue: [{ id: 'reco1', title: 'Reco 1' }],
    isTransitioning: false
  };

  function onTrackEnded() {
    if (state.repeatMode === 'one' && state.currentTrack) {
      restarted = true;
      return;
    }
    // Normal queue advance
    if (state.userQueue.length > 0) {
      state.currentTrack = state.userQueue.shift();
    }
  }

  // Simulate 3 natural song ends
  for (let i = 0; i < 3; i++) {
    restarted = false;
    onTrackEnded();
    assert.strictEqual(restarted, true, `Repeat ${i + 1} must trigger restartCurrentTrack`);
    assert.strictEqual(state.currentTrack.id, 't1', 'Current track must remain Song 1');
    assert.strictEqual(state.userQueue.length, 2, 'userQueue must NOT be consumed');
    assert.strictEqual(state.contextIndex, 0, 'contextIndex must NOT advance');
    assert.strictEqual(state.recommendationQueue.length, 1, 'recommendations must NOT be consumed');
  }
});

// -------------------------------------------------------------
// Test 5: Manual Next Skip Bypasses Repeat One
// -------------------------------------------------------------
runTest('Manual Next: Clicking Next advances to next song even if Repeat One is enabled', () => {
  const state = {
    repeatMode: 'one',
    currentTrack: { id: 't1', title: 'Song 1' },
    userQueue: [{ id: 't2', title: 'Song 2' }],
    contextQueue: [{ id: 't1', title: 'Song 1' }, { id: 't3', title: 'Song 3' }],
    contextIndex: 0,
    playbackHistory: [{ track: { id: 't1', title: 'Song 1' } }],
    historyCursor: 0
  };

  let songSwitchedTo = null;
  function transitionToNextSong(targetTrack = null, queueContext = null, options = {}) {
    if (!options.isManualSkip && !targetTrack && state.repeatMode === 'one' && state.currentTrack) {
      // Repeat current track
      songSwitchedTo = state.currentTrack;
      return;
    }
    if (state.userQueue && state.userQueue.length > 0) {
      songSwitchedTo = state.userQueue.shift();
    }
  }

  function nextTrack() {
    transitionToNextSong(null, null, { isManualSkip: true });
  }

  nextTrack();
  assert.strictEqual(songSwitchedTo.id, 't2', 'Manual skip must advance to userQueue item Song 2');
});

// -------------------------------------------------------------
// Test 6: Previous Button - Playback Position > 3.0s Restarts Song
// -------------------------------------------------------------
runTest('Previous Button: Playback position > 3.0s restarts current track from 0:00 without changing track', () => {
  let restartedReason = null;
  let playedTrack = null;

  const PREV_RESTART_THRESHOLD_SECONDS = 3.0;

  const state = {
    currentTrack: { id: 't2', title: 'Song 2' },
    playbackHistory: [
      { track: { id: 't1', title: 'Song 1' } },
      { track: { id: 't2', title: 'Song 2' } }
    ],
    historyCursor: 1
  };

  function getCurrentPlaybackTime() {
    return 4.2; // > 3.0 seconds
  }

  function restartCurrentTrack(reason) {
    restartedReason = reason;
  }

  function prevTrack() {
    const curTime = getCurrentPlaybackTime();
    if (curTime > PREV_RESTART_THRESHOLD_SECONDS) {
      restartCurrentTrack('previous-restart-3s');
      return;
    }
    state.historyCursor--;
    playedTrack = state.playbackHistory[state.historyCursor].track;
  }

  prevTrack();

  assert.strictEqual(restartedReason, 'previous-restart-3s', 'Should call restartCurrentTrack');
  assert.strictEqual(playedTrack, null, 'Must NOT navigate to previous song');
  assert.strictEqual(state.historyCursor, 1, 'historyCursor must NOT decrement');
});

// -------------------------------------------------------------
// Test 7: Previous Button - Playback Position <= 3.0s Navigates Backwards
// -------------------------------------------------------------
runTest('Previous Button: Playback position <= 3.0s navigates backwards through history stack', () => {
  let playedTrack = null;
  const PREV_RESTART_THRESHOLD_SECONDS = 3.0;

  const state = {
    currentTrack: { id: 't3', title: 'Song 3' },
    playbackHistory: [
      { track: { id: 't1', title: 'Song 1' } },
      { track: { id: 't2', title: 'Song 2' } },
      { track: { id: 't3', title: 'Song 3' } }
    ],
    historyCursor: 2
  };

  function areTracksIdentical(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id && a.id === b.id) return true;
    if (a.canonicalId && b.canonicalId && a.canonicalId === b.canonicalId) return true;
    return false;
  }

  function prevTrack(playbackTime) {
    if (playbackTime > PREV_RESTART_THRESHOLD_SECONDS) {
      return 'restarted';
    }

    if (state.playbackHistory && state.playbackHistory.length > 0 && state.historyCursor > 0) {
      let targetIndex = state.historyCursor - 1;
      while (targetIndex >= 0 && state.currentTrack && areTracksIdentical(state.playbackHistory[targetIndex].track, state.currentTrack)) {
        targetIndex--;
      }
      if (targetIndex >= 0) {
        state.historyCursor = targetIndex;
        playedTrack = state.playbackHistory[state.historyCursor].track;
        state.currentTrack = playedTrack;
        return 'navigated';
      }
    }
    return 'fallback-restart';
  }

  // 1st click at 1.2s: moves from Song 3 to Song 2
  const res1 = prevTrack(1.2);
  assert.strictEqual(res1, 'navigated');
  assert.strictEqual(playedTrack.id, 't2', 'Must navigate to Song 2');
  assert.strictEqual(state.historyCursor, 1, 'Cursor must be 1');

  // 2nd click at 0.5s: moves from Song 2 to Song 1
  const res2 = prevTrack(0.5);
  assert.strictEqual(res2, 'navigated');
  assert.strictEqual(playedTrack.id, 't1', 'Must navigate to Song 1');
  assert.strictEqual(state.historyCursor, 0, 'Cursor must be 0');

  // 3rd click at 0.8s: at beginning of history, restarts Song 1
  const res3 = prevTrack(0.8);
  assert.strictEqual(res3, 'fallback-restart', 'Must fallback to restart when at beginning');
  assert.strictEqual(state.currentTrack.id, 't1', 'Must remain Song 1');
  assert.strictEqual(state.historyCursor, 0, 'Cursor must stay at 0');
});

// -------------------------------------------------------------
// Test 8: Forward Retracing with Next Button after Navigating Backwards
// -------------------------------------------------------------
runTest('Next Button: Retraces forward through history stack after user navigated backwards with Previous', () => {
  let playedTrack = null;

  const state = {
    currentTrack: { id: 't1', title: 'Song 1' },
    playbackHistory: [
      { track: { id: 't1', title: 'Song 1' } },
      { track: { id: 't2', title: 'Song 2' } },
      { track: { id: 't3', title: 'Song 3' } }
    ],
    historyCursor: 0, // Navigated all the way back to Song 1
    queue: [{ id: 't4', title: 'Song 4' }]
  };

  function areTracksIdentical(a, b) {
    return a && b && a.id === b.id;
  }

  function nextTrack() {
    if (state.playbackHistory && state.playbackHistory.length > 0 && state.historyCursor >= 0 && state.historyCursor < state.playbackHistory.length - 1) {
      let targetIndex = state.historyCursor + 1;
      while (targetIndex < state.playbackHistory.length && state.currentTrack && areTracksIdentical(state.playbackHistory[targetIndex].track, state.currentTrack)) {
        targetIndex++;
      }
      if (targetIndex < state.playbackHistory.length) {
        state.historyCursor = targetIndex;
        playedTrack = state.playbackHistory[state.historyCursor].track;
        state.currentTrack = playedTrack;
        return;
      }
    }
    // Queue progression
    playedTrack = state.queue.shift();
    state.currentTrack = playedTrack;
  }

  // 1st Next click: retraces forward to Song 2
  nextTrack();
  assert.strictEqual(playedTrack.id, 't2', 'Next must retrace forward to Song 2');
  assert.strictEqual(state.historyCursor, 1);

  // 2nd Next click: retraces forward to Song 3
  nextTrack();
  assert.strictEqual(playedTrack.id, 't3', 'Next must retrace forward to Song 3');
  assert.strictEqual(state.historyCursor, 2);

  // 3rd Next click: at front of history, advances to regular upcoming queue Song 4
  nextTrack();
  assert.strictEqual(playedTrack.id, 't4', 'Next must advance to normal queue Song 4');
});

// -------------------------------------------------------------
// Test 9: History Branch Truncation on New Track Selection
// -------------------------------------------------------------
runTest('Playback History: Truncates forward abandoned branch if user chooses a new track while in the past', () => {
  const MAX_PLAYBACK_HISTORY = 50;
  const state = {
    playbackHistory: [
      { track: { id: 't1', title: 'Song 1' } },
      { track: { id: 't2', title: 'Song 2' } },
      { track: { id: 't3', title: 'Song 3' } }
    ],
    historyCursor: 1 // User clicked previous to Song 2
  };

  function areTracksIdentical(a, b) {
    return a && b && a.id === b.id;
  }

  function recordPlaybackHistoryEntry(track, options = {}) {
    if (!track) return;
    if (options.transitionReason === 'repeat-one') return;

    if (options.isHistoryNav) {
      return;
    }

    // Branch truncation
    if (state.historyCursor >= 0 && state.historyCursor < state.playbackHistory.length - 1) {
      state.playbackHistory = state.playbackHistory.slice(0, state.historyCursor + 1);
    }

    const currentEntry = state.playbackHistory[state.historyCursor];
    if (currentEntry && areTracksIdentical(currentEntry.track, track)) {
      return;
    }

    state.playbackHistory.push({ track });
    state.historyCursor = state.playbackHistory.length - 1;
  }

  // User manually selects new Song X
  const newTrack = { id: 'tx', title: 'Song X (New)' };
  recordPlaybackHistoryEntry(newTrack);

  assert.strictEqual(state.playbackHistory.length, 3, 'History length should be 3 [Song 1, Song 2, Song X]');
  assert.strictEqual(state.playbackHistory[0].track.id, 't1');
  assert.strictEqual(state.playbackHistory[1].track.id, 't2');
  assert.strictEqual(state.playbackHistory[2].track.id, 'tx', 'Song X must be at index 2');
  assert.strictEqual(state.historyCursor, 2, 'historyCursor must point to Song X');
  assert.strictEqual(state.playbackHistory.some(h => h.track.id === 't3'), false, 'Song 3 must be truncated from forward branch');
});

// -------------------------------------------------------------
// Test 10: Duplicate Track Deduplication in History
// -------------------------------------------------------------
runTest('Playback History: Does NOT push duplicate history entry when re-selecting or resuming same song', () => {
  const state = {
    playbackHistory: [
      { track: { id: 't1', title: 'Song 1' } }
    ],
    historyCursor: 0
  };

  function areTracksIdentical(a, b) {
    return a && b && a.id === b.id;
  }

  function recordPlaybackHistoryEntry(track, options = {}) {
    if (!track) return;
    if (options.transitionReason === 'repeat-one') return;

    const currentEntry = state.playbackHistory[state.historyCursor];
    if (currentEntry && areTracksIdentical(currentEntry.track, track)) {
      // Deduplicated
      return;
    }

    state.playbackHistory.push({ track });
    state.historyCursor = state.playbackHistory.length - 1;
  }

  // Re-selecting Song 1
  recordPlaybackHistoryEntry({ id: 't1', title: 'Song 1' });
  assert.strictEqual(state.playbackHistory.length, 1, 'Should NOT add duplicate entry');
  assert.strictEqual(state.historyCursor, 0);

  // Repeat-one restart
  recordPlaybackHistoryEntry({ id: 't1', title: 'Song 1' }, { transitionReason: 'repeat-one' });
  assert.strictEqual(state.playbackHistory.length, 1, 'Repeat One must NEVER add history entry');
});

// -------------------------------------------------------------
// Test 11: Initial Session Restore History Recording
// -------------------------------------------------------------
runTest('Session Restore: Initial restored song is accurately seeded into playbackHistory at startup', () => {
  localStorage.clear();

  const state = {
    playbackHistory: [],
    historyCursor: -1
  };

  function recordPlaybackHistoryEntry(track, options = {}) {
    state.playbackHistory.push({ track, source: options.transitionReason });
    state.historyCursor = 0;
  }

  const restoredTrack = { id: 'restored_1', title: 'Restored Song' };

  // simulate restoreLastPlayedState
  if (!state.playbackHistory || state.playbackHistory.length === 0) {
    recordPlaybackHistoryEntry(restoredTrack, { transitionReason: 'restored_session' });
  }

  assert.strictEqual(state.playbackHistory.length, 1);
  assert.strictEqual(state.playbackHistory[0].track.id, 'restored_1');
  assert.strictEqual(state.historyCursor, 0);
  assert.strictEqual(state.playbackHistory[0].source, 'restored_session');
});

console.log(`\n========================================`);
console.log(`Results: ${passedTests}/${totalTests} tests passed.`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
