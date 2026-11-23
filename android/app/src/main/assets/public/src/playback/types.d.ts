/**
 * MUSISURF AUDIO PLAYBACK ARCHITECTURE - TYPESCRIPT DEFINITIONS
 * 
 * Provides unified types for:
 * 1. Unified Song Metadata Model (Web & Native Android ExoPlayer).
 * 2. Playback State & Lifecycle.
 * 3. Centralized Queue & History Management.
 * 4. Capacitor Android Media Plugin Interface & Event Payloads.
 * 5. Audio Engine Contract (Web Audio vs Native Android Media3).
 * 6. Download Management (IndexedDB vs Native Android Storage).
 */

export type PlaybackStatus = 'idle' | 'loading' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error';
export type RepeatMode = 'off' | 'all' | 'one';
export type AudioEngineType = 'web' | 'android_native';
export type DownloadStatus = 'not_downloaded' | 'downloading' | 'downloaded' | 'failed';

/**
 * Unified Song Metadata Model
 * Represents any playable track in MusiSurf (Saavn, YouTube, Local Files, Offline Downloads)
 */
export interface UnifiedTrack {
  /** Unique track identifier (e.g., 'saavn_123', 'yt_abc', 'local_xyz') */
  id: string;

  /** Track title */
  title: string;

  /** Primary artist name */
  artist: string;

  /** Full artist string / collaborators (optional) */
  artists?: string;

  /** Album or playlist title */
  album: string;

  /** High-resolution cover artwork URL */
  artwork: string;

  /** Track duration in seconds */
  duration: number;

  /** Formatted duration string (mm:ss) */
  durationStr?: string;

  /**
   * Local native file reference for offline playback (e.g. 'file:///storage/emulated/0/...').
   * Used directly by native Android Media3 ExoPlayer.
   */
  localFileUri?: string | null;

  /**
   * Remote streaming URL (e.g. direct CDN or MusiSurf /api/stream proxy).
   */
  remoteStreamUrl?: string | null;

  /** Original audio URL if provided directly */
  audioUrl?: string | null;

  /** YouTube Video ID if track originates or falls back to YouTube */
  ytId?: string | null;

  /** Track source identifier */
  source: 'saavn' | 'youtube' | 'local' | 'custom';

  /** Download / Offline caching status */
  downloadStatus: DownloadStatus;

  /** Timestamp when track was downloaded (epoch ms) */
  downloadedAt?: number;

  /** File size in bytes if known */
  fileSize?: number;

  /** Optional lyrics snippet or synchronized lyrics availability */
  hasSyncedLyrics?: boolean;
}

/**
 * Playback State Snapshot
 */
export interface PlaybackStateSnapshot {
  isPlaying: boolean;
  status: PlaybackStatus;
  currentTrack: UnifiedTrack | null;
  position: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  activeEngine: AudioEngineType;
  bufferedPosition?: number;
}

/**
 * Playback Options when requesting playback
 */
export interface PlayOptions {
  startTime?: number;
  forceReload?: boolean;
  transitionReason?: string;
  isHistoryNav?: boolean;
  isManualSkip?: boolean;
}

/**
 * Event payloads emitted by Native Android Media3 ExoPlayer
 */
export interface NativePlaybackStateEvent {
  isPlaying: boolean;
  playbackState: 'idle' | 'buffering' | 'ready' | 'ended';
  currentPosition: number;
  duration: number;
  bufferedPosition?: number;
}

export interface NativeTrackChangedEvent {
  track: UnifiedTrack | null;
  index: number;
  queueLength: number;
}

export interface NativePositionEvent {
  position: number;
  duration: number;
}

export interface NativeQueueEvent {
  queue: UnifiedTrack[];
  currentIndex: number;
}

export interface NativeErrorEvent {
  errorCode: string;
  errorMessage: string;
  trackId?: string;
  recoverable: boolean;
}

export interface NativeAudioFocusEvent {
  focusState: 'gain' | 'loss' | 'loss_transient' | 'loss_transient_can_duck';
}

/**
 * Capacitor Plugin Interface for MusiSurf Media3 ExoPlayer Bridge
 */
