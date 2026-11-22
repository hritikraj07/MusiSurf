const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'app.js');
let content = fs.readFileSync(filePath, 'utf8');
const isCRLF = content.includes('\r\n');

function applyReplace(name, searchPattern, replacement) {
  const normContent = content.replace(/\r\n/g, '\n');
  const normSearch = searchPattern.replace(/\r\n/g, '\n');
  
  if (!normContent.includes(normSearch)) {
    console.error('FAILED to find: ' + name);
    process.exit(1);
  }
  
  const replaced = normContent.replace(normSearch, replacement.replace(/\r\n/g, '\n'));
  content = isCRLF ? replaced.replace(/\n/g, '\r\n') : replaced;
  console.log('SUCCESS: ' + name);
}

// Check if Step 1, 2, 3 were already applied
if (!content.includes('PREV_RESTART_THRESHOLD_SECONDS')) {
  // 1. Constants & state
  applyReplace('Step 1: State and Constants', 
`  const state = {
    currentUser: null,
    currentTrack: null,
    isPlaying: false,
    queue: [],
    queueIndex: -1,
    history: [],
    isShuffled: false,
    shuffledQueue: [],
    repeatMode: 'off', // 'off', 'all', 'one'`,
`  const PREV_RESTART_THRESHOLD_SECONDS = 3.0;
  const MAX_PLAYBACK_HISTORY = 50;

  const state = {
    currentUser: null,
    currentTrack: null,
    isPlaying: false,
    queue: [],
    queueIndex: -1,
    history: [],
    playbackHistory: [],
    historyCursor: -1,
    isShuffled: false,
    shuffledQueue: [],
    repeatMode: localStorage.getItem('musisurf_repeat_mode') || 'off', // 'off', 'all', 'one'`
  );
}

if (!content.includes('restored_session')) {
  // 2. restoreLastPlayedState
  applyReplace('Step 2: restoreLastPlayedState',
`      const resumeTime = parseFloat(saved.currentTime) || 0;
      state.restoredResumeTime = resumeTime;
      if (resumeTime > 0) {
        setTimeout(() => {
          state.restoredResumeTime = 0;
        }, 3000);
      }
      elements.currentTimeLabel.textContent = formatTime(resumeTime);`,
`      const resumeTime = parseFloat(saved.currentTime) || 0;
      state.restoredResumeTime = resumeTime;
      if (resumeTime > 0) {
        setTimeout(() => {
          state.restoredResumeTime = 0;
        }, 3000);
      }
      if (!state.playbackHistory || state.playbackHistory.length === 0) {
        recordPlaybackHistoryEntry(track, { transitionReason: 'restored_session' });
      }
      elements.currentTimeLabel.textContent = formatTime(resumeTime);`
  );
}

