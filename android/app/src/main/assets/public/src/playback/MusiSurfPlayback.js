/**
 * MUSISURF AUDIO PLAYBACK ARCHITECTURE
 * Unified Web & Native Android ExoPlayer Playback Core
 * 
 * Separates:
 * 1. UI & Visual Layer (Views, Animations, Lyrics)
 * 2. Playback State & Two-Way Sync
 * 3. Centralized Queue Management & History
 * 4. Audio Engine Abstraction (WebAudioEngine vs NativeAndroidAudioEngine)
 * 5. Download Management (IndexedDB vs Native Filesystem)
 * 
 * Safe for pure browsers, PWA, and Capacitor Android Native application.
 */

(function (global) {
  'use strict';

  // ============================================================================
  // 1. UNIFIED SONG METADATA MODEL
  // ============================================================================

  class UnifiedTrack {
    constructor(raw = {}) {
      this.id = String(raw.id || raw.trackId || (raw.ytId ? `yt_${raw.ytId}` : `ms_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`));
      this.title = String(raw.title || raw.name || 'Unknown Title').trim();
      this.artist = String(raw.artist || raw.primaryArtist || 'Unknown Artist').trim();
      this.artists = raw.artists ? String(raw.artists).trim() : this.artist;
      this.album = String(raw.album || 'MusiSurf Music').trim();
      
      // High-resolution artwork fallback
      this.artwork = raw.artwork || raw.image || raw.coverUrl || raw.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
      this.image = this.artwork; // Backward compatibility with MusiSurf UI

      let parsedDur = 0;
      if (typeof raw.duration === 'number' && Number.isFinite(raw.duration) && raw.duration > 0) {
        parsedDur = raw.duration;
      } else if (typeof raw.duration === 'string' && raw.duration.includes(':')) {
        const parts = raw.duration.split(':').map(p => Number(p));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          parsedDur = parts[0] * 60 + parts[1];
        } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
          parsedDur = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
      } else if (Number(raw.duration) > 0) {
        parsedDur = Number(raw.duration);
      } else if (typeof raw.durationStr === 'string' && raw.durationStr.includes(':')) {
        const parts = raw.durationStr.split(':').map(p => Number(p));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          parsedDur = parts[0] * 60 + parts[1];
        }
      }
      this.duration = parsedDur > 0 ? parsedDur : 210;
      this.durationStr = raw.durationStr || this._formatDuration(this.duration);
      this.durationFormatted = this.durationStr;

      // Direct CDN / Audio URL
      this.audioUrl = raw.audioUrl || raw.url || null;
      this.ytId = raw.ytId || null;
      this.source = raw.source || (this.ytId ? 'youtube' : 'saavn');

      // Native Android file reference (file:///... URI accessible by Media3 ExoPlayer)
      this.localFileUri = raw.localFileUri || null;

      // Remote streaming endpoint (via MusiSurf backend proxy or direct CDN)
      this.remoteStreamUrl = raw.remoteStreamUrl || raw.streamUrl || this._computeStreamUrl();
      this.streamUrl = this.remoteStreamUrl; // Backward compatibility

      // Download status
      this.downloadStatus = raw.downloadStatus || (raw.isDownloaded ? 'downloaded' : 'not_downloaded');
      this.downloadedAt = raw.downloadedAt || (this.downloadStatus === 'downloaded' ? Date.now() : null);
      this.fileSize = Number(raw.fileSize) || 0;

      // Lyrics metadata
      this.hasSyncedLyrics = Boolean(raw.hasSyncedLyrics);

      // Edge glow / Theme metadata
      this.themeColor = raw.themeColor || null;
      this.effectiveStart = Number(raw.effectiveStart) || 0;
      this.effectiveEnd = Number(raw.effectiveEnd) || this.duration;
    }

    _formatDuration(sec) {
      if (!Number.isFinite(sec) || sec <= 0) return '0:00';
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    _computeStreamUrl() {
      let base = '';
      if (typeof window !== 'undefined') {
        const isNative = window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform();
        if (isNative || window.location.hostname === 'localhost' || window.location.protocol === 'capacitor:') {
          base = 'https://musi-surf.vercel.app';
        }
      }
      if (this.audioUrl) {
        return `${base}/api/stream?url=${encodeURIComponent(this.audioUrl)}`;
      }
      if (this.ytId) {
        return `${base}/api/yt-stream?v=${encodeURIComponent(this.ytId)}`;
      }
      return `${base}/api/download?title=${encodeURIComponent(this.title)}&artist=${encodeURIComponent(this.artist)}`;
    }

    toDict() {
      return {
        id: this.id,
        title: this.title,
        artist: this.artist,
        artists: this.artists,
        album: this.album,
        artwork: this.artwork,
        image: this.artwork,
        duration: this.duration,
        durationStr: this.durationStr,
        audioUrl: this.audioUrl,
        ytId: this.ytId,
        source: this.source,
        localFileUri: this.localFileUri,
        remoteStreamUrl: this.remoteStreamUrl,
        streamUrl: this.remoteStreamUrl,
        downloadStatus: this.downloadStatus,
        downloadedAt: this.downloadedAt,
        fileSize: this.fileSize,
        hasSyncedLyrics: this.hasSyncedLyrics,
        effectiveStart: this.effectiveStart,
        effectiveEnd: this.effectiveEnd
      };
    }

    static from(raw) {
      if (raw instanceof UnifiedTrack) return raw;
      return new UnifiedTrack(raw);
    }
  }

  // ============================================================================
  // 2. AUDIO ENGINE INTERFACE (Contract)
  // ============================================================================

  class AudioEngineInterface {
    constructor() {
      if (new.target === AudioEngineInterface) {
        throw new TypeError('Cannot construct AudioEngineInterface directly');
      }
    }

    get engineType() { return 'abstract'; }
    isAvailable() { return false; }
    async loadTrack(track, options = {}) { throw new Error('Not implemented'); }
    async play() { throw new Error('Not implemented'); }
    async pause() { throw new Error('Not implemented'); }
    async resume() { throw new Error('Not implemented'); }
    async seek(positionSeconds) { throw new Error('Not implemented'); }
    setVolume(volume) { throw new Error('Not implemented'); }
    setMuted(isMuted) { throw new Error('Not implemented'); }
    getCurrentPosition() { return 0; }
    getDuration() { return 0; }
    stop() { throw new Error('Not implemented'); }
    cleanup() { throw new Error('Not implemented'); }
  }

  // ============================================================================
  // 3. WEB AUDIO ENGINE (Browser HTML5 Audio & YouTube Iframe Fallback)
  // ============================================================================

  class WebAudioEngine extends AudioEngineInterface {
    constructor(delegate) {
      super();
      this.delegate = delegate; // Ref to existing MusiSurf player app context
      this._volume = 0.8;
      this._isMuted = false;
      this._activeTrack = null;
    }

    get engineType() { return 'web'; }

    isAvailable() {
      return typeof window !== 'undefined' && (typeof Audio !== 'undefined' || !!document.createElement('audio'));
    }

    async loadTrack(track, options = {}) {
      this._activeTrack = track;
      if (this.delegate && typeof this.delegate.loadTrackWeb === 'function') {
        return await this.delegate.loadTrackWeb(track, options);
      }
      return true;
    }

    async play() {
      if (this.delegate && typeof this.delegate.playWeb === 'function') {
        return await this.delegate.playWeb();
      }
    }

    async pause() {
      if (this.delegate && typeof this.delegate.pauseWeb === 'function') {
        return await this.delegate.pauseWeb();
      }
    }

    async resume() {
      if (this.delegate && typeof this.delegate.resumeWeb === 'function') {
        return await this.delegate.resumeWeb();
      }
      return this.play();
    }

    async seek(positionSeconds) {
      if (this.delegate && typeof this.delegate.seekWeb === 'function') {
        return await this.delegate.seekWeb(positionSeconds);
      }
    }

    setVolume(volume) {
      this._volume = Math.max(0, Math.min(1, Number(volume) || 0));
      if (this.delegate && typeof this.delegate.setVolumeWeb === 'function') {
        this.delegate.setVolumeWeb(this._volume);
      }
    }

    setMuted(isMuted) {
      this._isMuted = Boolean(isMuted);
      if (this.delegate && typeof this.delegate.setMutedWeb === 'function') {
        this.delegate.setMutedWeb(this._isMuted);
      }
    }

    getCurrentPosition() {
      if (this.delegate && typeof this.delegate.getPositionWeb === 'function') {
        return this.delegate.getPositionWeb();
      }
      return 0;
    }

    getDuration() {
      if (this.delegate && typeof this.delegate.getDurationWeb === 'function') {
        return this.delegate.getDurationWeb();
      }
      return this._activeTrack?.duration || 0;
    }

    stop() {
      if (this.delegate && typeof this.delegate.stopWeb === 'function') {
        this.delegate.stopWeb();
      }
    }

    cleanup() {
      this.stop();
      this._activeTrack = null;
    }
  }

  // ============================================================================
  // 4. NATIVE ANDROID AUDIO ENGINE (Capacitor Media3 ExoPlayer Plugin Bridge)
  // ============================================================================

  class NativeAndroidAudioEngine extends AudioEngineInterface {
    constructor(coordinator) {
      super();
      this.coordinator = coordinator;
      this._plugin = null;
      this._isAvailable = false;
      this._activeTrack = null;
      this._listenersAttached = false;
      this._lastReportedPosition = 0;
      this._lastReportedDuration = 0;
      this._checkAvailability();
    }

    get engineType() { return 'android_native'; }

    _checkAvailability() {
      const cap = window.Capacitor;
      if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
        const p = cap.Plugins?.MusiSurfMediaPlugin || window.MusiSurfNativeBridge;
        if (p) {
          this._plugin = p;
          this._isAvailable = true;
          return true;
        }
      }
      // Also check explicit window bridge if injected by custom WebView
      if (window.MusiSurfNativeBridge) {
        this._plugin = window.MusiSurfNativeBridge;
        this._isAvailable = true;
        return true;
      }
      this._isAvailable = false;
      return false;
    }

    isAvailable() {
      return this._isAvailable || this._checkAvailability();
    }

    /**
     * Attach native event listeners to synchronize native Media3 ExoPlayer events with website UI
     */
    attachNativeListeners() {
      if (!this.isAvailable() || this._listenersAttached || !this._plugin) return;
      this._listenersAttached = true;

      try {
        // 1. Playback State Changed (playing, buffering, ready, ended)
        if (typeof this._plugin.addListener === 'function') {
          this._plugin.addListener('playbackStateChanged', (event) => {
            this.coordinator.handleNativeStateChanged(event);
          });

          // 2. Track Changed (Notification / Headset button skip)
          this._plugin.addListener('trackChanged', (event) => {
            this.coordinator.handleNativeTrackChanged(event);
          });

          // 3. Playback Position & Duration Discontinuity
          this._plugin.addListener('playbackPositionUpdate', (event) => {
            if (event && Number.isFinite(event.position)) {
              this._lastReportedPosition = event.position;
              if (Number.isFinite(event.duration) && event.duration > 0) {
                this._lastReportedDuration = event.duration;
              }
              this.coordinator.handleNativePositionUpdate(event.position, event.duration);
            }
          });

          // 4. Queue Updated
          this._plugin.addListener('queueUpdated', (event) => {
            this.coordinator.handleNativeQueueUpdated(event);
          });

          // 5. Playback Error
          this._plugin.addListener('playerError', (event) => {
            this.coordinator.handleNativeError(event);
          });

          // 6. Audio Focus (call interruptions, navigation voice ducking)
          this._plugin.addListener('audioFocusChanged', (event) => {
            this.coordinator.handleNativeAudioFocus(event);
          });
        }
      } catch (err) {
        console.warn('[NativeAudioEngine] Error attaching listeners:', err);
      }
    }

    async loadTrack(track, options = {}) {
      if (!this.isAvailable()) return false;
      this.attachNativeListeners();
      this._activeTrack = track;

      try {
        const payload = {
          track: track.toDict ? track.toDict() : track,
          startTime: options.startTime || 0
        };
        const res = await this._plugin.play(payload);
        return Boolean(res && res.success !== false);
      } catch (err) {
        console.error('[NativeAudioEngine] loadTrack failed:', err);
        return false;
      }
    }

    async play() {
      if (!this.isAvailable()) return;
      try {
        await this._plugin.resume();
      } catch (err) {
        console.error('[NativeAudioEngine] play/resume failed:', err);
      }
    }

    async pause() {
      if (!this.isAvailable()) return;
      try {
        await this._plugin.pause();
      } catch (err) {
        console.error('[NativeAudioEngine] pause failed:', err);
      }
    }

    async resume() {
      return this.play();
    }

    async seek(positionSeconds) {
      if (!this.isAvailable()) return;
      try {
        await this._plugin.seek({ position: positionSeconds });
        this._lastReportedPosition = positionSeconds;
      } catch (err) {
        console.error('[NativeAudioEngine] seek failed:', err);
      }
    }

    async setVolume(volume) {
      if (!this.isAvailable()) return;
      try {
        if (typeof this._plugin.setVolume === 'function') {
          await this._plugin.setVolume({ volume: Number(volume) || 0.8 });
        }
      } catch (err) {
        console.warn('[NativeAudioEngine] setVolume failed:', err);
      }
    }

    async setLoudness(mode) {
      if (!this.isAvailable()) return;
      try {
        if (typeof this._plugin.setLoudness === 'function') {
          await this._plugin.setLoudness({ mode: String(mode || 'off') });
        }
      } catch (err) {
        console.warn('[NativeAudioEngine] setLoudness failed:', err);
      }
    }

    setMuted(isMuted) {
      this.setVolume(isMuted ? 0 : 0.8);
    }

    getCurrentPosition() {
      return this._lastReportedPosition || 0;
    }

    getDuration() {
      return this._lastReportedDuration || this._activeTrack?.duration || 0;
    }

    async setQueue(tracks, startIndex = 0) {
      if (!this.isAvailable()) return;
      try {
        const queuePayload = tracks.map(t => (t.toDict ? t.toDict() : t));
        await this._plugin.setQueue({ queue: queuePayload, startIndex });
      } catch (err) {
        console.warn('[NativeAudioEngine] setQueue failed:', err);
      }
    }

    async setShuffle(enabled) {
      if (!this.isAvailable()) return;
      try {
        await this._plugin.setShuffle({ enabled: Boolean(enabled) });
      } catch (err) {
        console.warn('[NativeAudioEngine] setShuffle failed:', err);
      }
    }

    async setRepeat(mode) {
      if (!this.isAvailable()) return;
      try {
        await this._plugin.setRepeat({ mode });
      } catch (err) {
        console.warn('[NativeAudioEngine] setRepeat failed:', err);
      }
    }

    stop() {
      this.pause();
    }

    cleanup() {
      this.pause();
      this._activeTrack = null;
    }
  }

  // ============================================================================
  // 5. CENTRALIZED QUEUE MANAGER
  // ============================================================================

  class QueueManager {
    constructor() {
      this.currentTrack = null;
      this.userQueue = [];       // Songs manually added via "Add to Queue" or "Play Next"
      this.contextQueue = [];    // Playlist or album tracks currently active
      this.contextIndex = -1;    // Position in current context queue
      this.queue = [];           // Master visible unified queue [currentTrack, ...userQueue, ...contextRemaining]
      
      this.repeatMode = 'off';   // 'off' | 'all' | 'one'
      this.isShuffle = false;
      this.shuffledIndices = [];

      // History stack for backwards/forward re-tracing with Previous/Next buttons
      this.playbackHistory = [];
      this.historyCursor = -1;
      this.maxHistorySize = 50;

      // Duplicate prevention set
      this._trackIdSet = new Set();
    }

    setContextQueue(tracks = [], startIndex = 0) {
      this.contextQueue = tracks.map(t => UnifiedTrack.from(t));
      this.contextIndex = Math.max(0, Math.min(startIndex, this.contextQueue.length - 1));
      if (!this.currentTrack && this.contextQueue.length > 0 && this.contextIndex >= 0) {
        this.setCurrentTrack(this.contextQueue[this.contextIndex]);
      }
      if (this.isShuffle) {
        this._computeShuffledIndices();
      }
      this._updateMasterQueue();
    }

    setCurrentTrack(track, isHistoryNav = false) {
      this.currentTrack = track ? UnifiedTrack.from(track) : null;
      if (this.currentTrack && !isHistoryNav) {
        // Record in history if not a history traversal
        this._recordHistory(this.currentTrack);
      }
      this._updateMasterQueue();
    }

    addToQueue(track) {
      if (!track) return;
      const unified = UnifiedTrack.from(track);
      const existingIdx = this.userQueue.findIndex(t => t.id === unified.id);
      if (existingIdx !== -1) {
        this.userQueue.splice(existingIdx, 1);
      }
      this.userQueue.push(unified);
      this._updateMasterQueue();
    }

    playNext(track) {
      if (!track) return;
      const unified = UnifiedTrack.from(track);
      const existingIdx = this.userQueue.findIndex(t => t.id === unified.id);
      if (existingIdx !== -1) {
        this.userQueue.splice(existingIdx, 1);
      }
      this.userQueue.unshift(unified);
      this._updateMasterQueue();
    }

    removeFromQueue(index) {
      if (index >= 0 && index < this.userQueue.length) {
        this.userQueue.splice(index, 1);
        this._updateMasterQueue();
      }
    }

    moveQueueItem(fromIndex, toIndex) {
      if (fromIndex >= 0 && fromIndex < this.userQueue.length && toIndex >= 0 && toIndex < this.userQueue.length) {
        const item = this.userQueue.splice(fromIndex, 1)[0];
        this.userQueue.splice(toIndex, 0, item);
        this._updateMasterQueue();
      }
    }

    clearUserQueue() {
      this.userQueue = [];
      this._updateMasterQueue();
    }

    setShuffle(enabled) {
      this.isShuffle = Boolean(enabled);
      if (this.isShuffle) {
        this._computeShuffledIndices();
      }
      this._updateMasterQueue();
    }

    toggleShuffle() {
      this.setShuffle(!this.isShuffle);
      return this.isShuffle;
    }

    setRepeat(mode) {
      if (['off', 'all', 'one'].includes(mode)) {
        this.repeatMode = mode;
      }
      return this.repeatMode;
    }

    cycleRepeat() {
      if (this.repeatMode === 'off') this.repeatMode = 'all';
      else if (this.repeatMode === 'all') this.repeatMode = 'one';
      else this.repeatMode = 'off';
      return this.repeatMode;
    }

    _computeShuffledIndices() {
      const len = this.contextQueue.length;
      const arr = Array.from({ length: len }, (_, i) => i);
      // Fisher-Yates shuffle
      for (let i = len - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      // Ensure current context index is at position 0 so current song doesn't jump
      const curPos = arr.indexOf(this.contextIndex);
      if (curPos > 0) {
        [arr[0], arr[curPos]] = [arr[curPos], arr[0]];
      }
      this.shuffledIndices = arr;
    }

    _updateMasterQueue() {
      const remainingContext = [];
      if (this.contextQueue.length > 0 && this.contextIndex >= 0) {
        if (this.isShuffle && this.shuffledIndices.length === this.contextQueue.length) {
          const curOrderIdx = this.shuffledIndices.indexOf(this.contextIndex);
          for (let i = curOrderIdx + 1; i < this.shuffledIndices.length; i++) {
            const track = this.contextQueue[this.shuffledIndices[i]];
            if (track) remainingContext.push(track);
          }
        } else {
          for (let i = this.contextIndex + 1; i < this.contextQueue.length; i++) {
            const track = this.contextQueue[i];
            if (track) remainingContext.push(track);
          }
        }
      }

      this.queue = [];
      if (this.currentTrack) this.queue.push(this.currentTrack);
      this.queue.push(...this.userQueue);
      this.queue.push(...remainingContext);
    }

    _recordHistory(track) {
      if (!track) return;
      // Do not duplicate immediate last entry
      if (this.playbackHistory.length > 0 && this.historyCursor >= 0 && this.historyCursor < this.playbackHistory.length) {
        const lastEntry = this.playbackHistory[this.historyCursor];
        if (lastEntry && lastEntry.track && lastEntry.track.id === track.id) {
          return;
        }
      }
      // Truncate abandoned forward branch
      if (this.historyCursor < this.playbackHistory.length - 1) {
        this.playbackHistory = this.playbackHistory.slice(0, this.historyCursor + 1);
      }
      this.playbackHistory.push({ track, timestamp: Date.now() });
      if (this.playbackHistory.length > this.maxHistorySize) {
        this.playbackHistory.shift();
      }
      this.historyCursor = this.playbackHistory.length - 1;
    }

    get history() {
      return this.playbackHistory.map(h => h.track);
    }

    advance(options = {}) {
      const next = this.getNextTrack(options);
      if (next) {
        this.setCurrentTrack(next);
      }
      return next;
    }

    previous() {
      const prev = this.getPreviousTrack();
      if (prev) {
        this.setCurrentTrack(prev, true);
      }
      return prev;
    }

    /**
     * Determine next track to play
     */
    getNextTrack(options = {}) {
      // 1. Repeat One (unless manual skip was pressed)
      if (this.repeatMode === 'one' && !options.isManualSkip && this.currentTrack) {
        return this.currentTrack;
      }

      // 2. User-queued songs have highest priority
      if (this.userQueue.length > 0) {
        const nextUserTrack = this.userQueue.shift();
        this._updateMasterQueue();
        return nextUserTrack;
      }

      // 3. Context queue progression
      if (this.contextQueue.length > 0) {
        if (this.isShuffle && this.shuffledIndices.length === this.contextQueue.length) {
          const curOrderIdx = this.shuffledIndices.indexOf(this.contextIndex);
          if (curOrderIdx >= 0 && curOrderIdx < this.shuffledIndices.length - 1) {
            this.contextIndex = this.shuffledIndices[curOrderIdx + 1];
            this._updateMasterQueue();
            return this.contextQueue[this.contextIndex];
          }
        } else {
          if (this.contextIndex >= 0 && this.contextIndex < this.contextQueue.length - 1) {
            this.contextIndex++;
            this._updateMasterQueue();
            return this.contextQueue[this.contextIndex];
          }
        }

        // 4. Repeat All wrap-around
        if (this.repeatMode === 'all') {
          if (this.isShuffle) {
            this._computeShuffledIndices();
            this.contextIndex = this.shuffledIndices[0] || 0;
          } else {
            this.contextIndex = 0;
          }
          this._updateMasterQueue();
          return this.contextQueue[this.contextIndex] || null;
        }
      }

      return null;
    }

    /**
     * Determine previous track to play
     */
    getPreviousTrack() {
      if (this.playbackHistory.length > 0 && this.historyCursor > 0) {
        this.historyCursor--;
        const entry = this.playbackHistory[this.historyCursor];
        return entry ? entry.track : null;
      }
      // If at start of history or no history, restart current song
      return this.currentTrack;
    }

    syncFromNative(nativeQueue = [], currentIndex = 0) {
      if (!Array.isArray(nativeQueue)) return;
      this.contextQueue = nativeQueue.map(t => UnifiedTrack.from(t));
      this.contextIndex = currentIndex >= 0 ? currentIndex : 0;
      this.currentTrack = this.contextQueue[this.contextIndex] || null;
      this._updateMasterQueue();
    }
  }

  // ============================================================================
  // 6. DOWNLOAD MANAGER (IndexedDB for Web, Filesystem for Android Native)
  // ============================================================================

  class DownloadManager {
    constructor() {
      this.dbName = 'MusiSurfOfflineDB';
      this.storeName = 'downloaded_songs';
      this.dbPromise = null;
      this._offlineTracks = [];
      this._loadLocalMetadata();
    }

    _loadLocalMetadata() {
      try {
        const raw = localStorage.getItem('musisurf_offline_tracks');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            this._offlineTracks = list.map(t => UnifiedTrack.from(t));
          }
        }
      } catch (e) {
        this._offlineTracks = [];
      }
    }

    _saveLocalMetadata() {
      try {
        const plain = this._offlineTracks.map(t => t.toDict());
        localStorage.setItem('musisurf_offline_tracks', JSON.stringify(plain));
      } catch (e) {}
    }

    getOfflineDB() {
      if (!this.dbPromise) {
        this.dbPromise = new Promise((resolve, reject) => {
          if (typeof indexedDB === 'undefined') {
            resolve(null);
            return;
          }
          const req = indexedDB.open(this.dbName, 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(this.storeName)) {
              db.createObjectStore(this.storeName, { keyPath: 'id' });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return this.dbPromise;
    }

    isDownloaded(trackId) {
      return this._offlineTracks.some(t => t.id === trackId && t.downloadStatus === 'downloaded');
    }

    getTrack(trackId) {
      return this._offlineTracks.find(t => t.id === trackId) || null;
    }

    async getAllDownloaded() {
      this._loadLocalMetadata();
      return this._offlineTracks.filter(t => t.downloadStatus === 'downloaded');
    }

    /**
     * Download track for offline playback
     * Automatically adapts:
     * - In Native Android: uses Capacitor Filesystem / Native Plugin to save persistent file and store file:/// URI
     * - In Browser: fetches blob and stores in IndexedDB + triggers download
     */
    async download(track) {
      if (!track) throw new Error('No track provided');
      const unified = UnifiedTrack.from(track);

      // Check if running on native Android
      const cap = window.Capacitor;
      const isNative = cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();

      if (isNative && cap.Plugins?.MusiSurfMediaPlugin?.downloadTrack) {
        // Native Android Download Pipeline
        unified.downloadStatus = 'downloading';
        this._updateTrackInList(unified);

        try {
          const res = await cap.Plugins.MusiSurfMediaPlugin.downloadTrack({ track: unified.toDict() });
          if (res && res.success && res.localFileUri) {
            unified.localFileUri = res.localFileUri;
            unified.downloadStatus = 'downloaded';
            unified.downloadedAt = Date.now();
            this._updateTrackInList(unified);
            return { success: true, track: unified };
          }
        } catch (err) {
          console.warn('[DownloadManager] Native download error, falling back:', err);
        }
      }

      // Web Browser Download Pipeline (IndexedDB blob caching)
      unified.downloadStatus = 'downloading';
      this._updateTrackInList(unified);

      try {
        const streamTarget = unified.remoteStreamUrl || unified.audioUrl || `/api/download?title=${encodeURIComponent(unified.title)}&artist=${encodeURIComponent(unified.artist)}`;
        const res = await fetch(streamTarget);
        if (!res.ok) throw new Error(`Stream fetch failed with HTTP ${res.status}`);
        const blob = await res.blob();

        const db = await this.getOfflineDB();
        if (db) {
          const tx = db.transaction(this.storeName, 'readwrite');
          const store = tx.objectStore(this.storeName);
          await new Promise((resolve, reject) => {
            const req = store.put({ ...unified.toDict(), audioBlob: blob });
            req.onsuccess = resolve;
            req.onerror = reject;
          });
        }

        unified.downloadStatus = 'downloaded';
        unified.downloadedAt = Date.now();
        unified.fileSize = blob.size;
        this._updateTrackInList(unified);

        return { success: true, track: unified };
      } catch (err) {
        unified.downloadStatus = 'failed';
        this._updateTrackInList(unified);
        throw err;
      }
    }

    /**
     * Resolves the playable audio URI for a downloaded track.
     * On Android: returns persistent native file:/// URI for ExoPlayer.
     * On Web: returns Object URL from cached IndexedDB blob.
     */
    async getPlaybackUri(track) {
      if (!track) return '';
      // 1. If native file URI exists (Android ExoPlayer), return directly
      if (track.localFileUri) {
        return track.localFileUri;
      }

      // 2. Web IndexedDB blob lookup
      try {
        const db = await this.getOfflineDB();
        if (db) {
          const tx = db.transaction(this.storeName, 'readonly');
          const store = tx.objectStore(this.storeName);
          const record = await new Promise((resolve) => {
            const req = store.get(track.id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          });

          if (record && record.audioBlob) {
            return URL.createObjectURL(record.audioBlob);
          }
        }
      } catch (e) {
        console.warn('[DownloadManager] getPlaybackUri error:', e);
      }

      // 3. Fallback to remote streaming URL
      return track.remoteStreamUrl || track.audioUrl || '';
    }

    async delete(trackId) {
      const idx = this._offlineTracks.findIndex(t => t.id === trackId);
      if (idx >= 0) {
        const track = this._offlineTracks[idx];
        this._offlineTracks.splice(idx, 1);
        this._saveLocalMetadata();

        // Native cleanup
        const cap = window.Capacitor;
        if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() && cap.Plugins?.MusiSurfMediaPlugin?.removeDownloadedTrack) {
          try {
            await cap.Plugins.MusiSurfMediaPlugin.removeDownloadedTrack({ trackId });
          } catch (e) {}
        }

        // Web IndexedDB cleanup
        try {
          const db = await this.getOfflineDB();
          if (db) {
            const tx = db.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).delete(trackId);
          }
        } catch (e) {}
        return true;
      }
      return false;
    }

    _updateTrackInList(track) {
      const idx = this._offlineTracks.findIndex(t => t.id === track.id);
      if (idx >= 0) {
        this._offlineTracks[idx] = track;
      } else {
        this._offlineTracks.unshift(track);
      }
      this._saveLocalMetadata();
    }
  }

  // ============================================================================
  // 7. PLAYBACK COORDINATOR (Master Central Orchestrator & Two-Way Sync)
  // ============================================================================

  class PlaybackCoordinator {
    constructor() {
      this.queueManager = new QueueManager();
      this.downloadManager = new DownloadManager();

      this.webEngine = null;
      this.nativeEngine = new NativeAndroidAudioEngine(this);

      this.isNativeActive = false;
      this.isPlaying = false;
      this.currentTrack = null;
      this.currentTime = 0;
      this.duration = 0;

      // Event listener registration
      this._listeners = new Map();

      // Guard flags to prevent infinite two-way event synchronization loops
      this._isSyncingFromNative = false;
      this._isCommandOriginWeb = false;

      // Detect environment
      this._detectEnvironment();
    }

    _detectEnvironment() {
      const cap = window.Capacitor;
      const hasCapNative = Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
      const hasNativeBridge = Boolean(window.MusiSurfNativeBridge || cap?.Plugins?.MusiSurfMediaPlugin);

      if (hasCapNative && hasNativeBridge) {
        this.isNativeActive = true;
        console.log('[PlaybackCoordinator] Native Android Environment Detected (Media3 ExoPlayer Active)');
        this.nativeEngine.attachNativeListeners();
      } else {
        this.isNativeActive = false;
        console.log('[PlaybackCoordinator] Web Browser Environment Detected (Standard Web Audio Active)');
      }
    }

    setWebEngineDelegate(delegate) {
      this.webEngine = new WebAudioEngine(delegate);
    }

    get activeEngine() {
      if (this.isNativeActive && this.nativeEngine.isAvailable()) {
        return this.nativeEngine;
      }
      return this.webEngine;
    }

    // Event Bus Subscription
    on(event, callback) {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, new Set());
      }
      this._listeners.get(event).add(callback);
      return () => this.off(event, callback);
    }

    off(event, callback) {
      if (this._listeners.has(event)) {
        this._listeners.get(event).delete(callback);
      }
    }

    emit(event, payload) {
      if (this._listeners.has(event)) {
        for (const cb of this._listeners.get(event)) {
          try { cb(payload); } catch (e) { console.error(`[PlaybackCoordinator] Listener error (${event}):`, e); }
        }
      }
    }

    /**
     * Primary playback command: play track
     */
    async playTrack(track, queueList = null, options = {}) {
      if (!track) return;
      const unified = UnifiedTrack.from(track);
      this.currentTrack = unified;
      this.queueManager.setCurrentTrack(unified);

      if (Array.isArray(queueList)) {
        const unifiedQueue = queueList.map(t => UnifiedTrack.from(t));
        const idx = unifiedQueue.findIndex(t => t.id === unified.id);
        this.queueManager.setContextQueue(unifiedQueue, idx >= 0 ? idx : 0);
      }

      this._isCommandOriginWeb = true;

      // Check if downloaded offline
      if (this.downloadManager.isDownloaded(unified.id)) {
        const localUri = await this.downloadManager.getPlaybackUri(unified);
        if (localUri) {
          unified.localFileUri = localUri;
        }
      }

      // Execute on active engine
      if (this.isNativeActive && this.nativeEngine.isAvailable()) {
        await this.nativeEngine.loadTrack(unified, options);
        // Sync queue to native ExoPlayer
        this.nativeEngine.setQueue(this.queueManager.queue, 0);
      } else if (this.webEngine) {
        await this.webEngine.loadTrack(unified, options);
      }

      this.isPlaying = true;
      this._isCommandOriginWeb = false;
      this.emit('trackChanged', { track: this.currentTrack, queue: this.queueManager.queue });
      this.emit('playbackStateChanged', { isPlaying: true, track: this.currentTrack });
    }

    async togglePlayPause() {
      if (this.isPlaying) {
        await this.pause();
      } else {
        await this.resume();
      }
    }

    async pause() {
      this._isCommandOriginWeb = true;
      if (this.isNativeActive && this.nativeEngine.isAvailable()) {
        await this.nativeEngine.pause();
      } else if (this.webEngine) {
        await this.webEngine.pause();
      }
      this.isPlaying = false;
      this._isCommandOriginWeb = false;
      this.emit('playbackStateChanged', { isPlaying: false, track: this.currentTrack });
    }

    async resume() {
      this._isCommandOriginWeb = true;
      if (this.isNativeActive && this.nativeEngine.isAvailable()) {
        await this.nativeEngine.resume();
      } else if (this.webEngine) {
        await this.webEngine.resume();
      }
      this.isPlaying = true;
      this._isCommandOriginWeb = false;
      this.emit('playbackStateChanged', { isPlaying: true, track: this.currentTrack });
    }

    async seek(positionSeconds) {
      const pos = Math.max(0, Number(positionSeconds) || 0);
      this._isCommandOriginWeb = true;
      if (this.isNativeActive && this.nativeEngine.isAvailable()) {
        await this.nativeEngine.seek(pos);
      } else if (this.webEngine) {
        await this.webEngine.seek(pos);
      }
      this.currentTime = pos;
      this._isCommandOriginWeb = false;
      this.emit('positionChanged', { position: pos, duration: this.duration });
    }

    async next(options = {}) {
      const nextTrack = this.queueManager.getNextTrack(options);
      if (nextTrack) {
        await this.playTrack(nextTrack, null, { transitionReason: 'next', isManualSkip: options.isManualSkip });
      } else {
        this.emit('queueEnded', {});
      }
    }

    async previous() {
      const prevTrack = this.queueManager.getPreviousTrack();
      if (prevTrack) {
        await this.playTrack(prevTrack, null, { transitionReason: 'previous', isHistoryNav: true });
      }
    }

    setRepeat(mode) {
      const newMode = this.queueManager.setRepeat(mode);
      if (this.isNativeActive && this.nativeEngine.isAvailable()) {
        this.nativeEngine.setRepeat(newMode);
      }
      this.emit('repeatChanged', { mode: newMode, repeatMode: newMode });
      return newMode;
    }

    setRepeatMode(mode) {
      return this.setRepeat(mode);
    }

    cycleRepeat() {
      const newMode = this.queueManager.cycleRepeat();
      if (this.isNativeActive && this.nativeEngine.isAvailable()) {
        this.nativeEngine.setRepeat(newMode);
      }
      this.emit('repeatChanged', { mode: newMode, repeatMode: newMode });
      return newMode;
    }

    setShuffle(enabled) {
      this.queueManager.setShuffle(enabled);
      if (this.isNativeActive && this.nativeEngine.isAvailable()) {
        this.nativeEngine.setShuffle(enabled);
      }
      this.emit('shuffleChanged', { enabled: this.queueManager.isShuffle, isShuffle: this.queueManager.isShuffle });
    }

    toggleShuffle() {
      const res = this.queueManager.toggleShuffle();
      if (this.isNativeActive && this.nativeEngine.isAvailable()) {
        this.nativeEngine.setShuffle(res);
      }
      this.emit('shuffleChanged', { enabled: res, isShuffle: res });
      return res;
    }

    addToQueue(track) {
      this.queueManager.addToQueue(track);
      if (this.isNativeActive && this.nativeEngine.isAvailable()) {
        this.nativeEngine.setQueue(this.queueManager.queue);
      }
      this.emit('queueUpdated', { queue: this.queueManager.queue });
    }

    playNext(track) {
      this.queueManager.playNext(track);
      if (this.isNativeActive && this.nativeEngine.isAvailable()) {
        this.nativeEngine.setQueue(this.queueManager.queue);
      }
      this.emit('queueUpdated', { queue: this.queueManager.queue });
    }

    getCurrentTime() {
      if (this.isNativeActive && this.nativeEngine.isAvailable()) {
        return this.nativeEngine.getCurrentPosition();
      }
      if (this.webEngine) {
        return this.webEngine.getCurrentPosition();
      }
      return this.currentTime;
    }

    getDuration() {
      if (this.isNativeActive && this.nativeEngine.isAvailable()) {
        return this.nativeEngine.getDuration();
      }
      if (this.webEngine) {
        return this.webEngine.getDuration();
      }
      return this.duration || this.currentTrack?.duration || 0;
    }

    // ==========================================================================
    // TWO-WAY SYNCHRONIZATION HANDLERS (From Native Android -> Web UI)
    // ==========================================================================

    handleNativeStateChanged(event) {
      if (this._isCommandOriginWeb) return; // Prevent loop
      this._isSyncingFromNative = true;

      const isPlaying = Boolean(event.isPlaying || event.playbackState === 'playing' || event.playbackState === 'ready' || event.state === 'playing');
      this.isPlaying = isPlaying;
      if (Number.isFinite(event.currentPosition)) {
        this.currentTime = event.currentPosition;
      }
      if (Number.isFinite(event.duration) && event.duration > 0) {
        this.duration = event.duration;
      }

      this.emit('playbackStateChanged', { isPlaying: this.isPlaying, track: this.currentTrack, fromNative: true });
      this._isSyncingFromNative = false;
    }

    handleNativeTrackChanged(event) {
      if (this._isCommandOriginWeb) return;
      this._isSyncingFromNative = true;

      if (event && event.track) {
        this.currentTrack = UnifiedTrack.from(event.track);
        this.queueManager.setCurrentTrack(this.currentTrack);
        this.emit('trackChanged', { track: this.currentTrack, queue: this.queueManager.queue, fromNative: true });
      }

      this._isSyncingFromNative = false;
    }

    handleNativePositionUpdate(position, duration) {
      this.currentTime = position;
      if (Number.isFinite(duration) && duration > 0) {
        this.duration = duration;
      }
      this.emit('positionChanged', { position: this.currentTime, duration: this.duration, fromNative: true });
    }

    handleNativeQueueUpdated(event) {
      if (this._isCommandOriginWeb) return;
      if (event && Array.isArray(event.queue)) {
        this.queueManager.syncFromNative(event.queue, event.currentIndex);
        this.emit('queueUpdated', { queue: this.queueManager.queue, fromNative: true });
      }
    }

    handleNativeError(event) {
      console.error('[PlaybackCoordinator] Native Player Error:', event);
      this.emit('playbackError', event);
    }

    handleNativeAudioFocus(event) {
      console.log('[PlaybackCoordinator] Native Audio Focus Change:', event?.focusState);
      if (event?.focusState === 'loss') {
        this.isPlaying = false;
        this.emit('playbackStateChanged', { isPlaying: false, track: this.currentTrack, reason: 'audio_focus_loss' });
      }
    }
  }

  // ============================================================================
  // 8. GLOBAL EXPOSURE & INITIALIZATION
  // ============================================================================

  const MusiSurfPlayback = {
    UnifiedTrack,
    AudioEngineInterface,
    WebAudioEngine,
    NativeAndroidAudioEngine,
    QueueManager,
    DownloadManager,
    PlaybackCoordinator,
    coordinator: new PlaybackCoordinator()
  };

  global.MusiSurfPlayback = MusiSurfPlayback;

})(typeof window !== 'undefined' ? window : globalThis);
