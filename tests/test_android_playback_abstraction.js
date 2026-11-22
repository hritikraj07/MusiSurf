/**
 * Test Suite: Android Playback Abstraction & Media3 ExoPlayer Architecture
 */
const assert = require('assert');

// Mock browser environment for node testing
global.window = {
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; }
  },
  innerWidth: 1024,
  location: { pathname: '/' }
};
global.localStorage = global.window.localStorage;
global.navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
global.document = {
  createElement: () => ({ play: async () => {}, pause: () => {}, addEventListener: () => {} })
};

// Load Playback architecture
require('../public/src/playback/MusiSurfPlayback.js');

const { UnifiedTrack, QueueManager, DownloadManager, PlaybackCoordinator } = global.window.MusiSurfPlayback;

async function runTests() {
  console.log('🧪 Testing MusiSurf Native Android Playback Abstraction...\n');

  // TEST 1: UnifiedTrack Model
  console.log('--- TEST 1: UnifiedTrack Metadata Model ---');
  const rawTrack = {
    id: 'yt-12345',
    title: 'Kesariya',
    artist: 'Arijit Singh, Pritam',
    album: 'Brahmastra',
    image: 'https://example.com/art.jpg',
    duration: '4:28',
    audioUrl: 'https://example.com/audio.mp3'
  };
  const unified = UnifiedTrack.from(rawTrack);
  assert.strictEqual(unified.id, 'yt-12345');
  assert.strictEqual(unified.title, 'Kesariya');
  assert.strictEqual(unified.duration, 268); // 4 * 60 + 28
  assert.strictEqual(unified.durationFormatted, '4:28');
  assert.strictEqual(unified.audioUrl, 'https://example.com/audio.mp3');
  assert.ok(unified.streamUrl.includes('audio.mp3'));
  assert.strictEqual(unified.localFileUri, null);

  // Test local file reference for ExoPlayer
  unified.localFileUri = 'file:///data/user/0/com.musisurf.app/files/downloads/kesariya.mp3';
  const serialized = unified.toDict();
  assert.strictEqual(serialized.localFileUri, 'file:///data/user/0/com.musisurf.app/files/downloads/kesariya.mp3');
  console.log('  ✓ UnifiedTrack parses time strings, handles stream URLs, and supports localFileUri for ExoPlayer');

  // TEST 2: Centralized Queue Manager
  console.log('\n--- TEST 2: Centralized Queue Manager ---');
  const qm = new QueueManager();
  const t1 = UnifiedTrack.from({ id: 't1', title: 'Song 1' });
  const t2 = UnifiedTrack.from({ id: 't2', title: 'Song 2' });
  const t3 = UnifiedTrack.from({ id: 't3', title: 'Song 3' });

  qm.setContextQueue([t1, t2, t3], 0);
  assert.strictEqual(qm.queue.length, 3);
  assert.strictEqual(qm.currentTrack.id, 't1');

  // Play next priority
  const tNext = UnifiedTrack.from({ id: 't-next', title: 'Urgent Track' });
  qm.playNext(tNext);
  assert.strictEqual(qm.queue[1].id, 't-next');

  // Add to queue
  const tLater = UnifiedTrack.from({ id: 't-later', title: 'Later Track' });
  qm.addToQueue(tLater);
  assert.strictEqual(qm.userQueue.length, 2);

  // Deduplication: adding existing track to user queue prevents duplicate spam
  qm.addToQueue(tLater);
  assert.strictEqual(qm.userQueue.filter(t => t.id === 't-later').length, 1);

  // History navigation
  const nextUp = qm.advance();
  assert.strictEqual(nextUp.id, 't-next');
  assert.strictEqual(qm.history.length, 2);
  assert.strictEqual(qm.history[0].id, 't1');
  assert.strictEqual(qm.history[1].id, 't-next');

  const previous = qm.previous();
  assert.strictEqual(previous.id, 't1');
  console.log('  ✓ QueueManager handles context queues, user queue priority, deduplication, and retraceable history');

  // TEST 3: Web Playback Engine Default
  console.log('\n--- TEST 3: Web Playback Engine Isolation ---');
  const coord = new PlaybackCoordinator();
  assert.strictEqual(coord.isNativeActive, false, 'Default browser environment must keep isNativeActive false');

  let webPlayed = false;
  let webPaused = false;
  let webSeekPos = -1;

  coord.setWebEngineDelegate({
    loadTrackWeb: async (t) => { webPlayed = true; return true; },
    playWeb: async () => { webPlayed = true; },
    pauseWeb: async () => { webPaused = true; },
    seekWeb: async (pos) => { webSeekPos = pos; },
    getPositionWeb: () => 42,
    getDurationWeb: () => 200
  });

  assert.strictEqual(coord.activeEngine.engineType, 'web');
  await coord.playTrack(t1);
  assert.strictEqual(webPlayed, true);
  assert.strictEqual(coord.isPlaying, true);

  await coord.pause();
  assert.strictEqual(webPaused, true);
  assert.strictEqual(coord.isPlaying, false);

  await coord.seek(60);
  assert.strictEqual(webSeekPos, 60);
  console.log('  ✓ WebAudioEngine delegates directly to browser context with zero native dependency');

  // TEST 4: Simulated Android Native Media3 ExoPlayer Mode
  console.log('\n--- TEST 4: Simulated Android Native ExoPlayer Integration ---');
  const nativePluginCalls = [];
  const mockCapacitorPlugin = {
    addListener: (event, cb) => {
      mockCapacitorPlugin._listeners = mockCapacitorPlugin._listeners || {};
      mockCapacitorPlugin._listeners[event] = cb;
    },
    play: async (opts) => {
      const trackObj = opts.track || opts;
      nativePluginCalls.push(['play', trackObj.id]);
    },
    pause: async () => { nativePluginCalls.push(['pause']); },
    resume: async () => { nativePluginCalls.push(['resume']); },
    seek: async (opts) => { nativePluginCalls.push(['seek', opts.position]); },
    setQueue: async (opts) => { nativePluginCalls.push(['setQueue', (opts.queue || opts.songs || []).length]); },
    setShuffle: async (opts) => { nativePluginCalls.push(['setShuffle', opts.enabled]); },
    setRepeat: async (opts) => { nativePluginCalls.push(['setRepeat', opts.mode]); }
  };

  // Simulate Capacitor Native Android environment
  global.window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      MusiSurfMediaPlugin: mockCapacitorPlugin
    }
  };

  const nativeCoord = new PlaybackCoordinator();
  assert.strictEqual(nativeCoord.isNativeActive, true, 'Capacitor environment must activate native Media3 engine');
  assert.strictEqual(nativeCoord.activeEngine.engineType, 'android_native');

  // Test native command dispatch
  await nativeCoord.playTrack(t2, [t1, t2, t3]);
  assert.ok(nativePluginCalls.some(c => c[0] === 'play' && c[1] === 't2'));
  assert.ok(nativePluginCalls.some(c => c[0] === 'setQueue'));

  await nativeCoord.pause();
  assert.ok(nativePluginCalls.some(c => c[0] === 'pause'));

  await nativeCoord.resume();
  assert.ok(nativePluginCalls.some(c => c[0] === 'resume'));

  await nativeCoord.seek(120);
  assert.ok(nativePluginCalls.some(c => c[0] === 'seek' && c[1] === 120));

  await nativeCoord.setShuffle(true);
  assert.ok(nativePluginCalls.some(c => c[0] === 'setShuffle' && c[1] === true));

  await nativeCoord.setRepeatMode('one');
  assert.ok(nativePluginCalls.some(c => c[0] === 'setRepeat' && c[1] === 'one'));

  // Test native event synchronization (e.g. Media notification / Bluetooth track skip)
  let uiNotifiedTrack = null;
  let uiNotifiedPlaying = null;
  nativeCoord.on('trackChanged', (e) => { uiNotifiedTrack = e.track; });
  nativeCoord.on('playbackStateChanged', (e) => { uiNotifiedPlaying = e.isPlaying; });

  mockCapacitorPlugin._listeners['trackChanged']({ track: t3.toDict() });
  assert.strictEqual(uiNotifiedTrack?.id, 't3');

  mockCapacitorPlugin._listeners['playbackStateChanged']({ state: 'playing' });
  assert.strictEqual(uiNotifiedPlaying, true);

  mockCapacitorPlugin._listeners['playbackPositionUpdate']({ position: 75.5, duration: 240 });
  assert.strictEqual(nativeCoord.getCurrentTime(), 75.5);
  assert.strictEqual(nativeCoord.getDuration(), 240);

  console.log('  ✓ NativeAndroidAudioEngine dispatches all Media3 commands and synchronizes ExoPlayer events seamlessly');

  // TEST 5: Download Manager with offline path for ExoPlayer
  console.log('\n--- TEST 5: Download Manager Offline Path Resolution ---');
  const dm = new DownloadManager();
  const offlineTrack = UnifiedTrack.from({
    id: 'download-test',
    title: 'Offline Song',
    artist: 'Artist',
    downloadStatus: 'downloaded',
    localFileUri: 'file:///data/user/0/com.musisurf.app/files/downloads/download-test.mp3'
  });
  dm._offlineTracks.push(offlineTrack);
  assert.strictEqual(dm.isDownloaded('download-test'), true);
  const playbackUri = await dm.getPlaybackUri(offlineTrack);
  assert.strictEqual(playbackUri, 'file:///data/user/0/com.musisurf.app/files/downloads/download-test.mp3');
  console.log('  ✓ DownloadManager correctly resolves persistent file:/// URIs for ExoPlayer offline playback');

  console.log('\n====================================================');
  console.log('🏁 ALL ANDROID PLAYBACK ABSTRACTION TESTS PASSED!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