if (!content.includes('loadPlaybackHistory')) {
  // 3. Playback History persistence functions
  applyReplace('Step 3: History persistence functions',
`  // ==========================================================================
  // EDGE-ONLY DEAD SILENCE REMOVAL ENGINE (-45 dBFS, Leading & Trailing Only)
  // ==========================================================================`,
`  // Authoritative Playback History Stack & Persistent Cursor Navigation
  function loadPlaybackHistory() {
    try {
      const raw = localStorage.getItem('musisurf_playback_history');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.history)) {
          state.playbackHistory = parsed.history.slice(-MAX_PLAYBACK_HISTORY);
          state.historyCursor = typeof parsed.cursor === 'number' 
            ? Math.min(parsed.cursor, state.playbackHistory.length - 1) 
            : state.playbackHistory.length - 1;
          state.history = state.playbackHistory.map(h => h.track).filter(Boolean);
          return;
        }
      }
    } catch (e) {
      console.warn('Playback history load notice:', e);
    }
    state.playbackHistory = [];
    state.historyCursor = -1;
  }

  function savePlaybackHistory() {
    try {
      const payload = {
        history: (state.playbackHistory || []).slice(-MAX_PLAYBACK_HISTORY),
        cursor: state.historyCursor
      };
      localStorage.setItem('musisurf_playback_history', JSON.stringify(payload));
    } catch (e) {}
  }

  function recordPlaybackHistoryEntry(track, options = {}) {
    if (!track) return;
    // Repeat One restarts must never push duplicate history entries
    if (options.transitionReason === 'repeat-one') return;

    if (!state.playbackHistory) state.playbackHistory = [];

    const cid = getCanonicalTrackId(track);
    const instanceId = 'pb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    const entry = {
      track,
      canonicalId: cid,
      title: track.title,
      artist: track.artist,
      context: state.playbackContext ? { ...state.playbackContext } : null,
      timestamp: Date.now(),
      instanceId
    };

    if (options.isHistoryNav) {
      // Navigating backwards/forwards through existing history; cursor is already updated
      savePlaybackHistory();
      return;
    }

    // If cursor was behind newest entry (e.g. user clicked Previous, then manually selected a new track),
    // truncate the abandoned forward history branch!
    if (state.historyCursor >= 0 && state.historyCursor < state.playbackHistory.length - 1) {
      state.playbackHistory = state.playbackHistory.slice(0, state.historyCursor + 1);
    }

    // Deduplication check: do not push consecutive duplicate if identical track
    const currentEntry = state.playbackHistory[state.historyCursor];
    if (currentEntry && areTracksIdentical(currentEntry.track, track)) {
      currentEntry.timestamp = Date.now();
      currentEntry.instanceId = instanceId;
      savePlaybackHistory();
      return;
    }

    state.playbackHistory.push(entry);
    if (state.playbackHistory.length > MAX_PLAYBACK_HISTORY) {
      state.playbackHistory.shift();
    }
    state.historyCursor = state.playbackHistory.length - 1;
    state.history = state.playbackHistory.map(h => h.track);
    savePlaybackHistory();
  }

  loadPlaybackHistory();

  // ==========================================================================
  // EDGE-ONLY DEAD SILENCE REMOVAL ENGINE (-45 dBFS, Leading & Trailing Only)
  // ==========================================================================`
  );
}

// 4. Repeat UI update, toggleRepeatMode, and cycle protection
applyReplace('Step 4: Repeat UI update and toggle definition in outer scope',
`  function updateRepeatUI() {
    const mode = state.repeatMode || 'off';
    const isAll = mode === 'all';
    const isOne = mode === 'one';
    const isActive = isAll || isOne;

    [elements.repeatBtn, elements.mobRepeatBtn].forEach(btn => {
      if (!btn) return;
      btn.classList.toggle('active', isActive);
      btn.classList.toggle('repeat-one', isOne);
      if (isOne) {
        btn.title = 'Repeat: Current Track (R)';
      } else if (isAll) {
        btn.title = 'Repeat: All (R)';
      } else {
        btn.title = 'Repeat: Off (R)';
      }
    });
  }

  function updatePlaylistModeUI() {`,
`  function updateRepeatUI() {
    const mode = state.repeatMode || 'off';
    const isAll = mode === 'all';
    const isOne = mode === 'one';
    const isActive = isAll || isOne;

    [elements.repeatBtn, elements.mobRepeatBtn].forEach(btn => {
      if (!btn) return;
      btn.classList.toggle('active', isActive);
      btn.classList.toggle('repeat-one', isOne);
      if (isOne) {
        btn.title = 'Repeat: Current Track (R)';
        btn.setAttribute('aria-label', 'Repeat: Current Track');
      } else if (isAll) {
        btn.title = 'Repeat: All (R)';
        btn.setAttribute('aria-label', 'Repeat: All');
      } else {
        btn.title = 'Repeat: Off (R)';
        btn.setAttribute('aria-label', 'Repeat: Off');
      }
    });
  }

  function toggleRepeatMode(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (state.repeatMode === 'off') {
      state.repeatMode = 'all';
      showToast('Repeat: All 🔁', '🔁');
    } else if (state.repeatMode === 'all') {
      state.repeatMode = 'one';
      showToast('Repeat: Current Track 🔂', '🔂');
    } else {
      state.repeatMode = 'off';
      showToast('Repeat: Off ➡️', '➡️');
    }
    try {
      localStorage.setItem('musisurf_repeat_mode', state.repeatMode);
    } catch (err) {}
    updateRepeatUI();
  }

  function updatePlaylistModeUI() {`
);

