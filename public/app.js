/**
 * MusiSurf — Complete Client Application
 * Ad-Free, Full-Length Music Streaming Web Player
 */

(function () {
  'use strict';

  // State Management
  const state = {
    currentTrack: null,
    isPlaying: false,
    queue: [],
    queueIndex: -1,
    history: [],
    isShuffled: false,
    shuffledQueue: [],
    repeatMode: 'off', // 'off', 'all', 'one'
    volume: 0.8,
    isMuted: false,
    currentView: 'home', // 'home', 'search', 'explore', 'liked', 'playlist', 'lyrics', 'visualizer'
    previousView: 'home',
    searchSource: 'all',
    likedSongs: [],
    offlineTracks: [],
    customPlaylists: [],
    activePlaylistId: null,
    lyrics: [],
    hasSyncedLyrics: false,
    activeLyricIndex: -1,
    vizMode: 'bars', // 'bars', 'wave', 'circle'
    ytPlayer: null,
    ytReady: false
  };

  // DOM Elements
  const elements = {
    // Audio elements
    audio: document.getElementById('audioPlayer'),
    ytContainer: document.getElementById('youtubePlayerContainer'),

    // Views
    views: {
      home: document.getElementById('homeView'),
      search: document.getElementById('searchView'),
      playlist: document.getElementById('playlistView'),
      lyrics: document.getElementById('lyricsView')
    },
    contentScroll: document.getElementById('contentScroll'),

    // Nav & Sidebar
    navHome: document.getElementById('navHomeBtn'),
    navSearch: document.getElementById('navSearchBtn'),
    navLiked: document.getElementById('navLikedBtn'),
    navDownloaded: document.getElementById('navDownloadedBtn'),
    navBrand: document.getElementById('navBrand'),
    customPlaylistsList: document.getElementById('customPlaylistsList'),
    createPlaylistBtn: document.getElementById('createPlaylistBtn'),
    likedCountMeta: document.getElementById('likedCountMeta'),
    downloadedCountMeta: document.getElementById('downloadedCountMeta'),

    // Header & Offline Banner
    offlineBanner: document.getElementById('offlineBanner'),
    globalSearchInput: document.getElementById('globalSearchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    historyBackBtn: document.getElementById('historyBackBtn'),
    historyForwardBtn: document.getElementById('historyForwardBtn'),

    // Home View
    greetingHeading: document.getElementById('greetingHeading'),
    quickPicksGrid: document.getElementById('quickPicksGrid'),
    shelvesContainer: document.getElementById('shelvesContainer'),

    // Search View
    searchBrowseSection: document.getElementById('searchBrowseSection'),
    searchLoading: document.getElementById('searchLoading'),
    searchResultsWrapper: document.getElementById('searchResultsWrapper'),
    searchEmptyState: document.getElementById('searchEmptyState'),
    topResultCard: document.getElementById('topResultCard'),
    topSongsList: document.getElementById('topSongsList'),
    fullSongsTable: document.getElementById('fullSongsTable'),
    resultsCount: document.getElementById('resultsCount'),

    // Playlist View
    playlistHero: document.getElementById('playlistHero'),
    playlistCoverArt: document.getElementById('playlistCoverArt'),
    playlistTitle: document.getElementById('playlistTitle'),
    playlistDesc: document.getElementById('playlistDesc'),
    playlistOwner: document.getElementById('playlistOwner'),
    playlistTrackCount: document.getElementById('playlistTrackCount'),
    playlistTotalTime: document.getElementById('playlistTotalTime'),
    playlistTracksBody: document.getElementById('playlistTracksBody'),
    playlistEmptyState: document.getElementById('playlistEmptyState'),
    playAllPlaylistBtn: document.getElementById('playAllPlaylistBtn'),
    shufflePlaylistBtn: document.getElementById('shufflePlaylistBtn'),
    deletePlaylistBtn: document.getElementById('deletePlaylistBtn'),

    // Lyrics View
    lyricsAlbumCover: document.getElementById('lyricsAlbumCover'),
    lyricsTrackTitle: document.getElementById('lyricsTrackTitle'),
    lyricsTrackArtist: document.getElementById('lyricsTrackArtist'),
    lyricsLoading: document.getElementById('lyricsLoading'),
    lyricsLinesContainer: document.getElementById('lyricsLinesContainer'),
    lyricsScrollBody: document.getElementById('lyricsScrollBody'),
    closeLyricsBtn: document.getElementById('closeLyricsBtn'),

    // Queue Drawer
    queueDrawer: document.getElementById('queueDrawer'),
    queueBtn: document.getElementById('queueBtn'),
    closeQueueBtn: document.getElementById('closeQueueBtn'),
    queueNowPlaying: document.getElementById('queueNowPlaying'),
    queueList: document.getElementById('queueList'),
    clearQueueBtn: document.getElementById('clearQueueBtn'),

    // Player Bar
    playerBar: document.getElementById('playerBar'),
    playerCoverImg: document.getElementById('playerCoverImg'),
    playerCoverWrapper: document.getElementById('playerCoverWrapper'),
    playerTitle: document.getElementById('playerTitle'),
    playerArtist: document.getElementById('playerArtist'),
    playerHeartBtn: document.getElementById('playerHeartBtn'),
    playerDownloadBtn: document.getElementById('playerDownloadBtn'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    prevBtn: document.getElementById('prevBtn'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    nextBtn: document.getElementById('nextBtn'),
    repeatBtn: document.getElementById('repeatBtn'),
    currentTimeLabel: document.getElementById('currentTimeLabel'),
    totalDurationLabel: document.getElementById('totalDurationLabel'),
    progressBar: document.getElementById('progressBar'),
    progressFill: document.getElementById('progressFill'),
    progressBuffer: document.getElementById('progressBuffer'),
    progressHoverTime: document.getElementById('progressHoverTime'),
    volumeBtn: document.getElementById('volumeBtn'),
    volumeBar: document.getElementById('volumeBar'),
    volumeFill: document.getElementById('volumeFill'),
    lyricsBtn: document.getElementById('lyricsBtn'),

    // PWA & Mobile Navigation
    pwaInstallBtn: document.getElementById('pwaInstallBtn'),
    mobileNavBar: document.getElementById('mobileNavBar'),
    mobNavHome: document.getElementById('mobNavHome'),
    mobNavSearch: document.getElementById('mobNavSearch'),
    mobNavLiked: document.getElementById('mobNavLiked'),
    mobNavDownloaded: document.getElementById('mobNavDownloaded'),
    mobNavInstall: document.getElementById('mobNavInstall'),

    // Mobile Fullscreen Player Modal
    mobilePlayerModal: document.getElementById('mobilePlayerModal'),
    closeMobilePlayerBtn: document.getElementById('closeMobilePlayerBtn'),
    mobPlayerCover: document.getElementById('mobPlayerCover'),
    mobPlayerTitle: document.getElementById('mobPlayerTitle'),
    mobPlayerArtist: document.getElementById('mobPlayerArtist'),
    mobPlayerHeartBtn: document.getElementById('mobPlayerHeartBtn'),
    mobProgressBar: document.getElementById('mobProgressBar'),
    mobProgressFill: document.getElementById('mobProgressFill'),
    mobCurrentTime: document.getElementById('mobCurrentTime'),
    mobTotalDuration: document.getElementById('mobTotalDuration'),
    mobPlayPauseBtn: document.getElementById('mobPlayPauseBtn'),
    mobPrevBtn: document.getElementById('mobPrevBtn'),
    mobNextBtn: document.getElementById('mobNextBtn'),
    mobShuffleBtn: document.getElementById('mobShuffleBtn'),
    mobRepeatBtn: document.getElementById('mobRepeatBtn'),
    mobLyricsBtn: document.getElementById('mobLyricsBtn'),
    mobDownloadBtn: document.getElementById('mobDownloadBtn'),
    mobDownloadActionBtn: document.getElementById('mobDownloadActionBtn'),

    // Modals
    createPlaylistModal: document.getElementById('createPlaylistModal'),
    createPlaylistForm: document.getElementById('createPlaylistForm'),
    playlistNameInput: document.getElementById('playlistNameInput'),
    playlistDescInput: document.getElementById('playlistDescInput'),
    closePlaylistModalBtn: document.getElementById('closePlaylistModalBtn'),
    cancelPlaylistBtn: document.getElementById('cancelPlaylistBtn'),

    addToPlaylistModal: document.getElementById('addToPlaylistModal'),
    modalPlaylistPickerList: document.getElementById('modalPlaylistPickerList'),
    closeAddToPlaylistBtn: document.getElementById('closeAddToPlaylistBtn'),

    shortcutsModal: document.getElementById('shortcutsModal'),
    openShortcutsBtn: document.getElementById('openShortcutsBtn'),
    closeShortcutsModalBtn: document.getElementById('closeShortcutsModalBtn'),

    toastContainer: document.getElementById('toastContainer')
  };

  // Web Audio Visualizer API State
  let audioCtx = null;
  let analyser = null;
  let audioSourceNode = null;
  let animationFrameId = null;

  // Track pending track to add to playlist
  let pendingTrackForPlaylist = null;

  // Search debounce timer
  let searchDebounceTimer = null;

  // Format seconds to mm:ss
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // Toast System
  function showToast(message, icon = '✓') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  // Local Storage Helpers
  function loadStoredData() {
    try {
      const storedLikes = localStorage.getItem('musisurf_liked');
      if (storedLikes) state.likedSongs = JSON.parse(storedLikes);

      const storedPlaylists = localStorage.getItem('musisurf_playlists');
      if (storedPlaylists) state.customPlaylists = JSON.parse(storedPlaylists);

      const storedVol = localStorage.getItem('musisurf_volume');
      if (storedVol !== null) {
        const v = parseFloat(storedVol);
        state.volume = (!isNaN(v) && v > 0.05) ? v : 0.8;
      }
    } catch (e) {
      console.warn('Error loading local storage data:', e);
    }
  }

  function saveStoredLikes() {
    try {
      localStorage.setItem('musisurf_liked', JSON.stringify(state.likedSongs));
      updateLikedCountUI();
    } catch (e) {
      console.warn('Error saving liked songs:', e);
    }
  }

  function saveStoredPlaylists() {
    try {
      localStorage.setItem('musisurf_playlists', JSON.stringify(state.customPlaylists));
      renderSidebarPlaylists();
    } catch (e) {
      console.warn('Error saving custom playlists:', e);
    }
  }

  function updateLikedCountUI() {
    if (elements.likedCountMeta) {
      elements.likedCountMeta.textContent = `${state.likedSongs.length} song${state.likedSongs.length === 1 ? '' : 's'} • Auto-saved`;
    }
  }

  // ==========================================================================
  // INDEXEDDB OFFLINE STORAGE FOR IN-APP OFFLINE PLAYBACK
  // ==========================================================================
  const OFFLINE_DB_NAME = 'MusiSurfOfflineDB';
  const OFFLINE_STORE_NAME = 'downloaded_songs';
  let dbPromise = null;

  function getOfflineDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(OFFLINE_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
            db.createObjectStore(OFFLINE_STORE_NAME, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function saveSongOfflineBlob(track) {
    if (!track) return;
    if (!track.audioUrl) {
      downloadSong(track);
      return;
    }

    showToast(`Saving "${track.title}" for in-app offline play...`, '⏳');
    try {
      let res;
      try {
        res = await fetch(track.audioUrl);
        if (!res.ok) throw new Error('Direct fetch failed');
      } catch (err) {
        // Fallback to local server proxy if direct fetch is blocked by CORS
        const proxyUrl = `/api/download?url=${encodeURIComponent(track.audioUrl)}&title=${encodeURIComponent(track.title)}`;
        res = await fetch(proxyUrl);
      }
      if (!res.ok) throw new Error('Audio stream fetch failed');
      const blob = await res.blob();

      const db = await getOfflineDB();
      const tx = db.transaction(OFFLINE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(OFFLINE_STORE_NAME);

      const record = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album || 'Single',
        image: track.image,
        duration: track.duration,
        durationStr: track.durationStr,
        source: track.source,
        audioBlob: blob,
        downloadedAt: Date.now()
      };

      store.put(record);

      tx.oncomplete = () => {
        const existingIdx = state.offlineTracks.findIndex(t => t.id === track.id);
        if (existingIdx >= 0) {
          state.offlineTracks[existingIdx] = record;
        } else {
          state.offlineTracks.unshift(record);
        }
        updateDownloadedCountUI();
        showToast(`Saved "${track.title}" for offline playback!`, '⚡');
        if (state.currentView === 'downloaded') {
          renderPlaylistView('downloaded');
        }
      };
    } catch (err) {
      console.warn('Offline in-app save error:', err);
      downloadSong(track);
    }
  }

  async function loadOfflineTracks() {
    try {
      const db = await getOfflineDB();
      const tx = db.transaction(OFFLINE_STORE_NAME, 'readonly');
      const store = tx.objectStore(OFFLINE_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        state.offlineTracks = req.result || [];
        updateDownloadedCountUI();
      };
    } catch (e) {
      console.warn('Error loading offline tracks:', e);
    }
  }

  function updateDownloadedCountUI() {
    if (elements.downloadedCountMeta) {
      const count = state.offlineTracks.length;
      elements.downloadedCountMeta.textContent = `${count} song${count === 1 ? '' : 's'} • Offline Ready`;
    }
  }

  // YouTube Iframe API Initialization
  window.onYouTubeIframeAPIReady = function () {
    state.ytPlayer = new YT.Player('ytPlayer', {
      height: '100',
      width: '100',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0
      },
      events: {
        onReady: () => {
          state.ytReady = true;
          console.log('YouTube Player API Ready');
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.PLAYING) {
            state.isPlaying = true;
            updatePlayPauseButton();
          } else if (event.data === YT.PlayerState.PAUSED) {
            state.isPlaying = false;
            updatePlayPauseButton();
          } else if (event.data === YT.PlayerState.ENDED) {
            onTrackEnded();
          }
        }
      }
    });
  };

  // Audio Context Setup (non-interfering, direct audio without CORS muting)
  function initAudioContext() {
    // Web Audio media node intentionally omitted to allow direct cross-origin audio streaming
  }

  // ==========================================================================
  // PLAYBACK CONTROLLER
  // ==========================================================================
  function playTrack(track, queueList = null) {
    if (!track) return;

    // Set queue if provided
    if (queueList && Array.isArray(queueList)) {
      state.queue = [...queueList];
      state.queueIndex = state.queue.findIndex(t => t.id === track.id);
      if (state.queueIndex === -1) {
        state.queue.unshift(track);
        state.queueIndex = 0;
      }
    } else if (state.queueIndex === -1 || !state.queue.find(t => t.id === track.id)) {
      state.queue.push(track);
      state.queueIndex = state.queue.length - 1;
    }

    state.currentTrack = track;

    // Update Player UI Metadata
    elements.playerTitle.textContent = track.title;
    elements.playerArtist.textContent = track.artist;
    elements.playerCoverImg.src = track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80';
    elements.totalDurationLabel.textContent = track.durationStr || formatTime(track.duration || 0);

    // Sync Mobile Fullscreen Player UI
    if (elements.mobPlayerTitle) elements.mobPlayerTitle.textContent = track.title;
    if (elements.mobPlayerArtist) elements.mobPlayerArtist.textContent = track.artist;
    if (elements.mobPlayerCover) elements.mobPlayerCover.src = track.image;
    if (elements.mobTotalDuration) elements.mobTotalDuration.textContent = track.durationStr || formatTime(track.duration || 0);

    // Update Like Heart
    updateHeartIcon(track.id);

    // Update Lyrics view headers
    if (elements.lyricsTrackTitle) elements.lyricsTrackTitle.textContent = track.title;
    if (elements.lyricsTrackArtist) elements.lyricsTrackArtist.textContent = track.artist;
    if (elements.lyricsAlbumCover) elements.lyricsAlbumCover.src = track.image || '';

    // Setup MediaSession for lockscreen / headphone controls
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || 'MusiSurf',
        artwork: [{ src: track.image, sizes: '500x500', type: 'image/jpeg' }]
      });
    }

    // Determine playback mechanism
    const offlineRecord = track.audioBlob ? track : state.offlineTracks.find(t => t.id === track.id);
    if (offlineRecord && offlineRecord.audioBlob) {
      // Offline Stored Audio Playback
      if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.stopVideo === 'function') {
        state.ytPlayer.stopVideo();
      }

      const blobUrl = URL.createObjectURL(offlineRecord.audioBlob);
      elements.audio.src = blobUrl;
      elements.audio.volume = state.isMuted ? 0 : state.volume;
      elements.audio.load();
      elements.audio.play().catch(err => {
        console.warn('Offline playback error:', err);
      });
    } else if (track.source === 'youtube' || !track.hasDirectAudio) {
      // YouTube Engine
      elements.audio.pause();
      if (state.ytReady && state.ytPlayer && track.ytId) {
        state.ytPlayer.loadVideoById(track.ytId);
        state.ytPlayer.setVolume(state.isMuted ? 0 : state.volume * 100);
        state.ytPlayer.playVideo();
      }
    } else {
      // Audio Stream via same-origin /api/stream proxy for 100% reliable 206 streaming without CORS/adblocker blocks
      if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.stopVideo === 'function') {
        state.ytPlayer.stopVideo();
      }

      // Ensure volume is audible and unmuted
      if (state.isMuted || state.volume <= 0.05) {
        setVolume(0.8);
      } else {
        elements.audio.volume = state.volume;
      }

      const streamUrl = track.streamUrl || (track.audioUrl ? `/api/stream?url=${encodeURIComponent(track.audioUrl)}` : null);
      if (!streamUrl && !track.audioUrl) {
        showToast('Audio stream unavailable for this track', '⚠');
        return;
      }

      elements.audio.src = streamUrl || track.audioUrl;
      const playPromise = elements.audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('Stream proxy play rejected, trying direct CDN stream:', err);
          if (track.audioUrl && elements.audio.src.includes('/api/stream')) {
            elements.audio.src = track.audioUrl;
            elements.audio.play().catch(directErr => console.warn('Direct stream fallback failed:', directErr));
          }
        });
      }
    }

    state.isPlaying = true;
    updatePlayPauseButton();
    updateQueueDrawerUI();
    highlightPlayingTrackInTables(track.id);

    // Fetch synchronized lyrics
    loadLyricsForTrack(track.title, track.artist);
  }

  function togglePlayPause() {
    if (!state.currentTrack) {
      // If nothing is playing, play first song from queue or quick picks or shelves
      if (state.queue.length > 0) {
        playTrack(state.queue[0]);
      } else {
        const firstSong = document.querySelector('.quick-pick-tile')?._trackData || document.querySelector('.track-card')?._trackData;
        if (firstSong) {
          playTrack(firstSong);
        }
      }
      return;
    }

    if (state.currentTrack.source === 'youtube') {
      if (!state.ytReady || !state.ytPlayer) return;
      const ytState = state.ytPlayer.getPlayerState();
      if (ytState === YT.PlayerState.PLAYING) {
        state.ytPlayer.pauseVideo();
        state.isPlaying = false;
      } else {
        state.ytPlayer.playVideo();
        state.isPlaying = true;
      }
    } else {
      if (elements.audio.paused) {
        const resumePromise = elements.audio.play();
        if (resumePromise !== undefined) {
          resumePromise.catch(err => {
            if (state.currentTrack?.audioUrl && !elements.audio.src.includes('/api/stream')) {
              elements.audio.src = `/api/stream?url=${encodeURIComponent(state.currentTrack.audioUrl)}`;
              elements.audio.volume = state.isMuted ? 0 : state.volume;
              elements.audio.play().catch(e => console.warn('Proxy resume error:', e));
            }
          });
        }
        state.isPlaying = true;
      } else {
        elements.audio.pause();
        state.isPlaying = false;
      }
    }

    updatePlayPauseButton();
  }

  function updatePlayPauseButton() {
    const playIcon = elements.playPauseBtn?.querySelector('.play-icon');
    const pauseIcon = elements.playPauseBtn?.querySelector('.pause-icon');
    if (playIcon && pauseIcon) {
      if (state.isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
      } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
      }
    }

    if (elements.mobPlayPauseBtn) {
      const mobPlay = elements.mobPlayPauseBtn.querySelector('.play-icon');
      const mobPause = elements.mobPlayPauseBtn.querySelector('.pause-icon');
      if (mobPlay && mobPause) {
        mobPlay.style.display = state.isPlaying ? 'none' : 'block';
        mobPause.style.display = state.isPlaying ? 'block' : 'none';
      }
    }
  }

  // Direct Audio Downloader for Mobile and Desktop + In-App Offline Cache
  function downloadSong(track) {
    if (!track) {
      showToast('No song currently selected to download', 'ℹ');
      return;
    }
    if (track.audioUrl) {
      // 1. Download file to device's Downloads directory
      const downloadUrl = `/api/download?url=${encodeURIComponent(track.audioUrl)}&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.setAttribute('download', `${track.title} - ${track.artist}.mp4`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 2. Also save to IndexedDB for seamless in-app offline playback
      saveSongOfflineBlob(track);
    } else if (track.ytId) {
      showToast(`Opening YouTube audio stream for "${track.title}"...`, '⬇');
      window.open(`https://www.youtube.com/watch?v=${track.ytId}`, '_blank');
    } else {
      showToast('Download stream unavailable for this track', '⚠');
    }
  }

  function nextTrack() {
    if (state.queue.length === 0) return;

    if (state.repeatMode === 'one' && state.currentTrack) {
      seekTo(0);
      playTrack(state.currentTrack);
      return;
    }

    let nextIdx = state.queueIndex + 1;
    if (nextIdx >= state.queue.length) {
      if (state.repeatMode === 'all') {
        nextIdx = 0;
      } else {
        return; // End of queue
      }
    }

    state.queueIndex = nextIdx;
    playTrack(state.queue[nextIdx]);
  }

  function prevTrack() {
    if (state.queue.length === 0) return;

    // If current song played more than 3 seconds, restart it
    const currentTime = getCurrentPlaybackTime();
    if (currentTime > 3) {
      seekTo(0);
      return;
    }

    let prevIdx = state.queueIndex - 1;
    if (prevIdx < 0) {
      prevIdx = state.queue.length - 1;
    }

    state.queueIndex = prevIdx;
    playTrack(state.queue[prevIdx]);
  }

  function onTrackEnded() {
    if (state.repeatMode === 'one') {
      seekTo(0);
      togglePlayPause();
    } else {
      nextTrack();
    }
  }

  function getCurrentPlaybackTime() {
    if (state.currentTrack && state.currentTrack.source === 'youtube') {
      return state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function' ? state.ytPlayer.getCurrentTime() : 0;
    }
    return elements.audio.currentTime || 0;
  }

  function getTotalDuration() {
    if (state.currentTrack && state.currentTrack.source === 'youtube') {
      return state.ytPlayer && typeof state.ytPlayer.getDuration === 'function' ? state.ytPlayer.getDuration() : (state.currentTrack.duration || 0);
    }
    return elements.audio.duration || state.currentTrack?.duration || 0;
  }

  function seekTo(seconds) {
    if (state.currentTrack && state.currentTrack.source === 'youtube') {
      if (state.ytPlayer && typeof state.ytPlayer.seekTo === 'function') {
        state.ytPlayer.seekTo(seconds, true);
      }
    } else {
      elements.audio.currentTime = seconds;
    }
  }

  function setVolume(pct) {
    state.volume = Math.max(0, Math.min(1, pct));
    state.isMuted = state.volume === 0;
    localStorage.setItem('musisurf_volume', state.volume.toString());

    elements.audio.volume = state.isMuted ? 0 : state.volume;
    if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.setVolume === 'function') {
      state.ytPlayer.setVolume(state.isMuted ? 0 : state.volume * 100);
    }

    if (elements.volumeFill) {
      elements.volumeFill.style.width = `${(state.isMuted ? 0 : state.volume) * 100}%`;
    }

    const volHigh = elements.volumeBtn?.querySelector('.vol-high');
    const volMuted = elements.volumeBtn?.querySelector('.vol-muted');
    if (volHigh && volMuted) {
      if (state.isMuted) {
        volHigh.style.display = 'none';
        volMuted.style.display = 'block';
      } else {
        volHigh.style.display = 'block';
        volMuted.style.display = 'none';
      }
    }
  }

  function toggleMute() {
    state.isMuted = !state.isMuted;
    setVolume(state.isMuted ? 0 : (state.volume || 0.8));
  }

  // Real-time Progress Bar Loop
  function updateProgress() {
    if (state.isPlaying && state.currentTrack) {
      const cur = getCurrentPlaybackTime();
      const dur = getTotalDuration();

      elements.currentTimeLabel.textContent = formatTime(cur);
      if (elements.mobCurrentTime) elements.mobCurrentTime.textContent = formatTime(cur);

      if (dur > 0) {
        const pct = Math.min(100, (cur / dur) * 100);
        elements.progressFill.style.width = `${pct}%`;
        if (elements.mobProgressFill) elements.mobProgressFill.style.width = `${pct}%`;

        // Update buffer bar for HTML5 audio
        if (elements.audio.buffered && elements.audio.buffered.length > 0) {
          const bufEnd = elements.audio.buffered.end(elements.audio.buffered.length - 1);
          elements.progressBuffer.style.width = `${Math.min(100, (bufEnd / dur) * 100)}%`;
        }
      }

      // Sync active lyric line
      syncLyricsWithTime(cur);
    }

    requestAnimationFrame(updateProgress);
  }

  // ==========================================================================
  // SYNCHRONIZED LYRICS ENGINE
  // ==========================================================================
  async function loadLyricsForTrack(title, artist) {
    elements.lyricsLoading.style.display = 'flex';
    elements.lyricsLinesContainer.innerHTML = '';
    state.lyrics = [];
    state.hasSyncedLyrics = false;
    state.activeLyricIndex = -1;

    try {
      const res = await fetch(`/api/lyrics?track=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
      const data = await res.json();

      elements.lyricsLoading.style.display = 'none';

      if (data.success && data.syncedLyrics) {
        // Parse LRC format [mm:ss.xx] line
        const parsed = parseLrc(data.syncedLyrics);
        if (parsed.length > 0) {
          state.lyrics = parsed;
          state.hasSyncedLyrics = true;
          renderLyricsLines(parsed);
          return;
        }
      }

      if (data.success && data.plainLyrics) {
        // Render plain lyrics
        renderPlainLyrics(data.plainLyrics);
        return;
      }

      // No lyrics found
      elements.lyricsLinesContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 60px 0;">
          <p style="font-size: 1.2rem; margin-bottom: 8px;">No synchronized lyrics available for this song.</p>
          <p style="font-size: 0.9rem; color: var(--text-muted);">Enjoy the music!</p>
        </div>
      `;
    } catch (err) {
      console.warn('Lyrics fetch failed:', err);
      elements.lyricsLoading.style.display = 'none';
    }
  }

  function parseLrc(lrcText) {
    const lines = lrcText.split('\n');
    const result = [];
    const timeReg = /\[(\d{2}):(\d{2})\.?(\d{2,3})?\]/g;

    for (const line of lines) {
      const matches = [...line.matchAll(timeReg)];
      const text = line.replace(timeReg, '').trim();

      if (text) {
        for (const match of matches) {
          const mins = parseInt(match[1], 10);
          const secs = parseInt(match[2], 10);
          const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
          const time = mins * 60 + secs + ms / 1000;
          result.push({ time, text });
        }
      }
    }

    result.sort((a, b) => a.time - b.time);
    return result;
  }

  function renderLyricsLines(lyrics) {
    elements.lyricsLinesContainer.innerHTML = '';
    lyrics.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'lyric-line';
      div.textContent = item.text;
      div.dataset.index = idx;
      div.dataset.time = item.time;
      div.addEventListener('click', () => {
        seekTo(item.time);
      });
      elements.lyricsLinesContainer.appendChild(div);
    });
  }

  function renderPlainLyrics(plainText) {
    elements.lyricsLinesContainer.innerHTML = '';
    plainText.split('\n').forEach(line => {
      if (line.trim()) {
        const div = document.createElement('div');
        div.className = 'lyric-line passed';
        div.textContent = line;
        elements.lyricsLinesContainer.appendChild(div);
      }
    });
  }

  function syncLyricsWithTime(currentTime) {
    if (!state.hasSyncedLyrics || state.lyrics.length === 0) return;

    let activeIdx = -1;
    for (let i = 0; i < state.lyrics.length; i++) {
      if (currentTime >= state.lyrics[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }

    if (activeIdx !== state.activeLyricIndex) {
      state.activeLyricIndex = activeIdx;
      const allLines = elements.lyricsLinesContainer.querySelectorAll('.lyric-line');

      allLines.forEach((lineEl, idx) => {
        if (idx === activeIdx) {
          lineEl.classList.add('active');
          lineEl.classList.remove('passed');

          // Smoothly scroll active line to center
          lineEl.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        } else if (idx < activeIdx) {
          lineEl.classList.remove('active');
          lineEl.classList.add('passed');
        } else {
          lineEl.classList.remove('active', 'passed');
        }
      });
    }
  }

  // ==========================================================================
  // WEB AUDIO SPECTRUM VISUALIZER
  // ==========================================================================
  function startVisualizer() {
    const canvas = elements.visualizerCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function draw() {
      animationFrameId = requestAnimationFrame(draw);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (!analyser || !state.isPlaying) {
        // Idle gentle wave animation
        drawIdleAnimation(ctx, w, h);
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      if (state.vizMode === 'bars') {
        const barWidth = (w / bufferLength) * 2.2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * h * 0.85;

          const grad = ctx.createLinearGradient(0, h, 0, h - barHeight);
          grad.addColorStop(0, '#1db954');
          grad.addColorStop(0.5, '#00f2fe');
          grad.addColorStop(1, '#ff2a85');

          ctx.fillStyle = grad;
          ctx.fillRect(x, h - barHeight, barWidth - 2, barHeight);

          x += barWidth;
        }
      } else if (state.vizMode === 'wave') {
        ctx.beginPath();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#00f2fe';
        ctx.shadowBlur = 16;
        ctx.shadowColor = '#00f2fe';

        const sliceWidth = w / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * h) / 2;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);

          x += sliceWidth;
        }

        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (state.vizMode === 'circle') {
        const centerX = w / 2;
        const centerY = h / 2;
        const radius = Math.min(w, h) * 0.22;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(29, 185, 84, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        for (let i = 0; i < bufferLength; i += 2) {
          const rad = (i / bufferLength) * 2 * Math.PI;
          const barLen = (dataArray[i] / 255) * (radius * 0.9);

          const x1 = centerX + Math.cos(rad) * radius;
          const y1 = centerY + Math.sin(rad) * radius;
          const x2 = centerX + Math.cos(rad) * (radius + barLen);
          const y2 = centerY + Math.sin(rad) * (radius + barLen);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineWidth = 3;
          ctx.strokeStyle = `hsl(${(i * 3) % 360}, 90%, 60%)`;
          ctx.stroke();
        }
      }
    }

    draw();
  }

  function drawIdleAnimation(ctx, w, h) {
    const time = Date.now() * 0.002;
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(29, 185, 84, 0.35)';

    for (let x = 0; x < w; x += 10) {
      const y = h / 2 + Math.sin(x * 0.01 + time) * 30;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ==========================================================================
  // DISCOVERY & HOME PAGE
  // ==========================================================================
  function setDynamicGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Good Evening';
    if (hour >= 5 && hour < 12) greeting = 'Good Morning';
    else if (hour >= 12 && hour < 18) greeting = 'Good Afternoon';
    elements.greetingHeading.textContent = greeting;
  }

  // Deduplicate and Shuffle to ensure no identical album thumbnails on home page
  function deduplicateAndShuffleAlbums(tracks, max = 10) {
    if (!tracks || !Array.isArray(tracks)) return [];
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    const seenAlbums = new Set();
    const seenImages = new Set();
    const seenTitles = new Set();
    const unique = [];

    for (const t of shuffled) {
      if (!t || !t.audioUrl) continue;
      const albumKey = (t.album || '').trim().toLowerCase();
      const isSingle = !albumKey || albumKey === 'single' || albumKey === 'singles';
      const titleKey = (t.title || '').trim().toLowerCase().replace(/\(.*\)|\[.*\]|- .*/g, '').trim();
      let imgKey = t.image || '';
      try {
        const u = new URL(t.image);
        imgKey = u.pathname.split('/').pop() || t.image;
      } catch (e) {
        imgKey = t.image;
      }

      if (!isSingle && seenAlbums.has(albumKey)) continue;
      if (imgKey && seenImages.has(imgKey)) continue;
      if (titleKey && seenTitles.has(titleKey)) continue;

      if (!isSingle) seenAlbums.add(albumKey);
      if (imgKey) seenImages.add(imgKey);
      if (titleKey) seenTitles.add(titleKey);

      unique.push(t);
      if (unique.length >= max) break;
    }
    return unique;
  }

  async function loadTrendingShelves() {
    try {
      const res = await fetch('/api/trending');
      const data = await res.json();

      if (!data.success || !data.sections) {
        elements.shelvesContainer.innerHTML = '<p style="padding: 40px; color: var(--text-secondary);">Trending music loaded.</p>';
        return;
      }

      elements.shelvesContainer.innerHTML = '';

      // Populate Quick Picks with 6 songs from distinct albums and distinct thumbnails
      const allTracks = [];
      data.sections.forEach(sec => allTracks.push(...sec.tracks));
      const quickPicks = deduplicateAndShuffleAlbums(allTracks, 6);
      renderQuickPicks(quickPicks);

      // Populate Curated Shelves - strictly unique albums & shuffled on each home load
      data.sections.forEach(section => {
        const distinctTracks = deduplicateAndShuffleAlbums(section.tracks, 10);
        const shelf = createShelfElement({ ...section, tracks: distinctTracks });
        elements.shelvesContainer.appendChild(shelf);
      });
    } catch (err) {
      console.warn('Failed to load trending shelves:', err);
      elements.shelvesContainer.innerHTML = '<p style="padding: 40px; color: var(--text-secondary);">Unable to load trending catalog. Use Search to play any song!</p>';
    }
  }

  function renderQuickPicks(tracks) {
    elements.quickPicksGrid.innerHTML = '';
    tracks.forEach(track => {
      const tile = document.createElement('div');
      tile.className = 'quick-pick-tile';
      tile._trackData = track;
      tile.innerHTML = `
        <img src="${track.image}" alt="${track.title}" class="quick-pick-img">
        <div class="quick-pick-info">
          <span class="quick-pick-title">${track.title}</span>
        </div>
        <button class="quick-pick-play-btn" title="Play Full Song">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </button>
      `;

      tile.addEventListener('click', () => {
        playTrack(track, tracks);
      });

      elements.quickPicksGrid.appendChild(tile);
    });
  }

  function createShelfElement(section) {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'shelf-section';
    sectionEl.dataset.shelfId = section.id;

    sectionEl.innerHTML = `
      <div class="shelf-header">
        <div>
          <h2 class="shelf-title">${section.title}</h2>
          <p class="shelf-subtitle">${section.subtitle}</p>
        </div>
      </div>
      <div class="shelf-cards-grid"></div>
    `;

    const grid = sectionEl.querySelector('.shelf-cards-grid');

    section.tracks.forEach(track => {
      const card = document.createElement('div');
      card.className = 'track-card';
      card._trackData = track;

      card.innerHTML = `
        <div class="card-img-wrapper">
          <img src="${track.image}" alt="${track.title}" class="card-img" loading="lazy">
          <button class="card-play-btn" title="Play">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </button>
        </div>
        <div class="card-info">
          <span class="card-title">${track.title}</span>
          <span class="card-artist">${track.artist}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        playTrack(track, section.tracks);
      });

      grid.appendChild(card);
    });

    return sectionEl;
  }

  // ==========================================================================
  // SEARCH ENGINE
  // ==========================================================================
  function handleSearchInput(e) {
    const query = e.target.value.trim();

    if (query.length > 0) {
      elements.clearSearchBtn.style.display = 'flex';
      switchView('search');

      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        performSearch(query);
      }, 300);
    } else {
      elements.clearSearchBtn.style.display = 'none';
      elements.searchResultsWrapper.style.display = 'none';
      elements.searchEmptyState.style.display = 'none';
      elements.searchBrowseSection.style.display = 'block';
    }
  }

  async function performSearch(query) {
    if (!query) return;
    switchView('search');
    elements.searchBrowseSection.style.display = 'none';
    elements.searchResultsWrapper.style.display = 'none';
    elements.searchEmptyState.style.display = 'none';
    elements.searchLoading.style.display = 'flex';

    try {
      const url = `/api/search?q=${encodeURIComponent(query)}&source=${state.searchSource}`;
      const res = await fetch(url);
      const data = await res.json();

      elements.searchLoading.style.display = 'none';

      if (!data.success || !data.results || data.results.length === 0) {
        elements.searchEmptyState.style.display = 'flex';
        return;
      }

      renderSearchResults(data.results);
    } catch (err) {
      console.warn('Search failed:', err);
      elements.searchLoading.style.display = 'none';
      elements.searchEmptyState.style.display = 'flex';
    }
  }

  function renderSearchResults(results) {
    elements.searchResultsWrapper.style.display = 'block';
    elements.resultsCount.textContent = results.length;

    // Top Result
    const top = results[0];
    elements.topResultCard.innerHTML = `
      <img src="${top.image}" alt="${top.title}" class="top-result-img">
      <h4 class="top-result-title">${top.title}</h4>
      <div class="top-result-meta">
        <span class="top-result-artist">${top.artist}</span>
        <span class="top-result-pill">Song</span>
      </div>
      <button class="top-result-play-btn" title="Play">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </button>
    `;

    elements.topResultCard.onclick = () => {
      playTrack(top, results);
    };

    // First 4 tracks in preview list
    elements.topSongsList.innerHTML = '';
    const previewSongs = results.slice(0, 4);
    previewSongs.forEach(track => {
      const row = createSongRow(track, results);
      elements.topSongsList.appendChild(row);
    });

    // All results table
    elements.fullSongsTable.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'tracks-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th class="col-title">Title</th>
          <th class="col-album">Album</th>
          <th class="col-actions"></th>
          <th class="col-duration">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');
    results.forEach((track, idx) => {
      const tr = createTableRow(track, idx + 1, results);
      tbody.appendChild(tr);
    });

    elements.fullSongsTable.appendChild(table);
  }

  function createSongRow(track, queueList) {
    const row = document.createElement('div');
    row.className = `song-row ${state.currentTrack?.id === track.id ? 'playing' : ''}`;
    row.dataset.trackId = track.id;

    const isLiked = state.likedSongs.some(s => s.id === track.id);

    row.innerHTML = `
      <img src="${track.image}" alt="${track.title}" class="song-thumb">
      <div class="song-info-col">
        <div class="song-title-text">${track.title}</div>
        <div class="song-artist-text">${track.artist}</div>
      </div>
      <button class="song-action-btn ${isLiked ? 'liked' : ''}" title="${isLiked ? 'Liked' : 'Save to Liked Songs'}">
        <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </button>
      <button class="song-action-btn download-song-trigger" title="Download Full Track (320kbps)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
      <span class="song-duration-text">${track.durationStr}</span>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.closest('.download-song-trigger')) {
        e.stopPropagation();
        downloadSong(track);
        return;
      }
      if (e.target.closest('.song-action-btn')) {
        e.stopPropagation();
        toggleLikeSong(track);
        return;
      }
      playTrack(track, queueList);
    });

    return row;
  }

  function createTableRow(track, index, queueList) {
    const tr = document.createElement('tr');
    tr.className = state.currentTrack?.id === track.id ? 'playing' : '';
    tr.dataset.trackId = track.id;

    const isLiked = state.likedSongs.some(s => s.id === track.id);

    tr.innerHTML = `
      <td class="col-num">${index}</td>
      <td class="col-title">
        <div class="table-title-cell">
          <img src="${track.image}" alt="${track.title}" class="table-cover" loading="lazy">
          <div>
            <div class="table-title-main">${track.title}</div>
            <div class="table-artist-sub">${track.artist}</div>
          </div>
        </div>
      </td>
      <td class="col-album">${track.album || 'Single'}</td>
      <td class="col-actions">
        <button class="song-action-btn ${isLiked ? 'liked' : ''}" title="${isLiked ? 'Liked' : 'Like'}">
          <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
        <button class="song-action-btn add-to-playlist-trigger" title="Add to Playlist">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button class="song-action-btn download-song-trigger" title="Download Song">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
      </td>
      <td class="col-duration">${track.durationStr}</td>
    `;

    tr.addEventListener('click', (e) => {
      if (e.target.closest('.download-song-trigger')) {
        e.stopPropagation();
        downloadSong(track);
        return;
      }
      if (e.target.closest('.add-to-playlist-trigger')) {
        e.stopPropagation();
        openAddToPlaylistModal(track);
        return;
      }
      if (e.target.closest('.song-action-btn')) {
        e.stopPropagation();
        toggleLikeSong(track);
        return;
      }
      playTrack(track, queueList);
    });

    return tr;
  }

  function highlightPlayingTrackInTables(trackId) {
    document.querySelectorAll('[data-track-id]').forEach(el => {
      if (el.dataset.trackId === trackId) {
        el.classList.add('playing');
      } else {
        el.classList.remove('playing');
      }
    });
  }

  // ==========================================================================
  // LIKED SONGS & PLAYLIST VIEW CONTROLLER
  // ==========================================================================
  function toggleLikeSong(track) {
    const idx = state.likedSongs.findIndex(s => s.id === track.id);
    if (idx >= 0) {
      state.likedSongs.splice(idx, 1);
      showToast(`Removed "${track.title}" from Liked Songs`, '♡');
    } else {
      state.likedSongs.unshift(track);
      showToast(`Added "${track.title}" to Liked Songs`, '♥');
    }
    saveStoredLikes();
    updateHeartIcon(state.currentTrack?.id);

    // Refresh view if currently in Liked view
    if (state.currentView === 'liked') {
      renderPlaylistView('liked');
    }

    // Update buttons in table
    document.querySelectorAll(`[data-track-id="${track.id}"] .song-action-btn`).forEach(btn => {
      const isLiked = state.likedSongs.some(s => s.id === track.id);
      btn.classList.toggle('liked', isLiked);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', isLiked ? 'currentColor' : 'none');
    });
  }

  function updateHeartIcon(currentTrackId) {
    const isLiked = state.likedSongs.some(s => s.id === currentTrackId);
    elements.playerHeartBtn.classList.toggle('liked', isLiked);
    const svg = elements.playerHeartBtn.querySelector('svg');
    if (svg) {
      svg.setAttribute('fill', isLiked ? 'currentColor' : 'none');
    }
  }

  function renderPlaylistView(playlistId) {
    switchView('playlist');
    state.activePlaylistId = playlistId;

    let title = 'Liked Songs';
    let desc = 'Your collection of favorite songs.';
    let tracks = [];
    let isCustom = false;

    if (playlistId === 'liked') {
      tracks = state.likedSongs;
      elements.deletePlaylistBtn.style.display = 'none';
      elements.playlistCoverArt.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      `;
    } else if (playlistId === 'downloaded') {
      title = 'Downloaded Songs';
      desc = 'Stored locally on your device. Listen anywhere 100% offline with zero internet!';
      tracks = state.offlineTracks;
      elements.deletePlaylistBtn.style.display = 'none';
      elements.playlistCoverArt.innerHTML = `
        <div style="width: 100%; height: 100%; background: linear-gradient(135deg, #0575E6 0%, #00F260 100%); display: flex; align-items: center; justify-content: center; border-radius: 8px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 75px; height: 75px; color: #fff;">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </div>
      `;
    } else {
      const pl = state.customPlaylists.find(p => p.id === playlistId);
      if (pl) {
        title = pl.name;
        desc = pl.description || 'Created by MusiSurf Listener';
        tracks = pl.tracks || [];
        isCustom = true;
        elements.deletePlaylistBtn.style.display = 'block';
        elements.playlistCoverArt.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
        `;
      }
    }

    elements.playlistTitle.textContent = title;
    elements.playlistDesc.textContent = desc;
    elements.playlistTrackCount.textContent = `${tracks.length} song${tracks.length === 1 ? '' : 's'}`;

    const totalSeconds = tracks.reduce((acc, t) => acc + (t.duration || 210), 0);
    const totalMinutes = Math.round(totalSeconds / 60);
    elements.playlistTotalTime.textContent = `${totalMinutes} min`;

    // Render table
    elements.playlistTracksBody.innerHTML = '';
    if (tracks.length === 0) {
      elements.playlistEmptyState.style.display = 'block';
    } else {
      elements.playlistEmptyState.style.display = 'none';
      tracks.forEach((track, idx) => {
        const tr = createTableRow(track, idx + 1, tracks);
        elements.playlistTracksBody.appendChild(tr);
      });
    }

    // Play All Click
    elements.playAllPlaylistBtn.onclick = () => {
      if (tracks.length > 0) playTrack(tracks[0], tracks);
    };

    // Shuffle Click
    elements.shufflePlaylistBtn.onclick = () => {
      if (tracks.length > 0) {
        const shuffled = [...tracks].sort(() => Math.random() - 0.5);
        playTrack(shuffled[0], shuffled);
      }
    };

    // Delete custom playlist
    elements.deletePlaylistBtn.onclick = () => {
      if (confirm(`Delete playlist "${title}"?`)) {
        state.customPlaylists = state.customPlaylists.filter(p => p.id !== playlistId);
        saveStoredPlaylists();
        switchView('home');
        showToast(`Playlist deleted`);
      }
    };
  }

  function renderSidebarPlaylists() {
    elements.customPlaylistsList.innerHTML = '';
    state.customPlaylists.forEach(pl => {
      const div = document.createElement('div');
      div.className = 'playlist-list-item';
      div.innerHTML = `
        <div class="playlist-cover-mini">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
          </svg>
        </div>
        <div class="library-item-info">
          <span class="library-item-title">${pl.name}</span>
          <span class="library-item-meta">Playlist • ${pl.tracks?.length || 0} songs</span>
        </div>
      `;
      div.addEventListener('click', () => {
        renderPlaylistView(pl.id);
      });
      elements.customPlaylistsList.appendChild(div);
    });
  }

  // ==========================================================================
  // QUEUE DRAWER CONTROLLER
  // ==========================================================================
  function updateQueueDrawerUI() {
    // Now playing
    if (state.currentTrack) {
      elements.queueNowPlaying.innerHTML = `
        <img src="${state.currentTrack.image}" alt="${state.currentTrack.title}" class="queue-img">
        <div class="queue-card-info">
          <div class="queue-card-title">${state.currentTrack.title}</div>
          <div class="queue-card-artist">${state.currentTrack.artist}</div>
        </div>
      `;
    } else {
      elements.queueNowPlaying.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Nothing currently playing</span>';
    }

    // Next up list
    elements.queueList.innerHTML = '';
    const upcoming = state.queue.slice(state.queueIndex + 1);

    if (upcoming.length === 0) {
      elements.queueList.innerHTML = '<span style="color: var(--text-muted); font-size: 0.82rem; padding: 10px 0;">No upcoming songs in queue</span>';
    } else {
      upcoming.forEach((t, i) => {
        const card = document.createElement('div');
        card.className = 'queue-card';
        card.innerHTML = `
          <img src="${t.image}" alt="${t.title}" class="queue-img">
          <div class="queue-card-info">
            <div class="queue-card-title">${t.title}</div>
            <div class="queue-card-artist">${t.artist}</div>
          </div>
          <button class="icon-sub-btn remove-queue-btn" title="Remove" style="padding: 4px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        `;

        card.querySelector('.remove-queue-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          state.queue.splice(state.queueIndex + 1 + i, 1);
          updateQueueDrawerUI();
        });

        card.addEventListener('click', () => {
          state.queueIndex = state.queueIndex + 1 + i;
          playTrack(t);
        });

        elements.queueList.appendChild(card);
      });
    }
  }

  // ==========================================================================
  // VIEW NAVIGATION CONTROLLER
  // ==========================================================================
  function switchView(viewName) {
    if (state.currentView === viewName) return;

    state.previousView = state.currentView;
    state.currentView = viewName;

    // Toggle active view element
    Object.keys(elements.views).forEach(key => {
      if (elements.views[key]) {
        elements.views[key].classList.toggle('active', key === viewName);
      }
    });

    // Update active nav button
    if (elements.navHome) elements.navHome.classList.toggle('active', viewName === 'home');
    if (elements.navSearch) elements.navSearch.classList.toggle('active', viewName === 'search');
    if (elements.navExplore) elements.navExplore.classList.toggle('active', viewName === 'explore');
    if (elements.navLiked) elements.navLiked.classList.toggle('active', viewName === 'liked');

    if (elements.lyricsBtn) elements.lyricsBtn.classList.toggle('active', viewName === 'lyrics');

    // Scroll to top
    if (elements.contentScroll) elements.contentScroll.scrollTop = 0;
  }

  // Modal Helpers
  function openAddToPlaylistModal(track) {
    pendingTrackForPlaylist = track;
    elements.modalPlaylistPickerList.innerHTML = '';

    if (state.customPlaylists.length === 0) {
      elements.modalPlaylistPickerList.innerHTML = `
        <div style="text-align: center; padding: 24px 0; color: var(--text-secondary);">
          <p>No custom playlists created yet.</p>
          <button class="btn-primary" style="margin-top: 12px;" id="createFirstPlaylistBtn">+ Create Playlist</button>
        </div>
      `;
      document.getElementById('createFirstPlaylistBtn')?.addEventListener('click', () => {
        elements.addToPlaylistModal.style.display = 'none';
        elements.createPlaylistModal.style.display = 'flex';
      });
    } else {
      state.customPlaylists.forEach(pl => {
        const item = document.createElement('div');
        item.className = 'library-item';
        item.innerHTML = `
          <div class="playlist-cover-mini">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"/>
              <line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
            </svg>
          </div>
          <div class="library-item-info">
            <span class="library-item-title">${pl.name}</span>
            <span class="library-item-meta">${pl.tracks?.length || 0} songs</span>
          </div>
        `;
        item.addEventListener('click', () => {
          if (!pl.tracks) pl.tracks = [];
          if (!pl.tracks.some(t => t.id === track.id)) {
            pl.tracks.push(track);
            saveStoredPlaylists();
            showToast(`Added to "${pl.name}"`);
          } else {
            showToast(`Already in "${pl.name}"`);
          }
          elements.addToPlaylistModal.style.display = 'none';
        });
        elements.modalPlaylistPickerList.appendChild(item);
      });
    }

    elements.addToPlaylistModal.style.display = 'flex';
  }

  // ==========================================================================
  // EVENT LISTENERS & SETUP
  // ==========================================================================
  function setupEventListeners() {
    // Navigation
    elements.navHome.addEventListener('click', () => switchView('home'));
    elements.navBrand.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('home');
    });
    elements.navSearch.addEventListener('click', () => {
      switchView('search');
      elements.globalSearchInput.focus();
    });
    if (elements.navExplore) {
      elements.navExplore.addEventListener('click', () => {
        switchView('search');
        elements.globalSearchInput.focus();
      });
    }
    elements.navLiked.addEventListener('click', () => {
      renderPlaylistView('liked');
    });

    // Header Search
    elements.globalSearchInput.addEventListener('input', handleSearchInput);
    elements.globalSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(searchDebounceTimer);
        const query = elements.globalSearchInput.value.trim();
        if (query) {
          switchView('search');
          performSearch(query);
        }
      }
    });
    elements.clearSearchBtn.addEventListener('click', () => {
      elements.globalSearchInput.value = '';
      elements.clearSearchBtn.style.display = 'none';
      elements.searchResultsWrapper.style.display = 'none';
      elements.searchEmptyState.style.display = 'none';
      elements.searchBrowseSection.style.display = 'block';
      elements.globalSearchInput.focus();
    });

    // Category / Mood Cards in Search View
    document.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => {
        const query = card.dataset.query;
        if (query) {
          elements.globalSearchInput.value = query;
          elements.clearSearchBtn.style.display = 'flex';
          switchView('search');
          performSearch(query);
        }
      });
    });

    // Source Filter Pills in Search View
    document.querySelectorAll('.source-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.source-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.searchSource = pill.dataset.source;
        const currentQ = elements.globalSearchInput.value.trim();
        if (currentQ) performSearch(currentQ);
      });
    });

    // Home Filter Pills
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const filter = pill.dataset.filter;

        document.querySelectorAll('.shelf-section').forEach(shelf => {
          if (filter === 'all') {
            shelf.style.display = 'flex';
          } else if (filter === 'charts' && shelf.dataset.shelfId === 'global-hits') {
            shelf.style.display = 'flex';
          } else if (filter === 'lofi' && shelf.dataset.shelfId === 'chill-lofi') {
            shelf.style.display = 'flex';
          } else if (filter === 'energy' && shelf.dataset.shelfId === 'electronic-energy') {
            shelf.style.display = 'flex';
          } else if (filter === 'soul' && shelf.dataset.shelfId === 'acoustic-soul') {
            shelf.style.display = 'flex';
          } else if (filter === 'desi' && shelf.dataset.shelfId === 'bollywood-pop') {
            shelf.style.display = 'flex';
          } else {
            shelf.style.display = 'none';
          }
        });
      });
    });

    // Player Controls
    elements.playPauseBtn.addEventListener('click', togglePlayPause);
    elements.nextBtn.addEventListener('click', nextTrack);
    elements.prevBtn.addEventListener('click', prevTrack);
    elements.playerHeartBtn.addEventListener('click', () => {
      if (state.currentTrack) toggleLikeSong(state.currentTrack);
    });

    // Repeat Mode Toggle
    elements.repeatBtn.addEventListener('click', () => {
      const repeatOneInd = elements.repeatBtn.querySelector('.repeat-one-indicator');
      if (state.repeatMode === 'off') {
        state.repeatMode = 'all';
        elements.repeatBtn.classList.add('active');
        repeatOneInd.style.display = 'none';
        showToast('Repeat Queue On');
      } else if (state.repeatMode === 'all') {
        state.repeatMode = 'one';
        elements.repeatBtn.classList.add('active');
        repeatOneInd.style.display = 'flex';
        showToast('Repeat One On');
      } else {
        state.repeatMode = 'off';
        elements.repeatBtn.classList.remove('active');
        repeatOneInd.style.display = 'none';
        showToast('Repeat Off');
      }
    });

    // Shuffle Mode Toggle
    elements.shuffleBtn.addEventListener('click', () => {
      state.isShuffled = !state.isShuffled;
      elements.shuffleBtn.classList.toggle('active', state.isShuffled);
      if (state.isShuffled && state.queue.length > 1) {
        state.queue.sort(() => Math.random() - 0.5);
        showToast('Queue Shuffled');
      } else {
        showToast('Shuffle Off');
      }
      updateQueueDrawerUI();
    });

    // Scrubber Interactions
    elements.progressBar.addEventListener('click', (e) => {
      const rect = elements.progressBar.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      const targetTime = pct * getTotalDuration();
      seekTo(targetTime);
    });

    elements.progressBar.addEventListener('mousemove', (e) => {
      const rect = elements.progressBar.getBoundingClientRect();
      const hoverX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, hoverX / rect.width));
      const dur = getTotalDuration();
      elements.progressHoverTime.style.left = `${hoverX}px`;
      elements.progressHoverTime.textContent = formatTime(pct * dur);
    });

    // Movable Volume Slider (Interactive Drag for Mouse & Touch)
    let isDraggingVolume = false;

    function handleVolumeChange(e) {
      const rect = elements.volumeBar.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setVolume(pct);
    }

    elements.volumeBtn.addEventListener('click', toggleMute);

    elements.volumeBar.addEventListener('mousedown', (e) => {
      isDraggingVolume = true;
      elements.volumeBar.classList.add('dragging');
      handleVolumeChange(e);
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingVolume) return;
      handleVolumeChange(e);
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingVolume) {
        isDraggingVolume = false;
        elements.volumeBar.classList.remove('dragging');
      }
    });

    // Touch support for mobile devices
    elements.volumeBar.addEventListener('touchstart', (e) => {
      isDraggingVolume = true;
      elements.volumeBar.classList.add('dragging');
      handleVolumeChange(e);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!isDraggingVolume) return;
      handleVolumeChange(e);
    }, { passive: false });

    window.addEventListener('touchend', () => {
      if (isDraggingVolume) {
        isDraggingVolume = false;
        elements.volumeBar.classList.remove('dragging');
      }
    });

    // Queue Drawer Toggle
    elements.queueBtn.addEventListener('click', () => {
      elements.queueDrawer.classList.toggle('open');
      elements.queueBtn.classList.toggle('active', elements.queueDrawer.classList.contains('open'));
    });
    elements.closeQueueBtn.addEventListener('click', () => {
      elements.queueDrawer.classList.remove('open');
      elements.queueBtn.classList.remove('active');
    });
    elements.clearQueueBtn.addEventListener('click', () => {
      state.queue = state.currentTrack ? [state.currentTrack] : [];
      state.queueIndex = 0;
      updateQueueDrawerUI();
      showToast('Queue cleared');
    });

    // Lyrics View Toggle
    const toggleLyricsView = () => {
      if (state.currentView === 'lyrics') {
        switchView(state.previousView || 'home');
      } else {
        switchView('lyrics');
      }
    };
    if (elements.lyricsBtn) elements.lyricsBtn.addEventListener('click', toggleLyricsView);
    if (elements.closeLyricsBtn) elements.closeLyricsBtn.addEventListener('click', () => switchView('home'));

    // Expand Album Art click
    elements.playerCoverWrapper.addEventListener('click', () => {
      if (state.currentTrack) {
        window.open(state.currentTrack.image, '_blank');
      }
    });

    // Create Playlist Modal
    elements.createPlaylistBtn.addEventListener('click', () => {
      elements.createPlaylistModal.style.display = 'flex';
      elements.playlistNameInput.focus();
    });
    elements.closePlaylistModalBtn.addEventListener('click', () => {
      elements.createPlaylistModal.style.display = 'none';
    });
    elements.cancelPlaylistBtn.addEventListener('click', () => {
      elements.createPlaylistModal.style.display = 'none';
    });

    elements.createPlaylistForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = elements.playlistNameInput.value.trim();
      const desc = elements.playlistDescInput.value.trim();
      if (!name) return;

      const newPl = {
        id: 'pl_' + Date.now(),
        name,
        description: desc,
        tracks: []
      };

      state.customPlaylists.push(newPl);
      saveStoredPlaylists();
      elements.createPlaylistModal.style.display = 'none';
      elements.playlistNameInput.value = '';
      elements.playlistDescInput.value = '';
      showToast(`Created playlist "${name}"`);
      renderPlaylistView(newPl.id);
    });

    // Add to Playlist Modal Close
    elements.closeAddToPlaylistBtn.addEventListener('click', () => {
      elements.addToPlaylistModal.style.display = 'none';
    });

    // Shortcuts Modal
    elements.openShortcutsBtn.addEventListener('click', () => {
      elements.shortcutsModal.style.display = 'flex';
    });
    elements.closeShortcutsModalBtn.addEventListener('click', () => {
      elements.shortcutsModal.style.display = 'none';
    });

    // Close Modals on Backdrop Click
    [elements.createPlaylistModal, elements.addToPlaylistModal, elements.shortcutsModal].forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    });

    // Audio Element Native Events
    elements.audio.addEventListener('ended', onTrackEnded);
    elements.audio.addEventListener('error', (err) => {
      console.warn('Audio stream error event:', err);
      if (state.currentTrack?.audioUrl && !elements.audio.src.includes('/api/stream')) {
        console.log('Switching to MusiSurf stream proxy after error...');
        elements.audio.src = `/api/stream?url=${encodeURIComponent(state.currentTrack.audioUrl)}`;
        elements.audio.volume = state.isMuted ? 0 : state.volume;
        elements.audio.load();
        elements.audio.play().catch(e => console.warn('Proxy retry error:', e));
      } else if (state.currentTrack && !state.currentTrack.isFallbackAttempted) {
        state.currentTrack.isFallbackAttempted = true;
        fetch(`/api/search?q=${encodeURIComponent(state.currentTrack.title + ' ' + state.currentTrack.artist)}&source=youtube`)
          .then(r => r.json())
          .then(data => {
            if (data.results && data.results.length > 0) {
              playTrack(data.results[0]);
            }
          })
          .catch(e => console.warn('YouTube fallback failed:', e));
      }
    });

    // PWA Install Prompt Handling
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (elements.pwaInstallBtn) elements.pwaInstallBtn.style.display = 'flex';
      console.log('MusiSurf PWA beforeinstallprompt captured');
    });

    const triggerPwaInstall = () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            showToast('Installing MusiSurf to your device...', '📲');
          }
          deferredPrompt = null;
        });
      } else {
        showToast('To install MusiSurf on mobile: tap browser menu (⋮ or Share ⎋) -> "Install App" or "Add to Home Screen"!', '📲');
      }
    };

    if (elements.pwaInstallBtn) elements.pwaInstallBtn.addEventListener('click', triggerPwaInstall);
    if (elements.mobNavInstall) elements.mobNavInstall.addEventListener('click', triggerPwaInstall);

    // Mobile Bottom Navigation Tabs
    const updateMobNav = (btnId) => {
      [elements.mobNavHome, elements.mobNavSearch, elements.mobNavLiked, elements.mobNavDownloaded, elements.mobNavInstall].forEach(btn => {
        if (btn) btn.classList.toggle('active', btn.id === btnId);
      });
    };

    if (elements.mobNavHome) elements.mobNavHome.addEventListener('click', () => {
      switchView('home');
      updateMobNav('mobNavHome');
    });
    if (elements.mobNavSearch) elements.mobNavSearch.addEventListener('click', () => {
      switchView('search');
      elements.globalSearchInput.focus();
      updateMobNav('mobNavSearch');
    });
    if (elements.mobNavLiked) elements.mobNavLiked.addEventListener('click', () => {
      renderPlaylistView('liked');
      updateMobNav('mobNavLiked');
    });
    if (elements.mobNavDownloaded) elements.mobNavDownloaded.addEventListener('click', () => {
      renderPlaylistView('downloaded');
      updateMobNav('mobNavDownloaded');
    });

    // Mobile Mini-Player Bar Click -> Opens Fullscreen Mobile Player
    elements.playerBar.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        if (e.target.closest('#playPauseBtn') || e.target.closest('#playerHeartBtn') || e.target.closest('#playerDownloadBtn')) {
          return;
        }
        if (state.currentTrack) {
          elements.mobilePlayerModal.style.display = 'flex';
        }
      }
    });

    if (elements.closeMobilePlayerBtn) {
      elements.closeMobilePlayerBtn.addEventListener('click', () => {
        elements.mobilePlayerModal.style.display = 'none';
      });
    }

    if (elements.playerDownloadBtn) {
      elements.playerDownloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadSong(state.currentTrack);
      });
    }

    if (elements.mobDownloadBtn) elements.mobDownloadBtn.addEventListener('click', () => downloadSong(state.currentTrack));
    if (elements.mobDownloadActionBtn) elements.mobDownloadActionBtn.addEventListener('click', () => downloadSong(state.currentTrack));

    if (elements.mobLyricsBtn) {
      elements.mobLyricsBtn.addEventListener('click', () => {
        elements.mobilePlayerModal.style.display = 'none';
        switchView('lyrics');
      });
    }

    if (elements.mobPlayPauseBtn) elements.mobPlayPauseBtn.addEventListener('click', togglePlayPause);
    if (elements.mobNextBtn) elements.mobNextBtn.addEventListener('click', nextTrack);
    if (elements.mobPrevBtn) elements.mobPrevBtn.addEventListener('click', prevTrack);
    if (elements.mobShuffleBtn) elements.mobShuffleBtn.addEventListener('click', () => elements.shuffleBtn.click());
    if (elements.mobRepeatBtn) elements.mobRepeatBtn.addEventListener('click', () => elements.repeatBtn.click());
    if (elements.mobPlayerHeartBtn) elements.mobPlayerHeartBtn.addEventListener('click', () => {
      if (state.currentTrack) toggleLikeSong(state.currentTrack);
    });

    // Mobile scrubber seek
    if (elements.mobProgressBar) {
      elements.mobProgressBar.addEventListener('click', (e) => {
        const rect = elements.mobProgressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, clickX / rect.width));
        seekTo(pct * getTotalDuration());
      });
    }

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Don't trigger if typing in an input
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        if (e.key === 'Escape') {
          document.activeElement.blur();
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'ArrowRight' && e.ctrlKey) {
        e.preventDefault();
        nextTrack();
      } else if (e.key === 'ArrowLeft' && e.ctrlKey) {
        e.preventDefault();
        prevTrack();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekTo(getCurrentPlaybackTime() + 5);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekTo(Math.max(0, getCurrentPlaybackTime() - 5));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVolume(state.volume + 0.05);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume(state.volume - 0.05);
      } else if (e.key.toLowerCase() === 'm') {
        toggleMute();
      } else if (e.key.toLowerCase() === 'l') {
        toggleLyricsView();
      } else if (e.key.toLowerCase() === 'q') {
        elements.queueDrawer.classList.toggle('open');
      } else if (e.key === '/') {
        e.preventDefault();
        switchView('search');
        elements.globalSearchInput.focus();
      } else if (e.key === 'Escape') {
        elements.queueDrawer.classList.remove('open');
        elements.createPlaylistModal.style.display = 'none';
        elements.addToPlaylistModal.style.display = 'none';
        elements.shortcutsModal.style.display = 'none';
        if (elements.mobilePlayerModal) elements.mobilePlayerModal.style.display = 'none';
      }
    });
    if (elements.navDownloaded) {
      elements.navDownloaded.addEventListener('click', () => {
        renderPlaylistView('downloaded');
      });
    }

    // Network connection status changes
    function handleNetworkChange() {
      const isOnline = navigator.onLine;
      if (elements.offlineBanner) {
        elements.offlineBanner.style.display = isOnline ? 'none' : 'flex';
      }
      if (!isOnline) {
        showToast('Offline Mode: Internet disconnected. Playing from your Downloaded songs.', '⚡');
        if (state.offlineTracks.length > 0 && state.currentView === 'home') {
          renderPlaylistView('downloaded');
        }
      } else {
        showToast('Internet reconnected!', '🌐');
      }
    }

    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);
    if (!navigator.onLine && elements.offlineBanner) {
      elements.offlineBanner.style.display = 'flex';
    }
  }

  // ==========================================================================
  // INITIALIZE APP
  // ==========================================================================
  function init() {
    loadStoredData();
    loadOfflineTracks();
    setDynamicGreeting();
    setVolume(state.volume);
    updateLikedCountUI();
    renderSidebarPlaylists();
    setupEventListeners();
    loadTrendingShelves();
    updateProgress();

    // Register PWA Service Worker for Mobile Caching and Installation
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
          reg.update(); // Immediately check for updates
          console.log('🌊 MusiSurf Service Worker registered:', reg.scope);
        }).catch((err) => {
          console.warn('SW registration:', err);
        });
      });
    }

    console.log('🌊 MusiSurf Client Initialized');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
