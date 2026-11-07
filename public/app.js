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
    currentView: 'home', // 'home', 'search', 'explore', 'liked', 'playlist', 'lyrics', 'localMusic'
    previousView: 'home',
    searchSource: 'all',
    likedSongs: [],
    offlineTracks: [],
    customPlaylists: [],
    activePlaylistId: null,
    activePlaylistTracks: null,
    isPlaylistShuffle: false,
    lyrics: [],
    hasSyncedLyrics: false,
    activeLyricIndex: -1,
    vizMode: 'bars', // 'bars', 'wave', 'circle'
    ytPlayer: null,
    ytReady: false,
    settings: {
      removeDeadSilence: true
    },
    userQueuedCount: 0,
    localTracks: [],
    isTrimmingStartSilence: false,
    trailingSilenceFrames: 0,
    isDraggingProgress: false,
    allAvailableTracks: [],
    sleepTimer: {
      timeoutId: null,
      intervalId: null,
      targetTime: null,
      durationMinutes: 0
    },
    contextTrack: null
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
      lyrics: document.getElementById('lyricsView'),
      localMusic: document.getElementById('localMusicView'),
      library: document.getElementById('libraryView')
    },
    contentScroll: document.getElementById('contentScroll'),

    // Nav & Sidebar
    navHome: document.getElementById('navHomeBtn'),
    navSearch: document.getElementById('navSearchBtn'),
    navLiked: document.getElementById('navLikedBtn'),
    navDownloaded: document.getElementById('navDownloadedBtn'),
    navLocalMusic: document.getElementById('navLocalMusicBtn'),
    navBrand: document.getElementById('navBrand'),
    customPlaylistsList: document.getElementById('customPlaylistsList'),
    createPlaylistBtn: document.getElementById('createPlaylistBtn'),
    likedCountMeta: document.getElementById('likedCountMeta'),
    downloadedCountMeta: document.getElementById('downloadedCountMeta'),
    localCountMeta: document.getElementById('localCountMeta'),

    // Library Hub View Elements
    libViewCreatePlaylistBtn: document.getElementById('libViewCreatePlaylistBtn'),
    libHubLikedBtn: document.getElementById('libHubLikedBtn'),
    libHubDownloadedBtn: document.getElementById('libHubDownloadedBtn'),
    libHubLocalBtn: document.getElementById('libHubLocalBtn'),
    libHubLikedMeta: document.getElementById('libHubLikedMeta'),
    libHubDownloadedMeta: document.getElementById('libHubDownloadedMeta'),
    libHubLocalMeta: document.getElementById('libHubLocalMeta'),
    libCustomPlaylistsGrid: document.getElementById('libCustomPlaylistsGrid'),
    libHubSettingsBtn: document.getElementById('libHubSettingsBtn'),

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
    playlistBackBtn: document.getElementById('playlistBackBtn'),

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
    queueDrawerBackdrop: document.getElementById('queueDrawerBackdrop'),
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
    miniPlayerTrack: document.getElementById('miniPlayerTrack'),
    miniPlayerFill: document.getElementById('miniPlayerFill'),

    // PWA & Mobile Navigation (Strictly Home, Search, Library)
    pwaInstallBtn: document.getElementById('pwaInstallBtn'),
    mobileNavBar: document.getElementById('mobileNavBar'),
    mobNavHome: document.getElementById('mobNavHome'),
    mobNavSearch: document.getElementById('mobNavSearch'),
    mobNavLibrary: document.getElementById('mobNavLibrary'),

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
    mobPlayerLyricsBtn: document.getElementById('mobPlayerLyricsBtn'),
    mobPlayerShareBtn: document.getElementById('mobPlayerShareBtn'),
    mobPlayerTimerBtn: document.getElementById('mobPlayerTimerBtn'),
    mobTimerBadge: document.getElementById('mobTimerBadge'),
    mobPlayerOptionsBtn: document.getElementById('mobPlayerOptionsBtn'),

    // Mobile Player 3-Bar Options Bottom Sheet
    mobTrackOptionsModal: document.getElementById('mobTrackOptionsModal'),
    closeMobOptionsBtn: document.getElementById('closeMobOptionsBtn'),
    mobOptCover: document.getElementById('mobOptCover'),
    mobOptTitle: document.getElementById('mobOptTitle'),
    mobOptArtist: document.getElementById('mobOptArtist'),
    mobOptAddToPlaylistBtn: document.getElementById('mobOptAddToPlaylistBtn'),
    mobOptQueueBtn: document.getElementById('mobOptQueueBtn'),
    mobOptDownloadBtn: document.getElementById('mobOptDownloadBtn'),
    mobOptDownloadText: document.getElementById('mobOptDownloadText'),
    mobOptRemovePlaylistBtn: document.getElementById('mobOptRemovePlaylistBtn'),

    // Sleep Timer Modal
    sleepTimerModal: document.getElementById('sleepTimerModal'),
    closeSleepTimerBtn: document.getElementById('closeSleepTimerBtn'),
    sleepTimerActiveStatus: document.getElementById('sleepTimerActiveStatus'),
    customTimerMinutesInput: document.getElementById('customTimerMinutesInput'),
    setCustomTimerBtn: document.getElementById('setCustomTimerBtn'),
    turnOffTimerBtn: document.getElementById('turnOffTimerBtn'),

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

    settingsModal: document.getElementById('settingsModal'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    headerSettingsBtn: document.getElementById('headerSettingsBtn'),
    libSettingsBtn: document.getElementById('libSettingsBtn'),
    libFilterPillsBar: document.getElementById('libFilterPillsBar'),
    libHubGrid: document.getElementById('libHubGrid'),
    libPlaylistsSection: document.getElementById('libPlaylistsSection'),
    libHeaderAddPlaylistBtn: document.getElementById('libHeaderAddPlaylistBtn'),
    closeSettingsModalBtn: document.getElementById('closeSettingsModalBtn'),
    deadSilenceOnRadio: document.getElementById('deadSilenceOnRadio'),
    deadSilenceOffRadio: document.getElementById('deadSilenceOffRadio'),

    // Local Music View
    localTrackCount: document.getElementById('localTrackCount'),
    localTotalTime: document.getElementById('localTotalTime'),
    localAudioFileInput: document.getElementById('localAudioFileInput'),
    localDropZone: document.getElementById('localDropZone'),
    localTracksContainer: document.getElementById('localTracksContainer'),
    localTracksTable: document.getElementById('localTracksTable'),
    localTracksTbody: document.getElementById('localTracksTbody'),
    localEmptyState: document.getElementById('localEmptyState'),
    playAllLocalBtn: document.getElementById('playAllLocalBtn'),
    clearAllLocalBtn: document.getElementById('clearAllLocalBtn'),

    toastContainer: document.getElementById('toastContainer')
  };

  // Playback & Animation State
  let animationFrameId = null;
  let lastStateSaveTime = 0;

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

  // Safe HTML Escaper to prevent XSS and prevent undefined reference errors
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }

  // Check if a song is downloaded in IndexedDB
  function isTrackDownloaded(trackId) {
    if (!trackId) return false;
    return state.offlineTracks.some(t => t.id === trackId);
  }

  // Generate downloaded badge HTML indicator
  function getDownloadedBadgeHtml(trackId) {
    if (isTrackDownloaded(trackId)) {
      return `<span class="downloaded-badge" title="Downloaded • Offline Ready"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
    }
    return '';
  }

  // Live update all downloaded badges for a track across open views
  function updateAllDownloadedBadges(trackId) {
    const badgeHtml = `<span class="downloaded-badge" title="Downloaded • Offline Ready"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
    document.querySelectorAll(`[data-track-id="${trackId}"]`).forEach(el => {
      const titleEl = el.querySelector('.song-title-text, .table-title-main');
      if (titleEl && !titleEl.querySelector('.downloaded-badge')) {
        titleEl.insertAdjacentHTML('beforeend', badgeHtml);
      }
      const dlBtn = el.querySelector('.download-song-trigger');
      if (dlBtn) {
        dlBtn.classList.add('downloaded');
        dlBtn.title = 'Downloaded • Saved in Offline Songs';
      }
    });

    if (state.currentTrack && state.currentTrack.id === trackId) {
      if (elements.playerDownloadBtn) elements.playerDownloadBtn.classList.add('downloaded');
      if (elements.mobDownloadBtn) elements.mobDownloadBtn.classList.add('downloaded');
      if (elements.mobDownloadActionBtn) elements.mobDownloadActionBtn.classList.add('downloaded');
      if (elements.mobOptDownloadBtn) {
        elements.mobOptDownloadBtn.classList.add('downloaded');
        const span = elements.mobOptDownloadBtn.querySelector('span');
        if (span) span.textContent = 'Remove from Downloads';
      }
    }
  }

  // Check if track is saved in any playlist (Liked songs, Downloads, or Custom playlists)
  function isTrackInAnyPlaylist(trackId) {
    if (!trackId) return false;
    if (state.likedSongs && state.likedSongs.some(t => t.id === trackId)) return true;
    if (state.offlineTracks && state.offlineTracks.some(t => t.id === trackId)) return true;
    if (state.customPlaylists && state.customPlaylists.some(pl => (pl.tracks || []).some(t => t.id === trackId))) return true;
    return false;
  }

  // Spotify-style green circular checkmark badge for songs already in playlists / library
  function getPlaylistTickBadgeHtml(trackId) {
    if (isTrackInAnyPlaylist(trackId)) {
      return `<span class="in-playlist-tick-badge" title="Saved in your playlist / library" aria-label="In playlist"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.707 6.293-4.5 4.5a1 1 0 0 1-1.414 0l-2-2a1 1 0 1 1 1.414-1.414L6.5 8.586l3.793-3.793a1 1 0 0 1 1.414 1.414z"/></svg></span>`;
    }
    return '';
  }

  // Real-time update for all in-playlist tick marks across the DOM
  function updateAllPlaylistTickBadges(targetTrackId = null) {
    const selector = targetTrackId ? `[data-track-id="${targetTrackId}"]` : '[data-track-id]';
    document.querySelectorAll(selector).forEach(el => {
      const trackId = el.dataset.trackId;
      if (!trackId) return;
      const titleEl = el.querySelector('.song-title-text, .table-title-main, .song-title, .top-result-title, .quick-pick-title');
      if (!titleEl) return;
      const existingBadge = titleEl.querySelector('.in-playlist-tick-badge');
      const shouldHaveBadge = isTrackInAnyPlaylist(trackId);
      if (shouldHaveBadge && !existingBadge) {
        titleEl.insertAdjacentHTML('beforeend', getPlaylistTickBadgeHtml(trackId));
      } else if (!shouldHaveBadge && existingBadge) {
        existingBadge.remove();
      }
    });
  }

  // Dismiss splash loading screen smoothly
  function dismissSplashScreen() {
    const splash = document.getElementById('appSplashScreen');
    if (splash && !splash.classList.contains('splash-hidden')) {
      splash.classList.add('splash-hidden');
      setTimeout(() => {
        splash.style.display = 'none';
      }, 500);
    }
  }

  // Toast System - Completely disabled per user request ("remove the notification of doing anything")
  function showToast(message, icon = '✓') {
    return;
  }

  // Local Storage Helpers
  function loadStoredData() {
    try {
      const storedLikes = localStorage.getItem('musisurf_liked');
      if (storedLikes) state.likedSongs = JSON.parse(storedLikes);

      const storedPlaylists = localStorage.getItem('musisurf_playlists');
      if (storedPlaylists) state.customPlaylists = JSON.parse(storedPlaylists);

      const storedOffline = localStorage.getItem('musisurf_offline_tracks');
      if (storedOffline) {
        try {
          const parsed = JSON.parse(storedOffline);
          if (Array.isArray(parsed) && parsed.length > 0) {
            state.offlineTracks = parsed;
          }
        } catch (e) {}
      }

      const storedVol = localStorage.getItem('musisurf_volume');
      if (storedVol !== null) {
        const v = parseFloat(storedVol);
        state.volume = (!isNaN(v) && v > 0.05) ? v : 0.8;
      }
    } catch (e) {
      console.warn('Error loading local storage data:', e);
    }
  }

  function saveStoredOfflineTracks() {
    try {
      const metaToStore = state.offlineTracks.map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        duration: t.duration,
        durationStr: t.durationStr,
        image: t.image,
        audioUrl: t.audioUrl || null,
        streamUrl: t.streamUrl || null,
        ytId: t.ytId || null,
        source: t.source || 'saavn',
        isDownloaded: true,
        downloadedAt: t.downloadedAt || Date.now()
      }));
      localStorage.setItem('musisurf_offline_tracks', JSON.stringify(metaToStore));
    } catch (e) {
      console.warn('Error saving offline tracks metadata to localStorage:', e);
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
      updateLibraryUI();
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
        const idbTracks = req.result || [];
        if (idbTracks.length > 0) {
          idbTracks.forEach(idbTrack => {
            const idx = state.offlineTracks.findIndex(t => t.id === idbTrack.id);
            if (idx >= 0) {
              state.offlineTracks[idx] = { ...state.offlineTracks[idx], ...idbTrack };
            } else {
              state.offlineTracks.push(idbTrack);
            }
          });
          saveStoredOfflineTracks();
        }
        updateDownloadedCountUI();
        updateLibraryUI();
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

  async function deleteOfflineTrackFromDB(trackId) {
    if (!trackId) return;
    try {
      const db = await getOfflineDB();
      const tx = db.transaction(OFFLINE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(OFFLINE_STORE_NAME);
      store.delete(trackId);
      tx.oncomplete = () => {
        const deletedTrack = state.offlineTracks.find(t => t.id === trackId);
        state.offlineTracks = state.offlineTracks.filter(t => t.id !== trackId);
        saveStoredOfflineTracks();
        updateDownloadedCountUI();
        updateLibraryUI();

        // If currently viewing the downloaded playlist, re-render it seamlessly
        if (state.currentView === 'playlist' && state.activePlaylistId === 'downloaded') {
          renderPlaylistView('downloaded');
        }

        if (state.currentTrack?.id === trackId) {
          elements.playerDownloadBtn?.classList.remove('downloaded');
          elements.mobDownloadBtn?.classList.remove('downloaded');
          elements.mobDownloadActionBtn?.classList.remove('downloaded');
          if (elements.mobOptDownloadBtn) {
            elements.mobOptDownloadBtn.classList.remove('downloaded');
            const span = elements.mobOptDownloadBtn.querySelector('span');
            if (span) span.textContent = 'Download Song';
          }
        }

        // Update any download buttons and badges in DOM
        document.querySelectorAll(`.download-song-trigger`).forEach(btn => {
          if (btn.closest('tr')?.dataset.trackId === trackId || btn.closest('.song-row')?.dataset.trackId === trackId) {
            btn.classList.remove('downloaded');
            btn.title = 'Download Song';
          }
        });
        document.querySelectorAll(`.top-download-btn`).forEach(btn => {
          if (btn.closest('#topResultCard')?.querySelector('.top-result-title')?.textContent === deletedTrack?.title) {
            btn.classList.remove('downloaded');
            btn.title = 'Download Song';
          }
        });
        document.querySelectorAll(`.downloaded-badge`).forEach(badge => {
          if (badge.closest('tr')?.dataset.trackId === trackId || badge.closest('.song-row')?.dataset.trackId === trackId) {
            badge.remove();
          }
        });

        updateAllPlaylistTickBadges(trackId);
        showToast(`Removed "${deletedTrack?.title || 'Song'}" from downloads`, '🗑️');
      };
    } catch (e) {
      console.warn('Error deleting offline track:', e);
    }
  }

  // Background Audio Keep-Alive
  // Browsers throttle background iframes when tab loses focus unless an audio pipeline is active.
  const SILENT_AUDIO_URI = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
  function startBackgroundKeepAlive() {
    if (elements.audio && elements.audio.paused && (!state.currentTrack || state.currentTrack.source === 'youtube' || !state.currentTrack.hasDirectAudio)) {
      try {
        if (!elements.audio.src || !elements.audio.src.startsWith('data:audio')) {
          elements.audio.src = SILENT_AUDIO_URI;
          elements.audio.loop = true;
          elements.audio.volume = 0.001;
        }
        elements.audio.play().catch(() => {});
      } catch (e) {}
    }
  }

  function stopBackgroundKeepAlive() {
    if (elements.audio && elements.audio.src && elements.audio.src.startsWith('data:audio')) {
      try {
        elements.audio.pause();
        elements.audio.removeAttribute('src');
      } catch (e) {}
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
        rel: 0,
        playsinline: 1,
        origin: window.location.origin
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
            startBackgroundKeepAlive();
          } else if (event.data === YT.PlayerState.PAUSED) {
            if (document.hidden && state.isPlaying) {
              // Browser attempted to pause YouTube iframe due to tab switch; auto-resume
              setTimeout(() => {
                if (state.isPlaying && state.ytPlayer && typeof state.ytPlayer.playVideo === 'function') {
                  try { state.ytPlayer.playVideo(); } catch (e) {}
                }
              }, 100);
              return;
            }
            state.isPlaying = false;
            updatePlayPauseButton();
            stopBackgroundKeepAlive();
          } else if (event.data === YT.PlayerState.ENDED) {
            onTrackEnded();
          }
        }
      }
    });
  };

  // ==========================================================================
  // PLAYBACK PERSISTENCE (Resume on Reload)
  // ==========================================================================
  function savePlaybackState() {
    if (!state.currentTrack) return;
    try {
      const cur = getCurrentPlaybackTime();
      const dur = getTotalDuration();
      const data = {
        track: state.currentTrack,
        currentTime: cur || 0,
        duration: dur || state.currentTrack.duration || 0,
        queue: (state.queue && state.queue.length > 0) ? state.queue : [state.currentTrack],
        queueIndex: state.queueIndex >= 0 ? state.queueIndex : 0,
        volume: state.volume,
        isMuted: state.isMuted,
        savedAt: Date.now()
      };
      localStorage.setItem('musisurf_last_state', JSON.stringify(data));
    } catch (e) {
      console.warn('Playback state save warning:', e);
    }
  }

  function restoreLastPlayedState() {
    try {
      const savedStr = localStorage.getItem('musisurf_last_state');
      if (!savedStr) return;
      const saved = JSON.parse(savedStr);
      if (!saved || !saved.track) return;

      const track = saved.track;
      state.currentTrack = track;
      track._introTrimmed = true; // Don't re-trim intro when resuming

      if (Array.isArray(saved.queue) && saved.queue.length > 0) {
        state.queue = saved.queue;
        state.queueIndex = typeof saved.queueIndex === 'number' ? saved.queueIndex : 0;
      } else {
        state.queue = [track];
        state.queueIndex = 0;
      }

      if (typeof saved.volume === 'number') {
        state.volume = saved.volume;
      }
      if (typeof saved.isMuted === 'boolean') {
        state.isMuted = saved.isMuted;
      }

      // Update Player UI Metadata
      elements.playerTitle.textContent = track.title;
      elements.playerArtist.textContent = track.artist;
      elements.playerCoverImg.src = track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80';
      const dur = saved.duration || track.duration || 0;
      elements.totalDurationLabel.textContent = track.durationStr || formatTime(dur);

      if (elements.mobPlayerTitle) elements.mobPlayerTitle.textContent = track.title;
      if (elements.mobPlayerArtist) elements.mobPlayerArtist.textContent = track.artist;
      if (elements.mobPlayerCover) elements.mobPlayerCover.src = track.image;
      if (elements.mobTotalDuration) elements.mobTotalDuration.textContent = track.durationStr || formatTime(dur);

      updateHeartIcon(track.id);
      updateQueueDrawerUI();
      highlightPlayingTrackInTables(track.id);

      const resumeTime = parseFloat(saved.currentTime) || 0;
      elements.currentTimeLabel.textContent = formatTime(resumeTime);
      if (elements.mobCurrentTime) elements.mobCurrentTime.textContent = formatTime(resumeTime);
      if (dur > 0) {
        const pct = Math.min(100, (resumeTime / dur) * 100);
        elements.progressFill.style.width = `${pct}%`;
        if (elements.mobProgressFill) elements.mobProgressFill.style.width = `${pct}%`;
        if (elements.miniPlayerFill) elements.miniPlayerFill.style.width = `${pct}%`;
      }

      // Set MediaSession
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album || 'MusiSurf',
          artwork: [{ src: track.image, sizes: '500x500', type: 'image/jpeg' }]
        });
      }

      // Fetch synchronized lyrics
      loadLyricsForTrack(track.title, track.artist);

      // Prepare restored audio WITHOUT autoplay (leaves player paused until user clicks Play)
      state.isPlaying = false;
      updatePlayPauseButton();

      if (track.isLocal && track.id) {
        getLocalTrackBlobFromDB(track.id).then(blob => {
          if (blob) {
            elements.audio.src = URL.createObjectURL(blob);
            elements.audio.volume = state.isMuted ? 0 : state.volume;
            elements.audio.currentTime = resumeTime;
          }
        }).catch(() => {});
      } else {
        const offlineRecord = state.offlineTracks.find(t => t.id === track.id);
        if (offlineRecord && offlineRecord.audioBlob) {
          elements.audio.src = URL.createObjectURL(offlineRecord.audioBlob);
          elements.audio.volume = state.isMuted ? 0 : state.volume;
          elements.audio.currentTime = resumeTime;
        } else if (track.source === 'youtube' || !track.hasDirectAudio) {
          const cueYt = () => {
            if (state.ytReady && state.ytPlayer && track.ytId) {
              if (typeof state.ytPlayer.cueVideoById === 'function') {
                state.ytPlayer.cueVideoById({
                  videoId: track.ytId,
                  startSeconds: resumeTime
                });
              }
              state.ytPlayer.setVolume(state.isMuted ? 0 : state.volume * 100);
            } else {
              setTimeout(cueYt, 300);
            }
          };
          setTimeout(cueYt, 500);
        } else {
          const audioSrc = track.audioUrl || track.streamUrl;
          if (audioSrc) {
            elements.audio.src = audioSrc;
            elements.audio.volume = state.isMuted ? 0 : state.volume;
            const onCanPlay = () => {
              if (resumeTime > 0 && resumeTime < (elements.audio.duration || 9999)) {
                elements.audio.currentTime = resumeTime;
              }
              elements.audio.removeEventListener('canplay', onCanPlay);
            };
            elements.audio.addEventListener('canplay', onCanPlay);
          }
        }
      }
    } catch (e) {
      console.warn('Error restoring last played track:', e);
    }
  }

  function attachOneTimeResumeGesture() {
    const resume = () => {
      if (elements.audio.paused && state.currentTrack && state.currentTrack.source !== 'youtube') {
        elements.audio.play().then(() => {
          state.isPlaying = true;
          updatePlayPauseButton();
        }).catch(() => {});
      }
      window.removeEventListener('click', resume);
      window.removeEventListener('keydown', resume);
      window.removeEventListener('touchstart', resume);
    };
    window.addEventListener('click', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true });
  }

  // ==========================================================================
  // PLAYBACK CONTROLLER
  // ==========================================================================
  async function playTrack(track, queueList = null, addToHistory = true) {
    if (!track) return;

    // Track playback history for previous song button navigation
    if (addToHistory && state.currentTrack && state.currentTrack.id !== track.id) {
      if (!state.history) state.history = [];
      state.history.push(state.currentTrack);
      if (state.history.length > 50) state.history.shift();
    }

    // Set queue if provided
    if (queueList && Array.isArray(queueList)) {
      state.queue = [...queueList];
      state.userQueuedCount = 0;
      state.queueIndex = state.queue.findIndex(t => t.id === track.id);
      if (state.queueIndex === -1) {
        state.queue.unshift(track);
        state.queueIndex = 0;
      }
    } else {
      const existingQIdx = state.queue.findIndex(t => t.id === track.id);
      if (existingQIdx !== -1) {
        state.queueIndex = existingQIdx;
      } else {
        state.queue.push(track);
        state.queueIndex = state.queue.length - 1;
      }
    }

    state.currentTrack = track;
    track._introTrimmed = false;

    // Reset silence trimmer state for new track
    if (state.settings.removeDeadSilence) {
      state.isTrimmingStartSilence = true;
      state.trailingSilenceFrames = 0;
    }

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

    const headerName = document.getElementById('mobHeaderPlaylistName');
    if (headerName) {
      if (state.activePlaylistId === 'liked') headerName.textContent = 'Liked Songs';
      else if (state.activePlaylistId === 'downloaded') headerName.textContent = 'Downloaded';
      else if (state.activePlaylistTracks && state.activePlaylistTracks.length > 0) {
        const pl = state.customPlaylists.find(p => p.id === state.activePlaylistId);
        headerName.textContent = pl ? pl.name : 'Playlist';
      } else {
        headerName.textContent = 'MusiSurf';
      }
    }

    // Dynamic Atmospheric Background for Mobile Player Modal
    if (elements.mobilePlayerModal && track.image) {
      extractDominantColor(track.image, track.id).then(([r, g, b]) => {
        const darkR = Math.floor(r * 0.28);
        const darkG = Math.floor(g * 0.28);
        const darkB = Math.floor(b * 0.28);
        elements.mobilePlayerModal.style.setProperty(
          '--mob-player-bg',
          `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, 0.65) 0%, rgba(${darkR}, ${darkG}, ${darkB}, 0.42) 45%, #08090b 100%)`
        );
      }).catch(() => {});
    }

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
    if (track.isLocal && track.fileBlob) {
      // Local device storage file playback (100% on device)
      if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.stopVideo === 'function') {
        state.ytPlayer.stopVideo();
      }

      const blobUrl = URL.createObjectURL(track.fileBlob);
      elements.audio.src = blobUrl;
      elements.audio.volume = state.isMuted ? 0 : state.volume;
      elements.audio.load();
      elements.audio.play().catch(err => {
        console.warn('Local storage audio play error:', err);
      });
    } else {
      let offlineRecord = track.audioBlob ? track : state.offlineTracks.find(t => t.id === track.id);
      if (offlineRecord && !offlineRecord.audioBlob) {
        try {
          const db = await getOfflineDB();
          const tx = db.transaction(OFFLINE_STORE_NAME, 'readonly');
          const store = tx.objectStore(OFFLINE_STORE_NAME);
          const req = store.get(track.id);
          const storedItem = await new Promise((res) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => res(null);
          });
          if (storedItem && storedItem.audioBlob) {
            offlineRecord = { ...offlineRecord, audioBlob: storedItem.audioBlob };
            const idx = state.offlineTracks.findIndex(t => t.id === track.id);
            if (idx >= 0) state.offlineTracks[idx].audioBlob = storedItem.audioBlob;
          }
        } catch (e) {
          console.warn('Error reading offline blob from IDB:', e);
        }
      }

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
        // Universal YouTube Engine for 100% full-length song playback
        track.source = 'youtube';
        elements.audio.pause();
        let retries = 0;
        const playYt = () => {
          if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function' && track.ytId) {
            state.ytPlayer.loadVideoById(track.ytId);
            state.ytPlayer.setVolume(state.isMuted ? 0 : state.volume * 100);
            state.ytPlayer.playVideo();
          } else if (retries < 25) {
            retries++;
            setTimeout(playYt, 200);
          }
        };
        playYt();
      } else {
        // High quality full-length direct audio streaming
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
        const audioSrc = track.audioUrl || streamUrl;
        if (!audioSrc) {
          showToast('Audio stream unavailable for this track', '⚠️');
          return;
        }

        elements.audio.src = audioSrc;
        elements.audio.load();
        const playPromise = elements.audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.warn('Direct stream playback error, trying stream proxy fallback:', err);
            if (streamUrl && elements.audio.src !== streamUrl) {
              elements.audio.src = streamUrl;
              elements.audio.load();
              elements.audio.play().catch(directErr => console.warn('Stream fallback failed:', directErr));
            }
          });
        }
      }
    }

    state.isPlaying = true;
    updatePlayPauseButton();
    updateQueueDrawerUI();
    highlightPlayingTrackInTables(track.id);
    savePlaybackState();

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

    if (elements.playAllPlaylistBtn) {
      const plPlay = elements.playAllPlaylistBtn.querySelector('.play-icon');
      const plPause = elements.playAllPlaylistBtn.querySelector('.pause-icon');
      const isCurrentPlaylistPlaying = state.isPlaying && state.currentTrack && state.activePlaylistTracks && state.activePlaylistTracks.some(t => t.id === state.currentTrack.id);
      if (plPlay && plPause) {
        plPlay.style.display = isCurrentPlaylistPlaying ? 'none' : 'block';
        plPause.style.display = isCurrentPlaylistPlaying ? 'block' : 'none';
      }
      elements.playAllPlaylistBtn.title = isCurrentPlaylistPlaying ? 'Pause Playlist' : 'Play All';
    }

    // Sync Top Result Card Play/Pause Button
    const topPlayBtn = document.getElementById('topResultPlayBtn') || elements.topResultCard?.querySelector('.top-result-play-btn');
    if (topPlayBtn && elements.topResultCard?.dataset.trackId) {
      const isThisTopTrack = state.currentTrack && state.currentTrack.id === elements.topResultCard.dataset.trackId;
      const isPlayingThis = isThisTopTrack && state.isPlaying;
      const playIcon = topPlayBtn.querySelector('.play-icon');
      const pauseIcon = topPlayBtn.querySelector('.pause-icon');
      if (playIcon && pauseIcon) {
        playIcon.style.display = isPlayingThis ? 'none' : 'block';
        pauseIcon.style.display = isPlayingThis ? 'block' : 'none';
      }
      topPlayBtn.title = isPlayingThis ? 'Pause' : 'Play';
    }
  }

  // Direct Audio Downloader: Instantly adds to "Downloaded" playlist in Library, and triggers file download on Desktop
  async function downloadSong(track) {
    if (!track) {
      showToast('No song currently selected to download', 'ℹ');
      return;
    }

    if (isTrackDownloaded(track.id)) {
      if (confirm(`"${track.title}" is already in your Downloaded Songs. Remove it from downloads?`)) {
        deleteOfflineTrackFromDB(track.id);
      }
      return;
    }

    const cleanTitle = (track.title || 'Track').replace(/[\\/:*?"<>|]/g, '').trim();
    const cleanArtist = (track.artist || 'MusiSurf').replace(/[\\/:*?"<>|]/g, '').trim();
    const downloadFilename = `${cleanTitle} - ${cleanArtist}.mp4`;
    const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

    let streamUrl = '';
    if (track.audioUrl) {
      streamUrl = `/api/download?url=${encodeURIComponent(track.audioUrl)}&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;
    } else if (track.ytId) {
      streamUrl = `/api/download?ytId=${encodeURIComponent(track.ytId)}&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;
    } else {
      streamUrl = `/api/download?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;
    }

    // 1. Immediately create or update record in Downloaded Songs playlist
    const offlineRecord = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album || 'Downloaded Track',
      duration: track.duration || 210,
      durationStr: track.durationStr || formatTime(track.duration || 210),
      image: track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
      audioUrl: track.audioUrl || null,
      streamUrl: track.streamUrl || null,
      ytId: track.ytId || null,
      source: track.source || 'saavn',
      isDownloaded: true,
      downloadedAt: Date.now()
    };

    const existingIdx = state.offlineTracks.findIndex(t => t.id === track.id);
    if (existingIdx >= 0) {
      state.offlineTracks[existingIdx] = { ...state.offlineTracks[existingIdx], ...offlineRecord };
    } else {
      state.offlineTracks.unshift(offlineRecord);
    }

    // Immediately persist metadata to localStorage
    saveStoredOfflineTracks();

    // Immediately update counts, badges, and Library UI
    updateDownloadedCountUI();
    updateLibraryUI();
    updateAllDownloadedBadges(track.id);
    updateAllPlaylistTickBadges(track.id);

    showToast(`Saved "${track.title}" to Downloaded Songs!`, '✓');

    // If currently viewing Downloaded playlist, refresh view instantly
    if (state.currentView === 'downloaded' || (state.currentView === 'playlist' && state.activePlaylistId === 'downloaded')) {
      renderPlaylistView('downloaded');
    }

    // 2. On desktop, also trigger browser file download to computer's Downloads folder
    if (!isMobile) {
      const a = document.createElement('a');
      a.href = streamUrl;
      a.setAttribute('download', downloadFilename);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // 3. In background: asynchronously fetch audio stream blob and persist to IndexedDB for 100% offline playback
    (async () => {
      try {
        const fetchTarget = track.audioUrl ? `/api/stream?url=${encodeURIComponent(track.audioUrl)}` : streamUrl;
        const res = await fetch(fetchTarget);
        if (res.ok) {
          const blob = await res.blob();
          const db = await getOfflineDB();
          const tx = db.transaction(OFFLINE_STORE_NAME, 'readwrite');
          const store = tx.objectStore(OFFLINE_STORE_NAME);
          store.put({ ...offlineRecord, audioBlob: blob });
          const idx = state.offlineTracks.findIndex(t => t.id === track.id);
          if (idx >= 0) {
            state.offlineTracks[idx].audioBlob = blob;
          }
        }
      } catch (err) {
        console.warn('Background offline blob caching note:', err.message);
      }
    })();
  }

  // Add Track to Queue (inserts at top of upcoming queue, and successive adds queue right after)
  function addToQueue(track) {
    if (!track) return;

    if (!state.currentTrack || state.queue.length === 0) {
      playTrack(track);
      showToast(`Playing "${track.title}"`, '▶');
      return;
    }

    // Place at the top of the upcoming queue (after currently playing track + any previous user-queued songs)
    const insertIndex = Math.min(state.queue.length, (state.queueIndex + 1) + (state.userQueuedCount || 0));
    state.queue.splice(insertIndex, 0, track);
    state.userQueuedCount = (state.userQueuedCount || 0) + 1;

    updateQueueDrawerUI();
    showToast(`Added to top of queue: "${track.title}"`, '➕');
  }

  function nextTrack() {
    if (state.queue.length === 0) {
      if (state.allAvailableTracks && state.allAvailableTracks.length > 0) {
        state.queue = [...state.allAvailableTracks];
        state.queueIndex = 0;
        playTrack(state.queue[0]);
      }
      return;
    }

    if (state.repeatMode === 'one' && state.currentTrack) {
      playTrack(state.currentTrack, state.queue, false);
      return;
    }

    let nextIdx = state.queueIndex + 1;
    if (nextIdx >= state.queue.length) {
      if (state.repeatMode === 'all') {
        nextIdx = 0;
      } else if (state.activePlaylistTracks && state.activePlaylistTracks.length > 0) {
        // If playing from playlist, stay strictly within playlist tracks without pulling outside songs
        if (state.isPlaylistShuffle) {
          const pool = [...state.activePlaylistTracks];
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          if (pool.length > 1 && pool[0].id === state.currentTrack?.id) {
            [pool[0], pool[1]] = [pool[1], pool[0]];
          }
          state.queue = pool;
          state.queueIndex = 0;
          playTrack(state.queue[0]);
          return;
        } else {
          nextIdx = 0;
        }
      } else {
        // AUTOPLAY: Don't stop! Keep music flowing by picking unplayed songs from home/trending
        const unplayed = (state.allAvailableTracks || []).filter(t => !state.queue.some(q => q.id === t.id));
        if (unplayed.length > 0) {
          const batch = unplayed.slice(0, 10);
          state.queue.push(...batch);
        } else {
          // Loop seamlessly if entire catalog was played
          nextIdx = 0;
        }
      }
    }

    if (state.userQueuedCount && state.userQueuedCount > 0) {
      state.userQueuedCount--;
    }

    state.queueIndex = nextIdx;
    playTrack(state.queue[nextIdx]);
  }

  function prevTrack() {
    // 1. If we have a track in the playback history stack, navigate back to previous distinct song
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
        const qIdx = state.queue.findIndex(t => t.id === prevSong.id);
        if (qIdx !== -1) {
          state.queueIndex = qIdx;
        } else {
          state.queue.unshift(prevSong);
          state.queueIndex = 0;
        }
        playTrack(prevSong, null, false);
        showToast(`Playing previous: "${prevSong.title}"`, '⏮');
        return;
      }
    }

    // 2. If no distinct history item, navigate backwards in current queue
    if (state.queue && state.queue.length > 1) {
      let prevIdx = state.queueIndex - 1;
      if (prevIdx < 0) {
        prevIdx = state.queue.length - 1;
      }
      state.queueIndex = prevIdx;
      const prevSong = state.queue[prevIdx];
      if (prevSong) {
        playTrack(prevSong, null, false);
        showToast(`Playing previous: "${prevSong.title}"`, '⏮');
        return;
      }
    }

    // 3. Fallback: restart track if no other song exists
    seekTo(0);
  }

  function onTrackEnded() {
    if (state.repeatMode === 'one' && state.currentTrack) {
      if (state.currentTrack._introTrimmed) state.currentTrack._introTrimmed = false;
      playTrack(state.currentTrack, state.queue, false);
      return;
    }
    if (state.repeatMode === 'all' && state.queue.length <= 1 && state.currentTrack) {
      playTrack(state.currentTrack, state.queue, false);
      return;
    }
    nextTrack();
  }

  function isYouTubeActive() {
    return !!(
      (state.currentTrack && (state.currentTrack.source === 'youtube' || !state.currentTrack.hasDirectAudio)) ||
      (state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function' && state.ytPlayer.getPlayerState() === 1)
    );
  }

  function getCurrentPlaybackTime() {
    if (isYouTubeActive()) {
      return state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function' ? state.ytPlayer.getCurrentTime() : 0;
    }
    return elements.audio.currentTime || 0;
  }

  function getTotalDuration() {
    if (isYouTubeActive()) {
      const dur = state.ytPlayer && typeof state.ytPlayer.getDuration === 'function' ? state.ytPlayer.getDuration() : 0;
      return dur > 0 ? dur : (state.currentTrack?.duration || 0);
    }
    return elements.audio.duration || state.currentTrack?.duration || 0;
  }

  function seekTo(seconds) {
    if (isYouTubeActive()) {
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

  // Real-time Progress Bar Loop with Intelligent Dead Silence Trimmer
  function updateProgress() {
    requestAnimationFrame(updateProgress);

    if (state.isPlaying && state.currentTrack) {
      if (state.isDraggingProgress) return; // Don't override while user is actively dragging scrubber

      const cur = getCurrentPlaybackTime();
      const dur = getTotalDuration();

      elements.currentTimeLabel.textContent = formatTime(cur);
      if (elements.mobCurrentTime) elements.mobCurrentTime.textContent = formatTime(cur);

      if (dur > 0) {
        const pct = Math.min(100, (cur / dur) * 100);
        elements.progressFill.style.width = `${pct}%`;
        if (elements.mobProgressFill) elements.mobProgressFill.style.width = `${pct}%`;
        if (elements.miniPlayerFill) elements.miniPlayerFill.style.width = `${pct}%`;

        // Update buffer bar for HTML5 audio
        if (elements.audio.buffered && elements.audio.buffered.length > 0) {
          const bufEnd = elements.audio.buffered.end(elements.audio.buffered.length - 1);
          elements.progressBuffer.style.width = `${Math.min(100, (bufEnd / dur) * 100)}%`;
        }
      }

      // Check Intelligent Dead Silence Removal (Start & Ending ONLY - Middle is untouched)
      if (state.settings.removeDeadSilence && dur > 10 && !elements.audio.paused && !elements.audio.seeking) {
        // 1. START SILENCE ONLY: Skip initial digital/encoder lead-in padding (0.6s) once
        if (!state.currentTrack._introTrimmed && cur < 0.6) {
          state.currentTrack._introTrimmed = true;
          seekTo(0.6);
        }

        // 2. END SILENCE ONLY: Skip tail silence in the last 1.2 seconds of song
        if (cur >= dur - 1.2) {
          onTrackEnded();
        }
      }

      // Sync active lyric line
      syncLyricsWithTime(cur);

      // Throttled save of playback state for resume on reload
      const now = Date.now();
      if (now - lastStateSaveTime > 2500) {
        lastStateSaveTime = now;
        savePlaybackState();
      }
    }
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
    state.activeLyricIndex = -1;
    syncLyricsWithTime(getCurrentPlaybackTime());
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

          // Smoothly scroll active line to center strictly inside lyricsScrollBody
          if (elements.lyricsScrollBody) {
            const containerHeight = elements.lyricsScrollBody.clientHeight;
            const targetScroll = lineEl.offsetTop - (containerHeight / 2) + (lineEl.offsetHeight / 2);
            elements.lyricsScrollBody.scrollTo({
              top: Math.max(0, targetScroll),
              behavior: 'smooth'
            });
          }
        } else if (idx < activeIdx) {
          lineEl.classList.remove('active');
          lineEl.classList.add('passed');
        } else {
          lineEl.classList.remove('active', 'passed');
        }
      });

      // Update lyrics card preview snippet in fullscreen mobile player
      const snippetEl = document.getElementById('mobLyricsSnippet');
      if (snippetEl) {
        if (activeIdx >= 0 && state.lyrics[activeIdx]) {
          snippetEl.textContent = state.lyrics[activeIdx].text;
          snippetEl.style.color = '#ffffff';
        } else {
          snippetEl.textContent = 'Tap to view synchronized lyrics';
          snippetEl.style.color = '';
        }
      }
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
    } finally {
      dismissSplashScreen();
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
          <span class="quick-pick-title">${escapeHtml(track.title)}${getPlaylistTickBadgeHtml(track.id)}</span>
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
    sectionEl._sectionData = section;

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
    const isTopLiked = state.likedSongs.some(s => s.id === top.id);
    const isPlayingThisTop = state.isPlaying && state.currentTrack && state.currentTrack.id === top.id;

    elements.topResultCard.dataset.trackId = top.id;
    elements.topResultCard.className = `top-result-card ${isPlayingThisTop ? 'playing' : ''}`;
    elements.topResultCard.innerHTML = `
      <div class="top-result-header-row">
        <img src="${top.image}" alt="${escapeHtml(top.title)}" class="top-result-img">
        <div class="top-result-info">
          <h4 class="top-result-title">${escapeHtml(top.title)}${getPlaylistTickBadgeHtml(top.id)}</h4>
          <div class="top-result-meta">
            <span class="top-result-artist">${escapeHtml(top.artist)}</span>
            <span class="top-result-pill">Song</span>
          </div>
        </div>
      </div>
      <div class="top-result-actions">
        <button class="top-result-play-btn" id="topResultPlayBtn" title="${isPlayingThisTop ? 'Pause' : 'Play Now'}">
          <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor" style="display: ${isPlayingThisTop ? 'none' : 'block'};">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <svg class="pause-icon" viewBox="0 0 24 24" fill="currentColor" style="display: ${isPlayingThisTop ? 'block' : 'none'};">
            <rect x="6" y="4" width="4" height="16"/>
            <rect x="14" y="4" width="4" height="16"/>
          </svg>
        </button>
        <button class="top-result-action-btn top-like-btn ${isTopLiked ? 'liked' : ''}" title="${isTopLiked ? 'Liked' : 'Save to Liked Songs'}">
          <svg viewBox="0 0 24 24" fill="${isTopLiked ? '#ff3b5c' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
        <button class="top-result-action-btn top-more-btn" title="More Options">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;">
            <circle cx="12" cy="5" r="2"/>
            <circle cx="12" cy="12" r="2"/>
            <circle cx="12" cy="19" r="2"/>
          </svg>
        </button>
      </div>
    `;

    elements.topResultCard.onclick = (e) => {
      if (e.target.closest('.top-like-btn')) {
        e.stopPropagation();
        toggleLikeSong(top);
        return;
      }
      if (e.target.closest('.top-more-btn')) {
        e.stopPropagation();
        openTrackOptionsMenu(top);
        return;
      }
      if (e.target.closest('.top-result-play-btn')) {
        e.stopPropagation();
        if (state.currentTrack && state.currentTrack.id === top.id) {
          togglePlayPause();
        } else {
          playTrack(top, results);
        }
        return;
      }
      if (state.currentTrack && state.currentTrack.id === top.id) {
        togglePlayPause();
      } else {
        playTrack(top, results);
      }
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

  // Universal Track Options Modal Sheet (Spotify-grade ⋮ menu)
  function openTrackOptionsMenu(track) {
    if (!track) return;
    state.contextTrack = track;

    if (elements.mobOptCover) {
      elements.mobOptCover.src = track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80';
    }
    if (elements.mobOptTitle) elements.mobOptTitle.textContent = track.title || 'Unknown Track';
    if (elements.mobOptArtist) elements.mobOptArtist.textContent = track.artist || 'Unknown Artist';

    // Download option: check if downloaded or in downloaded playlist view
    if (elements.mobOptDownloadBtn) {
      const isDownloaded = isTrackDownloaded(track.id);
      const isDownloadedView = state.currentView === 'playlist' && state.activePlaylistId === 'downloaded';
      const showDelete = isDownloaded || isDownloadedView;

      elements.mobOptDownloadBtn.classList.toggle('downloaded', !showDelete && isDownloaded);
      elements.mobOptDownloadBtn.classList.toggle('delete-action', showDelete);

      const downloadIcon = elements.mobOptDownloadBtn.querySelector('.mob-option-icon');
      if (downloadIcon) {
        downloadIcon.innerHTML = showDelete ? `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #ef4444;">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        ` : `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        `;
      }

      if (elements.mobOptDownloadText) {
        elements.mobOptDownloadText.textContent = showDelete ? 'Delete from Downloads' : 'Download Song';
        elements.mobOptDownloadText.style.color = showDelete ? '#ef4444' : '';
      }
    }

    // Contextual "Remove from this Playlist" button (only visible when inside a user-created playlist)
    if (elements.mobOptRemovePlaylistBtn) {
      const isCustomUserPlaylist = state.currentView === 'playlist' && 
                                   state.activePlaylistId && 
                                   !['liked', 'downloaded', 'local'].includes(state.activePlaylistId);
      elements.mobOptRemovePlaylistBtn.style.display = isCustomUserPlaylist ? 'flex' : 'none';
    }



    if (elements.mobTrackOptionsModal) {
      elements.mobTrackOptionsModal.style.display = 'flex';
      try { window.history.pushState({ modal: 'mobTrackOptions' }, '', window.location.pathname); } catch (e) {}
    }
  }

  function createSongRow(track, queueList) {
    const row = document.createElement('div');
    row.className = `song-row ${state.currentTrack?.id === track.id ? 'playing' : ''}`;
    row.dataset.trackId = track.id;

    const isLiked = state.likedSongs.some(s => s.id === track.id);
    const badgeHtml = getDownloadedBadgeHtml(track.id);

    row.innerHTML = `
      <img src="${track.image}" alt="${escapeHtml(track.title)}" class="song-thumb">
      <div class="song-info-col">
        <div class="song-title-text">${escapeHtml(track.title)}${getPlaylistTickBadgeHtml(track.id)}${badgeHtml}</div>
        <div class="song-artist-text">${escapeHtml(track.artist)}</div>
      </div>
      <div class="song-row-right-actions">
        <button class="song-action-btn like-song-trigger ${isLiked ? 'liked' : ''}" title="${isLiked ? 'Liked' : 'Like'}">
          <svg viewBox="0 0 24 24" fill="${isLiked ? '#ff3b5c' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
        <button class="song-action-btn song-more-trigger" title="More Options">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"/>
            <circle cx="12" cy="12" r="2"/>
            <circle cx="12" cy="19" r="2"/>
          </svg>
        </button>
      </div>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.closest('.like-song-trigger')) {
        e.stopPropagation();
        toggleLikeSong(track);
        return;
      }
      if (e.target.closest('.song-more-trigger')) {
        e.stopPropagation();
        openTrackOptionsMenu(track);
        return;
      }
      if (e.target.closest('.song-action-btn')) {
        e.stopPropagation();
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
    const badgeHtml = getDownloadedBadgeHtml(track.id);

    tr.innerHTML = `
      <td class="col-num">${index}</td>
      <td class="col-title">
        <div class="table-title-cell">
          <img src="${track.image}" alt="${escapeHtml(track.title)}" class="table-cover" loading="lazy">
          <div>
            <div class="table-title-main">${escapeHtml(track.title)}${getPlaylistTickBadgeHtml(track.id)}${badgeHtml}</div>
            <div class="table-artist-sub">${escapeHtml(track.artist)}</div>
          </div>
        </div>
      </td>
      <td class="col-album">${escapeHtml(track.album || 'Single')}</td>
      <td class="col-actions">
        <button class="song-action-btn like-song-trigger ${isLiked ? 'liked' : ''}" title="${isLiked ? 'Liked' : 'Like'}">
          <svg viewBox="0 0 24 24" fill="${isLiked ? '#ff3b5c' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
        <button class="song-action-btn song-more-trigger" title="More Options">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"/>
            <circle cx="12" cy="12" r="2"/>
            <circle cx="12" cy="19" r="2"/>
          </svg>
        </button>
      </td>
      <td class="col-duration">${track.durationStr || '3:30'}</td>
    `;

    tr.addEventListener('click', (e) => {
      if (e.target.closest('.like-song-trigger')) {
        e.stopPropagation();
        toggleLikeSong(track);
        return;
      }
      if (e.target.closest('.song-more-trigger')) {
        e.stopPropagation();
        openTrackOptionsMenu(track);
        return;
      }
      if (e.target.closest('.song-action-btn')) {
        e.stopPropagation();
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

    // Update ONLY like buttons throughout the DOM
    const isLiked = state.likedSongs.some(s => s.id === track.id);
    document.querySelectorAll(`[data-track-id="${track.id}"] .like-song-trigger, [data-track-id="${track.id}"] .top-like-btn`).forEach(btn => {
      btn.classList.toggle('liked', isLiked);
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', isLiked ? '#ff3b5c' : 'none');
        svg.style.color = isLiked ? '#ff3b5c' : '';
      }
    });

    // Update in-playlist / library tick mark
    updateAllPlaylistTickBadges(track.id);
  }

  function updateHeartIcon(currentTrackId) {
    const isLiked = state.likedSongs.some(s => s.id === currentTrackId);
    if (elements.playerHeartBtn) {
      elements.playerHeartBtn.classList.toggle('liked', isLiked);
      const svg = elements.playerHeartBtn.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', isLiked ? '#ff3b5c' : 'none');
        svg.style.color = isLiked ? '#ff3b5c' : '';
      }
    }
    if (elements.mobPlayerHeartBtn) {
      elements.mobPlayerHeartBtn.classList.toggle('liked', isLiked);
      const mobSvg = elements.mobPlayerHeartBtn.querySelector('svg');
      if (mobSvg) {
        mobSvg.setAttribute('fill', isLiked ? '#ff3b5c' : 'none');
        mobSvg.style.color = isLiked ? '#ff3b5c' : '';
      }
    }
  }

  function createPlaylistCollageHtml(tracks, defaultIconSvg, fallbackGradient) {
    if (!tracks || tracks.length === 0) {
      return `
        <div style="width: 100%; height: 100%; background: ${fallbackGradient || 'linear-gradient(135deg, #1e2029 0%, #2a2d3d 100%)'}; display: flex; align-items: center; justify-content: center; border-radius: 6px;">
          ${defaultIconSvg || `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width: 44px; height: 44px; color: var(--accent-primary);">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
          `}
        </div>
      `;
    }

    const images = [];
    for (const t of tracks) {
      if (t && t.image && !images.includes(t.image)) {
        images.push(t.image);
        if (images.length === 4) break;
      }
    }

    if (images.length === 0) {
      return `
        <div style="width: 100%; height: 100%; background: ${fallbackGradient || 'linear-gradient(135deg, #1e2029 0%, #2a2d3d 100%)'}; display: flex; align-items: center; justify-content: center; border-radius: 6px;">
          ${defaultIconSvg || ''}
        </div>
      `;
    }

    if (images.length < 4) {
      return `<img src="${images[0]}" alt="Playlist Cover" class="playlist-cover-single-img">`;
    }

    return `
      <div class="playlist-cover-collage">
        <img src="${images[0]}" alt="" loading="lazy">
        <img src="${images[1]}" alt="" loading="lazy">
        <img src="${images[2]}" alt="" loading="lazy">
        <img src="${images[3]}" alt="" loading="lazy">
      </div>
    `;
  }

  // ==========================================================================
  // SPOTIFY-STYLE DYNAMIC PLAYLIST BACKGROUND SYSTEM
  // ==========================================================================
  const playlistColorCache = new Map();

  function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  function getDeterministicArtworkColor(key) {
    let hash = 0;
    const str = String(key || 'musisurf');
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const h = Math.abs(hash) % 360;
    const s = 48 + (Math.abs(hash >> 3) % 28);
    const l = 32 + (Math.abs(hash >> 6) % 18);
    return hslToRgb(h, s, l);
  }

  async function extractDominantColor(imgSrc, fallbackKey = 'musisurf') {
    if (!imgSrc) {
      return getDeterministicArtworkColor(fallbackKey);
    }
    if (playlistColorCache.has(imgSrc)) {
      return playlistColorCache.get(imgSrc);
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.decoding = 'async';

      let resolved = false;
      const done = (rgb) => {
        if (resolved) return;
        resolved = true;
        playlistColorCache.set(imgSrc, rgb);
        resolve(rgb);
      };

      const fallback = () => {
        done(getDeterministicArtworkColor(fallbackKey || imgSrc));
      };

      const timer = setTimeout(fallback, 1200);

      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 48;
          canvas.height = 48;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return fallback();

          ctx.drawImage(img, 0, 0, 48, 48);
          const data = ctx.getImageData(0, 0, 48, 48).data;
          const buckets = new Map();

          for (let i = 0; i < data.length; i += 16) {
            const a = data[i + 3];
            if (a < 128) continue;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            const qr = Math.round(r / 20) * 20;
            const qg = Math.round(g / 20) * 20;
            const qb = Math.round(b / 20) * 20;
            const key = `${qr},${qg},${qb}`;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const delta = max - min;
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;

            if (brightness < 30 || brightness > 225) continue;
            if (delta < 20 && brightness > 45 && brightness < 205) continue;

            const vibrancy = (delta / 255) * 2.2 + (1 - Math.abs(brightness - 128) / 128);
            buckets.set(key, (buckets.get(key) || 0) + vibrancy);
          }

          let bestKey = null;
          let bestScore = -1;
          for (const [k, score] of buckets.entries()) {
            if (score > bestScore) {
              bestScore = score;
              bestKey = k;
            }
          }

          if (bestKey) {
            const rgb = bestKey.split(',').map(Number);
            done(rgb);
          } else {
            fallback();
          }
        } catch (e) {
          fallback();
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        fallback();
      };

      img.src = imgSrc;
    });
  }

  async function applyPlaylistDynamicBackground(playlistId, tracks, fallbackKey = 'playlist') {
    const targetEl = document.getElementById('playlistView');
    const mainWrapper = document.getElementById('mainWrapper');
    if (!targetEl && !mainWrapper) return;

    let coverUrl = null;
    if (playlistId === 'liked' && state.likedSongs.length > 0) {
      coverUrl = state.likedSongs[0].image;
    } else if (playlistId === 'downloaded' && state.offlineTracks.length > 0) {
      coverUrl = state.offlineTracks[0].image;
    } else if (tracks && tracks.length > 0) {
      coverUrl = tracks[0].image;
    }

    const [r, g, b] = await extractDominantColor(coverUrl, playlistId || fallbackKey);
    const darkR = Math.floor(r * 0.35);
    const darkG = Math.floor(g * 0.35);
    const darkB = Math.floor(b * 0.35);

    const gradient = `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, 0.85) 0%, rgba(${darkR}, ${darkG}, ${darkB}, 0.48) 42%, rgba(13, 14, 17, 0.95) 78%, #08090b 100%)`;
    if (targetEl) targetEl.style.setProperty('--playlist-dynamic-gradient', gradient);
    if (mainWrapper) mainWrapper.style.setProperty('--playlist-dynamic-gradient', gradient);
    document.body.style.setProperty('--playlist-dynamic-gradient', gradient);
  }

  function renderPlaylistView(playlistId) {
    switchView('playlist', { force: true });
    state.activePlaylistId = playlistId;
    if (elements.views.playlist) elements.views.playlist.classList.add('active');
    if (elements.contentScroll) elements.contentScroll.scrollTop = 0;

    let title = 'Liked Songs';
    let desc = 'Your collection of favorite songs.';
    let tracks = [];
    let isCustom = false;

    if (playlistId === 'liked') {
      tracks = state.likedSongs;
      elements.deletePlaylistBtn.style.display = 'none';
      elements.playlistCoverArt.innerHTML = createPlaylistCollageHtml(
        state.likedSongs,
        `<svg viewBox="0 0 24 24" fill="currentColor" style="width: 75px; height: 75px; color: #fff;">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>`,
        'linear-gradient(135deg, #450af5 0%, #c4efd9 100%)'
      );
    } else if (playlistId === 'downloaded') {
      title = 'Downloaded Songs';
      desc = 'Stored locally on your device. Listen anywhere 100% offline with zero internet!';
      tracks = state.offlineTracks;
      elements.deletePlaylistBtn.style.display = 'none';
      elements.playlistCoverArt.innerHTML = createPlaylistCollageHtml(
        state.offlineTracks,
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 75px; height: 75px; color: #fff;">
          <circle cx="12" cy="12" r="10" stroke-width="2"/>
          <polyline points="8 12 11 15 16 9"/>
        </svg>`,
        'linear-gradient(135deg, #0575e6 0%, #00f260 100%)'
      );
    } else {
      const pl = state.customPlaylists.find(p => p.id === playlistId);
      if (pl) {
        title = pl.name;
        desc = pl.description || 'Created by MusiSurf Listener';
        tracks = pl.tracks || [];
        isCustom = true;
        elements.deletePlaylistBtn.style.display = 'inline-flex';
        elements.playlistCoverArt.innerHTML = createPlaylistCollageHtml(
          tracks,
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width: 75px; height: 75px; color: var(--accent-primary);">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>`
        );
      }
    }

    elements.playlistTitle.textContent = title;
    elements.playlistDesc.textContent = desc;
    elements.playlistTrackCount.textContent = `${tracks.length} song${tracks.length === 1 ? '' : 's'}`;

    const totalSeconds = tracks.reduce((acc, t) => acc + (t.duration || 210), 0);
    const totalMinutes = Math.round(totalSeconds / 60);
    elements.playlistTotalTime.textContent = `${totalMinutes} min`;

    // Automatically apply Spotify-style dynamic atmospheric background from artwork
    applyPlaylistDynamicBackground(playlistId, tracks, title);

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

    // Sync playlist tracking
    state.activePlaylistTracks = [...tracks];
    state.activePlaylistId = playlistId;

    // Play All Click (plays playlist in sequential order, or toggles pause if already playing)
    elements.playAllPlaylistBtn.onclick = () => {
      if (!tracks || tracks.length === 0) return;
      const isCurrentTrackInThisPlaylist = state.currentTrack && tracks.some(t => t.id === state.currentTrack.id);
      if (isCurrentTrackInThisPlaylist) {
        togglePlayPause();
      } else {
        state.activePlaylistTracks = [...tracks];
        state.activePlaylistId = playlistId;
        state.isPlaylistShuffle = false;
        state.isShuffled = false;
        if (elements.shufflePlaylistBtn) elements.shufflePlaylistBtn.classList.remove('active');
        playTrack(tracks[0], tracks);
      }
    };

    // Shuffle Button (Single Button that changes between Random No-Repeats vs In-Order)
    elements.shufflePlaylistBtn.classList.toggle('active', !!(state.isPlaylistShuffle && state.activePlaylistId === playlistId));
    elements.shufflePlaylistBtn.title = (state.isPlaylistShuffle && state.activePlaylistId === playlistId)
      ? "Mode: Random (No Repeats) • Click for In-Order"
      : "Mode: In-Order • Click to Shuffle (No Repeats)";

    elements.shufflePlaylistBtn.onclick = () => {
      if (!tracks || tracks.length === 0) return;
      state.isPlaylistShuffle = !state.isPlaylistShuffle;
      elements.shufflePlaylistBtn.classList.toggle('active', state.isPlaylistShuffle);
      state.isShuffled = state.isPlaylistShuffle;
      if (elements.shuffleBtn) elements.shuffleBtn.classList.toggle('active', state.isShuffled);
      if (elements.mobShuffleBtn) elements.mobShuffleBtn.classList.toggle('active', state.isShuffled);

      state.activePlaylistTracks = [...tracks];
      state.activePlaylistId = playlistId;

      if (state.isPlaylistShuffle) {
        // True non-repeating random selection from playlist only
        const pool = [...tracks];
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        if (state.currentTrack && pool.length > 1 && pool[0].id === state.currentTrack.id) {
          [pool[0], pool[1]] = [pool[1], pool[0]];
        }
        elements.shufflePlaylistBtn.title = "Mode: Random (No Repeats) • Click for In-Order";
        playTrack(pool[0], pool);
        showToast("Shuffle Mode: Random (No repeats)", "🔀");
      } else {
        // Play strictly in order of playlist
        elements.shufflePlaylistBtn.title = "Mode: In-Order • Click to Shuffle (No Repeats)";
        playTrack(tracks[0], tracks);
        showToast("Play Mode: In Order", "📋");
      }
    };

    updatePlayPauseButton();

    // Delete custom playlist (kept solely inside playlist view)
    elements.deletePlaylistBtn.onclick = () => {
      if (confirm(`Are you sure you want to delete playlist "${title}"?`)) {
        state.customPlaylists = state.customPlaylists.filter(p => p.id !== playlistId);
        saveStoredPlaylists();
        renderSidebarPlaylists();
        updateLibraryUI();
        const returnView = (window.innerWidth <= 768) ? 'library' : 'home';
        switchView(returnView);
        showToast(`Deleted playlist "${title}"`, '🗑️');
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
          ${createPlaylistCollageHtml(pl.tracks)}
        </div>
        <div class="library-item-info">
          <span class="library-item-title">${escapeHtml(pl.name)}</span>
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
  // VIEW NAVIGATION CONTROLLER & HISTORY MANAGEMENT
  // ==========================================================================
  let navHistoryStack = ['home'];

  function switchView(viewName, options = {}) {
    const pushHistory = options.pushHistory !== false;
    const force = options.force === true;
    if (state.currentView === viewName && !force) return;

    state.previousView = state.currentView;
    state.currentView = viewName;
    document.body.dataset.activeView = viewName;

    if (pushHistory) {
      navHistoryStack.push(viewName);
      try {
        window.history.pushState({ view: viewName, depth: navHistoryStack.length }, '', window.location.pathname);
      } catch (e) {}
    }

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
    if (elements.navLiked) elements.navLiked.classList.toggle('active', viewName === 'liked' || (viewName === 'playlist' && state.activePlaylistId === 'liked'));
    if (elements.navDownloaded) elements.navDownloaded.classList.toggle('active', viewName === 'downloaded' || (viewName === 'playlist' && state.activePlaylistId === 'downloaded'));
    if (elements.navLocalMusic) elements.navLocalMusic.classList.toggle('active', viewName === 'localMusic');

    if (elements.lyricsBtn) elements.lyricsBtn.classList.toggle('active', viewName === 'lyrics');

    if (viewName === 'localMusic') {
      updateLocalMusicUI();
    }
    if (viewName === 'library') {
      updateLibraryUI();
    }
    if (viewName === 'lyrics') {
      if (state.currentTrack) {
        if (elements.lyricsTrackTitle) elements.lyricsTrackTitle.textContent = state.currentTrack.title || 'Song Title';
        if (elements.lyricsTrackArtist) elements.lyricsTrackArtist.textContent = state.currentTrack.artist || 'Artist';
        if (elements.lyricsAlbumCover) {
          elements.lyricsAlbumCover.src = state.currentTrack.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80';
          elements.lyricsAlbumCover.style.display = 'block';
        }
        if (!state.lyrics || state.lyrics.length === 0) {
          loadLyricsForTrack(state.currentTrack.title, state.currentTrack.artist);
        } else {
          state.activeLyricIndex = -1;
          syncLyricsWithTime(getCurrentPlaybackTime());
        }
      } else {
        if (elements.lyricsTrackTitle) elements.lyricsTrackTitle.textContent = 'No Song Playing';
        if (elements.lyricsTrackArtist) elements.lyricsTrackArtist.textContent = 'Play a track to view lyrics';
        if (elements.lyricsAlbumCover) {
          elements.lyricsAlbumCover.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80';
        }
      }
    }

    // Sync mobile bottom navigation bar (Home, Search, Library)
    if (elements.mobNavHome && elements.mobNavSearch && elements.mobNavLibrary) {
      elements.mobNavHome.classList.toggle('active', viewName === 'home');
      elements.mobNavSearch.classList.toggle('active', viewName === 'search');
      elements.mobNavLibrary.classList.toggle('active', ['library', 'playlist', 'localMusic'].includes(viewName));
    }

    // Scroll to top and toggle lyrics active state on content scroll
    if (elements.contentScroll) {
      elements.contentScroll.classList.toggle('has-lyrics-active', viewName === 'lyrics');
      elements.contentScroll.scrollTop = 0;
    }
  }

  // Library View Hub UI
  function updateLibraryUI(filter = 'all') {
    if (elements.libHubLikedMeta) {
      elements.libHubLikedMeta.textContent = `${state.likedSongs.length} songs`;
    }
    if (elements.libHubDownloadedMeta) {
      elements.libHubDownloadedMeta.textContent = `${state.offlineTracks.length} songs`;
    }
    if (elements.libHubLocalMeta) {
      elements.libHubLocalMeta.textContent = `${state.localTracks.length} songs • Device Storage`;
    }

    if (elements.libCustomPlaylistsGrid) {
      elements.libCustomPlaylistsGrid.innerHTML = '';

      if (!state.customPlaylists || state.customPlaylists.length === 0) {
        const emptyPromo = document.createElement('div');
        emptyPromo.className = 'empty-playlist-promo';
        emptyPromo.innerHTML = `
          <div class="empty-promo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          <h3 class="empty-promo-title">Create your first playlist</h3>
          <p class="empty-promo-desc">Organize and keep your favorite tracks together in customized collections.</p>
          <button class="btn-primary empty-promo-btn" id="emptyCreatePlaylistBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>Create Playlist</span>
          </button>
        `;
        emptyPromo.querySelector('#emptyCreatePlaylistBtn')?.addEventListener('click', () => {
          elements.createPlaylistModal.style.display = 'flex';
          try { window.history.pushState({ modal: 'createPlaylist' }, '', window.location.pathname); } catch (e) {}
          elements.playlistNameInput?.focus();
        });
        elements.libCustomPlaylistsGrid.appendChild(emptyPromo);
      } else {
        state.customPlaylists.forEach(pl => {
          const card = document.createElement('div');
          card.className = 'track-card custom-playlist-card';
          card.style.cursor = 'pointer';
          card.innerHTML = `
            <div class="card-img-wrapper">
              ${createPlaylistCollageHtml(pl.tracks)}
              <button class="card-play-btn" title="Play Playlist">
                <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
            </div>
            <div class="card-info">
              <span class="card-title">${escapeHtml(pl.name)}</span>
              <span class="card-artist">${(pl.tracks || []).length} songs</span>
            </div>
          `;
          card.querySelector('.card-play-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (pl.tracks && pl.tracks.length > 0) playTrack(pl.tracks[0], pl.tracks);
          });
          card.addEventListener('click', () => {
            renderPlaylistView(pl.id);
          });
          elements.libCustomPlaylistsGrid.appendChild(card);
        });
      }
    }
  }

  // Modal Helpers
  function openAddToPlaylistModal(track) {
    if (!track) return;
    pendingTrackForPlaylist = track;
    elements.modalPlaylistPickerList.innerHTML = '';

    // Always offer "+ Create New Playlist" at top
    const newPlItem = document.createElement('div');
    newPlItem.className = 'library-item';
    newPlItem.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
    newPlItem.style.marginBottom = '8px';
    newPlItem.style.cursor = 'pointer';
    newPlItem.innerHTML = `
      <div class="playlist-cover-mini" style="background: var(--accent-primary); color: #000; display:flex; align-items:center; justify-content:center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </div>
      <div class="library-item-info">
        <span class="library-item-title" style="color: var(--accent-primary); font-weight: 700;">+ New Playlist</span>
        <span class="library-item-meta">Create collection with this song</span>
      </div>
    `;
    newPlItem.addEventListener('click', () => {
      elements.addToPlaylistModal.style.display = 'none';
      elements.createPlaylistModal.style.display = 'flex';
      try { window.history.pushState({ modal: 'createPlaylist' }, '', window.location.pathname); } catch (e) {}
      setTimeout(() => elements.playlistNameInput?.focus(), 60);
    });
    elements.modalPlaylistPickerList.appendChild(newPlItem);

    if (state.customPlaylists.length === 0) {
      const emptyNote = document.createElement('div');
      emptyNote.style.textAlign = 'center';
      emptyNote.style.padding = '16px 0';
      emptyNote.style.color = 'var(--text-secondary)';
      emptyNote.innerHTML = `<p>No other playlists yet. Tap "+ New Playlist" above to create your first!</p>`;
      elements.modalPlaylistPickerList.appendChild(emptyNote);
    } else {
      state.customPlaylists.forEach(pl => {
        const item = document.createElement('div');
        item.className = 'library-item';
        item.style.cursor = 'pointer';
        item.innerHTML = `
          <div class="playlist-cover-mini">
            ${createPlaylistCollageHtml(pl.tracks)}
          </div>
          <div class="library-item-info">
            <span class="library-item-title">${escapeHtml(pl.name)}</span>
            <span class="library-item-meta">${pl.tracks?.length || 0} songs</span>
          </div>
        `;
        item.addEventListener('click', () => {
          if (!pl.tracks) pl.tracks = [];
          if (!pl.tracks.some(t => t.id === track.id)) {
            pl.tracks.push(track);
            saveStoredPlaylists();
            updateAllPlaylistTickBadges(track.id);
            showToast(`Added to "${pl.name}"`, '✓');
          } else {
            showToast(`Already in "${pl.name}"`, 'ℹ');
          }
          elements.addToPlaylistModal.style.display = 'none';
          pendingTrackForPlaylist = null;
        });
        elements.modalPlaylistPickerList.appendChild(item);
      });
    }

    elements.addToPlaylistModal.style.display = 'flex';
    try { window.history.pushState({ modal: 'addToPlaylist' }, '', window.location.pathname); } catch (e) {}
  }

  // ==========================================================================
  // SETTINGS CONTROLLER (Dead Silence Remover & Keyboard Shortcuts)
  // ==========================================================================
  function loadSettings() {
    try {
      const saved = localStorage.getItem('musisurf_settings');
      if (saved) {
        state.settings = { ...state.settings, ...JSON.parse(saved) };
      }
    } catch (e) {}

    if (elements.deadSilenceOnRadio && elements.deadSilenceOffRadio) {
      if (state.settings.removeDeadSilence) {
        elements.deadSilenceOnRadio.checked = true;
      } else {
        elements.deadSilenceOffRadio.checked = true;
      }
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem('musisurf_settings', JSON.stringify(state.settings));
    } catch (e) {}
  }

  // ==========================================================================
  // LOCAL MUSIC STORAGE & PLAYBACK (100% Private to Device)
  // ==========================================================================
  const LOCAL_DB_NAME = 'MusiSurfLocalDB';
  const LOCAL_STORE_NAME = 'local_music_files';
  let localDbPromise = null;

  function getLocalDB() {
    if (!localDbPromise) {
      localDbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(LOCAL_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(LOCAL_STORE_NAME)) {
            db.createObjectStore(LOCAL_STORE_NAME, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return localDbPromise;
  }

  async function loadLocalTracksFromDB() {
    try {
      const db = await getLocalDB();
      const tx = db.transaction(LOCAL_STORE_NAME, 'readonly');
      const store = tx.objectStore(LOCAL_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        state.localTracks = req.result || [];
        updateLocalMusicUI();
      };
    } catch (e) {
      console.warn('Error loading local tracks:', e);
    }
  }

  async function saveLocalTrackToDB(track) {
    try {
      const db = await getLocalDB();
      const tx = db.transaction(LOCAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(LOCAL_STORE_NAME);
      store.put(track);
      tx.oncomplete = () => {
        const existingIdx = state.localTracks.findIndex(t => t.id === track.id);
        if (existingIdx !== -1) {
          state.localTracks[existingIdx] = track;
        } else {
          state.localTracks.unshift(track);
        }
        updateLocalMusicUI();
        showToast(`Saved "${track.title}" to Local Files`, '📁');
      };
    } catch (e) {
      console.warn('Error saving local track to DB:', e);
    }
  }

  async function deleteLocalTrackFromDB(trackId) {
    try {
      const db = await getLocalDB();
      const tx = db.transaction(LOCAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(LOCAL_STORE_NAME);
      store.delete(trackId);
      tx.oncomplete = () => {
        state.localTracks = state.localTracks.filter(t => t.id !== trackId);
        updateLocalMusicUI();
        showToast('Removed from Local Files');
      };
    } catch (e) {
      console.warn('Error deleting local track:', e);
    }
  }

  async function clearAllLocalTracksFromDB() {
    if (!confirm('Are you sure you want to remove all local files from MusiSurf? (Your actual device files will not be deleted)')) return;
    try {
      const db = await getLocalDB();
      const tx = db.transaction(LOCAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(LOCAL_STORE_NAME);
      store.clear();
      tx.oncomplete = () => {
        state.localTracks = [];
        updateLocalMusicUI();
        showToast('Cleared all local files');
      };
    } catch (e) {
      console.warn('Error clearing local tracks:', e);
    }
  }

  const DEFAULT_LOCAL_COVER = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23161822"/><stop offset="100%" stop-color="%230c0e14"/></linearGradient><linearGradient id="acc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%231db954"/><stop offset="100%" stop-color="%2300f260"/></linearGradient></defs><rect width="300" height="300" rx="16" fill="url(%23bg)"/><rect x="1" y="1" width="298" height="298" rx="15" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/><circle cx="150" cy="150" r="64" fill="rgba(29,185,84,0.12)"/><path d="M130 190V110l55-12v82M130 148l55-12" stroke="url(%23acc)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="114" cy="190" r="16" fill="url(%23acc)"/><circle cx="169" cy="178" r="16" fill="url(%23acc)"/></svg>';

  function updateLocalMusicUI() {
    const count = state.localTracks.length;
    if (elements.localCountMeta) elements.localCountMeta.textContent = `${count} songs • On Device`;
    if (elements.libHubLocalMeta) elements.libHubLocalMeta.textContent = `${count} songs • Device Storage`;
    if (elements.localTrackCount) elements.localTrackCount.textContent = `${count} songs`;

    const totalSeconds = state.localTracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    const totalMinutes = Math.round(totalSeconds / 60);
    if (elements.localTotalTime) elements.localTotalTime.textContent = `${totalMinutes} min`;

    if (count === 0) {
      if (elements.localEmptyState) elements.localEmptyState.style.display = 'flex';
      if (elements.localTracksContainer) elements.localTracksContainer.style.display = 'none';
      if (elements.playAllLocalBtn) elements.playAllLocalBtn.style.display = 'none';
      if (elements.clearAllLocalBtn) elements.clearAllLocalBtn.style.display = 'none';
      if (elements.localTracksTbody) elements.localTracksTbody.innerHTML = '';
      return;
    }

    if (elements.localEmptyState) elements.localEmptyState.style.display = 'none';
    if (elements.localTracksContainer) elements.localTracksContainer.style.display = 'block';
    if (elements.playAllLocalBtn) elements.playAllLocalBtn.style.display = 'inline-flex';
    if (elements.clearAllLocalBtn) elements.clearAllLocalBtn.style.display = 'inline-flex';

    if (elements.localTracksTbody) {
      elements.localTracksTbody.innerHTML = '';
      state.localTracks.forEach((track, idx) => {
        const tr = document.createElement('tr');
        tr.className = state.currentTrack?.id === track.id ? 'playing' : '';
        tr.dataset.trackId = track.id;

        tr.innerHTML = `
          <td class="col-num">${idx + 1}</td>
          <td class="col-title">
            <div class="table-title-cell">
              <img src="${track.image || DEFAULT_LOCAL_COVER}" alt="${track.title}" class="table-cover">
              <div>
                <div class="table-title-main">${track.title}</div>
                <div class="table-artist-sub">${track.artist || 'Local File'}</div>
              </div>
            </div>
          </td>
          <td class="col-album">${track.fileName || track.album || 'Device Storage'}</td>
          <td class="col-actions">
            <button class="song-action-btn add-to-queue-trigger" title="Add to Queue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="16" y2="18"/>
                <line x1="19" y1="15" x2="19" y2="21"/>
                <line x1="16" y1="18" x2="22" y2="18"/>
              </svg>
            </button>
            <button class="song-action-btn delete-local-trigger" title="Remove from Local Files">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </td>
          <td class="col-duration">${track.durationStr || '--:--'}</td>
        `;

        tr.addEventListener('click', (e) => {
          if (e.target.closest('.delete-local-trigger')) {
            e.stopPropagation();
            deleteLocalTrackFromDB(track.id);
            return;
          }
          if (e.target.closest('.add-to-queue-trigger')) {
            e.stopPropagation();
            addToQueue(track);
            return;
          }
          playTrack(track, state.localTracks);
        });

        elements.localTracksTbody.appendChild(tr);
      });
    }
  }

  function handleLocalAudioFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    Array.from(fileList).forEach(file => {
      const isAudio = file.type.startsWith('audio/') || /\.(mp3|m4a|wav|flac|ogg|aac)$/i.test(file.name);
      if (!isAudio) return;

      const cleanTitle = file.name.replace(/\.[^/.]+$/, "");
      const track = {
        id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title: cleanTitle,
        artist: 'Local Artist',
        album: 'Device Storage',
        fileName: file.name,
        fileSize: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
        duration: 0,
        durationStr: '--:--',
        image: DEFAULT_LOCAL_COVER,
        isLocal: true,
        fileBlob: file,
        hasDirectAudio: true,
        addedAt: Date.now()
      };

      const tempAudio = new Audio();
      const objectUrl = URL.createObjectURL(file);
      tempAudio.src = objectUrl;
      tempAudio.onloadedmetadata = () => {
        if (tempAudio.duration && isFinite(tempAudio.duration)) {
          track.duration = Math.round(tempAudio.duration);
          track.durationStr = formatTime(track.duration);
        }
        URL.revokeObjectURL(objectUrl);
        saveLocalTrackToDB(track);
      };
      tempAudio.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        saveLocalTrackToDB(track);
      };
    });
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

    // Home Filter Pills (100% Bollywood Moods & Dynamic Quick Picks Update)
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const filter = pill.dataset.filter;

        const visibleTracks = [];
        document.querySelectorAll('.shelf-section').forEach(shelf => {
          const match = (filter === 'all' || shelf.dataset.shelfId === filter);
          if (match) {
            shelf.style.display = 'flex';
            if (shelf._sectionData && Array.isArray(shelf._sectionData.tracks)) {
              visibleTracks.push(...shelf._sectionData.tracks);
            }
          } else {
            shelf.style.display = 'none';
          }
        });

        // Dynamically update Quick Picks at the top of the Home page with songs matching the chosen category!
        if (visibleTracks.length > 0) {
          renderQuickPicks(deduplicateAndShuffleAlbums(visibleTracks, 6));
        } else if (state.allAvailableTracks && state.allAvailableTracks.length > 0) {
          renderQuickPicks(deduplicateAndShuffleAlbums(state.allAvailableTracks, 6));
        }
      });
    });

    // Player Controls
    elements.playPauseBtn.addEventListener('click', togglePlayPause);
    elements.nextBtn.addEventListener('click', nextTrack);
    elements.prevBtn.addEventListener('click', prevTrack);
    elements.playerHeartBtn.addEventListener('click', () => {
      if (state.currentTrack) toggleLikeSong(state.currentTrack);
    });

    // Repeat Mode Synchronization (Desktop & Mobile, with audio.loop for seamless repeat)
    function updateRepeatUI() {
      const isRepeatOn = state.repeatMode !== 'off';
      const isRepeatOne = state.repeatMode === 'one';

      if (elements.audio) {
        elements.audio.loop = isRepeatOne;
      }

      [elements.repeatBtn, elements.mobRepeatBtn].forEach(btn => {
        if (!btn) return;
        btn.classList.toggle('active', isRepeatOn);
        btn.title = isRepeatOne ? 'Repeat: Current Track' : (isRepeatOn ? 'Repeat: Entire Queue' : 'Enable Repeat');
        const indicator = btn.querySelector('.repeat-one-indicator');
        if (indicator) {
          indicator.style.display = isRepeatOne ? 'flex' : 'none';
        }
      });
    }

    function toggleRepeatMode() {
      if (state.repeatMode === 'off') {
        state.repeatMode = 'one';
      } else if (state.repeatMode === 'one') {
        state.repeatMode = 'all';
      } else {
        state.repeatMode = 'off';
      }
      updateRepeatUI();
    }

    elements.repeatBtn.addEventListener('click', toggleRepeatMode);
    if (elements.mobRepeatBtn) elements.mobRepeatBtn.addEventListener('click', toggleRepeatMode);

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

    // Interactive Draggable Scrubber Engine (Desktop & Mobile, Mouse & Touch)
    function setupDraggableScrubber(barEl, fillEl, timeLabelEl, isMobileScrubber = false) {
      if (!barEl) return;

      let isDragging = false;
      let dragPct = 0;

      function updateScrubUI(pct) {
        dragPct = Math.max(0, Math.min(1, pct));
        const dur = getTotalDuration();
        const displayTime = formatTime(dragPct * dur);

        if (fillEl) fillEl.style.width = `${dragPct * 100}%`;
        if (timeLabelEl) timeLabelEl.textContent = displayTime;

        // Keep desktop and mobile scrubber bars in sync during drag
        if (elements.progressFill && fillEl !== elements.progressFill) {
          elements.progressFill.style.width = `${dragPct * 100}%`;
        }
        if (elements.mobProgressFill && fillEl !== elements.mobProgressFill) {
          elements.mobProgressFill.style.width = `${dragPct * 100}%`;
        }
        if (elements.miniPlayerFill) {
          elements.miniPlayerFill.style.width = `${dragPct * 100}%`;
        }
        if (elements.currentTimeLabel) elements.currentTimeLabel.textContent = displayTime;
        if (elements.mobCurrentTime) elements.mobCurrentTime.textContent = displayTime;

        if (elements.progressHoverTime && !isMobileScrubber) {
          const rect = barEl.getBoundingClientRect();
          elements.progressHoverTime.style.left = `${dragPct * rect.width}px`;
          elements.progressHoverTime.textContent = displayTime;
        }
      }

      function getClientX(e) {
        if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
        if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
        return e.clientX;
      }

      function handleStart(e) {
        isDragging = true;
        state.isDraggingProgress = true;
        barEl.classList.add('scrubbing');
        const rect = barEl.getBoundingClientRect();
        const clientX = getClientX(e);
        const pct = (clientX - rect.left) / rect.width;
        updateScrubUI(pct);
        e.preventDefault();
      }

      function handleMove(e) {
        if (!isDragging) return;
        const rect = barEl.getBoundingClientRect();
        const clientX = getClientX(e);
        const pct = (clientX - rect.left) / rect.width;
        updateScrubUI(pct);
        e.preventDefault();
      }

      function handleEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        barEl.classList.remove('scrubbing');
        const dur = getTotalDuration();
        if (dur > 0) {
          seekTo(dragPct * dur);
        }
        setTimeout(() => {
          state.isDraggingProgress = false;
        }, 80);
      }

      // Mouse drag events
      barEl.addEventListener('mousedown', (e) => {
        handleStart(e);
        const onMouseMove = (ev) => handleMove(ev);
        const onMouseUp = (ev) => {
          handleEnd(ev);
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      // Touch drag events (Mobile phones & tablets)
      barEl.addEventListener('touchstart', (e) => {
        handleStart(e);
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (isDragging) handleMove(e);
      }, { passive: false });

      window.addEventListener('touchend', (e) => {
        if (isDragging) handleEnd(e);
      });
      window.addEventListener('touchcancel', (e) => {
        if (isDragging) handleEnd(e);
      });

      // Hover preview time for desktop
      if (!isMobileScrubber && elements.progressHoverTime) {
        barEl.addEventListener('mousemove', (e) => {
          if (isDragging) return;
          const rect = barEl.getBoundingClientRect();
          const hoverX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const pct = hoverX / rect.width;
          const dur = getTotalDuration();
          elements.progressHoverTime.style.left = `${hoverX}px`;
          elements.progressHoverTime.textContent = formatTime(pct * dur);
        });
      }
    }

    // Attach to Desktop, Fullscreen Mobile, and Floating Mini-Player Scrubber
    setupDraggableScrubber(elements.progressBar, elements.progressFill, elements.currentTimeLabel, false);
    setupDraggableScrubber(elements.mobProgressBar, elements.mobProgressFill, elements.mobCurrentTime, true);
    if (elements.miniPlayerTrack && elements.miniPlayerFill) {
      setupDraggableScrubber(elements.miniPlayerTrack, elements.miniPlayerFill, null, true);
    }

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

    // Queue Drawer Toggle & Outside Click Dismissal
    const closeQueueDrawer = () => {
      if (elements.queueDrawer && elements.queueDrawer.classList.contains('open')) {
        elements.queueDrawer.classList.remove('open');
        if (elements.queueBtn) elements.queueBtn.classList.remove('active');
        if (elements.queueDrawerBackdrop) elements.queueDrawerBackdrop.classList.remove('active');
      }
    };

    if (elements.queueBtn) {
      elements.queueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !elements.queueDrawer.classList.contains('open');
        elements.queueDrawer.classList.toggle('open', willOpen);
        elements.queueBtn.classList.toggle('active', willOpen);
        if (elements.queueDrawerBackdrop) elements.queueDrawerBackdrop.classList.toggle('active', willOpen);
      });
    }

    if (elements.closeQueueBtn) {
      elements.closeQueueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeQueueDrawer();
      });
    }

    if (elements.queueDrawerBackdrop) {
      elements.queueDrawerBackdrop.addEventListener('click', (e) => {
        e.stopPropagation();
        closeQueueDrawer();
      });
    }

    // Dismiss queue drawer when clicking or tapping anywhere outside (capture phase so no stopPropagation blocks it)
    document.addEventListener('click', (e) => {
      if (elements.queueDrawer && elements.queueDrawer.classList.contains('open')) {
        const isClickInside = elements.queueDrawer.contains(e.target);
        const isClickOnBtn = elements.queueBtn && elements.queueBtn.contains(e.target);
        if (!isClickInside && !isClickOnBtn) {
          closeQueueDrawer();
        }
      }
    }, true);

    document.addEventListener('touchend', (e) => {
      if (elements.queueDrawer && elements.queueDrawer.classList.contains('open')) {
        const isClickInside = elements.queueDrawer.contains(e.target);
        const isClickOnBtn = elements.queueBtn && elements.queueBtn.contains(e.target);
        if (!isClickInside && !isClickOnBtn) {
          closeQueueDrawer();
        }
      }
    }, { passive: true, capture: true });

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
    if (elements.closeLyricsBtn) elements.closeLyricsBtn.addEventListener('click', () => switchView(state.previousView && state.previousView !== 'lyrics' ? state.previousView : 'home'));

    // Song image is explicitly not clickable per user specification
    if (elements.playerCoverWrapper) {
      elements.playerCoverWrapper.style.cursor = 'default';
    }

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
        tracks: pendingTrackForPlaylist ? [pendingTrackForPlaylist] : []
      };

      state.customPlaylists.push(newPl);
      saveStoredPlaylists();
      elements.createPlaylistModal.style.display = 'none';
      elements.playlistNameInput.value = '';
      elements.playlistDescInput.value = '';
      if (pendingTrackForPlaylist) {
        showToast(`Created "${name}" & added "${pendingTrackForPlaylist.title}"!`, '✓');
        pendingTrackForPlaylist = null;
      } else {
        showToast(`Created playlist "${name}"`, '✓');
      }
      renderPlaylistView(newPl.id);
    });

    // Add to Playlist Modal Close
    if (elements.closeAddToPlaylistBtn) {
      elements.closeAddToPlaylistBtn.addEventListener('click', () => {
        elements.addToPlaylistModal.style.display = 'none';
      });
    }

    // Settings Modal
    const openSettingsModal = () => {
      loadSettings();
      if (elements.settingsModal) {
        elements.settingsModal.style.display = 'flex';
        try { window.history.pushState({ modal: 'settings' }, '', window.location.pathname); } catch (e) {}
      }
    };
    const closeSettingsModal = () => {
      if (elements.settingsModal) elements.settingsModal.style.display = 'none';
    };

    if (elements.openSettingsBtn) elements.openSettingsBtn.addEventListener('click', openSettingsModal);
    if (elements.headerSettingsBtn) elements.headerSettingsBtn.addEventListener('click', openSettingsModal);
    if (elements.closeSettingsModalBtn) elements.closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
    if (elements.libHubSettingsBtn) elements.libHubSettingsBtn.addEventListener('click', openSettingsModal);

    // Desktop History Navigation Controls
    if (elements.historyBackBtn) {
      elements.historyBackBtn.removeAttribute('disabled');
      elements.historyBackBtn.addEventListener('click', () => window.history.back());
    }
    if (elements.historyForwardBtn) {
      elements.historyForwardBtn.removeAttribute('disabled');
      elements.historyForwardBtn.addEventListener('click', () => window.history.forward());
    }

    // Mobile Playlist Back Button
    if (elements.playlistBackBtn) {
      elements.playlistBackBtn.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          switchView('library');
        } else {
          switchView(state.previousView || 'home');
        }
      });
    }

    if (elements.deadSilenceOnRadio) {
      elements.deadSilenceOnRadio.addEventListener('change', () => {
        state.settings.removeDeadSilence = true;
        saveSettings();
        showToast('Dead silence removal enabled (intro & outro only)', '✨');
      });
    }

    if (elements.deadSilenceOffRadio) {
      elements.deadSilenceOffRadio.addEventListener('change', () => {
        state.settings.removeDeadSilence = false;
        saveSettings();
        showToast('Dead silence removal disabled', '⚙');
      });
    }

    // Local Files Event Listeners
    if (elements.navLocalMusic) {
      elements.navLocalMusic.addEventListener('click', () => switchView('localMusic'));
    }

    if (elements.localDropZone) {
      ['dragenter', 'dragover'].forEach(name => {
        elements.localDropZone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          elements.localDropZone.classList.add('drag-over');
        });
      });
      ['dragleave', 'drop'].forEach(name => {
        elements.localDropZone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          elements.localDropZone.classList.remove('drag-over');
        });
      });
      elements.localDropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          handleLocalAudioFiles(dt.files);
        }
      });
      elements.localDropZone.addEventListener('click', () => {
        elements.localAudioFileInput?.click();
      });
    }

    if (elements.localAudioFileInput) {
      elements.localAudioFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleLocalAudioFiles(e.target.files);
          e.target.value = '';
        }
      });
    }

    if (elements.playAllLocalBtn) {
      elements.playAllLocalBtn.addEventListener('click', () => {
        if (state.localTracks.length > 0) {
          playTrack(state.localTracks[0], state.localTracks);
        }
      });
    }

    if (elements.clearAllLocalBtn) {
      elements.clearAllLocalBtn.addEventListener('click', () => {
        clearAllLocalTracksFromDB();
      });
    }

    // Close Modals on Backdrop Click
    [elements.createPlaylistModal, elements.addToPlaylistModal, elements.settingsModal].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.style.display = 'none';
        });
      }
    });

    // Audio Element Native Events
    elements.audio.addEventListener('play', () => {
      state.isPlaying = true;
      updatePlayPauseButton();
    });
    elements.audio.addEventListener('pause', () => {
      state.isPlaying = false;
      updatePlayPauseButton();
      savePlaybackState();
    });
    elements.audio.addEventListener('timeupdate', () => {
      if (state.isPlaying && !state.isDraggingProgress && state.currentTrack) {
        const cur = elements.audio.currentTime || 0;
        const dur = elements.audio.duration || state.currentTrack.duration || 0;
        elements.currentTimeLabel.textContent = formatTime(cur);
        if (elements.mobCurrentTime) elements.mobCurrentTime.textContent = formatTime(cur);
        if (dur > 0) {
          const pct = Math.min(100, (cur / dur) * 100);
          elements.progressFill.style.width = `${pct}%`;
          if (elements.mobProgressFill) elements.mobProgressFill.style.width = `${pct}%`;
          if (elements.miniPlayerFill) elements.miniPlayerFill.style.width = `${pct}%`;
        }
        syncLyricsWithTime(cur);
      }
    });
    elements.audio.addEventListener('ended', onTrackEnded);
    elements.audio.addEventListener('error', (err) => {
      console.warn('Audio stream error event:', err);
      if (state.currentTrack?.streamUrl && elements.audio.src !== state.currentTrack.streamUrl) {
        console.log('Switching to MusiSurf stream proxy after error...');
        elements.audio.src = state.currentTrack.streamUrl;
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

    // Save playback position on tab close or page unload
    window.addEventListener('beforeunload', savePlaybackState);
    window.addEventListener('pagehide', savePlaybackState);

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

    // Mobile Bottom Navigation Tabs (Strictly: Home, Search, Library)
    const updateMobNav = (btnId) => {
      [elements.mobNavHome, elements.mobNavSearch, elements.mobNavLibrary].forEach(btn => {
        if (btn) btn.classList.toggle('active', btn.id === btnId);
      });
    };

    if (elements.mobNavHome) elements.mobNavHome.addEventListener('click', () => {
      switchView('home');
      updateMobNav('mobNavHome');
    });

    // Mobile Search Button:
    // - 1st tap: switches to search section without auto-focusing the keyboard
    // - 2nd tap: focuses the search bar to bring up the keyboard
    // - Long-press / hold: immediately opens search and focuses search bar
    let searchHoldTimer = null;
    let isSearchHoldTriggered = false;

    function triggerSearchFocus() {
      switchView('search');
      updateMobNav('mobNavSearch');
      setTimeout(() => {
        if (elements.globalSearchInput) elements.globalSearchInput.focus();
      }, 70);
    }

    if (elements.mobNavSearch) {
      // Touch long-press hold detection
      elements.mobNavSearch.addEventListener('touchstart', () => {
        isSearchHoldTriggered = false;
        searchHoldTimer = setTimeout(() => {
          isSearchHoldTriggered = true;
          if (navigator.vibrate) navigator.vibrate(40);
          triggerSearchFocus();
        }, 360);
      }, { passive: true });

      elements.mobNavSearch.addEventListener('touchend', () => {
        clearTimeout(searchHoldTimer);
      });
      elements.mobNavSearch.addEventListener('touchmove', () => {
        clearTimeout(searchHoldTimer);
      });

      // Mouse long-press hold detection
      elements.mobNavSearch.addEventListener('mousedown', () => {
        isSearchHoldTriggered = false;
        searchHoldTimer = setTimeout(() => {
          isSearchHoldTriggered = true;
          triggerSearchFocus();
        }, 360);
      });
      elements.mobNavSearch.addEventListener('mouseup', () => {
        clearTimeout(searchHoldTimer);
      });
      elements.mobNavSearch.addEventListener('mouseleave', () => {
        clearTimeout(searchHoldTimer);
      });

      elements.mobNavSearch.addEventListener('click', (e) => {
        if (isSearchHoldTriggered) {
          isSearchHoldTriggered = false;
          e.preventDefault();
          return;
        }
        clearTimeout(searchHoldTimer);

        if (state.currentView !== 'search') {
          // 1st click: redirect to search section without keyboard popup
          switchView('search');
          updateMobNav('mobNavSearch');
        } else {
          // 2nd click: already in search section, focus search bar
          triggerSearchFocus();
        }
      });
    }

    if (elements.mobNavLibrary) elements.mobNavLibrary.addEventListener('click', () => {
      switchView('library');
      updateMobNav('mobNavLibrary');
    });

    // Library View Hub Card Event Listeners
    if (elements.libSettingsBtn) {
      elements.libSettingsBtn.addEventListener('click', openSettingsModal);
    }
    if (elements.libFilterPillsBar) {
      elements.libFilterPillsBar.addEventListener('click', (e) => {
        const pill = e.target.closest('.lib-pill');
        if (!pill) return;
        const filter = pill.dataset.libFilter;
        elements.libFilterPillsBar.querySelectorAll('.lib-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        if (filter === 'all') {
          if (elements.libHubGrid) elements.libHubGrid.style.display = '';
          if (elements.libPlaylistsSection) elements.libPlaylistsSection.style.display = 'block';
          updateLibraryUI('all');
        } else if (filter === 'playlists') {
          if (elements.libHubGrid) elements.libHubGrid.style.display = 'none';
          if (elements.libPlaylistsSection) elements.libPlaylistsSection.style.display = 'block';
          updateLibraryUI('playlists');
        } else if (filter === 'downloaded') {
          renderPlaylistView('downloaded');
        } else if (filter === 'liked') {
          renderPlaylistView('liked');
        } else if (filter === 'local') {
          switchView('localMusic');
        }
      });
    }
    if (elements.libHubLikedBtn) {
      elements.libHubLikedBtn.addEventListener('click', () => renderPlaylistView('liked'));
    }
    if (elements.libHubDownloadedBtn) {
      elements.libHubDownloadedBtn.addEventListener('click', () => renderPlaylistView('downloaded'));
    }
    if (elements.libHubLocalBtn) {
      elements.libHubLocalBtn.addEventListener('click', () => switchView('localMusic'));
    }
    const openCreatePlaylistModal = () => {
      elements.createPlaylistModal.style.display = 'flex';
      try { window.history.pushState({ modal: 'createPlaylist' }, '', window.location.pathname); } catch (e) {}
      elements.playlistNameInput.focus();
    };
    if (elements.libViewCreatePlaylistBtn) {
      elements.libViewCreatePlaylistBtn.addEventListener('click', openCreatePlaylistModal);
    }
    if (elements.libHeaderAddPlaylistBtn) {
      elements.libHeaderAddPlaylistBtn.addEventListener('click', openCreatePlaylistModal);
    }

    // Mobile Mini-Player Bar Click -> Opens Fullscreen Mobile Player
    elements.playerBar.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        if (e.target.closest('#miniPlayerTrack') || e.target.closest('#playPauseBtn') || e.target.closest('#playerHeartBtn') || e.target.closest('#playerDownloadBtn')) {
          return;
        }
        if (state.currentTrack) {
          elements.mobilePlayerModal.style.display = 'flex';
          try { window.history.pushState({ modal: 'mobilePlayer' }, '', window.location.pathname); } catch (e) {}
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

    // ==========================================================================
    // SLEEP TIMER CONTROLLER (Multiples of 5: 5..50 mins + Custom + Auto Pause)
    // ==========================================================================
    function openSleepTimerModal() {
      updateSleepTimerUI();
      if (elements.sleepTimerModal) {
        elements.sleepTimerModal.style.display = 'flex';
        try { window.history.pushState({ modal: 'sleepTimer' }, '', window.location.pathname); } catch (e) {}
      }
    }

    function closeSleepTimerModal() {
      if (elements.sleepTimerModal) {
        elements.sleepTimerModal.style.display = 'none';
      }
    }

    function updateSleepTimerUI() {
      const isActive = !!(state.sleepTimer && state.sleepTimer.targetTime && state.sleepTimer.targetTime > Date.now());
      
      document.querySelectorAll('.timer-option-btn').forEach(btn => {
        const mins = parseInt(btn.dataset.minutes, 10);
        btn.classList.toggle('active', isActive && state.sleepTimer.durationMinutes === mins);
      });

      if (elements.turnOffTimerBtn) {
        elements.turnOffTimerBtn.style.display = isActive ? 'block' : 'none';
      }

      const mobDot = document.getElementById('mobTimerDot');
      if (mobDot) mobDot.style.display = isActive ? 'block' : 'none';
      if (elements.mobPlayerTimerBtn) elements.mobPlayerTimerBtn.classList.toggle('timer-active', isActive);

      if (isActive) {
        const remainingSec = Math.max(0, Math.round((state.sleepTimer.targetTime - Date.now()) / 1000));
        const remainingMin = Math.ceil(remainingSec / 60);
        if (elements.sleepTimerActiveStatus) {
          elements.sleepTimerActiveStatus.textContent = `Timer active: ~${remainingMin} minute${remainingMin === 1 ? '' : 's'} remaining (${formatTime(remainingSec)}).`;
          elements.sleepTimerActiveStatus.style.color = 'var(--accent-primary)';
        }
        if (elements.mobTimerBadge) {
          elements.mobTimerBadge.textContent = `${remainingMin}m`;
          elements.mobTimerBadge.parentElement?.classList.add('active');
        }
      } else {
        if (elements.sleepTimerActiveStatus) {
          elements.sleepTimerActiveStatus.textContent = 'Pause music automatically after a set duration.';
          elements.sleepTimerActiveStatus.style.color = '';
        }
        if (elements.mobTimerBadge) {
          elements.mobTimerBadge.textContent = 'Sleep Timer';
          elements.mobTimerBadge.parentElement?.classList.remove('active');
        }
      }
    }

    function startSleepTimer(minutes) {
      if (!minutes || isNaN(minutes) || minutes <= 0) return;
      cancelSleepTimer(false);

      const ms = minutes * 60 * 1000;
      state.sleepTimer.durationMinutes = minutes;
      state.sleepTimer.targetTime = Date.now() + ms;

      state.sleepTimer.timeoutId = setTimeout(() => {
        if (state.isPlaying) {
          togglePlayPause();
        }
        cancelSleepTimer(false);
        showToast('Sleep timer ended. Playback paused.', '🌙');
      }, ms);

      state.sleepTimer.intervalId = setInterval(() => {
        if (!state.sleepTimer.targetTime || state.sleepTimer.targetTime <= Date.now()) {
          cancelSleepTimer(false);
        } else {
          updateSleepTimerUI();
        }
      }, 1000);

      updateSleepTimerUI();
      closeSleepTimerModal();
      showToast(`Sleep timer set for ${minutes} minute${minutes === 1 ? '' : 's'}.`, '⏱️');
    }

    function cancelSleepTimer(showFeedback = true) {
      if (state.sleepTimer.timeoutId) clearTimeout(state.sleepTimer.timeoutId);
      if (state.sleepTimer.intervalId) clearInterval(state.sleepTimer.intervalId);
      state.sleepTimer.timeoutId = null;
      state.sleepTimer.intervalId = null;
      state.sleepTimer.targetTime = null;
      state.sleepTimer.durationMinutes = 0;

      updateSleepTimerUI();
      if (showFeedback) {
        closeSleepTimerModal();
        showToast('Sleep timer turned off.', '⚪');
      }
    }

    // Fullscreen Mobile Player Outside Utility Buttons
    if (elements.mobPlayerOptionsBtn) {
      elements.mobPlayerOptionsBtn.addEventListener('click', () => {
        if (state.currentTrack) openTrackOptionsMenu(state.currentTrack);
      });
    }

    if (elements.mobPlayerLyricsBtn) {
      elements.mobPlayerLyricsBtn.addEventListener('click', () => {
        if (elements.mobilePlayerModal) elements.mobilePlayerModal.style.display = 'none';
        switchView('lyrics');
      });
    }

    if (elements.mobPlayerShareBtn) {
      elements.mobPlayerShareBtn.addEventListener('click', async () => {
        const track = state.currentTrack;
        if (!track) return;
        if (navigator.share) {
          try {
            await navigator.share({
              title: track.title,
              text: `Listen to "${track.title}" by ${track.artist} on MusiSurf!`,
              url: window.location.href
            });
          } catch (e) {}
        } else {
          try {
            await navigator.clipboard.writeText(`${track.title} - ${track.artist} | MusiSurf: ${window.location.href}`);
          } catch (e) {}
        }
      });
    }

    if (elements.mobPlayerTimerBtn) {
      elements.mobPlayerTimerBtn.addEventListener('click', openSleepTimerModal);
    }

    // Mobile Player 3-Bar Options Button & Bottom Sheet
    if (elements.closeMobOptionsBtn) {
      elements.closeMobOptionsBtn.addEventListener('click', () => {
        if (elements.mobTrackOptionsModal) elements.mobTrackOptionsModal.style.display = 'none';
      });
    }

    if (elements.mobOptAddToPlaylistBtn) {
      elements.mobOptAddToPlaylistBtn.addEventListener('click', () => {
        if (elements.mobTrackOptionsModal) elements.mobTrackOptionsModal.style.display = 'none';
        const target = state.contextTrack || state.currentTrack;
        if (target) openAddToPlaylistModal(target);
      });
    }

    if (elements.mobOptQueueBtn) {
      elements.mobOptQueueBtn.addEventListener('click', () => {
        if (elements.mobTrackOptionsModal) elements.mobTrackOptionsModal.style.display = 'none';
        const target = state.contextTrack || state.currentTrack;
        if (target) addToQueue(target);
      });
    }

    if (elements.mobOptDownloadBtn) {
      elements.mobOptDownloadBtn.addEventListener('click', () => {
        if (elements.mobTrackOptionsModal) elements.mobTrackOptionsModal.style.display = 'none';
        const target = state.contextTrack || state.currentTrack;
        if (!target) return;
        const isDownloaded = isTrackDownloaded(target.id);
        const isDownloadedView = state.currentView === 'playlist' && state.activePlaylistId === 'downloaded';
        if (isDownloaded || isDownloadedView) {
          if (confirm(`Remove "${target.title}" from downloaded songs?`)) {
            deleteOfflineTrackFromDB(target.id);
          }
        } else {
          downloadSong(target);
        }
      });
    }

    if (elements.mobOptRemovePlaylistBtn) {
      elements.mobOptRemovePlaylistBtn.addEventListener('click', () => {
        if (elements.mobTrackOptionsModal) elements.mobTrackOptionsModal.style.display = 'none';
        const target = state.contextTrack || state.currentTrack;
        if (target && state.activePlaylistId) {
          const pl = state.customPlaylists.find(p => p.id === state.activePlaylistId);
          if (pl) {
            pl.tracks = (pl.tracks || []).filter(t => t.id !== target.id);
            saveStoredPlaylists();
            updateAllPlaylistTickBadges(target.id);
            renderPlaylistView(pl.id);
            showToast(`Removed "${target.title}" from ${pl.name}`, '🗑️');
          }
        }
      });
    }

    if (elements.mobTrackOptionsModal) {
      elements.mobTrackOptionsModal.addEventListener('click', (e) => {
        if (e.target === elements.mobTrackOptionsModal) {
          elements.mobTrackOptionsModal.style.display = 'none';
        }
      });
    }

    // Sleep Timer Modal Event Listeners
    if (elements.closeSleepTimerBtn) {
      elements.closeSleepTimerBtn.addEventListener('click', closeSleepTimerModal);
    }

    if (elements.sleepTimerModal) {
      elements.sleepTimerModal.addEventListener('click', (e) => {
        if (e.target === elements.sleepTimerModal) closeSleepTimerModal();
      });
    }

    document.querySelectorAll('.timer-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mins = parseInt(btn.dataset.minutes, 10);
        if (mins > 0) startSleepTimer(mins);
      });
    });

    if (elements.setCustomTimerBtn && elements.customTimerMinutesInput) {
      elements.setCustomTimerBtn.addEventListener('click', () => {
        const mins = parseInt(elements.customTimerMinutesInput.value, 10);
        if (mins && mins > 0) {
          startSleepTimer(mins);
          elements.customTimerMinutesInput.value = '';
        } else {
          showToast('Please enter a valid duration in minutes.', '⚠️');
        }
      });
      elements.customTimerMinutesInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') elements.setCustomTimerBtn.click();
      });
    }

    if (elements.turnOffTimerBtn) {
      elements.turnOffTimerBtn.addEventListener('click', () => cancelSleepTimer(true));
    }

    if (elements.mobPlayPauseBtn) elements.mobPlayPauseBtn.addEventListener('click', togglePlayPause);
    if (elements.mobNextBtn) elements.mobNextBtn.addEventListener('click', nextTrack);
    if (elements.mobPrevBtn) elements.mobPrevBtn.addEventListener('click', prevTrack);
    if (elements.mobShuffleBtn) elements.mobShuffleBtn.addEventListener('click', () => elements.shuffleBtn.click());
    if (elements.mobPlayerHeartBtn) elements.mobPlayerHeartBtn.addEventListener('click', () => {
      if (state.currentTrack) toggleLikeSong(state.currentTrack);
    });

    // Mobile System Back & Popstate History Navigation (Prevents app from closing on single back)
    window.addEventListener('popstate', (e) => {
      // 1. If any modal or drawer is open, close it first
      if (elements.sleepTimerModal && elements.sleepTimerModal.style.display !== 'none') {
        elements.sleepTimerModal.style.display = 'none';
        return;
      }
      if (elements.mobTrackOptionsModal && elements.mobTrackOptionsModal.style.display !== 'none') {
        elements.mobTrackOptionsModal.style.display = 'none';
        return;
      }
      if (elements.mobilePlayerModal && elements.mobilePlayerModal.style.display !== 'none') {
        elements.mobilePlayerModal.style.display = 'none';
        return;
      }
      if (elements.settingsModal && elements.settingsModal.style.display !== 'none') {
        elements.settingsModal.style.display = 'none';
        return;
      }
      if (elements.addToPlaylistModal && elements.addToPlaylistModal.style.display !== 'none') {
        elements.addToPlaylistModal.style.display = 'none';
        return;
      }
      if (elements.createPlaylistModal && elements.createPlaylistModal.style.display !== 'none') {
        elements.createPlaylistModal.style.display = 'none';
        return;
      }
      if (elements.queueDrawer && elements.queueDrawer.classList.contains('open')) {
        elements.queueDrawer.classList.remove('open');
        if (elements.queueBtn) elements.queueBtn.classList.remove('active');
        return;
      }

      // 2. View step-back navigation
      if (state.currentView === 'lyrics') {
        switchView(state.previousView || 'home', { pushHistory: false });
        return;
      }
      if (state.currentView === 'playlist' || state.currentView === 'localMusic') {
        const target = (window.innerWidth <= 768) ? 'library' : (state.previousView || 'home');
        switchView(target, { pushHistory: false });
        return;
      }
      if (state.currentView !== 'home') {
        switchView('home', { pushHistory: false });
        return;
      }
    });

    // Draggable Mobile Player Modal (Swipe down on top/handle to collapse)
    if (elements.mobilePlayerModal) {
      let startY = 0;
      let currentY = 0;
      let isDraggingModal = false;

      const modalEl = elements.mobilePlayerModal;

      modalEl.addEventListener('touchstart', (e) => {
        // Trigger swipe down when starting near top handle or header
        if (modalEl.scrollTop <= 5 && e.touches[0].clientY < 260) {
          isDraggingModal = true;
          startY = e.touches[0].clientY;
          currentY = startY;
          modalEl.style.transition = 'none';
        }
      }, { passive: true });

      modalEl.addEventListener('touchmove', (e) => {
        if (!isDraggingModal) return;
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        if (deltaY > 0) {
          modalEl.style.transform = `translateY(${deltaY}px)`;
          e.preventDefault();
        }
      }, { passive: false });

      modalEl.addEventListener('touchend', () => {
        if (!isDraggingModal) return;
        isDraggingModal = false;
        const deltaY = currentY - startY;
        modalEl.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        if (deltaY > 80) {
          modalEl.style.transform = 'translateY(100%)';
          setTimeout(() => {
            modalEl.style.display = 'none';
            modalEl.style.transform = 'translateY(0)';
          }, 240);
        } else {
          modalEl.style.transform = 'translateY(0)';
        }
      });
    }

    // Mobile Swipe Gestures: Swipe Left for Next Song, Swipe Right for Previous Song
    function setupSwipeTrackChange(targetEl) {
      if (!targetEl) return;
      let startX = 0;
      let startY = 0;
      let startTime = 0;

      targetEl.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTime = Date.now();
      }, { passive: true });

      targetEl.addEventListener('touchend', (e) => {
        if (e.changedTouches.length !== 1) return;
        const diffX = e.changedTouches[0].clientX - startX;
        const diffY = e.changedTouches[0].clientY - startY;
        const elapsed = Date.now() - startTime;

        // Must be predominantly horizontal and quick flick or swipe
        if (elapsed < 650 && Math.abs(diffX) > 42 && Math.abs(diffX) > Math.abs(diffY) * 1.35) {
          if (diffX < 0) {
            // Swipe Left -> Next Track
            nextTrack();
            showToast('Next Song ⏭️');
          } else {
            // Swipe Right -> Previous Track
            prevTrack();
            showToast('Previous Song ⏮️');
          }
        }
      }, { passive: true });
    }

    // Swiping to change song is enabled strictly on song name/artist text only (never on the track/scrubber)
    setupSwipeTrackChange(document.querySelector('.player-track-info'));
    setupSwipeTrackChange(document.querySelector('.mobile-player-text'));

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
      } else if (e.key === '?') {
        e.preventDefault();
        if (typeof openSettingsModal === 'function') openSettingsModal();
      } else if (e.key === 'Escape') {
        elements.queueDrawer.classList.remove('open');
        if (elements.queueDrawerBackdrop) elements.queueDrawerBackdrop.classList.remove('active');
        if (elements.queueBtn) elements.queueBtn.classList.remove('active');
        elements.createPlaylistModal.style.display = 'none';
        elements.addToPlaylistModal.style.display = 'none';
        if (elements.settingsModal) elements.settingsModal.style.display = 'none';
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

    // Uninterrupted Background Tab Playback Handler
    document.addEventListener('visibilitychange', () => {
      if (state.isPlaying) {
        if (isYouTubeActive() && state.ytPlayer && typeof state.ytPlayer.playVideo === 'function') {
          const pState = typeof state.ytPlayer.getPlayerState === 'function' ? state.ytPlayer.getPlayerState() : -1;
          if (pState === YT.PlayerState.PAUSED || pState === 2 || pState === -1) {
            try { state.ytPlayer.playVideo(); } catch (e) {}
          }
        } else if (elements.audio && elements.audio.paused && state.currentTrack?.hasDirectAudio) {
          elements.audio.play().catch(() => {});
        }
      }
    });
  }

  // ==========================================================================
  // INITIALIZE APP
  // ==========================================================================
  function init() {
    document.body.dataset.activeView = 'home';
    try {
      window.history.replaceState({ view: 'home', depth: 1 }, '', window.location.pathname);
    } catch (e) {}

    loadStoredData();
    loadOfflineTracks();
    loadSettings();
    loadLocalTracksFromDB();
    setDynamicGreeting();
    setVolume(state.volume);
    updateLikedCountUI();
    renderSidebarPlaylists();
    setupEventListeners();
    loadTrendingShelves();
    restoreLastPlayedState();
    updateProgress();

    // Ensure YouTube player initializes if YT script already loaded
    if (window.YT && window.YT.Player && !state.ytPlayer && typeof window.onYouTubeIframeAPIReady === 'function') {
      window.onYouTubeIframeAPIReady();
    }

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

    // Dismiss splash loading screen smoothly
    setTimeout(dismissSplashScreen, 900);

    console.log('🌊 MusiSurf Client Initialized');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