// 4b: Guard cyclePlaylistMode so it doesn't overwrite Repeat One
applyReplace('Step 4b: cyclePlaylistMode repeat guard',
`    if (state.playlistMode === '1') {
      state.repeatMode = 'off';
      updateRepeatUI();
      showToast('Shuffle: Off (In Order) 📋', '📋');
    } else if (state.playlistMode === '2') {
      showToast('Shuffle: On (Random) 🔀', '🔀');
    } else if (state.playlistMode === '3') {
      state.repeatMode = 'all';
      updateRepeatUI();
      showToast('Shuffle: Loop & Repeat 🔁', '🔁');
    }`,
`    if (state.playlistMode === '1') {
      if (state.repeatMode !== 'one') {
        state.repeatMode = 'off';
        try { localStorage.setItem('musisurf_repeat_mode', 'off'); } catch (e) {}
        updateRepeatUI();
      }
      showToast('Shuffle: Off (In Order) 📋', '📋');
    } else if (state.playlistMode === '2') {
      showToast('Shuffle: On (Random) 🔀', '🔀');
    } else if (state.playlistMode === '3') {
      if (state.repeatMode !== 'one') {
        state.repeatMode = 'all';
        try { localStorage.setItem('musisurf_repeat_mode', 'all'); } catch (e) {}
        updateRepeatUI();
      }
      showToast('Shuffle: Loop & Repeat 🔁', '🔁');
    }`
);