export interface MusiSurfMediaPlugin {
  play(options?: { track?: UnifiedTrack; startTime?: number }): Promise<{ success: boolean }>;
  pause(): Promise<{ success: boolean }>;
  resume(): Promise<{ success: boolean }>;
  seek(options: { position: number }): Promise<{ success: boolean }>;
  next(): Promise<{ success: boolean }>;
  previous(): Promise<{ success: boolean }>;
  setQueue(options: { queue: UnifiedTrack[]; startIndex?: number }): Promise<{ success: boolean }>;
  getPlaybackState(): Promise<PlaybackStateSnapshot>;
  setShuffle(options: { enabled: boolean }): Promise<{ success: boolean }>;
  setRepeat(options: { mode: RepeatMode }): Promise<{ success: boolean }>;
  getCurrentSong(): Promise<{ track: UnifiedTrack | null }>;
  getCurrentPosition(): Promise<{ position: number }>;
  getDuration(): Promise<{ duration: number }>;
  setVolume(options: { volume: number }): Promise<{ success: boolean }>;
  
  // Download methods
  downloadTrack(options: { track: UnifiedTrack }): Promise<{ success: boolean; localFileUri?: string }>;
  removeDownloadedTrack(options: { trackId: string }): Promise<{ success: boolean }>;
  getDownloadedTracks(): Promise<{ tracks: UnifiedTrack[] }>;

  // Event Listeners
  addListener(eventName: 'playbackStateChanged', listenerFunc: (event: NativePlaybackStateEvent) => void): Promise<{ remove: () => void }>;
  addListener(eventName: 'trackChanged', listenerFunc: (event: NativeTrackChangedEvent) => void): Promise<{ remove: () => void }>;
  addListener(eventName: 'playbackPositionUpdate', listenerFunc: (event: NativePositionEvent) => void): Promise<{ remove: () => void }>;
  addListener(eventName: 'queueUpdated', listenerFunc: (event: NativeQueueEvent) => void): Promise<{ remove: () => void }>;
  addListener(eventName: 'playerError', listenerFunc: (event: NativeErrorEvent) => void): Promise<{ remove: () => void }>;
  addListener(eventName: 'audioFocusChanged', listenerFunc: (event: NativeAudioFocusEvent) => void): Promise<{ remove: () => void }>;
  removeAllListeners(): Promise<void>;
}

/**
 * Audio Engine Interface
 * Abstract contract that both WebAudioEngine and NativeAndroidAudioEngine adhere to.
 */
export interface IAudioEngine {
  readonly engineType: AudioEngineType;
  isAvailable(): boolean;
  loadTrack(track: UnifiedTrack, options?: PlayOptions): Promise<boolean>;
  play(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionSeconds: number): Promise<void>;
  setVolume(volume: number): void;
  setMuted(isMuted: boolean): void;
  getCurrentPosition(): number;
  getDuration(): number;
  stop(): void;
  cleanup(): void;
}

/**
 * Centralized Queue Manager Interface
 */
export interface IQueueManager {
  readonly currentTrack: UnifiedTrack | null;
  readonly queue: UnifiedTrack[];
  readonly userQueue: UnifiedTrack[];
  readonly contextQueue: UnifiedTrack[];
  readonly contextIndex: number;
  readonly repeatMode: RepeatMode;
  readonly isShuffle: boolean;
  readonly history: { track: UnifiedTrack; timestamp: number }[];
  readonly historyCursor: number;

  setContextQueue(tracks: UnifiedTrack[], startIndex?: number): void;
  addToQueue(track: UnifiedTrack): void;
  playNext(track: UnifiedTrack): void;
  removeFromQueue(index: number): void;
  moveQueueItem(fromIndex: number, toIndex: number): void;
  clearUserQueue(): void;
  setShuffle(enabled: boolean): void;
  setRepeat(mode: RepeatMode): void;
  cycleRepeat(): RepeatMode;
  getNextTrack(options?: { isManualSkip?: boolean }): UnifiedTrack | null;
  getPreviousTrack(): UnifiedTrack | null;
  recordTrackPlayed(track: UnifiedTrack): void;
  syncFromNative(nativeQueue: UnifiedTrack[], currentIndex: number): void;
}

/**
 * Download Manager Interface
 */
export interface IDownloadManager {
  isDownloaded(trackId: string): boolean;
  getTrack(trackId: string): UnifiedTrack | null;
  getAllDownloaded(): Promise<UnifiedTrack[]>;
  download(track: UnifiedTrack): Promise<{ success: boolean; track: UnifiedTrack }>;
  delete(trackId: string): Promise<boolean>;
  getPlaybackUri(track: UnifiedTrack): Promise<string>;
}
