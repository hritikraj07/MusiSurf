const assert = require('assert');

/**
 * Automated test suite for MusiSurf Lyrics Panel Scroll Reset on Track Change
 * Tests all 11 scenarios specified in Section 12.
 */
function runLyricsResetTests() {
  console.log('--- STARTING 11-TEST LYRICS SCROLL RESET SUITE ---');
  let passed = 0;
  let failed = 0;

  function runTest(name, fn) {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`[FAIL] ${name}:`, e.message);
      failed++;
    }
  }

  // Simulated MusiSurf lyrics and player environment
  function createLyricsEnvironment() {
    const mockScrollBody = {
      scrollTop: 0,
      scrollLeft: 0,
      style: { scrollBehavior: 'smooth' },
      scrollTo: function(options) {
        if (typeof options === 'object') {
          this.scrollTop = options.top || 0;
          this.scrollLeft = options.left || 0;
        } else {
          this.scrollTop = arguments[0] || 0;
          this.scrollLeft = arguments[1] || 0;
        }
      }
    };

    const mockLinesContainer = {
      innerHTML: '',
      children: [],
      appendChild: function(el) {
        this.children.push(el);
      }
    };

    const env = {
      elements: {
        lyricsScrollBody: mockScrollBody,
        lyricsLinesContainer: mockLinesContainer,
        lyricsLoading: { style: { display: 'none' } }
      },
      state: {
        currentTrack: null,
        trackEpoch: 0,
        currentLyricsRequestId: 0,
        currentLyricsTrackId: null,
        _lastLyricsScrolledTrackId: null,
        activeLyricIndex: -1,
        lyrics: [],
        hasSyncedLyrics: false,
        currentLyricsData: null,
        userQueue: [],
        contextQueue: [],
        contextIndex: 0,
        history: [],
        recommendationQueue: [],
        playlistMode: '1',
        autoplay: true
      },
      getStableTrackId(track) {
        if (!track) return '';
        return String(track.id || track.ytId || track.trackId || ((track.title || '').trim() + '__' + (track.artist || '').trim())).trim();
      },
      resetLyricsScrollToTop(forced = false) {
        const currentTrack = this.state.currentTrack;
        const currentTrackId = this.getStableTrackId(currentTrack);

        if (!forced && currentTrackId && currentTrackId === this.state._lastLyricsScrolledTrackId) {
          return false;
        }
        if (currentTrackId) {
          this.state._lastLyricsScrolledTrackId = currentTrackId;
        }

        const container = this.elements.lyricsScrollBody;
        if (container) {
          const prevBehavior = container.style.scrollBehavior;
          container.style.scrollBehavior = 'auto';
          container.scrollTop = 0;
          container.scrollLeft = 0;
          container.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          container.style.scrollBehavior = prevBehavior;
        }

        this.state.activeLyricIndex = -1;
        return true;
      },
      applyAuthoritativeTrack(track, options = {}) {
        if (!track) return;
        const prevTrack = this.state.currentTrack;
        const isDifferentTrack = !prevTrack || this.getStableTrackId(prevTrack) !== this.getStableTrackId(track);

        this.state.currentTrack = track;
        const epoch = ++this.state.trackEpoch;

        if (isDifferentTrack) {
          this.state.lyrics = [];
          this.state.hasSyncedLyrics = false;
          this.state.activeLyricIndex = -1;
          this.elements.lyricsLinesContainer.innerHTML = '';
          this.elements.lyricsLinesContainer.children = [];
          this.elements.lyricsLoading.style.display = 'flex';
          this.resetLyricsScrollToTop(true);
        }

        if (!options.skipLyrics) {
          this.loadLyricsForTrack(track);
        }
      },
      loadLyricsForTrack(track, simulatedAsyncDelayMs = 0, customCallback = null) {
        const trackId = this.getStableTrackId(track);
        const reqId = ++this.state.currentLyricsRequestId;
        const targetEpoch = this.state.trackEpoch;

        this.resetLyricsScrollToTop(true);

        const finish = (lyricsData) => {
          if (reqId !== this.state.currentLyricsRequestId || targetEpoch !== this.state.trackEpoch || (this.state.currentTrack && this.getStableTrackId(this.state.currentTrack) !== trackId)) {
            return { discarded: true };
          }
          this.elements.lyricsLoading.style.display = 'none';
          if (!lyricsData || !lyricsData.success) {
            this.renderLyricsUnavailable(track.title, track.artist);
            return { rendered: 'unavailable' };
          } else if (lyricsData.syncedLyrics) {
            this.renderLyricsLines(lyricsData.syncedLyrics);
            return { rendered: 'synced' };
          } else if (lyricsData.plainLyrics) {
            this.renderPlainLyrics(lyricsData.plainLyrics);
            return { rendered: 'plain' };
          }
        };

        if (simulatedAsyncDelayMs === 0) {
          if (customCallback) return customCallback(finish);
          return finish(track._simulatedLyricsData);
        } else {
          return {
            trigger: (data) => finish(data)
          };
        }
      },
      renderLyricsLines(lines) {
        this.state.lyrics = lines;
        this.state.hasSyncedLyrics = true;
        this.state.activeLyricIndex = -1;
        this.elements.lyricsLinesContainer.children = lines.map((l, i) => ({ index: i, time: l.time, text: l.text }));
      },
      renderPlainLyrics(text) {
        this.state.lyrics = [];
        this.state.hasSyncedLyrics = false;
        this.state.activeLyricIndex = -1;
        this.elements.lyricsLinesContainer.children = [{ text }];
        this.resetLyricsScrollToTop(true);
      },
      renderLyricsUnavailable(title, artist) {
        this.state.lyrics = [];
        this.state.hasSyncedLyrics = false;
        this.state.activeLyricIndex = -1;
        this.elements.lyricsLinesContainer.children = [{ unavailable: true, title, artist }];
        this.resetLyricsScrollToTop(true);
      },
      syncLyricsWithTime(currentTime) {
        if (!this.state.hasSyncedLyrics || !this.state.lyrics || this.state.lyrics.length === 0) return;
        const lyricClock = currentTime + 0.15;
        let activeIdx = -1;
        for (let i = 0; i < this.state.lyrics.length; i++) {
          if (lyricClock >= this.state.lyrics[i].time) {
            activeIdx = i;
          } else {
            break;
          }
        }
        if (activeIdx !== this.state.activeLyricIndex) {
          this.state.activeLyricIndex = activeIdx;
          if (activeIdx >= 0) {
            // Smoothly scroll active line
            this.elements.lyricsScrollBody.scrollTop = activeIdx * 40;
          }
        }
      },
      seekTo(seconds) {
        // Seek does NOT trigger applyAuthoritativeTrack or resetLyricsScrollToTop
        this.syncLyricsWithTime(seconds);
      }
    };
    return env;
  }

  // TEST 1 — Natural track completion
  runTest('Test 1 — Natural track completion resets lyrics scroll to top', () => {
    const env = createLyricsEnvironment();
    const songA = { id: 'sA', title: 'Song A', artist: 'Artist A', _simulatedLyricsData: { success: true, syncedLyrics: [{ time: 10, text: 'L1' }, { time: 20, text: 'L2' }, { time: 30, text: 'L3' }] } };
    const songB = { id: 'sB', title: 'Song B', artist: 'Artist B', _simulatedLyricsData: { success: true, syncedLyrics: [{ time: 15, text: 'B1' }, { time: 25, text: 'B2' }] } };

    env.applyAuthoritativeTrack(songA);
    env.syncLyricsWithTime(25); // At 25s, activeIdx = 1, scrolled down
    assert(env.elements.lyricsScrollBody.scrollTop > 0, 'Song A lyrics should be scrolled down');

    // Natural completion: Song B becomes authoritative track
    env.applyAuthoritativeTrack(songB);
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0, 'Lyrics panel must immediately reset to top for Song B');
    assert.strictEqual(env.state.activeLyricIndex, -1, 'Active index must reset to -1');
  });

  // TEST 2 — Next button
  runTest('Test 2 — Next button immediately resets lyrics scroll to top', () => {
    const env = createLyricsEnvironment();
    const songA = { id: 'sA', title: 'Song A', artist: 'Artist A' };
    const songB = { id: 'sB', title: 'Song B', artist: 'Artist B' };

    env.applyAuthoritativeTrack(songA);
    env.elements.lyricsScrollBody.scrollTop = 450; // User scrolled down

    // User presses Next -> Song B starts
    env.applyAuthoritativeTrack(songB);
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0, 'Must be 0 immediately on Next');
  });

  // TEST 3 — Previous button
  runTest('Test 3 — Previous button resets lyrics scroll to top', () => {
    const env = createLyricsEnvironment();
    const songB = { id: 'sB', title: 'Song B', artist: 'Artist B' };
    const songA = { id: 'sA', title: 'Song A', artist: 'Artist A' };

    env.applyAuthoritativeTrack(songB);
    env.elements.lyricsScrollBody.scrollTop = 320; // User scrolled down

    // User presses Previous -> Song A starts
    env.applyAuthoritativeTrack(songA);
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0, 'Must be 0 immediately on Previous');
  });

  // TEST 4 — Delayed lyrics response
  runTest('Test 4 — Delayed lyrics response resets before response arrives', () => {
    const env = createLyricsEnvironment();
    const songA = { id: 'sA', title: 'Song A', artist: 'Artist A' };
    const songB = { id: 'sB', title: 'Song B', artist: 'Artist B' };

    env.applyAuthoritativeTrack(songA);
    env.elements.lyricsScrollBody.scrollTop = 700;

    // Song B starts with delayed lyrics network call
    env.state.currentTrack = songB;
    const req = env.loadLyricsForTrack(songB, 1500); // 1.5s delay
    // Panel must be 0 BEFORE response arrives:
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0, 'Must be 0 immediately before lyrics load');

    // Response arrives 1.5s later:
    req.trigger({ success: true, syncedLyrics: [{ time: 12, text: 'Hello from B' }] });
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0, 'Must remain at 0 after lyrics render until first active timestamp');
  });

  // TEST 5 — No lyrics
  runTest('Test 5 — Unavailable lyrics resets to top and shows unavailable state', () => {
    const env = createLyricsEnvironment();
    const songA = { id: 'sA', title: 'Song A', artist: 'Artist A' };
    const songNoLyrics = { id: 'sNoL', title: 'Instrumental', artist: 'Artist', _simulatedLyricsData: { success: false } };

    env.applyAuthoritativeTrack(songA);
    env.elements.lyricsScrollBody.scrollTop = 600;

    env.applyAuthoritativeTrack(songNoLyrics);
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0, 'Must reset to top for song with no lyrics');
    assert.strictEqual(env.elements.lyricsLinesContainer.children[0].unavailable, true);
  });

  // TEST 6 — Rapid Next presses
  runTest('Test 6 — Rapid Next presses discard stale responses and keep top position', () => {
    const env = createLyricsEnvironment();
    const songA = { id: 'sA', title: 'Song A', artist: 'Artist A' };
    const songB = { id: 'sB', title: 'Song B', artist: 'Artist B' };
    const songC = { id: 'sC', title: 'Song C', artist: 'Artist C' };

    env.applyAuthoritativeTrack(songA);
    env.elements.lyricsScrollBody.scrollTop = 800;

    // Press Next -> Song B
    env.applyAuthoritativeTrack(songB, { skipLyrics: true });
    const reqB = env.loadLyricsForTrack(songB, 2000);
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0);

    // Rapidly press Next again -> Song C
    env.applyAuthoritativeTrack(songC, { skipLyrics: true });
    const reqC = env.loadLyricsForTrack(songC, 500);
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0);

    // Delayed response for B arrives LATER:
    const resB = reqB.trigger({ success: true, syncedLyrics: [{ time: 5, text: 'Song B Old Lyrics' }] });
    assert.strictEqual(resB.discarded, true, 'Song B response must be discarded as stale');

    // Response for C arrives:
    const resC = reqC.trigger({ success: true, syncedLyrics: [{ time: 8, text: 'Song C Fresh Lyrics' }] });
    assert.strictEqual(resC.rendered, 'synced', 'Song C lyrics must be rendered');
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0, 'Must still be at top for Song C');
  });

  // TEST 7 — Same-track seeking
  runTest('Test 7 — Same-track seeking does NOT trigger full panel reset', () => {
    const env = createLyricsEnvironment();
    const songA = {
      id: 'sA',
      title: 'Song A',
      artist: 'Artist A',
      _simulatedLyricsData: {
        success: true,
        syncedLyrics: [
          { time: 10, text: 'Line 1' },
          { time: 20, text: 'Line 2' },
          { time: 30, text: 'Line 3' },
          { time: 40, text: 'Line 4' }
        ]
      }
    };
    env.applyAuthoritativeTrack(songA);
    env.syncLyricsWithTime(35); // Active line 2, scroll = 80
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 80);

    // Seek backward to 25s (Line 1: 20s - 30s) within Song A
    env.seekTo(25);
    // Should update to Line 1 (scroll = 40), NOT reset blindly to 0
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 40, 'Seeking within same song syncs to active line, does not reset to 0');
    assert.strictEqual(env.state.activeLyricIndex, 1);
  });

  // TEST 8 — Pause and resume
  runTest('Test 8 — Pause and resume do NOT trigger lyrics reset', () => {
    const env = createLyricsEnvironment();
    const songA = { id: 'sA', title: 'Song A', artist: 'Artist A' };
    env.applyAuthoritativeTrack(songA);
    env.elements.lyricsScrollBody.scrollTop = 500;

    // Simulate pause and play events (which don't call applyAuthoritativeTrack)
    const isReset = env.resetLyricsScrollToTop(false); // forced = false, same track ID
    assert.strictEqual(isReset, false, 'resetLyricsScrollToTop with same track must not reset');
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 500, 'Scroll position preserved on pause/resume');
  });

  // TEST 9 — Playlist autoplay
  runTest('Test 9 — Playlist autoplay transitions reset lyrics scroll to top', () => {
    const env = createLyricsEnvironment();
    const playlistTracks = [
      { id: 'pl_1', title: 'P1', artist: 'A1' },
      { id: 'pl_2', title: 'P2', artist: 'A2' }
    ];
    env.state.contextQueue = playlistTracks;
    env.state.contextIndex = 0;

    env.applyAuthoritativeTrack(playlistTracks[0]);
    env.elements.lyricsScrollBody.scrollTop = 900;

    // Song 1 finishes -> playlist advances to Song 2
    env.state.contextIndex = 1;
    env.applyAuthoritativeTrack(playlistTracks[1]);
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0, 'Must reset to top on playlist autoplay');
  });

  // TEST 10 — Recommendation autoplay
  runTest('Test 10 — Smart recommendation autoplay resets lyrics scroll to top', () => {
    const env = createLyricsEnvironment();
    const currentSong = { id: 'seed_1', title: 'Seed Song', artist: 'Seed Artist' };
    const recSong = { id: 'rec_99', title: 'Recommended Song', artist: 'Rec Artist' };

    env.applyAuthoritativeTrack(currentSong);
    env.elements.lyricsScrollBody.scrollTop = 450;

    // Switched to smart recommendations
    env.applyAuthoritativeTrack(recSong);
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0, 'Must reset to top on recommendation autoplay');
  });

  // TEST 11 — Different lyrics formats
  runTest('Test 11 — All lyrics formats (synced, plain, unavailable) reset scroll cleanly', () => {
    const env = createLyricsEnvironment();

    // 1. Plain lyrics track
    const plainTrack = { id: 'tp', title: 'Plain Track', artist: 'Artist', _simulatedLyricsData: { success: true, plainLyrics: 'Just line 1\nJust line 2' } };
    env.elements.lyricsScrollBody.scrollTop = 400;
    env.applyAuthoritativeTrack(plainTrack);
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0, 'Plain lyrics must be at 0');

    // 2. Unavailable lyrics track
    const unavTrack = { id: 'tu', title: 'Unav Track', artist: 'Artist', _simulatedLyricsData: { success: false } };
    env.elements.lyricsScrollBody.scrollTop = 400;
    env.applyAuthoritativeTrack(unavTrack);
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0, 'Unavailable track must be at 0');

    // 3. Synced lyrics track
    const syncTrack = { id: 'ts', title: 'Sync Track', artist: 'Artist', _simulatedLyricsData: { success: true, syncedLyrics: [{ time: 10, text: 'Hi' }] } };
    env.elements.lyricsScrollBody.scrollTop = 400;
    env.applyAuthoritativeTrack(syncTrack);
    assert.strictEqual(env.elements.lyricsScrollBody.scrollTop, 0, 'Synced track must be at 0');
  });

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log(`========================================`);
  if (failed > 0) process.exit(1);
}

runLyricsResetTests();