// 5. Authoritative restartCurrentTrack before transitionToNextSong
applyReplace('Step 5: restartCurrentTrack definition',
`  // Instant Next-Track Switcher (<10ms deck swap when preloaded)
  function transitionToNextSong(targetTrack = null, queueContext = null) {`,
`  // Authoritative Track Restart Engine (Single Source of Truth for Repeat One & Previous <= 3s)
  function restartCurrentTrack(reason = 'repeat-one') {
    const track = state.currentTrack;
    if (!track) return;

    logPlaybackDiag('RESTART_TRACK', \`Restarting track "\${track.title}" [Reason: \${reason}]\`);

    // 1. Immediately abort active crossfade/AutoMix and preloads
    cancelActiveAutoMix(true);
    cancelActiveCrossfade();
    state.isTransitioning = false;
    state.isTransitionPreloaded = false;
    state.preloadedNextTrack = null;

    // 2. Reset silence bounds and listening timers for fresh playback cycle
    track._introTrimmed = false;
    state._currentTrackPlayedRecorded = false;
    state._currentTrackListeningSeconds = 0;
    state._lastTrackedPlaybackTime = 0;
    state._tailSilenceStartTime = null;
    lastKnownPlaybackTime = 0;
    state.restoredResumeTime = 0;

    const key = getTrackSilenceCacheKey(track);
    const edgeInfo = trackEdgeSilenceCache.get(key);
    const effectiveStart = (edgeInfo && typeof edgeInfo.effectiveStart === 'number') 
      ? edgeInfo.effectiveStart 
      : (track._effectiveStart || track._silenceStartOffset || 0);

    // 3. Reset progress bar UI across all surfaces
    if (elements.currentTimeLabel) elements.currentTimeLabel.textContent = '0:00';
    if (elements.progressFill) elements.progressFill.style.width = '0%';
    if (elements.progressBar) elements.progressBar.value = 0;
    if (elements.mobCurrentTime) elements.mobCurrentTime.textContent = '0:00';
    if (elements.mobProgressFill) elements.mobProgressFill.style.width = '0%';
    if (elements.mobProgressBar) elements.mobProgressBar.value = 0;
    if (elements.miniPlayerFill) elements.miniPlayerFill.style.width = '0%';
    if (elements.miniplayerScrubberFill) elements.miniplayerScrubberFill.style.width = '0%';
    if (elements.progressBuffer) elements.progressBuffer.style.width = '0%';

    // 4. Reset lyrics scroll and highlights to line 0
    state.activeLyricIndex = 0;
    if (typeof resetLyricsScrollToTop === 'function') {
      resetLyricsScrollToTop(true);
    }
    const allLyricEls = document.querySelectorAll('.lyric-line');
    allLyricEls.forEach((el, idx) => {
      el.classList.remove('active', 'past');
      if (idx === 0) el.classList.add('active');
    });

    // 5. Restart playback on active audio deck or YouTube
    const masterVol = state.isMuted ? 0 : (state.volume || 0.8);

    if (isYouTubeActive() || state.activePlayerEngine === 'youtube') {
      if (state.ytPlayer && typeof state.ytPlayer.seekTo === 'function') {
        try {
          state.ytPlayer.seekTo(effectiveStart > 0 ? effectiveStart : 0, true);
          state.ytPlayer.playVideo();
          state.isPlaying = true;
          updatePlayPauseButton();
        } catch (e) {
          console.warn('YouTube repeat restart warning:', e);
        }
      }
    } else {
      const act = getActiveDeck();
      if (act) {
        try {
          act.currentTime = effectiveStart > 0 ? effectiveStart : 0;
        } catch (e) {}
        act.volume = masterVol;
        const playPromise = act.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            state.isPlaying = true;
            state.isTrackLoading = false;
            act.volume = masterVol;
            updatePlayPauseButton();
          }).catch(err => {
            console.warn('Deck repeat play error, recovering via playTrack reload:', err);
            playTrack(track, state.contextQueue, false, 0, true, { transitionReason: 'repeat-one' });
          });
        }
      }
    }

    state.isPlaying = true;
    updatePlayPauseButton();

    // 6. Update MediaSession position if supported
    if ('mediaSession' in navigator && typeof navigator.mediaSession.setPositionState === 'function') {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(1, getTotalDuration() || track.duration || 1),
          playbackRate: 1.0,
          position: 0
        });
      } catch (e) {}
    }

    if (reason === 'repeat-one') {
      showToast(\`Repeating: "\${track.title}" 🔂\`, '🔂');
    } else if (reason.startsWith('previous')) {
      showToast(\`Restarted: "\${track.title}" 0:00\`, '⏮');
    }
  }

  // Instant Next-Track Switcher (<10ms deck swap when preloaded)
  function transitionToNextSong(targetTrack = null, queueContext = null, options = {}) {`
);

// 6. transitionToNextSong repeat one priority
applyReplace('Step 6: transitionToNextSong repeat one priority',
`    cancelActiveAutoMix(false);

    let nextSong = targetTrack;
    let switchedToRecommendations = false;
    let fromUserQueue = false;
    let fromRecommendations = false;
    let loopedPlaylist = false;

    if (!nextSong) {
      // 1. Manual user queue (Priority 1)
      if (state.userQueue && state.userQueue.length > 0) {
        nextSong = state.userQueue.shift();
        fromUserQueue = true;
      }
      // 2. Repeat One
      else if (state.repeatMode === 'one' && state.currentTrack) {
        nextSong = state.currentTrack;
      }`,
`    cancelActiveAutoMix(false);

    // 0. Repeat One takes absolute precedence for automatic track completion
    if (!options.isManualSkip && !targetTrack && state.repeatMode === 'one' && state.currentTrack) {
      state.isTransitioning = false;
      restartCurrentTrack('repeat-one');
      return;
    }

    let nextSong = targetTrack;
    let switchedToRecommendations = false;
    let fromUserQueue = false;
    let fromRecommendations = false;
    let loopedPlaylist = false;

    if (!nextSong) {
      // 1. Repeat One (Explicit fallback)
      if (!options.isManualSkip && state.repeatMode === 'one' && state.currentTrack) {
        state.isTransitioning = false;
        restartCurrentTrack('repeat-one');
        return;
      }
      // 2. Manual user queue (Priority 1)
      else if (state.userQueue && state.userQueue.length > 0) {
        nextSong = state.userQueue.shift();
        fromUserQueue = true;
      }`
);

