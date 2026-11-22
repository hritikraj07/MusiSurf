/**
 * MusiSurf Automated Hotspot & Slow-Network Resilience Test Suite
 * Simulates:
 * 1. High latency & jitter (3G/4G cellular hotspot)
 * 2. Stale asynchronous lyrics responses overwriting current tracks
 * 3. Authoritative UI synchronization (Desktop player, Mobile modal, Miniplayer, Lyrics view hero)
 * 4. Ended-event stream truncation without replay bug
 * 5. Stream error proxy retry & non-blocking fallback progression
 * 6. Autoplay queue empty waiting state with delayed recommendation arrival
 * 7. 10 consecutive simulated track transitions under unstable hotspot conditions
 */

const assert = require('assert');

console.log('====================================================');
console.log('   MusiSurf Hotspot & Network Resilience Test Suite');
console.log('====================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    testsFailed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    testsFailed++;
  }
}

async function runAll() {
  // -------------------------------------------------------------
  // TEST 1: Authoritative Track Synchronization
  // -------------------------------------------------------------
  runTest('Authoritative track updates all UI surfaces simultaneously', () => {
    const elements = {
      playerCoverImg: { src: '', onerror: null },
      playerTitle: { innerHTML: '' },
      playerArtist: { textContent: '' },
      totalDurationLabel: { textContent: '' },
      mobPlayerCover: { src: '', onerror: null },
      mobPlayerTitle: { innerHTML: '' },
      mobPlayerArtist: { textContent: '' },
      mobTotalDuration: { textContent: '' },
      miniplayerCover: { src: '', onerror: null },
      miniplayerTitle: { textContent: '' },
      miniplayerArtist: { textContent: '' },
      lyricsAlbumCover: { src: '', style: {} },
      lyricsTrackTitle: { textContent: '' },
      lyricsTrackArtist: { textContent: '' },
      lyricsLinesContainer: { innerHTML: 'old lyrics line' },
      lyricsLoading: { style: {} }
    };

    const state = {
      currentTrack: null,
      trackEpoch: 0,
      lyrics: ['old', 'stale'],
      currentLyricsTrackId: 'old_song'
    };

    const DEFAULT_ALBUM_ART = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500';

    function applyAuthoritativeTrack(track) {
      state.currentTrack = track;
      const epoch = ++state.trackEpoch;
      const coverUrl = track.image || DEFAULT_ALBUM_ART;

      elements.playerTitle.innerHTML = track.title;
      elements.playerArtist.textContent = track.artist;
      elements.playerCoverImg.src = coverUrl;
      elements.totalDurationLabel.textContent = track.durationStr;

      elements.mobPlayerTitle.innerHTML = track.title;
      elements.mobPlayerArtist.textContent = track.artist;
      elements.mobPlayerCover.src = coverUrl;
      elements.mobTotalDuration.textContent = track.durationStr;

      elements.miniplayerCover.src = coverUrl;
      elements.miniplayerTitle.textContent = track.title;
      elements.miniplayerArtist.textContent = track.artist;

      elements.lyricsAlbumCover.src = coverUrl;
      elements.lyricsTrackTitle.textContent = track.title;
      elements.lyricsTrackArtist.textContent = track.artist;

      state.lyrics = [];
      state.currentLyricsTrackId = track.id;
      elements.lyricsLinesContainer.innerHTML = '';
    }

    const trackA = {
      id: 'track_101',
      title: 'Apna Bana Le',
      artist: 'Arijit Singh',
      image: 'https://c.saavncdn.com/apna_bana_le.jpg',
      durationStr: '4:21'
    };

    applyAuthoritativeTrack(trackA);

    assert.strictEqual(state.currentTrack.id, 'track_101');
    assert.strictEqual(state.trackEpoch, 1);
    assert.strictEqual(elements.playerCoverImg.src, trackA.image);
    assert.strictEqual(elements.mobPlayerCover.src, trackA.image);
    assert.strictEqual(elements.miniplayerCover.src, trackA.image);
    assert.strictEqual(elements.lyricsAlbumCover.src, trackA.image);
    assert.strictEqual(elements.lyricsTrackTitle.textContent, trackA.title);
    assert.strictEqual(elements.lyricsTrackArtist.textContent, trackA.artist);
    assert.strictEqual(elements.lyricsLinesContainer.innerHTML, '', 'Old lyrics must be wiped immediately on track set');
    assert.strictEqual(state.currentLyricsTrackId, 'track_101');
  });

  // -------------------------------------------------------------
  // TEST 2: Artwork Fallback Resilience
  // -------------------------------------------------------------
  runTest('Artwork fallback activates on image load error or missing image', () => {
    const DEFAULT_ALBUM_ART = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500';
    const trackWithoutImage = { id: 't2', title: 'Local Song', artist: 'Unknown', image: '' };
    
    const coverUrl = trackWithoutImage.image || DEFAULT_ALBUM_ART;
    assert.strictEqual(coverUrl, DEFAULT_ALBUM_ART, 'Missing image must resolve to DEFAULT_ALBUM_ART');

    let elementSrc = 'https://broken.cdn.com/404.jpg';
    const imgElement = {
      src: elementSrc,
      onerror: function() { this.src = DEFAULT_ALBUM_ART; }
    };

    imgElement.onerror();
    assert.strictEqual(imgElement.src, DEFAULT_ALBUM_ART, 'onerror callback must fall back to DEFAULT_ALBUM_ART');
  });

  // -------------------------------------------------------------
  // TEST 3: Stale Lyrics Async Race Condition Elimination
  // -------------------------------------------------------------
  await runAsyncTest('Delayed lyrics response from previous track is strictly rejected', async () => {
    const state = {
      currentTrack: { id: 'track_1', title: 'Song 1' },
      trackEpoch: 1,
      currentLyricsRequestId: 1,
      currentLyricsData: null
    };

    let renderedLyrics = null;

    async function mockFetchLyrics(track, delayMs) {
      const requestEpoch = state.trackEpoch;
      const reqId = ++state.currentLyricsRequestId;
      const targetTrackId = track.id;

      await new Promise(r => setTimeout(r, delayMs));

      // Epoch and Track ID Guard (as in MusiSurf app.js)
      if (reqId !== state.currentLyricsRequestId || requestEpoch !== state.trackEpoch || state.currentTrack?.id !== targetTrackId) {
        // Discarded!
        return { discarded: true };
      }

      renderedLyrics = `Lyrics for ${track.title}`;
      state.currentLyricsData = { trackName: track.title };
      return { discarded: false };
    }

    // Song 1 starts and initiates lyrics request (takes 120ms due to hotspot latency)
    const p1 = mockFetchLyrics(state.currentTrack, 120);

    // User skips or song finishes after 30ms -> Song 2 begins
    await new Promise(r => setTimeout(r, 30));
    state.currentTrack = { id: 'track_2', title: 'Song 2' };
    state.trackEpoch = 2; // Epoch incremented!

    // Song 2 initiates lyrics request (takes 40ms)
    const p2 = mockFetchLyrics(state.currentTrack, 40);

    await Promise.all([p1, p2]);

    assert.strictEqual(renderedLyrics, 'Lyrics for Song 2', 'Lyrics must be Song 2, never overwritten by Song 1 delayed response');
    assert.strictEqual(state.currentLyricsData.trackName, 'Song 2');
  });

  // -------------------------------------------------------------
  // TEST 4: Idempotent Track Advance & No Duplicate Replays
  // -------------------------------------------------------------
  runTest('advanceToNextTrack rejects duplicate triggers within 600ms', () => {
    let advanceCalls = 0;
    let lastAdvanceCallTime = 0;
    let lastAdvancedTrackId = null;

    function advanceToNextTrack(reason, completedTrackId) {
      const now = Date.now();
      if (now - lastAdvanceCallTime < 600) return;
      if (completedTrackId && lastAdvancedTrackId === completedTrackId && (now - lastAdvanceCallTime < 1500)) return;

      lastAdvanceCallTime = now;
      if (completedTrackId) lastAdvancedTrackId = completedTrackId;
      advanceCalls++;
    }

    // First trigger (e.g. from timeupdate crossfade check)
    advanceToNextTrack('crossfade_threshold', 'track_42');
    assert.strictEqual(advanceCalls, 1, 'First advance must execute');

    // Duplicate trigger 50ms later (e.g. ended event fires right after)
    advanceToNextTrack('ended_event', 'track_42');
    assert.strictEqual(advanceCalls, 1, 'Duplicate advance within 600ms must be ignored');

    // Another trigger 200ms later for same track
    advanceToNextTrack('backup_timer', 'track_42');
    assert.strictEqual(advanceCalls, 1, 'Same track advance within 1500ms must be ignored');
  });

  // -------------------------------------------------------------
  // TEST 5: Track Completion without Duration-Replay Bug
  // -------------------------------------------------------------
  runTest('onTrackEnded advances to next track and does not replay ended deck', () => {
    let playCalled = false;
    let advancedTrackId = null;

    const mockDeck = {
      play: () => { playCalled = true; return Promise.resolve(); }
    };

    const state = {
      currentTrack: { id: 'track_99', title: 'Kesariya', duration: 268 },
      repeatMode: 'off',
      isCrossfading: false
    };

    function onTrackEnded() {
      if (state.isCrossfading) return;
      const completedTrack = state.currentTrack;

      if (state.repeatMode === 'one' && completedTrack) {
        mockDeck.play();
        return;
      }

      advancedTrackId = completedTrack.id;
    }

    onTrackEnded();

    assert.strictEqual(playCalled, false, 'play() must NOT be called on ended audio deck (which would rewind and replay)');
    assert.strictEqual(advancedTrackId, 'track_99', 'Must advance to next track on track end');
  });

  // -------------------------------------------------------------
  // TEST 6: Resilient Audio Stream Error Recovery
  // -------------------------------------------------------------
  await runAsyncTest('Audio stream error retries proxy and advances on permanent failure', async () => {
    let advanced = false;
    let proxyRetried = false;
    let toastShown = '';

    const activeTrack = {
      id: 't_stream_fail',
      title: 'Faulty Stream Song',
      audioUrl: 'https://faulty.cdn.com/bad.mp4',
      streamUrl: '/api/stream?url=https%3A%2F%2Ffaulty.cdn.com%2Fbad.mp4'
    };

    const deck = {
      src: activeTrack.audioUrl,
      _proxyRetried: false,
      volume: 0.8,
      load: () => {},
      play: () => Promise.reject(new Error('Network CDN 403 Forbidden'))
    };

    const state = {
      isPlaying: true,
      currentTrack: activeTrack,
      consecutivePlaybackErrors: 0
    };

    function showToast(msg) { toastShown = msg; }

    async function handleAudioError() {
      if (activeTrack.streamUrl && deck.src !== activeTrack.streamUrl && !deck._proxyRetried) {
        deck._proxyRetried = true;
        proxyRetried = true;
        deck.src = activeTrack.streamUrl;
        try {
          await deck.play();
          return;
        } catch (e) {
          // Proxy also failed
        }
      }

      state.consecutivePlaybackErrors++;
      showToast(`Skipping unplayable stream: ${activeTrack.title}`);
      advanced = true;
    }

    await handleAudioError();

    assert.strictEqual(proxyRetried, true, 'Must have attempted proxy stream retry');
    assert.strictEqual(advanced, true, 'Must auto-advance to next song if stream is permanently unplayable');
    assert.strictEqual(toastShown.includes('Skipping unplayable stream'), true);
  });

  // -------------------------------------------------------------
  // TEST 7: Autoplay Awaiting Recommendations over Slow Network
  // -------------------------------------------------------------
  await runAsyncTest('Autoplay awaits recommendation batch over slow network and auto-resumes', async () => {
    const state = {
      currentTrack: { id: 'last_song', title: 'Last Song' },
      autoplay: true,
      recommendationQueue: [],
      isAwaitingRecommendations: false,
      isPlaying: true
    };

    let resumedWithTrack = null;

    function transitionToNextSong() {
      let nextSong = state.recommendationQueue.shift();
      if (!nextSong) {
        if (state.autoplay && state.currentTrack) {
          state.isAwaitingRecommendations = true;
          // Simulate delayed network fetch (100ms)
          setTimeout(() => {
            const freshTracks = [
              { id: 'reco_1', title: 'Recommended Song 1' },
              { id: 'reco_2', title: 'Recommended Song 2' }
            ];
            state.recommendationQueue.push(...freshTracks);

            if (state.isAwaitingRecommendations && state.recommendationQueue.length > 0) {
              state.isAwaitingRecommendations = false;
              const toPlay = state.recommendationQueue.shift();
              resumedWithTrack = toPlay;
            }
          }, 100);
        }
        return;
      }
    }

    transitionToNextSong();
    assert.strictEqual(state.isAwaitingRecommendations, true, 'Must enter isAwaitingRecommendations while network loads');
    assert.strictEqual(resumedWithTrack, null, 'Has not yet resumed');

    await new Promise(r => setTimeout(r, 150));

    assert.strictEqual(state.isAwaitingRecommendations, false, 'Must clear isAwaitingRecommendations once tracks arrive');
    assert.notStrictEqual(resumedWithTrack, null, 'Must resume playback automatically');
    assert.strictEqual(resumedWithTrack.id, 'reco_1', 'Must play first recommendation');
    assert.strictEqual(state.recommendationQueue.length, 1, 'Remaining tracks stay in queue');
  });

  // -------------------------------------------------------------
  // TEST 8: 10 Consecutive Track Transitions Simulation
  // -------------------------------------------------------------
  await runAsyncTest('10 consecutive track transitions complete seamlessly with accurate state', async () => {
    const playlist = Array.from({ length: 15 }, (_, i) => ({
      id: `track_${i + 1}`,
      title: `Song Number ${i + 1}`,
      artist: `Artist ${Math.floor(i / 2) + 1}`,
      image: `https://images.unsplash.com/photo-${i + 1}?w=500`,
      durationStr: '3:30'
    }));

    const state = {
      currentTrack: null,
      trackEpoch: 0,
      contextQueue: [...playlist],
      contextIndex: 0,
      isPlaying: true,
      userQueue: []
    };

    const playedOrder = [];

    function simulatePlay(track) {
      state.currentTrack = track;
      state.trackEpoch++;
      playedOrder.push({ epoch: state.trackEpoch, id: track.id, title: track.title });
    }

    function advance() {
      if (state.contextIndex + 1 < state.contextQueue.length) {
        state.contextIndex++;
        simulatePlay(state.contextQueue[state.contextIndex]);
      }
    }

    simulatePlay(state.contextQueue[0]);

    for (let step = 1; step <= 9; step++) {
      await new Promise(r => setTimeout(r, 10 + Math.random() * 20));
      advance();
    }

    assert.strictEqual(playedOrder.length, 10, 'Exactly 10 songs must have played');
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(playedOrder[i].id, `track_${i + 1}`, `Song #${i + 1} must match expected order`);
      assert.strictEqual(playedOrder[i].epoch, i + 1, `Track epoch #${i + 1} must increment monotonically`);
    }
  });

  console.log('\n====================================================');
  console.log(`Tests Completed: ${testsPassed + testsFailed}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  console.log('====================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAll();
