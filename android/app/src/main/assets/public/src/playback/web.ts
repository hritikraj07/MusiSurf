import { WebPlugin } from '@capacitor/core';
import type { 
  MusiSurfMediaPlugin, 
  UnifiedTrack, 
  PlaybackStateSnapshot, 
  RepeatMode 
} from './types';

export class MusiSurfMediaWeb extends WebPlugin implements MusiSurfMediaPlugin {
  async play(options?: { track?: UnifiedTrack; startTime?: number }): Promise<{ success: boolean }> {
    if (typeof window !== 'undefined' && (window as any).MusiSurfPlayback?.coordinator) {
      if (options?.track) {
        await (window as any).MusiSurfPlayback.coordinator.playTrack(options.track, null, { startTime: options.startTime });
      } else {
        await (window as any).MusiSurfPlayback.coordinator.resume();
      }
      return { success: true };
    }
    return { success: false };
  }

  async pause(): Promise<{ success: boolean }> {
    if (typeof window !== 'undefined' && (window as any).MusiSurfPlayback?.coordinator) {
      await (window as any).MusiSurfPlayback.coordinator.pause();
      return { success: true };
    }
    return { success: false };
  }

  async resume(): Promise<{ success: boolean }> {
    if (typeof window !== 'undefined' && (window as any).MusiSurfPlayback?.coordinator) {
      await (window as any).MusiSurfPlayback.coordinator.resume();
      return { success: true };
    }
    return { success: false };
  }

  async seek(options: { position: number }): Promise<{ success: boolean }> {
    if (typeof window !== 'undefined' && (window as any).MusiSurfPlayback?.coordinator) {
      await (window as any).MusiSurfPlayback.coordinator.seek(options.position);
      return { success: true };
    }
    return { success: false };
  }

  async next(): Promise<{ success: boolean }> {
    if (typeof window !== 'undefined' && (window as any).MusiSurfPlayback?.coordinator) {
      await (window as any).MusiSurfPlayback.coordinator.next({ isManualSkip: true });
      return { success: true };
    }
    return { success: false };
  }

  async previous(): Promise<{ success: boolean }> {
    if (typeof window !== 'undefined' && (window as any).MusiSurfPlayback?.coordinator) {
      await (window as any).MusiSurfPlayback.coordinator.previous();
      return { success: true };
    }
    return { success: false };
  }

  async setQueue(options: { queue: UnifiedTrack[]; startIndex?: number }): Promise<{ success: boolean }> {
    if (typeof window !== 'undefined' && (window as any).MusiSurfPlayback?.coordinator) {
      (window as any).MusiSurfPlayback.coordinator.queueManager.setContextQueue(options.queue, options.startIndex || 0);
      return { success: true };
    }
    return { success: false };
  }

  async getPlaybackState(): Promise<PlaybackStateSnapshot> {
    const coord = typeof window !== 'undefined' ? (window as any).MusiSurfPlayback?.coordinator : null;
    return {
      isPlaying: Boolean(coord?.isPlaying),
      status: coord?.isPlaying ? 'playing' : 'paused',
      currentTrack: coord?.currentTrack || null,
      position: coord?.getCurrentTime() || 0,
      duration: coord?.getDuration() || 0,
      volume: 0.8,
      isMuted: false,
      repeatMode: coord?.queueManager?.repeatMode || 'off',
      isShuffle: Boolean(coord?.queueManager?.isShuffle),
      activeEngine: 'web'
    };
  }

  async setShuffle(options: { enabled: boolean }): Promise<{ success: boolean }> {
    if (typeof window !== 'undefined' && (window as any).MusiSurfPlayback?.coordinator) {
      (window as any).MusiSurfPlayback.coordinator.setShuffle(options.enabled);
      return { success: true };
    }
    return { success: false };
  }

  async setRepeat(options: { mode: RepeatMode }): Promise<{ success: boolean }> {
    if (typeof window !== 'undefined' && (window as any).MusiSurfPlayback?.coordinator) {
      (window as any).MusiSurfPlayback.coordinator.setRepeat(options.mode);
      return { success: true };
    }
    return { success: false };
  }

  async getCurrentSong(): Promise<{ track: UnifiedTrack | null }> {
    const coord = typeof window !== 'undefined' ? (window as any).MusiSurfPlayback?.coordinator : null;
    return { track: coord?.currentTrack || null };
  }

  async getCurrentPosition(): Promise<{ position: number }> {
    const coord = typeof window !== 'undefined' ? (window as any).MusiSurfPlayback?.coordinator : null;
    return { position: coord?.getCurrentTime() || 0 };
  }

  async getDuration(): Promise<{ duration: number }> {
    const coord = typeof window !== 'undefined' ? (window as any).MusiSurfPlayback?.coordinator : null;
    return { duration: coord?.getDuration() || 0 };
  }

  async setVolume(options: { volume: number }): Promise<{ success: boolean }> {
    return { success: true };
  }

  async downloadTrack(options: { track: UnifiedTrack }): Promise<{ success: boolean; localFileUri?: string }> {
    const coord = typeof window !== 'undefined' ? (window as any).MusiSurfPlayback?.coordinator : null;
    if (coord?.downloadManager) {
      const res = await coord.downloadManager.download(options.track);
      return { success: true, localFileUri: res?.track?.localFileUri || undefined };
    }
    return { success: false };
  }

  async removeDownloadedTrack(options: { trackId: string }): Promise<{ success: boolean }> {
    const coord = typeof window !== 'undefined' ? (window as any).MusiSurfPlayback?.coordinator : null;
    if (coord?.downloadManager) {
      const ok = await coord.downloadManager.delete(options.trackId);
      return { success: ok };
    }
    return { success: false };
  }

  async getDownloadedTracks(): Promise<{ tracks: UnifiedTrack[] }> {
    const coord = typeof window !== 'undefined' ? (window as any).MusiSurfPlayback?.coordinator : null;
    if (coord?.downloadManager) {
      const tracks = await coord.downloadManager.getAllDownloaded();
      return { tracks };
    }
    return { tracks: [] };
  }
}