// 7. checkPlaybackCrossfadeAndTransitions repeat one priority
applyReplace('Step 7: checkPlaybackCrossfadeAndTransitions repeat one guard',
`    const effectiveTimeLeft = effectiveEnd - cur;
    const autoMixSec = typeof state.settings.autoMixDuration === 'number' 
      ? state.settings.autoMixDuration 
      : (state.settings.crossfade || 0);`,
`    const effectiveTimeLeft = effectiveEnd - cur;

    // REPEAT ONE ABSOLUTE PRIORITY:
    // If Repeat One is active, NEVER initiate AutoMix or preload/transition into upcoming songs!
    // When track reaches effective end, restart current track cleanly from 0:00!
    if (state.repeatMode === 'one') {
      if (effectiveTimeLeft <= 0.05 && !state.isTransitioning) {
        restartCurrentTrack('repeat-one');
      }
      return;
    }

    const autoMixSec = typeof state.settings.autoMixDuration === 'number' 
      ? state.settings.autoMixDuration 
      : (state.settings.crossfade || 0);`
);

// 8. playTrack signature, same-track guard and history recording
applyReplace('Step 8a: playTrack signature and guard',
`  let activePlayToken = 0;
  async function playTrack(track, queueList = null, addToHistory = true, customStartTime = 0, forceReload = false) {
    if (!track) return;

    // Synchronously resume AudioContext within user gesture loop to prevent sound hanging
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (e) {}

    // Strict Content Filter check
    if (!isContentFilterAllowed(track)) {
      showToast('⚠️ Content Blocked: MusiSurf strictly plays pure Music only.', '🚫');
      state.isPlaying = false;
      updatePlayPauseButton();
      return;
    }

    // Save previous track progress if belonging to a playlist BEFORE assigning new track
    if (state.playbackContext && state.playbackContext.type === 'playlist') {
      saveCurrentPlaylistProgress({ immediate: true });
    }
    const previousTrack = state.currentTrack;

    // Guard: If clicking the CURRENTLY PLAYING song without explicit custom seek
    const actForGuard = getActiveDeck();
    const currentDeckSrc = actForGuard ? (actForGuard.currentSrc || actForGuard.src || '') : '';
    const hasValidDeckSource = Boolean(currentDeckSrc && currentDeckSrc !== '' && !currentDeckSrc.startsWith('data:audio') && !currentDeckSrc.endsWith('/') && !actForGuard.error);

    if (!forceReload && previousTrack && isSameTrack(track, previousTrack) && customStartTime === 0 && hasValidDeckSource && actForGuard && actForGuard.readyState >= 1) {`,
`  let activePlayToken = 0;
  async function playTrack(track, queueList = null, addToHistory = true, customStartTime = 0, forceReload = false, options = {}) {
    if (!track) return;

    // Synchronously resume AudioContext within user gesture loop to prevent sound hanging
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (e) {}

    // Strict Content Filter check
    if (!isContentFilterAllowed(track)) {
      showToast('⚠️ Content Blocked: MusiSurf strictly plays pure Music only.', '🚫');
      state.isPlaying = false;
      updatePlayPauseButton();
      return;
    }

    // Save previous track progress if belonging to a playlist BEFORE assigning new track
    if (state.playbackContext && state.playbackContext.type === 'playlist') {
      saveCurrentPlaylistProgress({ immediate: true });
    }
    const previousTrack = state.currentTrack;

    // Guard: If clicking the CURRENTLY PLAYING song without explicit custom seek
    const actForGuard = getActiveDeck();
    const currentDeckSrc = actForGuard ? (actForGuard.currentSrc || actForGuard.src || '') : '';
    const hasValidDeckSource = Boolean(currentDeckSrc && currentDeckSrc !== '' && !currentDeckSrc.startsWith('data:audio') && !currentDeckSrc.endsWith('/') && !actForGuard.error);

    if (!forceReload && options?.transitionReason !== 'repeat-one' && previousTrack && isSameTrack(track, previousTrack) && customStartTime === 0 && hasValidDeckSource && actForGuard && actForGuard.readyState >= 1) {`
);

applyReplace('Step 8b: playTrack history recording',
`    // Track playback history for previous song button navigation
    if (addToHistory && previousTrack && previousTrack.id !== track.id) {
      if (!state.history) state.history = [];
      state.history.push(previousTrack);
      if (state.history.length > 50) state.history.shift();
    }`,
`    // Track playback history for previous song button navigation
    if (options?.isHistoryNav || addToHistory !== false) {
      recordPlaybackHistoryEntry(track, options);
    }`
);

// 9. nextTrack
applyReplace('Step 9: nextTrack forward retracing',
`  function nextTrack() {
    if (state.currentTrack && state.isPlaying && (state._currentTrackListeningSeconds < 20 || getCurrentPlaybackTime() < 20)) {
      recordTrackSkipped(state.currentTrack);
    }
    transitionToNextSong();
  }`,
`  function nextTrack() {
    if (state.currentTrack && state.isPlaying && (state._currentTrackListeningSeconds < 20 || getCurrentPlaybackTime() < 20)) {
      recordTrackSkipped(state.currentTrack);
    }
    cancelActiveCrossfade();

    // 1. Retrace forward through history if user previously navigated backwards
    if (state.playbackHistory && state.playbackHistory.length > 0 && state.historyCursor >= 0 && state.historyCursor < state.playbackHistory.length - 1) {
      let targetIndex = state.historyCursor + 1;
      while (targetIndex < state.playbackHistory.length && state.currentTrack && areTracksIdentical(state.playbackHistory[targetIndex].track, state.currentTrack)) {
        targetIndex++;
      }
      if (targetIndex < state.playbackHistory.length) {
        state.historyCursor = targetIndex;
        const forwardEntry = state.playbackHistory[state.historyCursor];
        if (forwardEntry && forwardEntry.track) {
          showToast(\`Playing: \"\${forwardEntry.track.title}\"\`, '⏭');
          playTrack(forwardEntry.track, forwardEntry.context?.type === 'playlist' ? state.contextQueue : null, false, 0, true, {
            isHistoryNav: true,
            transitionReason: 'history-next'
          });
          return;
        }
      }
    }

    // 2. Advance to next track in queue/playlist/recommendation progression (manual skip bypasses Repeat One)
    transitionToNextSong(null, null, { isManualSkip: true });
  }`
);

// 10. prevTrack
applyReplace('Step 10: prevTrack history stack and 3s threshold',
`  function prevTrack() {
    cancelActiveCrossfade();

    // 1. If song has played for more than 3 seconds, previous button restarts current song
    const curTime = getCurrentPlaybackTime();
    if (curTime > 3) {
      seekTo(0);
      return;
    }

    // 2. Playback history stack navigation
    if (state.history && state.history.length > 0) {
      let prevSong = null;
      while (state.history.length > 0) {
        const candidate = state.history.pop();
        if (candidate && (!state.currentTrack || candidate.id !== state.currentTrack.id)) {
          prevSong = candidate;
          break;
        }
      }
      if (prevSong) {
        playTrack(prevSong, null, false);
        showToast(\`Playing previous: \"\${prevSong.title}\"\`, '⏮');
        return;
      }
    }

    // 3. Navigate backwards in context queue
    if (state.contextQueue && state.contextQueue.length > 0 && state.contextIndex > 0) {
      state.contextIndex--;
      const prevSong = state.contextQueue[state.contextIndex];
      playTrack(prevSong, state.contextQueue, false);
      showToast(\`Playing previous: \"\${prevSong.title}\"\`, '⏮');
      return;
    }

    // 4. Fallback: restart track if no other song exists
    seekTo(0);
  }`,
`  function prevTrack() {
    cancelActiveCrossfade();

    // 1. If song has played for more than 3.0 seconds, previous button restarts current song from 0:00
    const curTime = getCurrentPlaybackTime();
    if (curTime > PREV_RESTART_THRESHOLD_SECONDS) {
      restartCurrentTrack('previous-restart-3s');
      return;
    }

    // 2. Playback history stack navigation with forward-retracing capability
    if (state.playbackHistory && state.playbackHistory.length > 0 && state.historyCursor > 0) {
      let targetIndex = state.historyCursor - 1;
      // Skip identical tracks backwards if any
      while (targetIndex >= 0 && state.currentTrack && areTracksIdentical(state.playbackHistory[targetIndex].track, state.currentTrack)) {
        targetIndex--;
      }
      if (targetIndex >= 0) {
        state.historyCursor = targetIndex;
        const targetEntry = state.playbackHistory[state.historyCursor];
        if (targetEntry && targetEntry.track) {
          showToast(\`Playing previous: \"\${targetEntry.track.title}\"\`, '⏮');
          playTrack(targetEntry.track, targetEntry.context?.type === 'playlist' ? state.contextQueue : null, false, 0, true, {
            isHistoryNav: true,
            transitionReason: 'history-previous'
          });
          return;
        }
      }
    }

    // 3. Fallback: If cursor is at start (or no earlier history entry), restart current track from beginning
    restartCurrentTrack('previous-at-start');
  }`
);

// 11. onTrackEnded
applyReplace('Step 11: onTrackEnded repeat one call',
`    if (state.repeatMode === 'one' && completedTrack) {
      if (completedTrack._introTrimmed) completedTrack._introTrimmed = false;
      seekTo(0);
      applyCrossfadeIn();
      const deck = getActiveDeck();
      if (deck) {
        deck.play().catch(e => console.warn('Repeat play error:', e));
      }
      return;
    }`,
`    if (state.repeatMode === 'one' && completedTrack) {
      restartCurrentTrack('repeat-one');
      return;
    }`
);

// 12. Cleanup inner duplicate toggleRepeatMode / updateRepeatUI in setup listeners
applyReplace('Step 12: Wire listeners in setup without shadowing',
`    // Repeat Mode: 3-way toggle ('off' -> 'all' -> 'one' -> 'off')
    function updateRepeatUI() {
      const mode = state.repeatMode || 'off';
      const isAll = mode === 'all';
      const isOne = mode === 'one';
      const isActive = isAll || isOne;

      [elements.repeatBtn, elements.mobRepeatBtn].forEach(btn => {
        if (!btn) return;
        btn.classList.toggle('active', isActive);
        btn.classList.toggle('repeat-one', isOne);
        if (isOne) {
          btn.title = 'Repeat: Current Track (R)';
        } else if (isAll) {
          btn.title = 'Repeat: All (R)';
        } else {
          btn.title = 'Repeat: Off (R)';
        }
      });
    }

    function toggleRepeatMode(e) {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      if (state.repeatMode === 'off') {
        state.repeatMode = 'all';
        showToast('Repeat: All', '🔁');
        // Synchronize with playlist mode (Mode 3: Shuffle & Repeat Playlist)
        state.playlistMode = '3';
        localStorage.setItem('musisurf_playlist_playback_mode', '3');
        updatePlaylistModeUI();
      } else if (state.repeatMode === 'all') {
        state.repeatMode = 'one';
        showToast('Repeat: Current Track', '🔂');
      } else {
        state.repeatMode = 'off';
        showToast('Repeat: Off', '➡️');
        // Synchronize with playlist mode (Mode 1: In Order + Autoplay)
        state.playlistMode = '1';
        localStorage.setItem('musisurf_playlist_playback_mode', '1');
        updatePlaylistModeUI();
      }
      updateRepeatUI();
    }

    elements.repeatBtn.addEventListener('click', toggleRepeatMode);
    if (elements.mobRepeatBtn) elements.mobRepeatBtn.addEventListener('click', toggleRepeatMode);`,
`    // Repeat Mode: 3-way toggle ('off' -> 'all' -> 'one' -> 'off')
    elements.repeatBtn.addEventListener('click', toggleRepeatMode);
    if (elements.mobRepeatBtn) elements.mobRepeatBtn.addEventListener('click', toggleRepeatMode);
    updateRepeatUI();`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('ALL EDITS APPLIED CLEANLY TO public/app.js!');
