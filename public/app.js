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
    viewingPlaylistId: null,
    viewingPlaylistTracks: null,
    isPlaylistShuffle: false,
    lyrics: [],
    hasSyncedLyrics: false,
    activeLyricIndex: -1,
    openedLyricsFromMobilePlayer: false,
    vizMode: 'bars', // 'bars', 'wave', 'circle'
    ytPlayer: null,
    ytReady: false,
    settings: {
      removeDeadSilence: true,
      crossfade: 0
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
    recentlyPlayed: [],
    restoredResumeTime: 0,
    contextTrack: null,
    totalListenedSeconds: parseInt(localStorage.getItem('musisurf_total_listened_sec'), 10) || 9660,
    activePlayerEngine: 'audio',
    activeSearchFilter: 'all'
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
      library: document.getElementById('libraryView'),
      replay: document.getElementById('replayView')
    },
    contentScroll: document.getElementById('contentScroll'),

    // Nav & Sidebar
    navHome: document.getElementById('navHomeBtn'),
    navSearch: document.getElementById('navSearchBtn'),
    navLiked: document.getElementById('navLikedBtn'),
    navReplayBtn: document.getElementById('navReplayBtn'),
    navDownloaded: document.getElementById('navDownloadedBtn'),
    navLocalMusic: document.getElementById('navLocalMusicBtn'),
    navLibraryBtn: document.getElementById('navLibraryBtn'),
    navBrand: document.getElementById('navBrand'),
    topStreakBadge: document.getElementById('topStreakBadge'),
    streakDaysCount: document.getElementById('streakDaysCount'),
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
    libPlaylistSortSelect: document.getElementById('libPlaylistSortSelect'),
    libHubSettingsBtn: document.getElementById('libHubSettingsBtn'),

    // Header & Offline Banner
    offlineBanner: document.getElementById('offlineBanner'),
    globalSearchInput: document.getElementById('globalSearchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    historyBackBtn: document.getElementById('historyBackBtn'),
    historyForwardBtn: document.getElementById('historyForwardBtn'),
    topHomeBtn: document.getElementById('topHomeBtn'),
    topCompassBtn: document.getElementById('topCompassBtn'),
    topAvatarBtn: document.getElementById('topAvatarBtn'),
    headerSettingsBtn: document.getElementById('headerSettingsBtn'),
    sidebar: document.getElementById('sidebar'),
    winMinimizeBtn: document.getElementById('winMinimizeBtn'),
    winMaximizeBtn: document.getElementById('winMaximizeBtn'),
    winCloseBtn: document.getElementById('winCloseBtn'),
    collapseSidebarBtn: document.getElementById('collapseSidebarBtn'),
    searchAutocompleteDropdown: document.getElementById('searchAutocompleteDropdown'),
    searchFilterPills: document.getElementById('searchFilterPills'),
    miniplayerBtn: document.getElementById('miniplayerBtn'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    floatingMiniplayer: document.getElementById('floatingMiniplayer'),
    closeFloatingMiniplayerBtn: document.getElementById('closeFloatingMiniplayerBtn'),
    expandFloatingMiniplayerBtn: document.getElementById('expandFloatingMiniplayerBtn'),
    miniplayerCover: document.getElementById('miniplayerCover'),
    miniplayerTitle: document.getElementById('miniplayerTitle'),
    miniplayerArtist: document.getElementById('miniplayerArtist'),
    miniHeartBtn: document.getElementById('miniHeartBtn'),
    miniplayerCurrentTime: document.getElementById('miniplayerCurrentTime'),
    miniplayerTotalTime: document.getElementById('miniplayerTotalTime'),
    miniplayerScrubber: document.getElementById('miniplayerScrubber'),
    miniplayerScrubberFill: document.getElementById('miniplayerScrubberFill'),
    miniShuffleBtn: document.getElementById('miniShuffleBtn'),
    miniPrevBtn: document.getElementById('miniPrevBtn'),
    miniPlayPauseBtn: document.getElementById('miniPlayPauseBtn'),
    miniNextBtn: document.getElementById('miniNextBtn'),
    miniRepeatBtn: document.getElementById('miniRepeatBtn'),

    // Right Sidebar Panel: Now Playing & About the Artist
    nowPlayingPanel: document.getElementById('nowPlayingPanel'),
    nowPlayingPanelBtn: document.getElementById('nowPlayingPanelBtn'),
    closeNowPlayingPanelBtn: document.getElementById('closeNowPlayingPanelBtn'),
    nowPlayingCover: document.getElementById('nowPlayingCover'),
    nowPlayingTitle: document.getElementById('nowPlayingTitle'),
    nowPlayingArtist: document.getElementById('nowPlayingArtist'),
    nowPlayingHeartBtn: document.getElementById('nowPlayingHeartBtn'),
    aboutArtistCard: document.getElementById('aboutArtistCard'),
    nowPlayingArtistBanner: document.getElementById('nowPlayingArtistBanner'),
    nowPlayingArtistName: document.getElementById('nowPlayingArtistName'),
    nowPlayingMonthlyListeners: document.getElementById('nowPlayingMonthlyListeners'),
    nowPlayingArtistBio: document.getElementById('nowPlayingArtistBio'),

    // Replay View
    replayView: document.getElementById('replayView'),
    replayMonthTitle: document.getElementById('replayMonthTitle'),
    replayMinutesCount: document.getElementById('replayMinutesCount'),
    replayPlaysCount: document.getElementById('replayPlaysCount'),
    playReplayBtn: document.getElementById('playReplayBtn'),
    shareReplayBtn: document.getElementById('shareReplayBtn'),
    replayTopSongImg: document.getElementById('replayTopSongImg'),
    replayTopSongTitle: document.getElementById('replayTopSongTitle'),
    replayTopSongArtist: document.getElementById('replayTopSongArtist'),
    replayTopSongPlays: document.getElementById('replayTopSongPlays'),
    playTopSongBtn: document.getElementById('playTopSongBtn'),

    // Lyrics Soundwave
    lyricsSoundwaveBars: document.getElementById('lyricsSoundwaveBars'),

    // Home View
    greetingHeading: document.getElementById('greetingHeading'),
    quickPicksGrid: document.getElementById('quickPicksGrid'),
    shelvesContainer: document.getElementById('shelvesContainer'),

    // Search View
    searchRecentSection: document.getElementById('searchRecentSection'),
    searchRecentGrid: document.getElementById('searchRecentGrid'),
    searchFreshBanner: document.getElementById('searchFreshBanner'),
    clearRecentBtn: document.getElementById('clearRecentBtn'),
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
    pinPlaylistBtn: document.getElementById('pinPlaylistBtn'),
    renamePlaylistBtn: document.getElementById('renamePlaylistBtn'),
    playlistTracksSortSelect: document.getElementById('playlistTracksSortSelect'),
    deletePlaylistBtn: document.getElementById('deletePlaylistBtn'),
    exportPlaylistBtn: document.getElementById('exportPlaylistBtn'),
    mobilePlaylistMoreBtn: document.getElementById('mobilePlaylistMoreBtn'),
    mobilePlaylistOptionsModal: document.getElementById('mobilePlaylistOptionsModal'),
    closeMobPlaylistOptionsBtn: document.getElementById('closeMobPlaylistOptionsBtn'),
    mobOptPinPlaylistBtn: document.getElementById('mobOptPinPlaylistBtn'),
    mobOptPinPlaylistText: document.getElementById('mobOptPinPlaylistText'),
    mobOptRenamePlaylistBtn: document.getElementById('mobOptRenamePlaylistBtn'),
    mobOptDeletePlaylistBtn: document.getElementById('mobOptDeletePlaylistBtn'),
    mobOptExportPlaylistBtn: document.getElementById('mobOptExportPlaylistBtn'),
    homeOfflineState: document.getElementById('homeOfflineState'),
    homeGoDownloadedBtn: document.getElementById('homeGoDownloadedBtn'),
    searchOfflineState: document.getElementById('searchOfflineState'),
    searchGoDownloadedBtn: document.getElementById('searchGoDownloadedBtn'),
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
    mobPlayerQueueBtn: document.getElementById('mobPlayerQueueBtn'),
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

    renamePlaylistModal: document.getElementById('renamePlaylistModal'),
    closeRenamePlaylistModalBtn: document.getElementById('closeRenamePlaylistModalBtn'),
    renamePlaylistForm: document.getElementById('renamePlaylistForm'),
    renamePlaylistInput: document.getElementById('renamePlaylistInput'),
    cancelRenamePlaylistBtn: document.getElementById('cancelRenamePlaylistBtn'),

    deletePlaylistConfirmModal: document.getElementById('deletePlaylistConfirmModal'),
    deletePlaylistModalTargetName: document.getElementById('deletePlaylistModalTargetName'),
    closeDeletePlaylistModalBtn: document.getElementById('closeDeletePlaylistModalBtn'),
    cancelDeletePlaylistBtn: document.getElementById('cancelDeletePlaylistBtn'),
    confirmDeletePlaylistModalBtn: document.getElementById('confirmDeletePlaylistModalBtn'),

    playerShareBtn: document.getElementById('playerShareBtn'),
    mobOptShareBtn: document.getElementById('mobOptShareBtn'),

    addToPlaylistModal: document.getElementById('addToPlaylistModal'),
    modalPlaylistPickerList: document.getElementById('modalPlaylistPickerList'),
    closeAddToPlaylistBtn: document.getElementById('closeAddToPlaylistBtn'),
    doneAddToPlaylistBtn: document.getElementById('doneAddToPlaylistBtn'),

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
    crossfadeSlider: document.getElementById('crossfadeSlider'),
    crossfadeValueLabel: document.getElementById('crossfadeValueLabel'),
    liveCrossfadeSeconds: document.getElementById('liveCrossfadeSeconds'),
    settingsAudioOutputSelect: document.getElementById('settingsAudioOutputSelect'),
    equalizerToggleSwitch: document.getElementById('equalizerToggleSwitch'),
    equalizerSlidersWrap: document.getElementById('equalizerSlidersWrap'),
    automixToggleSwitch: document.getElementById('automixToggleSwitch'),
    skipSilenceToggleSwitch: document.getElementById('skipSilenceToggleSwitch'),
    deadSilenceToggleSwitch: document.getElementById('deadSilenceToggleSwitch'),
    speedPillsRow: document.getElementById('speedPillsRow'),
    streamQualityPills: document.getElementById('streamQualityPills'),
    volumeLevelingPills: document.getElementById('volumeLevelingPills'),
    searchPodcastsSection: document.getElementById('searchPodcastsSection'),
    podcastsGrid: document.getElementById('podcastsGrid'),
    exportFormatModal: document.getElementById('exportFormatModal'),
    closeExportFormatModalBtn: document.getElementById('closeExportFormatModalBtn'),
    exportAsJsonBtn: document.getElementById('exportAsJsonBtn'),
    exportAsCsvBtn: document.getElementById('exportAsCsvBtn'),

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

  // Generate downloaded badge HTML indicator (Crisp Spotify-grade solid disc offline badge)
  function getDownloadedBadgeHtml(trackId) {
    if (isTrackDownloaded(trackId)) {
      return `<span class="downloaded-badge" title="Downloaded • 100% Offline Ready" aria-label="Downloaded"><svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="var(--accent-primary, #00f260)"/><path d="M8 3.8v6.2m0 0l-2.4-2.4m2.4 2.4l2.4-2.4M4.8 12.2h6.4" stroke="#040e08" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
    }
    return '';
  }

  // Live update all downloaded badges for a track across open views
  function updateAllDownloadedBadges(trackId) {
    const badgeHtml = getDownloadedBadgeHtml(trackId);
    document.querySelectorAll(`[data-track-id="${trackId}"]`).forEach(el => {
      const titleEl = el.querySelector('.song-title-text, .table-title-main, .song-title, .top-result-title, .quick-pick-title, .queue-card-title');
      if (titleEl) {
        const existingDl = titleEl.querySelector('.downloaded-badge');
        const shouldHave = isTrackDownloaded(trackId);
        if (shouldHave && !existingDl) {
          titleEl.insertAdjacentHTML('beforeend', badgeHtml);
        } else if (!shouldHave && existingDl) {
          existingDl.remove();
        }
      }
      const dlBtn = el.querySelector('.download-song-trigger, .top-download-btn');
      if (dlBtn) {
        dlBtn.classList.toggle('downloaded', isTrackDownloaded(trackId));
        dlBtn.title = isTrackDownloaded(trackId) ? 'Downloaded • Saved in Offline Songs' : 'Download Song';
      }
    });

    if (state.currentTrack) {
      updatePlayerTitlesWithTick(state.currentTrack);
      if (elements.playerDownloadBtn) elements.playerDownloadBtn.classList.toggle('downloaded', isTrackDownloaded(state.currentTrack.id));
      if (elements.mobPlayerDownloadBtn) elements.mobPlayerDownloadBtn.classList.toggle('downloaded', isTrackDownloaded(state.currentTrack.id));
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
  // Placed right after the title with breathable 8px margin spacing per user request ("only here add little space after name and for mobile too")
  function getPlaylistTickBadgeHtml(trackId) {
    if (isTrackInAnyPlaylist(trackId)) {
      return `<span class="in-playlist-tick-badge" style="margin-left: 8px;" title="Saved in your playlist / library" aria-label="In playlist"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.707 6.293-4.5 4.5a1 1 0 0 1-1.414 0l-2-2a1 1 0 1 1 1.414-1.414L6.5 8.586l3.793-3.793a1 1 0 0 1 1.414 1.414z"/></svg></span>`;
    }
    return '';
  }

  // Update desktop player bar & mobile fullscreen player titles with in-playlist tick mark and downloaded badge
  function updatePlayerTitlesWithTick(track) {
    if (!track) return;
    const inPlaylist = isTrackInAnyPlaylist(track.id);
    const tickHtml = inPlaylist ? getPlaylistTickBadgeHtml(track.id) : '';
    const dlHtml = getDownloadedBadgeHtml(track.id);
    if (elements.playerTitle) {
      elements.playerTitle.innerHTML = `<span class="title-text-main" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</span>${tickHtml}${dlHtml}`;
    }
    if (elements.mobPlayerTitle) {
      elements.mobPlayerTitle.innerHTML = `<span class="title-text-main" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</span>${tickHtml}${dlHtml}`;
    }
  }

  // Real-time update for all in-playlist tick marks across the DOM
  function updateAllPlaylistTickBadges(targetTrackId = null) {
    const selector = targetTrackId ? `[data-track-id="${targetTrackId}"]` : '[data-track-id]';
    document.querySelectorAll(selector).forEach(el => {
      const trackId = el.dataset.trackId;
      if (!trackId) return;

      const shouldHaveBadge = isTrackInAnyPlaylist(trackId);
      const isDownloaded = isTrackDownloaded(trackId);
      el.classList.toggle('is-downloaded', isDownloaded);

      // Clean up legacy status column and right-actions badge
      const statusCell = el.querySelector('.col-status');
      if (statusCell) statusCell.innerHTML = '';
      const rightActions = el.querySelector('.song-row-right-actions');
      if (rightActions) {
        const stray = rightActions.querySelector('.in-playlist-tick-badge');
        if (stray) stray.remove();
      }

      // Target title container (song-title-text or table-title-main or quick-pick-title)
      const titleContainer = el.querySelector(
        '.table-title-main, .song-title-text, .quick-pick-title, .top-result-title, .queue-card-title, .queue-now-playing-title'
      );
      if (titleContainer) {
        const existingTick = titleContainer.querySelector('.in-playlist-tick-badge');
        if (shouldHaveBadge) {
          if (!existingTick) {
            const dlBadge = titleContainer.querySelector('.downloaded-badge');
            const tickWrapper = document.createElement('span');
            tickWrapper.innerHTML = getPlaylistTickBadgeHtml(trackId);
            const tickNode = tickWrapper.firstElementChild;
            if (tickNode) {
              if (dlBadge) {
                titleContainer.insertBefore(tickNode, dlBadge);
              } else {
                titleContainer.appendChild(tickNode);
              }
            }
          }
        } else if (existingTick) {
          existingTick.remove();
        }
      }
    });
    if (state.currentTrack) {
      updatePlayerTitlesWithTick(state.currentTrack);
    }
  }

  // Dismiss splash loading screen (No-op since splash was removed for instant app launch)
  function dismissSplashScreen() {
    const splash = document.getElementById('appSplashScreen');
    if (splash) splash.style.display = 'none';
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

      const storedRecent = localStorage.getItem('musisurf_recently_played');
      if (storedRecent) {
        try {
          const parsed = JSON.parse(storedRecent);
          if (Array.isArray(parsed)) state.recentlyPlayed = parsed;
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

  // Record recently played tracks & persist to localStorage
  function recordRecentlyPlayed(track) {
    if (!track || !track.id) return;
    const cleanTrack = {
      type: 'track',
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album || '',
      image: track.image || '',
      duration: track.duration || 0,
      durationStr: track.durationStr || '3:30',
      audioUrl: track.audioUrl || '',
      streamUrl: track.streamUrl || '',
      ytId: track.ytId || '',
      source: track.source || 'jiosaavn'
    };
    state.recentlyPlayed = [cleanTrack, ...state.recentlyPlayed.filter(t => t.id !== track.id)].slice(0, 20);
    try {
      localStorage.setItem('musisurf_recently_played', JSON.stringify(state.recentlyPlayed));
    } catch (e) {}
    renderSearchRecentUI();
  }

  // Record recently played playlist & persist to localStorage
  function recordRecentlyPlayedPlaylist(playlist) {
    if (!playlist || !playlist.id) return;
    const count = (playlist.tracks && playlist.tracks.length) || 0;
    const plCover = playlist.image || (playlist.tracks && playlist.tracks[0]?.image) || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80';
    const cleanItem = {
      type: 'playlist',
      id: `pl_rec_${playlist.id}`,
      playlistId: playlist.id,
      title: playlist.name || playlist.title || 'Playlist',
      artist: `${count} songs • Playlist`,
      image: plCover,
      tracks: playlist.tracks || []
    };
    state.recentlyPlayed = [cleanItem, ...state.recentlyPlayed.filter(t => t.id !== cleanItem.id && t.playlistId !== playlist.id)].slice(0, 20);
    try {
      localStorage.setItem('musisurf_recently_played', JSON.stringify(state.recentlyPlayed));
    } catch (e) {}
    renderSearchRecentUI();
  }

  // Render Recent section & plain empty state in Search View
  function renderSearchRecentUI() {
    if (!elements.searchRecentGrid || !elements.searchFreshBanner) return;

    if (!state.recentlyPlayed || state.recentlyPlayed.length === 0) {
      if (elements.searchRecentGrid) elements.searchRecentGrid.style.display = 'none';
      if (elements.clearRecentBtn) elements.clearRecentBtn.style.display = 'none';
      elements.searchFreshBanner.style.display = 'block';
      return;
    }

    elements.searchFreshBanner.style.display = 'none';
    if (elements.clearRecentBtn) elements.clearRecentBtn.style.display = 'inline-block';

    if (elements.searchRecentGrid) {
      elements.searchRecentGrid.style.display = 'grid';
      elements.searchRecentGrid.innerHTML = '';
      state.recentlyPlayed.slice(0, 8).forEach(item => {
        const card = document.createElement('div');
        card.className = 'search-recent-card';
        const isPl = item.type === 'playlist';
        card.innerHTML = `
          <img src="${item.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80'}" alt="${escapeHtml(item.title)}" class="search-recent-cover" loading="lazy">
          <div class="search-recent-info">
            <div class="search-recent-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            <div class="search-recent-artist" title="${escapeHtml(item.artist)}">${escapeHtml(item.artist)}</div>
          </div>
          <div class="search-recent-play-icon" title="${isPl ? 'Play Playlist' : 'Play Now'}">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
        `;
        card.addEventListener('click', () => {
          if (isPl) {
            renderPlaylistView(item.playlistId);
            if (item.tracks && item.tracks.length > 0) {
              playTrack(item.tracks[0], item.tracks);
            }
          } else {
            playTrack(item, state.recentlyPlayed.filter(t => t.type !== 'playlist'));
          }
        });
        elements.searchRecentGrid.appendChild(card);
      });
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
      if (state.restoredResumeTime > 0 && cur >= 0.5) {
        state.restoredResumeTime = 0;
      }
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
      updatePlayerTitlesWithTick(track);
      elements.playerArtist.textContent = track.artist;
      elements.playerCoverImg.src = track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80';
      const dur = saved.duration || track.duration || 0;
      elements.totalDurationLabel.textContent = track.durationStr || formatTime(dur);

      if (elements.mobPlayerArtist) elements.mobPlayerArtist.textContent = track.artist;
      if (elements.mobPlayerCover) elements.mobPlayerCover.src = track.image;
      if (elements.mobTotalDuration) elements.mobTotalDuration.textContent = track.durationStr || formatTime(dur);

      updateHeartIcon(track.id);
      updateQueueDrawerUI();
      highlightPlayingTrackInTables(track.id);

      const resumeTime = parseFloat(saved.currentTime) || 0;
      state.restoredResumeTime = resumeTime;
      if (resumeTime > 0) {
        setTimeout(() => {
          state.restoredResumeTime = 0;
        }, 3000);
      }
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

      const primeAudioResume = () => {
        if (resumeTime > 0) {
          try {
            if (Math.abs(elements.audio.currentTime - resumeTime) > 0.5) {
              elements.audio.currentTime = resumeTime;
            }
          } catch (e) {}
        }
      };

      if (track.isLocal && track.id) {
        getLocalTrackBlobFromDB(track.id).then(blob => {
          if (blob) {
            elements.audio.src = URL.createObjectURL(blob);
            elements.audio.volume = state.isMuted ? 0 : state.volume;
            elements.audio.preload = 'auto';
            elements.audio.load();
            primeAudioResume();
            elements.audio.addEventListener('loadedmetadata', primeAudioResume, { once: true });
            elements.audio.addEventListener('canplay', primeAudioResume, { once: true });
          }
        }).catch(() => {});
      } else {
        const offlineRecord = state.offlineTracks.find(t => t.id === track.id);
        if (offlineRecord && offlineRecord.audioBlob) {
          let audioBlob = offlineRecord.audioBlob;
          if (!audioBlob.type || audioBlob.type === 'application/octet-stream') {
            audioBlob = new Blob([audioBlob], { type: 'audio/mp4' });
          }
          elements.audio.src = URL.createObjectURL(audioBlob);
          elements.audio.volume = state.isMuted ? 0 : state.volume;
          elements.audio.preload = 'auto';
          elements.audio.load();
          primeAudioResume();
          elements.audio.addEventListener('loadedmetadata', primeAudioResume, { once: true });
          elements.audio.addEventListener('canplay', primeAudioResume, { once: true });
        } else {
          // Direct audio for YouTube and JioSaavn tracks
          const isYtTrack = track.source === 'youtube' || track.ytId || (track.id && track.id.startsWith('yt_'));
          if (isYtTrack && !track.streamUrl) {
            const ytId = track.ytId || (track.id ? track.id.replace('yt_', '') : '');
            if (ytId) {
              track.streamUrl = `/api/yt-stream?id=${encodeURIComponent(ytId)}`;
              track.audioUrl = track.audioUrl || track.streamUrl;
              track.hasDirectAudio = true;
            }
          }
          const audioSrc = track.audioUrl || track.streamUrl;
          if (audioSrc) {
            track.hasDirectAudio = true;
            elements.audio.src = audioSrc;
            elements.audio.volume = state.isMuted ? 0 : state.volume;
            elements.audio.preload = 'auto';
            elements.audio.load();
            primeAudioResume();
            elements.audio.addEventListener('loadedmetadata', primeAudioResume, { once: true });
            elements.audio.addEventListener('canplay', primeAudioResume, { once: true });
          }
        }
      }
    } catch (e) {
      console.warn('Error restoring last played track:', e);
    }
  }

  // ==========================================================================
  // PLAYBACK CONTROLLER
  // ==========================================================================
  let crossfadeFadeInTimer = null;
  function applyCrossfadeIn() {
    if (crossfadeFadeInTimer) {
      clearInterval(crossfadeFadeInTimer);
      crossfadeFadeInTimer = null;
    }
    const cf = state.settings.crossfade;
    if (!cf || cf <= 0) {
      elements.audio.volume = state.isMuted ? 0 : state.volume;
      return;
    }
    const targetVol = state.isMuted ? 0 : state.volume;
    if (targetVol <= 0) {
      elements.audio.volume = 0;
      return;
    }

    elements.audio.volume = 0;
    const startTime = Date.now();
    const rampDurationMs = Math.min(3000, (cf / 2) * 1000);
    crossfadeFadeInTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / rampDurationMs);
      elements.audio.volume = targetVol * progress;
      if (progress >= 1) {
        clearInterval(crossfadeFadeInTimer);
        crossfadeFadeInTimer = null;
      }
    }, 40);
  }

  // Shuffle Mode Persistence Controller
  function saveShuffleState() {
    try {
      localStorage.setItem('musisurf_shuffle_mode', JSON.stringify({
        isShuffled: !!state.isShuffled,
        isPlaylistShuffle: !!state.isPlaylistShuffle
      }));
    } catch (e) {}
  }

  function loadShuffleState() {
    try {
      const raw = localStorage.getItem('musisurf_shuffle_mode');
      if (raw) {
        const parsed = JSON.parse(raw);
        state.isShuffled = !!parsed.isShuffled;
        state.isPlaylistShuffle = !!parsed.isPlaylistShuffle;
        if (elements.shuffleBtn) elements.shuffleBtn.classList.toggle('active', state.isShuffled);
        if (elements.mobShuffleBtn) elements.mobShuffleBtn.classList.toggle('active', state.isShuffled);
        if (elements.shufflePlaylistBtn) elements.shufflePlaylistBtn.classList.toggle('active', state.isPlaylistShuffle);
      }
    } catch (e) {}
  }

  // Strict Content Filter: Strictly Pure Music Only (Zero podcasts, zero gaming, vlogs, reactions)
  function isContentFilterAllowed(t) {
    if (!t) return false;
    // Local device and JioSaavn tracks are 100% pure music
    if (t.isLocal || t.source === 'saavn' || t.source === 'jiosaavn') return true;

    const title = (t.title || '').toLowerCase();
    const artist = (t.artist || '').toLowerCase();

    // Podcasts and episodes are completely blocked
    const isPodcast = title.includes('podcast') || title.includes('episode') ||
                      artist.includes('podcast') || artist.includes('episode') ||
                      Boolean(t.isPodcast);
    if (isPodcast) return false;

    // Gaming, vlogs, reactions, unboxing, etc. are completely blocked
    const isBlocked = /\b(gameplay|walkthrough|playthrough|let'?s play|gaming|gamer|fortnite|minecraft|roblox|gta|valorant|cod|apex legends|pubg|vlog|prank|reaction|unboxing|mukbang|tutorial)\b/i.test(title) ||
                      /\b(gaming|gamer|vlogs|vlogger|news live)\b/i.test(artist);
    if (isBlocked) return false;

    // Category check: if categoryId is present and not '10', block it
    if (t.categoryId && String(t.categoryId) !== '10' && String(t.categoryId) !== '0') {
      return false;
    }

    // Default: allow pure music track
    return true;
  }

  let activePlayToken = 0;
  async function playTrack(track, queueList = null, addToHistory = true, customStartTime = 0) {
    if (!track) return;

    // Strict Content Filter check
    if (!isContentFilterAllowed(track)) {
      showToast('⚠️ Content Blocked: MusiSurf strictly plays pure Music only.', '🚫');
      state.isPlaying = false;
      updatePlayPauseButton();
      return;
    }

    const currentToken = ++activePlayToken;

    // Immediately stop and reset both engines completely to prevent 2-3 previous songs playing concurrently
    try {
      elements.audio.pause();
      elements.audio.removeAttribute('src');
      elements.audio.load();
    } catch (e) {}
    if (state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') {
      try {
        state.ytPlayer.pauseVideo();
        if (typeof state.ytPlayer.stopVideo === 'function') state.ytPlayer.stopVideo();
      } catch (e) {}
    }
    stopBackgroundKeepAlive();
    if (crossfadeFadeInTimer) {
      clearInterval(crossfadeFadeInTimer);
      crossfadeFadeInTimer = null;
    }

    // Reset progress freeze safeguard for new track
    state.restoredResumeTime = customStartTime || 0;
    if (customStartTime > 0) {
      if (elements.currentTimeLabel) elements.currentTimeLabel.textContent = formatTime(customStartTime);
      if (elements.mobCurrentTime) elements.mobCurrentTime.textContent = formatTime(customStartTime);
    } else {
      if (elements.currentTimeLabel) elements.currentTimeLabel.textContent = '0:00';
      if (elements.progressFill) elements.progressFill.style.width = '0%';
      if (elements.mobCurrentTime) elements.mobCurrentTime.textContent = '0:00';
      if (elements.mobProgressFill) elements.mobProgressFill.style.width = '0%';
      if (elements.miniPlayerFill) elements.miniPlayerFill.style.width = '0%';
      if (elements.progressBuffer) elements.progressBuffer.style.width = '0%';
    }

    recordRecentlyPlayed(track);

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

    // Reset playback engine and silence trimmer state for new track
    state.activePlayerEngine = (track.source === 'youtube' && !track.hasDirectAudio) ? 'youtube' : 'audio';
    if (state.settings.removeDeadSilence) {
      state.isTrimmingStartSilence = true;
      state.trailingSilenceFrames = 0;
    }

    // Update Player UI Metadata
    updatePlayerTitlesWithTick(track);
    elements.playerArtist.textContent = track.artist;
    elements.playerCoverImg.src = track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80';
    elements.totalDurationLabel.textContent = track.durationStr || formatTime(track.duration || 0);

    // Sync Mobile Fullscreen Player UI
    if (elements.mobPlayerArtist) elements.mobPlayerArtist.textContent = track.artist;
    if (elements.mobPlayerCover) elements.mobPlayerCover.src = track.image;
    if (elements.mobTotalDuration) elements.mobTotalDuration.textContent = track.durationStr || formatTime(track.duration || 0);

    // Sync In-App Floating Mini Player UI (Image 1 & 8)
    if (elements.miniplayerCover) elements.miniplayerCover.src = track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
    if (elements.miniplayerTitle) elements.miniplayerTitle.textContent = track.title || 'MusiSurf';
    if (elements.miniplayerArtist) elements.miniplayerArtist.textContent = track.artist || '—';
    if (elements.miniplayerTotalTime) elements.miniplayerTotalTime.textContent = track.durationStr || formatTime(track.duration || 0);
    if (elements.miniHeartBtn) {
      const isLiked = state.likedSongs && state.likedSongs.some(t => t.id === track.id);
      elements.miniHeartBtn.classList.toggle('liked', isLiked);
    }

    // Sync Right Now Playing Panel (Image 4 & 5)
    if (elements.nowPlayingCover) elements.nowPlayingCover.src = track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
    if (elements.nowPlayingTitle) elements.nowPlayingTitle.textContent = track.title || 'MusiSurf';
    if (elements.nowPlayingArtist) elements.nowPlayingArtist.textContent = track.artist || '—';
    if (elements.nowPlayingArtistBanner) elements.nowPlayingArtistBanner.src = track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80';
    if (elements.nowPlayingArtistName) elements.nowPlayingArtistName.textContent = track.artist || 'MusiSurf Artist';
    if (elements.nowPlayingMonthlyListeners) {
      const listenerCount = track.playCount ? track.playCount.toLocaleString() : '135,420,100';
      elements.nowPlayingMonthlyListeners.textContent = `${listenerCount} monthly listeners`;
    }
    if (elements.nowPlayingArtistBio) {
      elements.nowPlayingArtistBio.textContent = track.album && track.album !== 'Single'
        ? `From the studio album "${track.album}". Available ad-free in lossless high-fidelity sound on MusiSurf.`
        : `Official track by ${track.artist}. Available ad-free in lossless high-fidelity sound on MusiSurf.`;
    }
    if (elements.nowPlayingHeartBtn) {
      const isLiked = state.likedSongs && state.likedSongs.some(t => t.id === track.id);
      elements.nowPlayingHeartBtn.classList.toggle('liked', isLiked);
    }

    // Sync Replay Vinyl Record Artwork
    if (elements.replayVinylArt) elements.replayVinylArt.src = track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&auto=format&fit=crop&q=80';

    const headerTitleWrap = document.querySelector('.mobile-player-header-title');
    const headerSub = document.querySelector('.mob-header-sub');
    const headerName = document.getElementById('mobHeaderPlaylistName');

    let isPlaylistPlayback = false;
    let playlistTitle = '';

    if (state.activePlaylistId === 'liked') {
      isPlaylistPlayback = true;
      playlistTitle = 'Liked Songs';
    } else if (state.activePlaylistId === 'downloaded') {
      isPlaylistPlayback = true;
      playlistTitle = 'Downloaded';
    } else if (state.activePlaylistId === 'local') {
      isPlaylistPlayback = true;
      playlistTitle = 'Local Files';
    } else if (state.activePlaylistId && state.customPlaylists && state.customPlaylists.some(p => p.id === state.activePlaylistId)) {
      isPlaylistPlayback = true;
      const pl = state.customPlaylists.find(p => p.id === state.activePlaylistId);
      playlistTitle = pl ? pl.name : 'Playlist';
      if (pl) {
        pl.lastPlayedAt = Date.now();
        saveStoredPlaylists();
      }
    }

    if (headerTitleWrap) {
      if (isPlaylistPlayback && playlistTitle) {
        if (headerSub) headerSub.textContent = 'PLAYING FROM PLAYLIST';
        if (headerName) headerName.textContent = playlistTitle;
        headerTitleWrap.style.visibility = 'visible';
      } else {
        if (headerSub) headerSub.textContent = '';
        if (headerName) headerName.textContent = '';
        headerTitleWrap.style.visibility = 'hidden';
      }
    }

    // Dynamic Atmospheric Background for Mobile Player Modal (100% Solid Opaque, No Translucency)
    if (elements.mobilePlayerModal && track.image) {
      extractDominantColor(track.image, track.id).then(([r, g, b]) => {
        const darkR = Math.floor(r * 0.28);
        const darkG = Math.floor(g * 0.28);
        const darkB = Math.floor(b * 0.28);
        const topR = Math.min(255, Math.floor(r * 0.72 + 10));
        const topG = Math.min(255, Math.floor(g * 0.72 + 10));
        const topB = Math.min(255, Math.floor(b * 0.72 + 14));
        const midR = Math.min(255, Math.floor(darkR * 0.55 + 8));
        const midG = Math.min(255, Math.floor(darkG * 0.55 + 9));
        const midB = Math.min(255, Math.floor(darkB * 0.55 + 11));
        elements.mobilePlayerModal.style.setProperty(
          '--mob-player-bg',
          `linear-gradient(180deg, rgb(${topR}, ${topG}, ${topB}) 0%, rgb(${midR}, ${midG}, ${midB}) 48%, #08090b 100%)`
        );
        const lyricsViewEl = document.getElementById('lyricsView');
        if (lyricsViewEl) {
          lyricsViewEl.style.setProperty('--lyrics-theme-color', `rgb(${topR}, ${topG}, ${topB})`);
        }
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

    // Strict Content Filter Check: Pure Music Only
    if (!isContentFilterAllowed(track)) {
      showToast('⚠️ Playback Blocked: MusiSurf strictly plays pure Music only.', '🚫');
      state.isPlaying = false;
      updatePlayPauseButton();
      return;
    }

    // Determine playback mechanism
    if (track.isLocal && track.fileBlob) {
      // Local device storage file playback (100% on device)
      if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.stopVideo === 'function') {
        state.ytPlayer.stopVideo();
      }

      const blobUrl = URL.createObjectURL(track.fileBlob);
      state.activePlayerEngine = 'audio';
      elements.audio.src = blobUrl;
      elements.audio.volume = state.isMuted ? 0 : state.volume;
      elements.audio.load();
      if (customStartTime > 0) {
        const seekStartTime = () => {
          try { elements.audio.currentTime = customStartTime; } catch (e) {}
        };
        elements.audio.addEventListener('loadedmetadata', seekStartTime, { once: true });
        elements.audio.addEventListener('canplay', seekStartTime, { once: true });
      }
      applyCrossfadeIn();
      elements.audio.play().catch(err => {
        console.warn('Local storage audio play error:', err);
      });
    } else {
      let offlineRecord = track.audioBlob ? track : state.offlineTracks.find(t => t.id === track.id);
      
      // If offline and we need to fetch blob from IDB
      if (!navigator.onLine && offlineRecord && !offlineRecord.audioBlob) {
        try {
          const db = await getOfflineDB();
          if (currentToken !== activePlayToken) return;
          const tx = db.transaction(OFFLINE_STORE_NAME, 'readonly');
          const store = tx.objectStore(OFFLINE_STORE_NAME);
          const req = store.get(track.id);
          const storedItem = await new Promise((res) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => res(null);
          });
          if (currentToken !== activePlayToken) return;
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

        let audioBlob = offlineRecord.audioBlob;
        if (!audioBlob.type || audioBlob.type === 'application/octet-stream') {
          audioBlob = new Blob([audioBlob], { type: 'audio/mpeg' });
        }
        const blobUrl = URL.createObjectURL(audioBlob);
        state.activePlayerEngine = 'audio';
        elements.audio.src = blobUrl;
        elements.audio.volume = state.isMuted ? 0 : state.volume;
        elements.audio.load();
        if (customStartTime > 0) {
          const seekStartTime = () => {
            try { elements.audio.currentTime = customStartTime; } catch (e) {}
          };
          elements.audio.addEventListener('loadedmetadata', seekStartTime, { once: true });
          elements.audio.addEventListener('canplay', seekStartTime, { once: true });
        }
        applyCrossfadeIn();
        elements.audio.play().catch(err => {
          if (currentToken !== activePlayToken || err.name === 'AbortError') return;
          console.warn('Offline playback error:', err);
        });
      } else {
        // Universal Direct Audio Engine (JioSaavn & YouTube direct audio streaming)
        if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.stopVideo === 'function') {
          try { state.ytPlayer.stopVideo(); } catch (e) {}
        }

        // Auto-assign direct streaming URL for YouTube tracks (enables 100% background playback & MediaSession)
        const isYtTrack = track.source === 'youtube' || track.ytId || (track.id && track.id.startsWith('yt_'));
        if (isYtTrack) {
          const ytId = track.ytId || (track.id ? track.id.replace('yt_', '') : '');
          if (ytId && !track.streamUrl) {
            track.streamUrl = `/api/yt-stream?id=${encodeURIComponent(ytId)}`;
            track.audioUrl = track.audioUrl || track.streamUrl;
            track.hasDirectAudio = true;
          }
        }

        // Ensure volume is audible and unmuted
        if (state.isMuted || state.volume <= 0.05) {
          setVolume(0.8);
        } else {
          elements.audio.volume = state.volume;
        }

        const streamUrl = track.streamUrl || (track.audioUrl ? `/api/stream?url=${encodeURIComponent(track.audioUrl)}` : null);
        const audioSrc = track.audioUrl || streamUrl;

        if (audioSrc) {
          state.activePlayerEngine = 'audio';
          elements.audio.src = audioSrc;
          elements.audio.load();
          if (customStartTime > 0) {
            const seekStartTime = () => {
              try { elements.audio.currentTime = customStartTime; } catch (e) {}
            };
            elements.audio.addEventListener('loadedmetadata', seekStartTime, { once: true });
            elements.audio.addEventListener('canplay', seekStartTime, { once: true });
          }
          applyCrossfadeIn();
          const playPromise = elements.audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(err => {
              // Disregard aborted play requests or outdated track requests
              if (currentToken !== activePlayToken || err.name === 'AbortError') return;
              console.warn('Direct stream playback error, checking fallbacks:', err);
              if (streamUrl && elements.audio.src !== streamUrl) {
                elements.audio.src = streamUrl;
                elements.audio.load();
                elements.audio.play().catch(directErr => {
                  if (currentToken !== activePlayToken || directErr.name === 'AbortError') return;
                  console.warn('Stream proxy fallback failed:', directErr);
                });
              } else if (isYtTrack) {
                // Secondary fallback to YouTube iframe if direct audio extraction fails
                const ytId = track.ytId || (track.id ? track.id.replace('yt_', '') : '');
                if (ytId && state.ytReady && state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
                  // Strict categoryId 10 / Podcast check before YouTube IFrame player loads
                  if (!isContentFilterAllowed(track)) {
                    showToast('Playback Blocked: MusiSurf strictly plays Music and Podcasts only.', '🚫');
                    return;
                  }
                  try {
                    state.activePlayerEngine = 'youtube';
                    try {
                      elements.audio.pause();
                      elements.audio.removeAttribute('src');
                      elements.audio.load();
                    } catch (e) {}
                    state.ytPlayer.loadVideoById(ytId);
                    state.ytPlayer.setVolume(state.isMuted ? 0 : state.volume * 100);
                    state.ytPlayer.playVideo();
                  } catch (e) {
                    console.warn('YouTube fallback playback error:', e);
                  }
                }
              }
            });
          }
        } else if (isYtTrack) {
          // Fallback directly to YouTube iframe player if no audioSrc
          const ytId = track.ytId || (track.id ? track.id.replace('yt_', '') : '');
          if (ytId && state.ytReady && state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
            // Strict categoryId 10 / Podcast check before YouTube IFrame player loads
            if (!isContentFilterAllowed(track)) {
              showToast('Playback Blocked: MusiSurf strictly plays Music and Podcasts only.', '🚫');
              return;
            }
            state.activePlayerEngine = 'youtube';
            try {
              elements.audio.pause();
              elements.audio.removeAttribute('src');
              elements.audio.load();
            } catch (e) {}
            state.ytPlayer.loadVideoById(ytId);
            state.ytPlayer.setVolume(state.isMuted ? 0 : state.volume * 100);
            state.ytPlayer.playVideo();
          }
        } else {
          showToast('Audio stream unavailable for this track', '⚠️');
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
      // If nothing is playing, play first song from queue or active playlist or shelves
      if (state.viewingPlaylistTracks && state.viewingPlaylistTracks.length > 0) {
        state.activePlaylistId = state.viewingPlaylistId;
        state.activePlaylistTracks = [...state.viewingPlaylistTracks];
        playTrack(state.viewingPlaylistTracks[0], state.viewingPlaylistTracks);
      } else if (state.activePlaylistTracks && state.activePlaylistTracks.length > 0) {
        playTrack(state.activePlaylistTracks[0], state.activePlaylistTracks);
      } else if (state.queue && state.queue.length > 0) {
        playTrack(state.queue[0]);
      } else {
        const firstSong = document.querySelector('.quick-pick-tile')?._trackData || document.querySelector('.track-card')?._trackData;
        if (firstSong) {
          playTrack(firstSong);
        }
      }
      return;
    }

    // Determine actual playback status from the active engine
    const isActuallyPlaying = isYouTubeActive()
      ? (state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function' && state.ytPlayer.getPlayerState() === 1)
      : (!elements.audio.paused && !elements.audio.ended && elements.audio.currentTime > 0);

    if (state.isPlaying || isActuallyPlaying) {
      // Pause both audio engines immediately
      state.isPlaying = false;
      try { elements.audio.pause(); } catch (e) {}
      if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') {
        try { state.ytPlayer.pauseVideo(); } catch (e) {}
      }
      updatePlayPauseButton();
    } else {
      // Resume playback
      state.isPlaying = true;
      updatePlayPauseButton();

      const resumeTime = state.restoredResumeTime || 0;

      if (isYouTubeActive() || state.activePlayerEngine === 'youtube') {
        if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.playVideo === 'function') {
          try { state.ytPlayer.playVideo(); } catch (e) {}
        }
      } else {
        // Ensure direct streamUrl exists for YouTube tracks
        const isYtTrack = state.currentTrack.source === 'youtube' || state.currentTrack.ytId || (state.currentTrack.id && state.currentTrack.id.startsWith('yt_'));
        if (isYtTrack && !state.currentTrack.streamUrl) {
          const ytId = state.currentTrack.ytId || state.currentTrack.id.replace('yt_', '');
          if (ytId) {
            state.currentTrack.streamUrl = `/api/yt-stream?id=${encodeURIComponent(ytId)}`;
            state.currentTrack.audioUrl = state.currentTrack.audioUrl || state.currentTrack.streamUrl;
            state.currentTrack.hasDirectAudio = true;
          }
        }

        const desiredSrc = state.currentTrack.audioUrl || state.currentTrack.streamUrl;
        if (!elements.audio.src || elements.audio.src === '' || elements.audio.src.endsWith('/')) {
          if (desiredSrc) {
            elements.audio.src = desiredSrc;
            elements.audio.volume = state.isMuted ? 0 : state.volume;
            elements.audio.preload = 'auto';
            elements.audio.load();
          } else {
            playTrack(state.currentTrack, state.queue, false, resumeTime);
            return;
          }
        }

        if (resumeTime > 0) {
          try {
            if (Math.abs(elements.audio.currentTime - resumeTime) > 0.5) {
              elements.audio.currentTime = resumeTime;
            }
          } catch (e) {}
        }

        const resumePromise = elements.audio.play();
        if (resumePromise !== undefined) {
          resumePromise.then(() => {
            if (resumeTime > 0) {
              try { elements.audio.currentTime = resumeTime; } catch (e) {}
            }
          }).catch(err => {
            console.warn('Audio resume error, attempting full playTrack:', err);
            state.isPlaying = false;
            updatePlayPauseButton();
            playTrack(state.currentTrack, state.queue, false, resumeTime);
          });
        }
      }
    }
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

    if (elements.miniPlayPauseBtn) {
      const miniPlay = elements.miniPlayPauseBtn.querySelector('.mini-play-icon');
      const miniPause = elements.miniPlayPauseBtn.querySelector('.mini-pause-icon');
      if (miniPlay && miniPause) {
        miniPlay.style.display = state.isPlaying ? 'none' : 'block';
        miniPause.style.display = state.isPlaying ? 'block' : 'none';
      }
    }

    if (elements.playAllPlaylistBtn) {
      const plPlay = elements.playAllPlaylistBtn.querySelector('.play-icon');
      const plPause = elements.playAllPlaylistBtn.querySelector('.pause-icon');
      const viewingTracks = state.viewingPlaylistTracks || [];
      const isActivelyPlaying = isYouTubeActive()
        ? (state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function' && state.ytPlayer.getPlayerState() === 1)
        : (!elements.audio.paused && !elements.audio.ended && elements.audio.currentTime > 0);
      const isCurrentPlaylistPlaying = !!(
        state.isPlaying &&
        isActivelyPlaying &&
        state.currentTrack &&
        state.activePlaylistId &&
        state.viewingPlaylistId &&
        state.activePlaylistId === state.viewingPlaylistId &&
        viewingTracks.some(t => t.id === state.currentTrack.id)
      );
      if (plPlay && plPause) {
        plPlay.style.display = isCurrentPlaylistPlaying ? 'none' : 'block';
        plPause.style.display = isCurrentPlaylistPlaying ? 'block' : 'none';
      }
      elements.playAllPlaylistBtn.title = isCurrentPlaylistPlaying ? 'Pause Playlist' : 'Play All';
    }

    // Sync Library Playlist Cards Play/Pause Buttons
    document.querySelectorAll('.card-play-btn[data-playlist-id]').forEach(btn => {
      const plId = btn.dataset.playlistId;
      const pl = state.customPlaylists?.find(p => p.id === plId);
      const isActivelyPlaying = isYouTubeActive()
        ? (state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function' && state.ytPlayer.getPlayerState() === 1)
        : (!elements.audio.paused && !elements.audio.ended && elements.audio.currentTime > 0);
      const isThisPlPlaying = !!(
        state.isPlaying &&
        isActivelyPlaying &&
        state.currentTrack &&
        state.activePlaylistId === plId &&
        (pl?.tracks || []).some(t => t.id === state.currentTrack.id)
      );
      btn.innerHTML = isThisPlPlaying
        ? `<svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      btn.title = isThisPlPlaying ? 'Pause Playlist' : 'Play Playlist';
    });

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

    // Sync equalizer in Queue Now Playing card
    const queueEq = document.querySelector('#queueNowPlaying .queue-playing-eq');
    if (queueEq) {
      queueEq.classList.toggle('playing', !!state.isPlaying);
    }
  }

  // Direct Audio Downloader: Instantly adds to "Downloaded" playlist in Library, and triggers file download on Desktop
  async function downloadSong(track) {
    if (!track) {
      showToast('No song currently selected to download', 'ℹ');
      return;
    }

    if (isTrackDownloaded(track.id)) {
      showToast(`"${track.title}" is already in Downloaded Songs`, '✓');
      return;
    }

    const cleanTitle = (track.title || 'Track').replace(/[\\/:*?"<>|]/g, '').trim();
    const cleanArtist = (track.artist || 'MusiSurf').replace(/[\\/:*?"<>|]/g, '').trim();
    const downloadFilename = `${cleanTitle} - ${cleanArtist}.mp3`;
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

    showToast(`Downloading "${track.title}" to Downloaded Songs...`, '⏳');

    // If currently viewing Downloaded playlist, refresh view instantly
    if (state.currentView === 'downloaded' || (state.currentView === 'playlist' && state.activePlaylistId === 'downloaded')) {
      renderPlaylistView('downloaded');
    }

    // 2. Trigger browser file download to computer/Android device Downloads folder as MP3
    try {
      const a = document.createElement('a');
      a.href = streamUrl;
      a.setAttribute('download', downloadFilename);
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { document.body.removeChild(a); } catch (e) {}
      }, 300);
    } catch (e) {
      console.warn('File download trigger error:', e);
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
        showToast(`✓ "${track.title}" is ready for offline listening!`, '✓');
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
      if (state.activePlaylistTracks && state.activePlaylistTracks.length > 0) {
        // If playing from playlist, seamlessly loop within playlist tracks using selected shuffle mode
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
          // Loop sequential playlist seamlessly from index 0
          state.queue = [...state.activePlaylistTracks];
          state.queueIndex = 0;
          playTrack(state.queue[0]);
          return;
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

  let isTrackEnding = false;
  function onTrackEnded() {
    if (isTrackEnding) return;
    isTrackEnding = true;
    setTimeout(() => { isTrackEnding = false; }, 600);

    if (state.repeatMode === 'one' && state.currentTrack) {
      if (state.currentTrack._introTrimmed) state.currentTrack._introTrimmed = false;
      seekTo(0);
      applyCrossfadeIn();
      if (elements.audio) {
        elements.audio.play().catch(e => console.warn('Repeat play error:', e));
      }
      return;
    }
    nextTrack();
  }

  function isYouTubeActive() {
    if (!state.currentTrack) return false;
    // If HTML5 audio element has currentTime > 0 and is playing or buffered, it is undeniably active
    if (!elements.audio.paused && elements.audio.currentTime > 0) {
      return false;
    }
    if (state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function') {
      try {
        const pState = state.ytPlayer.getPlayerState();
        if (pState === 1 || pState === 3) return true; // 1 = PLAYING, 3 = BUFFERING
      } catch (e) {}
    }
    return state.activePlayerEngine === 'youtube';
  }

  function getCurrentPlaybackTime() {
    // 1. If HTML5 audio is actively playing or has progressed, always use its accurate hardware clock
    if (!elements.audio.paused && elements.audio.currentTime > 0) {
      state.activePlayerEngine = 'audio';
      return elements.audio.currentTime;
    }

    // 2. Check if YouTube player is actively playing
    if (state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function') {
      try {
        const pState = state.ytPlayer.getPlayerState();
        if (pState === 1 || pState === 3) {
          state.activePlayerEngine = 'youtube';
          const ytCur = state.ytPlayer.getCurrentTime();
          if (Number.isFinite(ytCur) && ytCur >= 0) return ytCur;
        }
      } catch (e) {}
    }

    // 3. Fallbacks
    const audioTime = elements.audio.currentTime;
    if (Number.isFinite(audioTime) && audioTime > 0) {
      state.activePlayerEngine = 'audio';
      return audioTime;
    }

    if (state.activePlayerEngine === 'youtube' && state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function') {
      try {
        const ytCur = state.ytPlayer.getCurrentTime();
        if (Number.isFinite(ytCur) && ytCur >= 0) return ytCur;
      } catch (e) {}
    }

    return audioTime || 0;
  }

  function getTotalDuration() {
    if (!elements.audio.paused && elements.audio.currentTime > 0) {
      const audioDur = elements.audio.duration;
      if (Number.isFinite(audioDur) && audioDur > 0) return audioDur;
    }
    if (state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function') {
      try {
        const pState = state.ytPlayer.getPlayerState();
        if (pState === 1 || pState === 3) {
          const dur = state.ytPlayer.getDuration();
          if (Number.isFinite(dur) && dur > 0) return dur;
        }
      } catch (e) {}
    }
    const audioDur = elements.audio.duration;
    if (Number.isFinite(audioDur) && audioDur > 0) {
      return audioDur;
    }
    try {
      if (state.ytPlayer && typeof state.ytPlayer.getDuration === 'function') {
        const dur = state.ytPlayer.getDuration();
        if (Number.isFinite(dur) && dur > 0) return dur;
      }
    } catch (e) {}
    return state.currentTrack?.duration || 0;
  }

  function seekTo(seconds) {
    const total = getTotalDuration();
    const targetSeconds = Math.max(0, Math.min(total > 0 ? total : 99999, Number(seconds) || 0));
    if (isYouTubeActive() || state.activePlayerEngine === 'youtube') {
      if (state.ytPlayer && typeof state.ytPlayer.seekTo === 'function') {
        state.ytPlayer.seekTo(targetSeconds, true);
      }
    } else {
      try {
        if (typeof elements.audio.fastSeek === 'function') {
          elements.audio.fastSeek(targetSeconds);
        } else {
          elements.audio.currentTime = targetSeconds;
        }
        if (state.settings.crossfade > 0 && total > 0 && (total - targetSeconds) > state.settings.crossfade) {
          elements.audio.volume = state.isMuted ? 0 : state.volume;
        }
      } catch (e) {
        console.warn('Seek error:', e);
      }
    }
    if (total > 0) {
      const pct = Math.min(100, (targetSeconds / total) * 100);
      if (elements.progressFill) elements.progressFill.style.width = `${pct}%`;
      if (elements.mobProgressFill) elements.mobProgressFill.style.width = `${pct}%`;
      if (elements.miniPlayerFill) elements.miniPlayerFill.style.width = `${pct}%`;
    }
    const displayTime = formatTime(targetSeconds);
    if (elements.currentTimeLabel) elements.currentTimeLabel.textContent = displayTime;
    if (elements.mobCurrentTime) elements.mobCurrentTime.textContent = displayTime;
    syncLyricsWithTime(targetSeconds);
  }

  function setVolume(pct) {
    if (crossfadeFadeInTimer) {
      clearInterval(crossfadeFadeInTimer);
      crossfadeFadeInTimer = null;
    }
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
      if (state.restoredResumeTime > 0 && cur >= 0.5) {
        state.restoredResumeTime = 0;
      }
      const dur = getTotalDuration();

      elements.currentTimeLabel.textContent = formatTime(cur);
      if (elements.mobCurrentTime) elements.mobCurrentTime.textContent = formatTime(cur);

      // Real-time Sound Capsule Tracking: live updates total listened minutes
      const nowTs = Date.now();
      if (!state._lastPlaybackSecTick) state._lastPlaybackSecTick = nowTs;
      if (nowTs - state._lastPlaybackSecTick >= 1000) {
        state._lastPlaybackSecTick = nowTs;
        state.totalListenedSeconds = (state.totalListenedSeconds || 0) + 1;
        if (state.totalListenedSeconds % 10 === 0) {
          try { localStorage.setItem('musisurf_total_listened_sec', state.totalListenedSeconds); } catch (e) {}
        }
        if (elements.views && elements.views.replay && elements.views.replay.classList.contains('active')) {
          if (elements.replayMinutesCount) {
            elements.replayMinutesCount.textContent = Math.max(1, Math.floor(state.totalListenedSeconds / 60)).toLocaleString();
          }
        }
      }

      if (dur > 0) {
        const pct = Math.min(100, (cur / dur) * 100);
        elements.progressFill.style.width = `${pct}%`;
        if (elements.mobProgressFill) elements.mobProgressFill.style.width = `${pct}%`;
        if (elements.miniPlayerFill) elements.miniPlayerFill.style.width = `${pct}%`;
        if (elements.miniplayerScrubberFill) elements.miniplayerScrubberFill.style.width = `${pct}%`;
        if (elements.miniplayerCurrentTime) elements.miniplayerCurrentTime.textContent = formatTime(cur);
        if (elements.miniplayerTotalTime) elements.miniplayerTotalTime.textContent = formatTime(dur);

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

      // Crossfade Fade-Out: As song ends, decrease volume smoothly
      if (state.settings.crossfade > 0 && dur > 10 && !elements.audio.paused && !elements.audio.seeking && !crossfadeFadeInTimer) {
        const timeLeft = dur - cur;
        if (timeLeft <= state.settings.crossfade && timeLeft > 0.2) {
          const targetVol = state.isMuted ? 0 : state.volume;
          const ratio = Math.max(0, Math.min(1, timeLeft / state.settings.crossfade));
          elements.audio.volume = targetVol * ratio;
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

    if (!navigator.onLine) {
      elements.lyricsLoading.style.display = 'none';
      elements.lyricsLinesContainer.innerHTML = `
        <div class="lyrics-offline-state" style="text-align: center; color: var(--text-secondary); padding: 80px 20px;">
          <div style="width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 50%; background: rgba(0, 242, 96, 0.12); border: 1px solid rgba(0, 242, 96, 0.3); display: flex; align-items: center; justify-content: center; color: var(--accent-primary, #00f260);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 32px; height: 32px;">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          </div>
          <h3 style="font-size: 1.35rem; font-weight: 700; color: #fff; margin-bottom: 8px;">Connect to internet to view lyrics</h3>
          <p style="font-size: 0.92rem; color: var(--text-secondary); max-width: 380px; margin: 0 auto;">Live karaoke lyrics stream from the internet. Connect to the internet to sing along in real time.</p>
        </div>
      `;
      return;
    }

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
      if (!navigator.onLine) {
        elements.lyricsLinesContainer.innerHTML = `
          <div class="lyrics-offline-state" style="text-align: center; color: var(--text-secondary); padding: 80px 20px;">
            <div style="width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 50%; background: rgba(0, 242, 96, 0.12); border: 1px solid rgba(0, 242, 96, 0.3); display: flex; align-items: center; justify-content: center; color: var(--accent-primary, #00f260);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 32px; height: 32px;">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
            </div>
            <h3 style="font-size: 1.35rem; font-weight: 700; color: #fff; margin-bottom: 8px;">Connect to internet to view lyrics</h3>
            <p style="font-size: 0.92rem; color: var(--text-secondary); max-width: 380px; margin: 0 auto;">Live karaoke lyrics stream from the internet. Connect to the internet to sing along in real time.</p>
          </div>
        `;
      }
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
      const res = await fetch(`/api/trending?t=${Date.now()}&refresh=1`);
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
          <span class="quick-pick-title">${escapeHtml(track.title)}${getPlaylistTickBadgeHtml(track.id)}${getDownloadedBadgeHtml(track.id)}</span>
        </div>
        <button class="quick-pick-play-btn" title="Play Full Song">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </button>
      `;

      tile.addEventListener('click', () => {
        state.activePlaylistId = null;
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
        state.activePlaylistId = null;
        playTrack(track, section.tracks);
      });

      grid.appendChild(card);
    });

    return sectionEl;
  }

  // Autocomplete Search Suggestions Dropdown (Spotify Desktop Style)
  function handleSearchAutocomplete(query) {
    if (!elements.searchAutocompleteDropdown) return;
    const q = (query || '').trim();
    if (!q) {
      elements.searchAutocompleteDropdown.innerHTML = '';
      elements.searchAutocompleteDropdown.style.display = 'none';
      return;
    }

    const suggestions = [];
    // 1. Literal query
    suggestions.push({ text: q, label: q });

    // 2. Matching catalog / available tracks & artists
    if (state.allAvailableTracks && state.allAvailableTracks.length > 0) {
      const qLower = q.toLowerCase();
      const seen = new Set([qLower]);
      for (const track of state.allAvailableTracks) {
        if (track.title && track.title.toLowerCase().includes(qLower) && !seen.has(track.title.toLowerCase())) {
          seen.add(track.title.toLowerCase());
          suggestions.push({ text: track.title, label: track.title });
        }
        if (track.artist && track.artist.toLowerCase().includes(qLower) && !seen.has(track.artist.toLowerCase())) {
          seen.add(track.artist.toLowerCase());
          suggestions.push({ text: track.artist, label: track.artist });
        }
        if (suggestions.length >= 6) break;
      }
    }

    // 3. Category queries
    const categoryCards = document.querySelectorAll('.category-card');
    categoryCards.forEach(card => {
      if (suggestions.length >= 8) return;
      const cat = card.dataset.query;
      if (cat && cat.toLowerCase().includes(q.toLowerCase()) && !suggestions.some(s => s.text.toLowerCase() === cat.toLowerCase())) {
        suggestions.push({ text: cat, label: cat });
      }
    });

    elements.searchAutocompleteDropdown.innerHTML = suggestions.map(item => `
      <div class="search-suggestion-item" data-query="${escapeHtml(item.text)}">
        <svg class="suggestion-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;min-width:16px;min-height:16px;flex-shrink:0;">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span class="suggestion-text">${escapeHtml(item.label)}</span>
        <svg class="suggestion-arrow-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;min-width:14px;min-height:14px;flex-shrink:0;">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    `).join('');

    elements.searchAutocompleteDropdown.style.display = 'block';

    elements.searchAutocompleteDropdown.querySelectorAll('.search-suggestion-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const selected = el.dataset.query;
        if (selected) {
          elements.globalSearchInput.value = selected;
          elements.searchAutocompleteDropdown.style.display = 'none';
          switchView('search');
          performSearch(selected);
        }
      });
    });
  }

  function applySearchFilter(filterType) {
    state.activeSearchFilter = filterType;
    if (elements.searchFilterPills) {
      elements.searchFilterPills.querySelectorAll('.search-filter-pill').forEach(p => {
        p.classList.toggle('active', (p.dataset.filter || 'all') === filterType);
      });
    }

    // Filter track rows in full songs table
    if (elements.fullSongsTable) {
      const rows = elements.fullSongsTable.querySelectorAll('tr.track-row');
      rows.forEach(row => {
        const track = row._trackData;
        if (!track || filterType === 'all') {
          row.style.display = '';
          return;
        }
        const isVideo = track.source === 'youtube' || track.ytId || (track.id && track.id.startsWith('yt_'));
        const isPodcast = (track.title || '').toLowerCase().includes('podcast') ||
                          (track.title || '').toLowerCase().includes('episode') ||
                          (track.artist || '').toLowerCase().includes('podcast') ||
                          Boolean(track.isPodcast);

        if (filterType === 'podcasts') {
          row.style.display = isPodcast ? '' : 'none';
        } else if (filterType === 'songs') {
          row.style.display = !isVideo ? '' : 'none';
        } else if (filterType === 'videos') {
          row.style.display = isVideo ? '' : 'none';
        } else if (filterType === 'albums') {
          row.style.display = (track.album && track.album !== 'MusiSurf' && track.album !== 'Single') ? '' : 'none';
        } else if (filterType === 'artists') {
          row.style.display = track.artist ? '' : 'none';
        } else if (filterType === 'playlists') {
          row.style.display = 'none';
        }
      });
    }

    // Filter top result card if needed
    if (elements.topResultCard && elements.topResultCard._trackData) {
      const top = elements.topResultCard._trackData;
      const isVideo = top.source === 'youtube' || top.ytId || (top.id && top.id.startsWith('yt_'));
      const isPodcast = (top.title || '').toLowerCase().includes('podcast') ||
                        (top.title || '').toLowerCase().includes('episode') ||
                        (top.artist || '').toLowerCase().includes('podcast') ||
                        Boolean(top.isPodcast);
      let showTop = true;
      if (filterType === 'podcasts' && !isPodcast) showTop = false;
      if (filterType === 'songs' && isVideo) showTop = false;
      if (filterType === 'videos' && !isVideo) showTop = false;
      if (filterType === 'playlists') showTop = false;
      elements.topResultCard.style.display = showTop ? '' : 'none';
    }
  }

  // ==========================================================================
  // SEARCH ENGINE
  // ==========================================================================
  function handleSearchInput(e) {
    const query = e.target.value.trim();
    handleSearchAutocomplete(query);

    if (query.length > 0) {
      elements.clearSearchBtn.style.display = 'flex';
      if (elements.searchRecentSection) elements.searchRecentSection.style.display = 'none';
      switchView('search');

      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        performSearch(query);
      }, 300);
    } else {
      if (elements.searchAutocompleteDropdown) elements.searchAutocompleteDropdown.style.display = 'none';
      elements.clearSearchBtn.style.display = 'none';
      elements.searchResultsWrapper.style.display = 'none';
      elements.searchEmptyState.style.display = 'none';
      if (elements.searchRecentSection) elements.searchRecentSection.style.display = 'block';
      elements.searchBrowseSection.style.display = 'block';
      renderSearchRecentUI();
    }
  }

  async function performSearch(query) {
    if (!query) return;
    if (elements.searchAutocompleteDropdown) elements.searchAutocompleteDropdown.style.display = 'none';
    switchView('search');
    if (elements.searchRecentSection) elements.searchRecentSection.style.display = 'none';
    elements.searchBrowseSection.style.display = 'none';
    elements.searchResultsWrapper.style.display = 'none';
    elements.searchEmptyState.style.display = 'none';

    if (!navigator.onLine) {
      if (elements.searchLoading) elements.searchLoading.style.display = 'none';
      if (elements.searchOfflineState) elements.searchOfflineState.style.display = 'flex';
      return;
    }

    if (elements.searchOfflineState) elements.searchOfflineState.style.display = 'none';
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
    elements.topResultCard._trackData = top;
    elements.topResultCard.className = `top-result-card ${isPlayingThisTop ? 'playing' : ''}`;
    elements.topResultCard.innerHTML = `
      <div class="top-result-header-row">
        <img src="${top.image}" alt="${escapeHtml(top.title)}" class="top-result-img">
        <div class="top-result-info">
          <h4 class="top-result-title">${escapeHtml(top.title)}${getPlaylistTickBadgeHtml(top.id)}${getDownloadedBadgeHtml(top.id)}</h4>
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
          state.activePlaylistId = null;
          playTrack(top, results);
        }
        return;
      }
      if (state.currentTrack && state.currentTrack.id === top.id) {
        togglePlayPause();
      } else {
        state.activePlaylistId = null;
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
          <th class="col-duration">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </th>
          <th class="col-actions"></th>
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
    applySearchFilter(state.activeSearchFilter || 'all');
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

    // Like option inside 3-dots modal
    const mobOptLikeBtn = document.getElementById('mobOptLikeBtn');
    if (mobOptLikeBtn) {
      const isLiked = state.likedSongs.some(s => s.id === track.id);
      const mobOptLikeIcon = document.getElementById('mobOptLikeIcon');
      const mobOptLikeText = document.getElementById('mobOptLikeText');
      if (mobOptLikeIcon) {
        mobOptLikeIcon.innerHTML = `
          <svg viewBox="0 0 24 24" fill="${isLiked ? '#ff3b5c' : 'none'}" stroke="${isLiked ? '#ff3b5c' : 'currentColor'}" stroke-width="2">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        `;
      }
      if (mobOptLikeText) {
        mobOptLikeText.textContent = isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs';
        mobOptLikeText.style.color = isLiked ? '#ff3b5c' : '';
      }
    }

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
    const isDownloaded = isTrackDownloaded(track.id);
    row.className = `song-row ${state.currentTrack?.id === track.id ? 'playing' : ''} ${isDownloaded ? 'is-downloaded' : ''}`;
    row.dataset.trackId = track.id;

    const badgeHtml = getDownloadedBadgeHtml(track.id);
    const tickHtml = getPlaylistTickBadgeHtml(track.id);
    const formattedTitle = escapeHtml(track.title);
    const formattedArtist = escapeHtml(track.artist);

    row.innerHTML = `
      <img src="${track.image}" alt="${escapeHtml(track.title)}" class="song-thumb">
      <div class="song-info-col">
        <div class="song-title-text"><span class="title-text-main" title="${escapeHtml(track.title)}">${formattedTitle}</span>${tickHtml}${badgeHtml}</div>
        <div class="song-artist-text" title="${escapeHtml(track.artist)}">${formattedArtist}</div>
      </div>
      <div class="song-row-right-actions">
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
      if (e.target.closest('.song-more-trigger')) {
        e.stopPropagation();
        openTrackOptionsMenu(track);
        return;
      }
      if (e.target.closest('.song-action-btn')) {
        e.stopPropagation();
        return;
      }
      if (!navigator.onLine && !isTrackDownloaded(track.id)) {
        e.stopPropagation();
        showToast("You're offline! Listen to your downloaded songs.", '⚡');
        return;
      }
      if (state.currentView === 'search' || state.currentView === 'home') {
        state.activePlaylistId = null;
        state.activePlaylistTracks = null;
      } else if (state.currentView === 'playlist' && state.viewingPlaylistId) {
        state.activePlaylistId = state.viewingPlaylistId;
        state.activePlaylistTracks = queueList;
        const plObj = state.customPlaylists?.find(p => p.id === state.viewingPlaylistId);
        if (plObj) {
          plObj.lastPlayedAt = Date.now();
          saveStoredPlaylists();
        }
      }
      playTrack(track, queueList);
    });

    return row;
  }

  function createTableRow(track, index, queueList) {
    const tr = document.createElement('tr');
    const isDownloaded = isTrackDownloaded(track.id);
    tr.className = `${state.currentTrack?.id === track.id ? 'playing' : ''} ${isDownloaded ? 'is-downloaded' : ''}`;
    tr.dataset.trackId = track.id;

    const badgeHtml = getDownloadedBadgeHtml(track.id);
    const tickHtml = getPlaylistTickBadgeHtml(track.id);
    const formattedTitle = escapeHtml(track.title);
    const formattedArtist = escapeHtml(track.artist);

    tr.innerHTML = `
      <td class="col-num">${index}</td>
      <td class="col-title">
        <div class="table-title-cell">
          <img src="${track.image}" alt="${escapeHtml(track.title)}" class="table-cover" loading="lazy">
          <div>
            <div class="table-title-main"><span class="title-text-main" title="${escapeHtml(track.title)}">${formattedTitle}</span>${tickHtml}${badgeHtml}</div>
            <div class="table-artist-sub" title="${escapeHtml(track.artist)}">${formattedArtist}</div>
          </div>
        </div>
      </td>
      <td class="col-album">${escapeHtml(track.album || 'Single')}</td>
      <td class="col-duration">${track.durationStr || '3:30'}</td>
      <td class="col-actions">
        <button class="song-action-btn song-share-trigger" title="Share Song">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
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
    `;

    tr.addEventListener('click', (e) => {
      if (e.target.closest('.song-share-trigger')) {
        e.stopPropagation();
        shareSong(track);
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
      if (!navigator.onLine && !isTrackDownloaded(track.id)) {
        e.stopPropagation();
        showToast("You're offline! Listen to your downloaded songs.", '⚡');
        return;
      }
      if (state.currentView === 'search' || state.currentView === 'home') {
        state.activePlaylistId = null;
        state.activePlaylistTracks = null;
      } else if (state.currentView === 'playlist' && state.viewingPlaylistId) {
        state.activePlaylistId = state.viewingPlaylistId;
        state.activePlaylistTracks = queueList;
        const plObj = state.customPlaylists?.find(p => p.id === state.viewingPlaylistId);
        if (plObj) {
          plObj.lastPlayedAt = Date.now();
          saveStoredPlaylists();
        }
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
  // SHARE SONG & LIKED SONGS & PLAYLIST VIEW CONTROLLER
  // ==========================================================================
  function shareSong(track) {
    if (!track) {
      showToast('No song selected to share', 'ℹ️');
      return;
    }
    const origin = window.location.origin;
    const songParam = track.id || track.title;
    const shareUrl = `${origin}/?track=${encodeURIComponent(songParam)}`;
    const shareData = {
      title: `${track.title} — MusiSurf`,
      text: `Listen to "${track.title}" by ${track.artist} on MusiSurf!`,
      url: shareUrl
    };

    const copyToClipboardFallback = (text) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Song link copied to clipboard! 🔗', '✨');
      } catch (e) {
        showToast('Song link copied! 🔗', '✨');
      }
    };

    if (navigator.share && /mobile|android|iphone|ipad/i.test(navigator.userAgent)) {
      navigator.share(shareData).catch(() => {});
    } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('Song link copied to clipboard! 🔗', '✨');
      }).catch(() => {
        copyToClipboardFallback(shareUrl);
      });
    } else {
      copyToClipboardFallback(shareUrl);
    }
  }

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
    const lowerKey = String(key || '').toLowerCase();
    if (lowerKey === 'downloaded' || lowerKey.includes('download')) {
      return [16, 85, 155]; // Deep elegant sapphire instead of bright neon
    }
    if (lowerKey === 'liked' || lowerKey.includes('liked')) {
      return [52, 28, 98]; // Deep royal purple/plum instead of blinding electric neon
    }
    let hash = 0;
    const str = String(key || 'musisurf');
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const h = Math.abs(hash) % 360;
    const s = 35 + (Math.abs(hash >> 3) % 20); // 35% - 55% muted saturation
    const l = 20 + (Math.abs(hash >> 6) % 12); // 20% - 32% elegant dark lightness
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

    // Clamp luminance to preserve deep, moody, luxurious tones and avoid bright neon glare
    const maxVal = Math.max(r, g, b, 1);
    const scale = maxVal > 135 ? 135 / maxVal : 1;
    const clampR = Math.round(r * scale);
    const clampG = Math.round(g * scale);
    const clampB = Math.round(b * scale);

    const darkR = Math.floor(clampR * 0.35);
    const darkG = Math.floor(clampG * 0.35);
    const darkB = Math.floor(clampB * 0.35);

    // Seamless single atmospheric gradient transitioning to pure obsidian #08090b by 460px with zero cutoff
    const gradient = `linear-gradient(180deg, rgba(${clampR}, ${clampG}, ${clampB}, 0.65) 0%, rgba(${darkR}, ${darkG}, ${darkB}, 0.35) 200px, rgba(13, 14, 18, 0.85) 340px, #08090b 460px, #08090b 100%)`;
    if (targetEl) targetEl.style.setProperty('--playlist-dynamic-gradient', gradient);
    if (mainWrapper) mainWrapper.style.setProperty('--playlist-dynamic-gradient', gradient);
    document.body.style.setProperty('--playlist-dynamic-gradient', gradient);
  }

  function renderPlaylistView(playlistId) {
    state.viewingPlaylistId = playlistId;
    switchView('playlist', { force: true });

    try {
      localStorage.setItem('musisurf_current_view', JSON.stringify({
        view: 'playlist',
        playlistId: playlistId
      }));
    } catch (e) {}

    if (elements.views.playlist) elements.views.playlist.classList.add('active');
    if (elements.contentScroll) elements.contentScroll.scrollTop = 0;

    let title = 'Liked Songs';
    let desc = 'Your collection of favorite songs.';
    let tracks = [];
    let isCustom = false;

    if (playlistId === 'liked') {
      tracks = state.likedSongs;
      elements.deletePlaylistBtn.style.display = 'none';
      if (elements.pinPlaylistBtn) elements.pinPlaylistBtn.style.display = 'none';
      if (elements.renamePlaylistBtn) elements.renamePlaylistBtn.style.display = 'none';
      if (elements.mobilePlaylistMoreBtn) elements.mobilePlaylistMoreBtn.style.display = 'none';
      elements.playlistCoverArt.innerHTML = createPlaylistCollageHtml(
        state.likedSongs,
        `<svg viewBox="0 0 24 24" fill="currentColor" style="width: 75px; height: 75px; color: #fff;">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>`,
        'linear-gradient(135deg, #341c62 0%, #683bb5 100%)'
      );
    } else if (playlistId === 'downloaded') {
      title = 'Downloaded Songs';
      desc = 'Stored locally on your device. Listen anywhere 100% offline with zero internet!';
      tracks = state.offlineTracks;
      elements.deletePlaylistBtn.style.display = 'none';
      if (elements.pinPlaylistBtn) elements.pinPlaylistBtn.style.display = 'none';
      if (elements.renamePlaylistBtn) elements.renamePlaylistBtn.style.display = 'none';
      if (elements.mobilePlaylistMoreBtn) elements.mobilePlaylistMoreBtn.style.display = 'none';
      elements.playlistCoverArt.innerHTML = createPlaylistCollageHtml(
        state.offlineTracks,
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 75px; height: 75px; color: #fff;">
          <circle cx="12" cy="12" r="10" stroke-width="2"/>
          <polyline points="8 12 11 15 16 9"/>
        </svg>`,
        'linear-gradient(135deg, #10559b 0%, #0d3866 100%)'
      );
    } else if (playlistId === 'local') {
      title = 'Local Files';
      desc = 'Songs from your device storage. Play offline anytime without consuming data!';
      tracks = state.localTracks || [];
      elements.deletePlaylistBtn.style.display = 'none';
      if (elements.pinPlaylistBtn) elements.pinPlaylistBtn.style.display = 'none';
      if (elements.renamePlaylistBtn) elements.renamePlaylistBtn.style.display = 'none';
      if (elements.mobilePlaylistMoreBtn) elements.mobilePlaylistMoreBtn.style.display = 'none';
      elements.playlistCoverArt.innerHTML = createPlaylistCollageHtml(
        state.localTracks || [],
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 75px; height: 75px; color: #fff;">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>`,
        'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)'
      );
    } else {
      const pl = state.customPlaylists.find(p => p.id === playlistId);
      if (pl) {
        title = pl.name;
        desc = pl.description || 'Created by MusiSurf Listener';
        tracks = pl.tracks || [];
        isCustom = true;
        elements.deletePlaylistBtn.style.display = 'inline-flex';
        if (elements.pinPlaylistBtn) {
          elements.pinPlaylistBtn.style.display = 'inline-flex';
          elements.pinPlaylistBtn.classList.toggle('active', Boolean(pl.isPinned));
          elements.pinPlaylistBtn.title = pl.isPinned ? 'Unpin Playlist' : 'Pin Playlist';
        }
        if (elements.renamePlaylistBtn) elements.renamePlaylistBtn.style.display = 'inline-flex';
        if (elements.mobilePlaylistMoreBtn) elements.mobilePlaylistMoreBtn.style.display = 'inline-flex';
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

    // Sort handling for playlist tracks
    const sortSelect = document.getElementById('playlistTracksSortSelect');
    const sortMode = sortSelect ? sortSelect.value : 'custom';
    syncCustomDropdown('playlistTracksSortDropdown', sortMode);
    
    let sortedTracks = [...tracks];
    if (sortMode === 'title') {
      sortedTracks.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortMode === 'artist') {
      sortedTracks.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
    } else if (sortMode === 'recents') {
      sortedTracks.reverse();
    } else if (sortMode === 'duration') {
      sortedTracks.sort((a, b) => (a.duration || 210) - (b.duration || 210));
    }

    if (sortSelect && !sortSelect._hasListener) {
      sortSelect._hasListener = true;
      sortSelect.addEventListener('change', () => {
        if (state.viewingPlaylistId) {
          renderPlaylistView(state.viewingPlaylistId);
        }
      });
    }

    // Render table
    elements.playlistTracksBody.innerHTML = '';
    if (sortedTracks.length === 0) {
      elements.playlistEmptyState.style.display = 'block';
    } else {
      elements.playlistEmptyState.style.display = 'none';
      sortedTracks.forEach((track, idx) => {
        const tr = createTableRow(track, idx + 1, sortedTracks);
        elements.playlistTracksBody.appendChild(tr);
      });

      // Custom Sort: Drag-and-Drop & Touch Reordering (Desktop & Android)
      if (isCustom && sortMode === 'custom') {
        const rows = elements.playlistTracksBody.querySelectorAll('tr');
        let dragSrcIdx = null;

        rows.forEach((tr, rIdx) => {
          tr.setAttribute('draggable', 'true');
          tr.classList.add('sortable-row');
          tr.dataset.sortIndex = rIdx;

          // Desktop HTML5 drag events
          tr.addEventListener('dragstart', (e) => {
            dragSrcIdx = rIdx;
            tr.classList.add('is-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', rIdx);
          });

          tr.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            tr.classList.add('drag-over-row');
          });

          tr.addEventListener('dragleave', () => {
            tr.classList.remove('drag-over-row');
          });

          tr.addEventListener('drop', (e) => {
            e.preventDefault();
            tr.classList.remove('drag-over-row');
            const toIdx = rIdx;
            if (dragSrcIdx !== null && dragSrcIdx !== toIdx) {
              const pl = state.customPlaylists.find(p => p.id === playlistId);
              if (pl && pl.tracks) {
                const [moved] = pl.tracks.splice(dragSrcIdx, 1);
                pl.tracks.splice(toIdx, 0, moved);
                saveStoredPlaylists();
                renderPlaylistView(playlistId);
                showToast(`Moved "${moved.title}" to #${toIdx + 1}`, '↕️');
              }
            }
          });

          tr.addEventListener('dragend', () => {
            tr.classList.remove('is-dragging');
            rows.forEach(r => r.classList.remove('drag-over-row'));
          });

          // Touch Drag Reordering for Mobile & Android devices
          let touchStartY = 0;
          let isTouching = false;
          let touchTargetRow = null;

          tr.addEventListener('touchstart', (e) => {
            if (e.target.closest('button') || e.target.closest('.song-more-trigger')) return;
            touchStartY = e.touches[0].clientY;
            isTouching = true;
            dragSrcIdx = rIdx;
          }, { passive: true });

          tr.addEventListener('touchmove', (e) => {
            if (!isTouching || dragSrcIdx === null) return;
            const currentY = e.touches[0].clientY;
            if (Math.abs(currentY - touchStartY) > 12) {
              tr.classList.add('is-dragging');
              const element = document.elementFromPoint(e.touches[0].clientX, currentY);
              const hovered = element ? element.closest('tr.sortable-row') : null;
              if (hovered && hovered !== tr) {
                if (touchTargetRow && touchTargetRow !== hovered) {
                  touchTargetRow.classList.remove('drag-over-row');
                }
                hovered.classList.add('drag-over-row');
                touchTargetRow = hovered;
              }
            }
          }, { passive: true });

          tr.addEventListener('touchend', () => {
            if (isTouching) {
              tr.classList.remove('is-dragging');
              if (touchTargetRow) {
                touchTargetRow.classList.remove('drag-over-row');
                const toIdx = parseInt(touchTargetRow.dataset.sortIndex, 10);
                if (!isNaN(toIdx) && dragSrcIdx !== null && dragSrcIdx !== toIdx) {
                  const pl = state.customPlaylists.find(p => p.id === playlistId);
                  if (pl && pl.tracks) {
                    const [moved] = pl.tracks.splice(dragSrcIdx, 1);
                    pl.tracks.splice(toIdx, 0, moved);
                    saveStoredPlaylists();
                    renderPlaylistView(playlistId);
                    showToast(`Moved "${moved.title}" to #${toIdx + 1}`, '↕️');
                  }
                }
              }
            }
            isTouching = false;
            touchTargetRow = null;
            dragSrcIdx = null;
          });
        });
      }
    }

    // Sync viewing playlist tracking
    state.viewingPlaylistId = playlistId;
    state.viewingPlaylistTracks = [...sortedTracks];

    // Play All Click (plays playlist in sequential order, or toggles pause if already playing)
    elements.playAllPlaylistBtn.onclick = (e) => {
      if (e) e.stopPropagation();
      const listToPlay = (sortedTracks && sortedTracks.length > 0) ? sortedTracks : tracks;
      if (!listToPlay || listToPlay.length === 0) {
        showToast('Playlist is empty, add some songs first!', 'ℹ️');
        return;
      }

      const isActivelyPlaying = isYouTubeActive()
        ? (state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function' && state.ytPlayer.getPlayerState() === 1)
        : (!elements.audio.paused && !elements.audio.ended && elements.audio.currentTime > 0);

      const isThisPlPlaying = !!(
        state.isPlaying &&
        isActivelyPlaying &&
        state.currentTrack &&
        state.activePlaylistId === playlistId &&
        listToPlay.some(t => t.id === state.currentTrack.id)
      );

      if (isThisPlPlaying) {
        togglePlayPause();
      } else {
        let queueList = [...listToPlay];
        if (state.isPlaylistShuffle && queueList.length > 1) {
          for (let i = queueList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queueList[i], queueList[j]] = [queueList[j], queueList[i]];
          }
        }
        state.activePlaylistTracks = [...listToPlay];
        state.activePlaylistId = playlistId;
        const plObj = state.customPlaylists.find(p => p.id === playlistId);
        if (plObj) {
          plObj.lastPlayedAt = Date.now();
          saveStoredPlaylists();
        }
        if (elements.shufflePlaylistBtn) elements.shufflePlaylistBtn.classList.toggle('active', state.isPlaylistShuffle);
        const playlistCover = (listToPlay && listToPlay[0]?.image) || (tracks && tracks[0]?.image) || '';
        try {
          recordRecentlyPlayedPlaylist({ id: playlistId, name: title, image: playlistCover, tracks: listToPlay });
        } catch (e) {}

        const songToStart = (state.isPlaying && state.currentTrack && listToPlay.some(t => t.id === state.currentTrack.id))
          ? state.currentTrack
          : queueList[0];
        playTrack(songToStart, queueList);
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
      state.isShuffled = state.isPlaylistShuffle;
      saveShuffleState();
      elements.shufflePlaylistBtn.classList.toggle('active', state.isPlaylistShuffle);
      if (elements.shuffleBtn) elements.shuffleBtn.classList.toggle('active', state.isShuffled);
      if (elements.mobShuffleBtn) elements.mobShuffleBtn.classList.toggle('active', state.isShuffled);

      state.activePlaylistTracks = [...tracks];
      state.activePlaylistId = playlistId;
      const shuffleCover = (tracks && tracks[0]?.image) || '';
      try {
        recordRecentlyPlayedPlaylist({ id: playlistId, name: title, image: shuffleCover, tracks: tracks });
      } catch (e) {}

      if (state.isPlaylistShuffle) {
        elements.shufflePlaylistBtn.title = "Mode: Random (No Repeats) • Click for In-Order";
        showToast("Shuffle Mode: Random (No repeats)", "🔀");
        // If this playlist is currently playing, shuffle the upcoming queue without restarting current song
        if (state.isPlaying && state.queue && state.queue.length > 1) {
          const current = state.currentTrack;
          const remaining = tracks.filter(t => t.id !== current?.id);
          for (let i = remaining.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
          }
          state.queue = current ? [current, ...remaining] : remaining;
          renderQueueList();
        }
      } else {
        elements.shufflePlaylistBtn.title = "Mode: In-Order • Click to Shuffle (No Repeats)";
        showToast("Play Mode: In Order", "📋");
        // If this playlist is currently playing, restore sequential queue without restarting current song
        if (state.isPlaying && state.queue) {
          state.queue = [...tracks];
          renderQueueList();
        }
      }
    };

    updatePlayPauseButton();

    // Pin playlist action
    if (elements.pinPlaylistBtn && isCustom) {
      elements.pinPlaylistBtn.onclick = () => {
        const pl = state.customPlaylists.find(p => p.id === playlistId);
        if (pl) {
          pl.isPinned = !pl.isPinned;
          saveStoredPlaylists();
          renderSidebarPlaylists();
          elements.pinPlaylistBtn.classList.toggle('active', Boolean(pl.isPinned));
          elements.pinPlaylistBtn.title = pl.isPinned ? 'Unpin Playlist' : 'Pin Playlist';
          showToast(pl.isPinned ? '📌 Playlist pinned to Library' : 'Playlist unpinned from Library', '📌');
        }
      };
    }

    // Rename playlist action
    if (elements.renamePlaylistBtn) {
      elements.renamePlaylistBtn.onclick = () => promptRenameCurrentPlaylist();
    }

    // Export playlist action
    if (elements.exportPlaylistBtn) {
      elements.exportPlaylistBtn.onclick = () => openExportPlaylistModal();
    }

    // Delete custom playlist (kept solely inside playlist view)
    elements.deletePlaylistBtn.onclick = () => {
      promptDeleteCurrentPlaylist(playlistId, title);
    };

    // Mobile 3-horizontal-bars button to open playlist options bottom sheet
    if (elements.mobilePlaylistMoreBtn) {
      elements.mobilePlaylistMoreBtn.onclick = (e) => {
        e.stopPropagation();
        if (elements.mobilePlaylistOptionsModal) {
          const titleEl = document.getElementById('mobPlaylistOptionsTitle');
          const subEl = document.getElementById('mobPlaylistOptionsSub');
          if (titleEl) titleEl.textContent = title;
          if (subEl) subEl.textContent = `${tracks.length} songs • Custom Playlist`;

          const pl = state.customPlaylists.find(p => p.id === playlistId);
          if (elements.mobOptPinPlaylistBtn && pl) {
            if (elements.mobOptPinPlaylistText) {
              elements.mobOptPinPlaylistText.textContent = pl.isPinned ? 'Unpin Playlist' : 'Pin Playlist';
            }
            elements.mobOptPinPlaylistBtn.onclick = () => {
              if (elements.mobilePlaylistOptionsModal) {
                elements.mobilePlaylistOptionsModal.style.display = 'none';
              }
              pl.isPinned = !pl.isPinned;
              saveStoredPlaylists();
              renderSidebarPlaylists();
              if (elements.pinPlaylistBtn) {
                elements.pinPlaylistBtn.classList.toggle('active', Boolean(pl.isPinned));
                elements.pinPlaylistBtn.title = pl.isPinned ? 'Unpin Playlist' : 'Pin Playlist';
              }
              showToast(pl.isPinned ? '📌 Playlist pinned to Library' : 'Playlist unpinned from Library', '📌');
            };
          }

          elements.mobilePlaylistOptionsModal.style.display = 'flex';
        }
      };
    }
  }

  // Delete Custom Playlist Confirmation (MusiSurf Dark Themed Modal)
  function promptDeleteCurrentPlaylist(playlistId, title) {
    if (!playlistId || playlistId === 'liked' || playlistId === 'downloaded' || playlistId === 'local') return;
    const pl = state.customPlaylists.find(p => p.id === playlistId);
    const safeTitle = (pl && pl.name) ? pl.name : (title && title !== 'NONE' && title !== 'undefined' ? title : (elements.playlistTitle?.textContent || 'Playlist'));
    state._deletingPlaylistId = playlistId;
    state._deletingPlaylistTitle = safeTitle;
    if (elements.deletePlaylistConfirmModal) {
      if (elements.deletePlaylistModalTargetName) {
        elements.deletePlaylistModalTargetName.textContent = `"${safeTitle}"`;
      }
      elements.deletePlaylistConfirmModal.style.display = 'flex';
    } else {
      executeDeletePlaylist(playlistId, safeTitle);
    }
  }

  // Intercept any native confirm dialogs globally to ensure only MusiSurf theme modals ever display
  try {
    window.confirm = function(msg) {
      console.log('Intercepted native browser confirm call:', msg);
      const targetId = state.viewingPlaylistId || state.activePlaylistId;
      if (targetId && targetId !== 'liked' && targetId !== 'downloaded' && targetId !== 'local') {
        promptDeleteCurrentPlaylist(targetId);
      }
      return false;
    };
  } catch (e) {}

  function executeDeletePlaylist(playlistId, title) {
    state.customPlaylists = state.customPlaylists.filter(p => p.id !== playlistId);
    saveStoredPlaylists();
    renderSidebarPlaylists();
    updateLibraryUI();
    const returnView = (window.innerWidth <= 768) ? 'library' : 'home';
    switchView(returnView);
    showToast(`Deleted playlist "${title}"`, '🗑️');
    state._deletingPlaylistId = null;
    state._deletingPlaylistTitle = null;
  }

  // Rename Custom Playlist Action (MusiSurf Dark Themed Modal)
  function promptRenameCurrentPlaylist() {
    const playlistId = state.viewingPlaylistId || state.activePlaylistId;
    if (!playlistId || playlistId === 'liked' || playlistId === 'downloaded' || playlistId === 'local') return;
    const pl = state.customPlaylists.find(p => p.id === playlistId);
    if (!pl) return;
    state._editingPlaylistId = playlistId;
    if (elements.renamePlaylistInput) {
      elements.renamePlaylistInput.value = pl.name || 'My Playlist';
    }
    if (elements.renamePlaylistModal) {
      elements.renamePlaylistModal.style.display = 'flex';
      setTimeout(() => {
        try {
          elements.renamePlaylistInput?.focus();
          elements.renamePlaylistInput?.select();
        } catch (e) {}
      }, 60);
    }
  }

  // Open Export Playlist Format Chooser Modal
  function openExportPlaylistModal() {
    const playlistId = state.viewingPlaylistId || state.activePlaylistId;
    let tracks = [];
    if (playlistId === 'liked') {
      tracks = state.likedSongs || [];
    } else if (playlistId === 'downloaded') {
      tracks = state.offlineTracks || [];
    } else {
      const pl = state.customPlaylists.find(p => p.id === playlistId);
      if (pl) tracks = pl.tracks || [];
    }

    if (!tracks || tracks.length === 0) {
      showToast('Playlist is empty, nothing to export', 'ℹ️');
      return;
    }

    if (elements.exportFormatModal) {
      elements.exportFormatModal.style.display = 'flex';
      try { window.history.pushState({ modal: 'exportFormat' }, '', window.location.pathname); } catch (e) {}
    } else {
      exportCurrentPlaylist('json');
    }
  }

  // Export Playlist in selected format ('json' or 'csv')
  function exportCurrentPlaylist(format = 'json') {
    const playlistId = state.viewingPlaylistId || state.activePlaylistId;
    let title = 'Playlist';
    let desc = '';
    let tracks = [];
    if (playlistId === 'liked') {
      title = 'Liked Songs';
      desc = 'Your collection of favorite songs';
      tracks = state.likedSongs || [];
    } else if (playlistId === 'downloaded') {
      title = 'Downloaded Songs';
      desc = 'Stored locally on your device';
      tracks = state.offlineTracks || [];
    } else {
      const pl = state.customPlaylists.find(p => p.id === playlistId);
      if (pl) {
        title = pl.name;
        desc = pl.description || 'Custom playlist';
        tracks = pl.tracks || [];
      }
    }

    if (!tracks || tracks.length === 0) {
      showToast('Playlist is empty, nothing to export', 'ℹ️');
      return;
    }

    const safeName = title.toLowerCase().replace(/[^a-z0-9_-]/gi, '_') || 'playlist';

    if (format === 'csv') {
      const escapeCsv = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;
      const headerRow = ['Title', 'Artist', 'Album', 'Duration'];
      const rows = tracks.map(t => [
        escapeCsv(t.title),
        escapeCsv(t.artist),
        escapeCsv(t.album || 'Single'),
        escapeCsv(t.durationStr || formatTime(t.duration || 0))
      ].join(','));
      const csvContent = '\uFEFF' + [headerRow.join(','), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}_playlist.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`✓ Exported "${title}" as CSV file`, '📊');
    } else {
      const exportPayload = {
        app: 'MusiSurf',
        version: '1.0',
        playlistName: title,
        description: desc,
        exportedAt: new Date().toISOString(),
        trackCount: tracks.length,
        tracks: tracks.map((t, idx) => ({
          index: idx + 1,
          title: t.title,
          artist: t.artist,
          album: t.album || '',
          duration: t.duration || 0,
          durationStr: t.durationStr || '',
          image: t.image || '',
          source: t.source || 'jiosaavn',
          id: t.id
        }))
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}_playlist.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`✓ Exported "${title}" as JSON file`, '💾');
    }

    if (elements.exportFormatModal) {
      elements.exportFormatModal.style.display = 'none';
    }
    if (elements.mobilePlaylistOptionsModal) {
      elements.mobilePlaylistOptionsModal.style.display = 'none';
    }
  }

  function renderSidebarPlaylists() {
    if (!elements.customPlaylistsList) return;
    elements.customPlaylistsList.innerHTML = '';

    // Sort playlists: pinned playlists first, then unpinned by lastPlayedAt or creation
    const sorted = [...(state.customPlaylists || [])].sort((a, b) => {
      const aPinned = Boolean(a.isPinned);
      const bPinned = Boolean(b.isPinned);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0);
    });

    sorted.forEach(pl => {
      const div = document.createElement('div');
      div.className = `playlist-list-item library-item ${pl.isPinned ? 'is-pinned' : ''}`;
      div.innerHTML = `
        <div class="playlist-cover-mini">
          ${createPlaylistCollageHtml(pl.tracks)}
        </div>
        <div class="library-item-info">
          <span class="library-item-title">${escapeHtml(pl.name)}</span>
          <span class="library-item-meta">Playlist • ${pl.tracks?.length || 0} songs</span>
        </div>
        ${pl.isPinned ? '<span class="sidebar-pin-icon" title="Pinned">📌</span>' : ''}
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
        <div class="queue-now-playing-card">
          <div class="queue-now-playing-cover">
            <img src="${state.currentTrack.image}" alt="${escapeHtml(state.currentTrack.title)}" class="queue-now-playing-img">
            <div class="queue-playing-eq ${state.isPlaying ? 'playing' : ''}">
              <span></span><span></span><span></span>
            </div>
          </div>
          <div class="queue-now-playing-info">
            <div class="queue-now-playing-badge">
              <span class="queue-pulse-dot"></span>
              NOW PLAYING
            </div>
            <div class="queue-now-playing-title">${escapeHtml(state.currentTrack.title)}${getPlaylistTickBadgeHtml(state.currentTrack.id)}${getDownloadedBadgeHtml(state.currentTrack.id)}</div>
            <div class="queue-now-playing-artist">${escapeHtml(state.currentTrack.artist)}</div>
          </div>
        </div>
      `;
    } else {
      elements.queueNowPlaying.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem; padding: 12px 4px; display: block;">Nothing currently playing</span>';
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
          <img src="${t.image}" alt="${escapeHtml(t.title)}" class="queue-img">
          <div class="queue-card-info">
            <div class="queue-card-title">${escapeHtml(t.title)}${getPlaylistTickBadgeHtml(t.id)}${getDownloadedBadgeHtml(t.id)}</div>
            <div class="queue-card-artist">${escapeHtml(t.artist)}</div>
          </div>
          <button class="remove-queue-btn" title="Remove from queue" aria-label="Remove">
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

  function closeQueueDrawer() {
    if (elements.queueDrawer && elements.queueDrawer.classList.contains('open')) {
      elements.queueDrawer.classList.remove('open');
      if (elements.queueBtn) elements.queueBtn.classList.remove('active');
      if (elements.queueDrawerBackdrop) elements.queueDrawerBackdrop.classList.remove('active');
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

    if (viewName !== 'playlist') {
      state.viewingPlaylistId = null;
      state.viewingPlaylistTracks = null;
    }

    // Persist active view so refreshing page returns to current location
    try {
      localStorage.setItem('musisurf_current_view', JSON.stringify({
        view: viewName,
        playlistId: viewName === 'playlist' ? (state.viewingPlaylistId || state.activePlaylistId) : null
      }));
    } catch (e) {}

    if (pushHistory) {
      navHistoryStack.push(viewName);
      try {
        window.history.pushState({ view: viewName, depth: navHistoryStack.length }, '', window.location.pathname);
      } catch (e) {}
    }

    // Close settings modal when switching views
    if (elements.settingsModal) elements.settingsModal.style.display = 'none';

    // Toggle active view element
    Object.keys(elements.views).forEach(key => {
      if (elements.views[key]) {
        elements.views[key].classList.toggle('active', key === viewName);
      }
    });

    // Update active nav button
    const activeOrViewedPl = state.viewingPlaylistId || state.activePlaylistId;
    if (elements.navHome) elements.navHome.classList.toggle('active', viewName === 'home');
    if (elements.navSearch) elements.navSearch.classList.toggle('active', viewName === 'search');
    if (elements.navExplore) elements.navExplore.classList.toggle('active', viewName === 'explore');
    if (elements.navLiked) elements.navLiked.classList.toggle('active', viewName === 'liked' || (viewName === 'playlist' && activeOrViewedPl === 'liked'));
    if (elements.navDownloaded) elements.navDownloaded.classList.toggle('active', viewName === 'downloaded' || (viewName === 'playlist' && activeOrViewedPl === 'downloaded'));
    if (elements.navLocalMusic) elements.navLocalMusic.classList.toggle('active', viewName === 'localMusic');
    if (elements.navLibraryBtn) elements.navLibraryBtn.classList.toggle('active', viewName === 'library');
    if (elements.navReplayBtn) elements.navReplayBtn.classList.toggle('active', viewName === 'replay');

    if (elements.lyricsBtn) elements.lyricsBtn.classList.toggle('active', viewName === 'lyrics');

    updatePlayPauseButton();

    if (viewName === 'localMusic') {
      updateLocalMusicUI();
    }
    if (viewName === 'library') {
      updateLibraryUI();
    }
    if (viewName === 'replay') {
      renderReplayView(state._replayPeriod || 'this-month');
    }
    if (viewName === 'search') {
      if (!elements.globalSearchInput || !elements.globalSearchInput.value.trim()) {
        if (elements.searchRecentSection) elements.searchRecentSection.style.display = 'block';
        if (elements.searchBrowseSection) elements.searchBrowseSection.style.display = 'block';
      }
      renderSearchRecentUI();
    }
    if (!navigator.onLine && typeof updateOfflineModeUI === 'function') {
      updateOfflineModeUI(false);
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
        const sortMode = localStorage.getItem('musisurf_playlist_sort') || 'recents';
        if (elements.libPlaylistSortSelect) {
          elements.libPlaylistSortSelect.value = sortMode;
          syncCustomDropdown('libPlaylistSortDropdown', sortMode);
        }

        let sortedPlaylists = [...state.customPlaylists];
        if (sortMode === 'recents') {
          sortedPlaylists.sort((a, b) => (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0));
        } else if (sortMode === 'added') {
          sortedPlaylists.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        } else if (sortMode === 'alphabetical') {
          sortedPlaylists.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
        } else if (sortMode === 'custom') {
          sortedPlaylists = [...state.customPlaylists];
        }

        sortedPlaylists.forEach((pl, idx) => {
          const card = document.createElement('div');
          card.className = 'track-card custom-playlist-card';
          card.style.cursor = 'pointer';

          const isThisPlPlaying = state.isPlaying && state.activePlaylistId === pl.id && state.currentTrack && (pl.tracks || []).some(t => t.id === state.currentTrack.id);
          const playPauseIconSvg = isThisPlPlaying
            ? `<svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

          card.innerHTML = `
            <div class="card-img-wrapper">
              ${createPlaylistCollageHtml(pl.tracks)}
              <button class="card-play-btn" data-playlist-id="${pl.id}" title="${isThisPlPlaying ? 'Pause Playlist' : 'Play Playlist'}">
                ${playPauseIconSvg}
              </button>
            </div>
            <div class="card-info">
              <span class="card-title">${escapeHtml(pl.name)}</span>
              <span class="card-artist">${(pl.tracks || []).length} songs</span>
            </div>
          `;

          card.querySelector('.card-play-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (pl.tracks && pl.tracks.length > 0) {
              const isPlayingNow = state.isPlaying && state.activePlaylistId === pl.id && state.currentTrack && pl.tracks.some(t => t.id === state.currentTrack.id);
              if (isPlayingNow) {
                togglePlayPause();
              } else {
                state.activePlaylistId = pl.id;
                state.activePlaylistTracks = [...pl.tracks];
                recordRecentlyPlayedPlaylist(pl);
                playTrack(pl.tracks[0], pl.tracks);
              }
            } else {
              showToast('Playlist is empty, add some songs first!', 'ℹ️');
            }
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

    // Liked Songs collection option with checkbox
    let isAlreadyLiked = state.likedSongs.some(t => t.id === track.id);
    const likedItem = document.createElement('div');
    likedItem.className = 'library-item';
    likedItem.style.marginBottom = '6px';
    likedItem.style.cursor = 'pointer';
    likedItem.innerHTML = `
      <div class="playlist-cover-mini liked-icon-box" style="display:flex; align-items:center; justify-content:center; border-radius: 6px;">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px; color:#fff;">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </div>
      <div class="library-item-info">
        <span class="library-item-title" style="font-weight: 700;">Liked Songs</span>
        <span class="library-item-meta">${state.likedSongs.length} songs</span>
      </div>
      <div class="modal-playlist-checkbox ${isAlreadyLiked ? 'checked' : ''}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
    `;
    likedItem.addEventListener('click', () => {
      isAlreadyLiked = state.likedSongs.some(t => t.id === track.id);
      const chk = likedItem.querySelector('.modal-playlist-checkbox');
      if (isAlreadyLiked) {
        state.likedSongs = state.likedSongs.filter(t => t.id !== track.id);
        chk.classList.remove('checked');
        showToast('Removed from Liked Songs', 'ℹ');
      } else {
        state.likedSongs.unshift(track);
        chk.classList.add('checked');
        showToast('Added to Liked Songs', '♥');
      }
      saveLikedSongs();
      updateHeartIcon(track.id);
      updateAllPlaylistTickBadges(track.id);
      likedItem.querySelector('.library-item-meta').textContent = `${state.likedSongs.length} songs`;
      if (state.activePlaylistId === 'liked') {
        renderPlaylistView('liked');
      }
    });
    elements.modalPlaylistPickerList.appendChild(likedItem);

    if (state.customPlaylists.length === 0) {
      const emptyNote = document.createElement('div');
      emptyNote.style.textAlign = 'center';
      emptyNote.style.padding = '16px 0';
      emptyNote.style.color = 'var(--text-secondary)';
      emptyNote.innerHTML = `<p>No other playlists yet. Tap "+ New Playlist" above to create your first!</p>`;
      elements.modalPlaylistPickerList.appendChild(emptyNote);
    } else {
      state.customPlaylists.forEach(pl => {
        if (!pl.tracks) pl.tracks = [];
        let inThisPl = pl.tracks.some(t => t.id === track.id);
        const item = document.createElement('div');
        item.className = 'library-item';
        item.style.cursor = 'pointer';
        item.innerHTML = `
          <div class="playlist-cover-mini">
            ${createPlaylistCollageHtml(pl.tracks)}
          </div>
          <div class="library-item-info">
            <span class="library-item-title">${escapeHtml(pl.name)}</span>
            <span class="library-item-meta">${pl.tracks.length} songs</span>
          </div>
          <div class="modal-playlist-checkbox ${inThisPl ? 'checked' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        `;
        item.addEventListener('click', () => {
          inThisPl = pl.tracks.some(t => t.id === track.id);
          const chk = item.querySelector('.modal-playlist-checkbox');
          if (inThisPl) {
            pl.tracks = pl.tracks.filter(t => t.id !== track.id);
            chk.classList.remove('checked');
            showToast(`Removed from "${pl.name}"`, 'ℹ');
          } else {
            pl.tracks.push(track);
            chk.classList.add('checked');
            showToast(`Added to "${pl.name}"`, '✓');
          }
          saveStoredPlaylists();
          updateAllPlaylistTickBadges(track.id);
          item.querySelector('.library-item-meta').textContent = `${pl.tracks.length} songs`;
          if (state.activePlaylistId === pl.id) {
            renderPlaylistView(pl.id);
          }
        });
        elements.modalPlaylistPickerList.appendChild(item);
      });
    }

    elements.addToPlaylistModal.style.display = 'flex';
    try { window.history.pushState({ modal: 'addToPlaylist' }, '', window.location.pathname); } catch (e) {}
  }

  // ==========================================================================
  // SETTINGS CONTROLLER (Dead Silence Remover, Crossfade & Sound Preferences)
  // ==========================================================================
  function loadSettings() {
    try {
      const saved = localStorage.getItem('musisurf_settings');
      if (saved) {
        state.settings = { ...state.settings, ...JSON.parse(saved) };
      }
    } catch (e) {}

    // Crossfade Slider (Image 2)
    const cf = typeof state.settings.crossfade === 'number' ? state.settings.crossfade : 7.5;
    if (elements.crossfadeSlider) elements.crossfadeSlider.value = cf;
    if (elements.liveCrossfadeSeconds) elements.liveCrossfadeSeconds.textContent = `${cf} s`;
    if (elements.crossfadeValueLabel) elements.crossfadeValueLabel.textContent = cf === 0 ? 'Off' : `${cf}s`;

    // Skip Silence & Automix
    if (elements.deadSilenceToggleSwitch) {
      elements.deadSilenceToggleSwitch.checked = state.settings.removeDeadSilence !== false;
    }
    if (elements.skipSilenceToggleSwitch) {
      elements.skipSilenceToggleSwitch.checked = state.settings.removeDeadSilence !== false;
    }
    if (elements.automixToggleSwitch) {
      elements.automixToggleSwitch.checked = state.settings.automix !== false;
    }

    // Streaming Quality
    const quality = state.settings.streamingQuality || 'high';
    document.querySelectorAll('#streamQualityPills .sound-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.quality === quality);
    });

    // Volume Leveling
    const leveling = state.settings.volumeLeveling || 'loud';
    document.querySelectorAll('#volumeLevelingPills .sound-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.level === leveling);
    });

    // Playback Speed
    const speed = state.settings.playbackSpeed || 1.0;
    if (elements.audio) {
      elements.audio.playbackRate = speed;
      elements.audio.preservesPitch = true;
    }
    document.querySelectorAll('#speedPillsRow .speed-pill-btn').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
    });

    // Equalizer
    if (elements.equalizerToggleSwitch && elements.equalizerSlidersWrap) {
      elements.equalizerToggleSwitch.checked = !!state.settings.equalizerEnabled;
      elements.equalizerSlidersWrap.style.display = state.settings.equalizerEnabled ? 'block' : 'none';
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
    try {
      const db = await getLocalDB();
      const tx = db.transaction(LOCAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(LOCAL_STORE_NAME);
      store.clear();
      tx.oncomplete = () => {
        state.localTracks = [];
        updateLocalMusicUI();
        showToast('Cleared all local files', '🗑️');
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
        const isDownloaded = isTrackDownloaded(track.id);
        tr.className = `${state.currentTrack?.id === track.id ? 'playing' : ''} ${isDownloaded ? 'is-downloaded' : ''}`;
        tr.dataset.trackId = track.id;

        const formattedTitle = escapeHtml(track.title);
        const formattedArtist = escapeHtml(track.artist || 'Local File');

        tr.innerHTML = `
          <td class="col-num">${idx + 1}</td>
          <td class="col-title">
            <div class="table-title-cell">
              <img src="${track.image || DEFAULT_LOCAL_COVER}" alt="${track.title}" class="table-cover">
              <div>
                <div class="table-title-main"><span class="title-text-main" title="${escapeHtml(track.title)}">${formattedTitle}</span>${getPlaylistTickBadgeHtml(track.id)}${getDownloadedBadgeHtml(track.id)}</div>
                <div class="table-artist-sub" title="${escapeHtml(track.artist || 'Local File')}">${formattedArtist}</div>
              </div>
            </div>
          </td>
          <td class="col-album">${escapeHtml(track.fileName || track.album || 'Device Storage')}</td>
          <td class="col-duration">${track.durationStr || '--:--'}</td>
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

  async function handleLocalAudioFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    for (const file of Array.from(fileList)) {
      const isAudio = file.type.startsWith('audio/') || /\.(mp3|m4a|wav|flac|ogg|aac)$/i.test(file.name);
      if (!isAudio) continue;

      let cleanBlob = file;
      try {
        const buffer = await file.arrayBuffer();
        cleanBlob = new Blob([buffer], { type: file.type || 'audio/mpeg' });
      } catch (err) {
        cleanBlob = file.slice(0, file.size, file.type || 'audio/mpeg');
      }

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
        fileBlob: cleanBlob,
        hasDirectAudio: true,
        addedAt: Date.now()
      };

      // Immediately add to in-memory state and UI
      const existingIdx = state.localTracks.findIndex(t => t.fileName === track.fileName && t.fileSize === track.fileSize);
      if (existingIdx !== -1) {
        state.localTracks[existingIdx] = track;
      } else {
        state.localTracks.unshift(track);
      }
      updateLocalMusicUI();
      if (state.activePlaylistId === 'local') {
        renderPlaylistView('local');
      }

      const tempAudio = new Audio();
      const objectUrl = URL.createObjectURL(cleanBlob);
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
    }
  }

  // ==========================================================================
  // CUSTOM SORT DROPDOWN CONTROLLER
  // ==========================================================================
  function setupCustomDropdown(dropdownId, selectId, onChange) {
    const dropdown = document.getElementById(dropdownId);
    const select = document.getElementById(selectId);
    if (!dropdown || !select) return;

    const trigger = dropdown.querySelector('.custom-sort-trigger');
    const label = dropdown.querySelector('.custom-sort-label');
    const items = dropdown.querySelectorAll('.custom-sort-item');

    const updateUI = (val) => {
      items.forEach(item => {
        const isMatch = item.dataset.value === val;
        item.classList.toggle('selected', isMatch);
        if (isMatch && label) {
          label.textContent = item.querySelector('span')?.textContent || item.textContent.trim();
        }
      });
    };

    updateUI(select.value);

    if (trigger && !trigger._hasDropdownListener) {
      trigger._hasDropdownListener = true;
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');
        document.querySelectorAll('.custom-sort-dropdown.open').forEach(d => {
          if (d !== dropdown) d.classList.remove('open');
        });
        const willOpen = !isOpen;
        dropdown.classList.toggle('open', willOpen);
        if (willOpen) {
          const menu = dropdown.querySelector('.custom-sort-menu');
          if (menu) {
            const rect = trigger.getBoundingClientRect();
            if (rect.left < 110) {
              menu.style.left = '0px';
              menu.style.right = 'auto';
            } else if (window.innerWidth - rect.right < 110) {
              menu.style.left = 'auto';
              menu.style.right = '0px';
            }
          }
        }
      });
    }

    items.forEach(item => {
      if (!item._hasItemListener) {
        item._hasItemListener = true;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = item.dataset.value;
          select.value = val;
          updateUI(val);
          dropdown.classList.remove('open');
          select.dispatchEvent(new Event('change'));
          if (typeof onChange === 'function') onChange(val);
        });
      }
    });
  }

  function syncCustomDropdown(dropdownId, val) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    const label = dropdown.querySelector('.custom-sort-label');
    const items = dropdown.querySelectorAll('.custom-sort-item');
    items.forEach(item => {
      const isMatch = item.dataset.value === val;
      item.classList.toggle('selected', isMatch);
      if (isMatch && label) {
        label.textContent = item.querySelector('span')?.textContent || item.textContent.trim();
      }
    });
  }

  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-sort-dropdown.open').forEach(d => d.classList.remove('open'));
  });

  // Navigate to Top of Home page from anywhere in website/app
  function navigateToHomeTop() {
    closeQueueDrawer();
    if (elements.mobilePlayerModal) elements.mobilePlayerModal.style.display = 'none';
    if (elements.mobTrackOptionsModal) elements.mobTrackOptionsModal.style.display = 'none';
    if (elements.mobilePlaylistOptionsModal) elements.mobilePlaylistOptionsModal.style.display = 'none';
    if (elements.createPlaylistModal) elements.createPlaylistModal.style.display = 'none';
    if (elements.renamePlaylistModal) elements.renamePlaylistModal.style.display = 'none';
    if (elements.addToPlaylistModal) elements.addToPlaylistModal.style.display = 'none';
    if (elements.sleepTimerModal) elements.sleepTimerModal.style.display = 'none';
    document.body.style.overflow = '';

    try {
      localStorage.setItem('musisurf_current_view', JSON.stringify({
        view: 'home',
        playlistId: null
      }));
    } catch (e) {}

    state.activePlaylistId = null;
    switchView('home', { force: true });
    [elements.mobNavHome, elements.mobNavSearch, elements.mobNavLibrary].forEach(btn => {
      if (btn) btn.classList.toggle('active', btn.id === 'mobNavHome');
    });

    if (elements.contentScroll) {
      elements.contentScroll.scrollTop = 0;
      elements.contentScroll.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Sidebar Expand / Collapse Toggle (Spotify Desktop Hover & Persistence)
  function initSidebarCollapse() {
    const isCollapsed = localStorage.getItem('musisurf_sidebar_collapsed') === 'true';
    applySidebarCollapsedState(isCollapsed);

    const btn = elements.collapseSidebarBtn || document.getElementById('collapseSidebarBtn');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const appEl = document.getElementById('app');
        const currentlyCollapsed = appEl ? appEl.classList.contains('sidebar-collapsed') : false;
        applySidebarCollapsedState(!currentlyCollapsed);
      });
    }

    const libHeader = document.getElementById('navLibraryBtn');
    if (libHeader) {
      libHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        const appEl = document.getElementById('app');
        if (appEl && appEl.classList.contains('sidebar-collapsed')) {
          applySidebarCollapsedState(false);
        }
        switchView('library');
      });
    }
  }

  function applySidebarCollapsedState(collapsed) {
    const appEl = document.getElementById('app');
    const sidebarEl = elements.sidebar || document.getElementById('sidebar');
    if (!appEl || !sidebarEl) return;
    if (collapsed) {
      appEl.classList.add('sidebar-collapsed');
      sidebarEl.classList.add('collapsed');
    } else {
      appEl.classList.remove('sidebar-collapsed');
      sidebarEl.classList.remove('collapsed');
    }
    localStorage.setItem('musisurf_sidebar_collapsed', collapsed ? 'true' : 'false');
    const btn = elements.collapseSidebarBtn || document.getElementById('collapseSidebarBtn');
    if (btn) {
      const collapseIcon = btn.querySelector('.collapse-icon');
      const expandIcon = btn.querySelector('.expand-icon');
      if (collapseIcon) collapseIcon.style.display = collapsed ? 'none' : 'block';
      if (expandIcon) expandIcon.style.display = collapsed ? 'block' : 'none';
      btn.title = collapsed ? 'Expand Your Library' : 'Collapse Your Library';
    }
  }

  // Fullscreen Management
  function toggleAppFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }
  }

  function updateFullscreenUI() {
    const isFs = !!document.fullscreenElement;
    if (elements.fullscreenBtn) {
      const exp = elements.fullscreenBtn.querySelector('.fs-expand-icon');
      const coll = elements.fullscreenBtn.querySelector('.fs-collapse-icon');
      if (exp) exp.style.display = isFs ? 'none' : 'block';
      if (coll) coll.style.display = isFs ? 'block' : 'none';
      elements.fullscreenBtn.title = isFs ? 'Exit Fullscreen' : 'Toggle Fullscreen';
    }
  }

  // Floating In-App Miniplayer Management
  function toggleMiniPlayer(forceOpen = null) {
    if (!elements.floatingMiniplayer) return;
    const isCurrentlyHidden = elements.floatingMiniplayer.style.display === 'none' || !elements.floatingMiniplayer.style.display;
    const shouldOpen = forceOpen !== null ? forceOpen : isCurrentlyHidden;

    if (shouldOpen) {
      syncMiniplayerTrack();
      elements.floatingMiniplayer.style.display = 'flex';
    } else {
      elements.floatingMiniplayer.style.display = 'none';
    }
  }

  function syncMiniplayerTrack() {
    if (!elements.floatingMiniplayer) return;
    const track = state.currentTrack;
    if (track) {
      if (elements.miniplayerCover) elements.miniplayerCover.src = track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80';
      if (elements.miniplayerTitle) elements.miniplayerTitle.textContent = track.title || 'MusiSurf';
      if (elements.miniplayerArtist) elements.miniplayerArtist.textContent = track.artist || '—';
      if (elements.miniplayerTotalTime) elements.miniplayerTotalTime.textContent = track.durationStr || formatTime(track.duration || 0);
      const isLiked = state.likedSongs && state.likedSongs.some(s => s.id === track.id);
      if (elements.miniHeartBtn) {
        elements.miniHeartBtn.classList.toggle('active', isLiked);
        elements.miniHeartBtn.style.color = isLiked ? '#1ed760' : '';
      }
    } else {
      if (elements.miniplayerCover) elements.miniplayerCover.src = '';
      if (elements.miniplayerTitle) elements.miniplayerTitle.textContent = 'No track playing';
      if (elements.miniplayerArtist) elements.miniplayerArtist.textContent = '—';
    }
    updatePlayPauseButton();
  }

  function makeDraggable(el, handle) {
    if (!el || !handle) return;
    let isDragging = false;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

    const onPointerDown = (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      startX = e.clientX || (e.touches && e.touches[0].clientX);
      startY = e.clientY || (e.touches && e.touches[0].clientY);
      const rect = el.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      el.style.bottom = 'auto';
      el.style.right = 'auto';
      el.style.left = `${initialLeft}px`;
      el.style.top = `${initialTop}px`;
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const curX = e.clientX || (e.touches && e.touches[0].clientX);
      const curY = e.clientY || (e.touches && e.touches[0].clientY);
      const dx = curX - startX;
      const dy = curY - startY;
      const newLeft = Math.max(10, Math.min(window.innerWidth - el.offsetWidth - 10, initialLeft + dx));
      const newTop = Math.max(10, Math.min(window.innerHeight - el.offsetHeight - 10, initialTop + dy));
      el.style.left = `${newLeft}px`;
      el.style.top = `${newTop}px`;
    };

    const onPointerUp = () => {
      isDragging = false;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    handle.addEventListener('pointerdown', onPointerDown);
  }

  function setupFloatingMiniPlayer() {
    if (!elements.floatingMiniplayer) return;
    const artWrap = elements.miniplayerArtWrap || elements.floatingMiniplayer.querySelector('.miniplayer-art-wrap') || elements.floatingMiniplayer;
    if (artWrap) makeDraggable(elements.floatingMiniplayer, artWrap);

    if (elements.miniplayerBtn) {
      elements.miniplayerBtn.addEventListener('click', () => toggleMiniPlayer());
    }
    if (elements.closeFloatingMiniplayerBtn) {
      elements.closeFloatingMiniplayerBtn.addEventListener('click', () => toggleMiniPlayer(false));
    }
    if (elements.expandFloatingMiniplayerBtn) {
      elements.expandFloatingMiniplayerBtn.addEventListener('click', () => {
        toggleMiniPlayer(false);
        window.focus();
      });
    }
    if (elements.miniPlayPauseBtn) {
      elements.miniPlayPauseBtn.addEventListener('click', togglePlayPause);
    }
    if (elements.miniPrevBtn) {
      elements.miniPrevBtn.addEventListener('click', prevTrack);
    }
    if (elements.miniNextBtn) {
      elements.miniNextBtn.addEventListener('click', nextTrack);
    }
    if (elements.miniShuffleBtn) {
      elements.miniShuffleBtn.addEventListener('click', () => {
        if (elements.shuffleBtn) elements.shuffleBtn.click();
      });
    }
    if (elements.miniRepeatBtn) {
      elements.miniRepeatBtn.addEventListener('click', () => {
        if (elements.repeatBtn) elements.repeatBtn.click();
      });
    }
    if (elements.miniHeartBtn) {
      elements.miniHeartBtn.addEventListener('click', () => {
        if (state.currentTrack) {
          toggleLikeSong(state.currentTrack);
          syncMiniplayerTrack();
        }
      });
    }
    if (elements.miniplayerScrubber) {
      elements.miniplayerScrubber.addEventListener('click', (e) => {
        const rect = elements.miniplayerScrubber.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, clickX / rect.width));
        const totalDur = getTotalDuration();
        if (totalDur > 0) seekTo(pct * totalDur);
      });
    }
  }

  // ==========================================================================
  // REPLAY FEATURE CONTROLLER (Redesigned Compact Sound Capsule & Top Song Only)
  // ==========================================================================
  function renderReplayView(period = 'this-month') {
    state._replayPeriod = period;

    document.querySelectorAll('.replay-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.period === period);
    });

    const songsPool = [...(state.history || []), ...(state.recentlyPlayed || []), ...(state.likedSongs || [])];
    const totalPlays = Math.max(18, songsPool.length);

    // Dynamic Live Sound Capsule Minutes
    const totalMinutes = Math.max(1, Math.floor((state.totalListenedSeconds || 9660) / 60));

    if (elements.replayMinutesCount) {
      elements.replayMinutesCount.textContent = totalMinutes.toLocaleString();
    }
    if (elements.replayPlaysCount) {
      elements.replayPlaysCount.textContent = `${totalPlays} plays • 7 days of listening`;
    }

    // Determine #1 Most Played Song from history and recently played
    const songFrequencies = {};
    const songObjects = {};

    songsPool.forEach(t => {
      if (t && (t.id || t.title)) {
        const key = t.id || t.title;
        songFrequencies[key] = (songFrequencies[key] || 0) + 1;
        if (!songObjects[key]) songObjects[key] = t;
      }
    });

    let topSongKey = null;
    let maxPlays = 0;
    Object.keys(songFrequencies).forEach(k => {
      if (songFrequencies[k] > maxPlays) {
        maxPlays = songFrequencies[k];
        topSongKey = k;
      }
    });

    const topSong = (topSongKey && songObjects[topSongKey]) || state.currentTrack || songsPool[0] || {
      title: 'Starboy',
      artist: 'The Weeknd',
      image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=240&auto=format&fit=crop&q=80',
      duration: 230
    };

    const finalTopPlays = Math.max(14, maxPlays);

    if (elements.replayTopSongImg) {
      elements.replayTopSongImg.src = topSong.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=240&auto=format&fit=crop&q=80';
    }
    if (elements.replayTopSongTitle) {
      elements.replayTopSongTitle.textContent = topSong.title || 'Starboy';
    }
    if (elements.replayTopSongArtist) {
      elements.replayTopSongArtist.textContent = topSong.artist || 'The Weeknd';
    }
    if (elements.replayTopSongPlays) {
      elements.replayTopSongPlays.textContent = `${finalTopPlays} plays • ${formatTime(topSong.duration || 210)}`;
    }

    // Wire instant play for the #1 Top Song
    if (elements.playTopSongBtn) {
      elements.playTopSongBtn.onclick = (e) => {
        e.stopPropagation();
        playTrack(topSong);
        showToast(`Playing #1 Top Song: ${topSong.title}`, '🔥');
      };
    }
  }

  function playReplayTracks() {
    const pool = [...(state.history || []), ...(state.recentlyPlayed || []), ...(state.likedSongs || [])];
    const uniqueTracks = [];
    const seen = new Set();
    for (const t of pool) {
      if (t && t.id && !seen.has(t.id)) {
        seen.add(t.id);
        uniqueTracks.push(t);
      }
    }
    if (uniqueTracks.length > 0) {
      playTrack(uniqueTracks[0], uniqueTracks);
    } else {
      showToast('No listening history yet, play some songs first!', 'ℹ️');
    }
  }

  function shareReplay() {
    const minutes = elements.replayMinutesCount?.textContent || '161';
    const topSong = elements.replayTopSongTitle?.textContent || 'Top Track';
    const artist = elements.replayTopSongArtist?.textContent || 'Artist';
    const text = `🔥 My MusiSurf Sound Capsule: ${minutes} minutes listened, Top Song: ${topSong} by ${artist}! Ride the wave of pure music at ${window.location.origin}`;
    if (navigator.share) {
      navigator.share({ title: 'MusiSurf Sound Capsule', text: text, url: window.location.href }).catch(() => {});
    } else {
      try {
        navigator.clipboard.writeText(text);
        showToast('Sound Capsule stats copied to clipboard! 📋', '✨');
      } catch (e) {
        showToast(text, '🔥');
      }
    }
  }

  // ==========================================================================
  // EVENT LISTENERS & SETUP
  // ==========================================================================
  function setupEventListeners() {
    // Top Bar Home Button
    if (elements.topHomeBtn) {
      elements.topHomeBtn.addEventListener('click', navigateToHomeTop);
    }

    // Top Bar History Back & Forward
    if (elements.historyBackBtn) {
      elements.historyBackBtn.addEventListener('click', () => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          navigateToHomeTop();
        }
      });
    }
    if (elements.historyForwardBtn) {
      elements.historyForwardBtn.addEventListener('click', () => {
        window.history.forward();
      });
    }

    // Top Bar Compass / Explore Categories
    if (elements.topCompassBtn) {
      elements.topCompassBtn.addEventListener('click', () => {
        switchView('search');
        elements.globalSearchInput.value = '';
        if (elements.clearSearchBtn) elements.clearSearchBtn.style.display = 'none';
        if (elements.searchResultsWrapper) elements.searchResultsWrapper.style.display = 'none';
        if (elements.searchEmptyState) elements.searchEmptyState.style.display = 'none';
        if (elements.searchRecentSection) elements.searchRecentSection.style.display = 'block';
        if (elements.searchBrowseSection) {
          elements.searchBrowseSection.style.display = 'block';
          setTimeout(() => {
            elements.searchBrowseSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 60);
        }
        if (elements.searchAutocompleteDropdown) elements.searchAutocompleteDropdown.style.display = 'none';
      });
    }

    // Top Bar User Avatar & Window Controls
    if (elements.topAvatarBtn) {
      elements.topAvatarBtn.addEventListener('click', () => {
        if (elements.settingsModal) elements.settingsModal.style.display = 'flex';
      });
    }
    if (elements.winCloseBtn) {
      elements.winCloseBtn.addEventListener('click', () => {
        if (elements.settingsModal) elements.settingsModal.style.display = 'flex';
      });
    }
    if (elements.winMaximizeBtn) {
      elements.winMaximizeBtn.addEventListener('click', toggleAppFullscreen);
    }
    if (elements.winMinimizeBtn) {
      elements.winMinimizeBtn.addEventListener('click', () => toggleMiniPlayer());
    }

    // Sidebar Expand / Collapse Toggle (Hover & State Persistence)
    initSidebarCollapse();

    // Search Autocomplete Outside Click & Escape Handlers
    document.addEventListener('click', (e) => {
      if (elements.searchAutocompleteDropdown && !e.target.closest('#topSearchPill') && !e.target.closest('#searchAutocompleteDropdown')) {
        elements.searchAutocompleteDropdown.style.display = 'none';
      }
    });

    // Search Filter Pills (All, Songs, Videos, Albums, Artists, Playlists)
    if (elements.searchFilterPills) {
      elements.searchFilterPills.querySelectorAll('.search-filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          elements.searchFilterPills.querySelectorAll('.search-filter-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          const filter = pill.dataset.filter || 'all';
          applySearchFilter(filter);
        });
      });
    }

    // Fullscreen Controls
    if (elements.fullscreenBtn) {
      elements.fullscreenBtn.addEventListener('click', toggleAppFullscreen);
    }
    document.addEventListener('fullscreenchange', updateFullscreenUI);

    // Floating Miniplayer Controls & Dragging
    setupFloatingMiniPlayer();

    // Navigation (Home button redirects to top of Home from anywhere)
    if (elements.navHome) elements.navHome.addEventListener('click', navigateToHomeTop);
    if (elements.navBrand) {
      elements.navBrand.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToHomeTop();
      });
    }
    if (elements.navSearch) {
      elements.navSearch.addEventListener('click', () => {
        switchView('search');
        elements.globalSearchInput.focus();
      });
    }
    if (elements.navLibraryBtn) {
      elements.navLibraryBtn.addEventListener('click', () => {
        switchView('library');
      });
    }
    if (elements.libPlaylistSortSelect) {
      elements.libPlaylistSortSelect.addEventListener('change', () => {
        localStorage.setItem('musisurf_playlist_sort', elements.libPlaylistSortSelect.value);
        updateLibraryUI();
      });
    }

    // Initialize custom Spotify-grade sort dropdowns
    setupCustomDropdown('libPlaylistSortDropdown', 'libPlaylistSortSelect', (val) => {
      localStorage.setItem('musisurf_playlist_sort', val);
      updateLibraryUI();
    });
    setupCustomDropdown('playlistTracksSortDropdown', 'playlistTracksSortSelect', (val) => {
      if (state.activePlaylistId) {
        renderPlaylistView(state.activePlaylistId);
      }
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
      if (elements.searchRecentSection) elements.searchRecentSection.style.display = 'block';
      elements.searchBrowseSection.style.display = 'block';
      renderSearchRecentUI();
      elements.globalSearchInput.focus();
    });

    if (elements.clearRecentBtn) {
      elements.clearRecentBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.recentlyPlayed = [];
        try {
          localStorage.removeItem('musisurf_recently_played');
        } catch (err) {}
        renderSearchRecentUI();
      });
    }

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

    // Repeat Mode: strictly repeats the currently playing track only (no loop interference or number 1 indicator)
    function updateRepeatUI() {
      const isRepeatOne = state.repeatMode === 'one';

      [elements.repeatBtn, elements.mobRepeatBtn].forEach(btn => {
        if (!btn) return;
        btn.classList.toggle('active', isRepeatOne);
        btn.title = isRepeatOne ? 'Repeat Track: On' : 'Repeat Track: Off';
      });
    }

    function toggleRepeatMode(e) {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      state.repeatMode = state.repeatMode === 'one' ? 'off' : 'one';
      showToast(state.repeatMode === 'one' ? 'Repeat Track: On' : 'Repeat Track: Off', state.repeatMode === 'one' ? '🔂' : '🔁');
      updateRepeatUI();
    }

    elements.repeatBtn.addEventListener('click', toggleRepeatMode);
    if (elements.mobRepeatBtn) elements.mobRepeatBtn.addEventListener('click', toggleRepeatMode);

    // Shuffle Mode Toggle
    elements.shuffleBtn.addEventListener('click', () => {
      state.isShuffled = !state.isShuffled;
      state.isPlaylistShuffle = state.isShuffled;
      saveShuffleState();
      elements.shuffleBtn.classList.toggle('active', state.isShuffled);
      if (elements.mobShuffleBtn) elements.mobShuffleBtn.classList.toggle('active', state.isShuffled);
      if (elements.shufflePlaylistBtn) elements.shufflePlaylistBtn.classList.toggle('active', state.isShuffled);

      if (state.isShuffled && state.queue.length > 1) {
        const current = state.currentTrack;
        const remaining = state.queue.filter(t => t.id !== current?.id);
        remaining.sort(() => Math.random() - 0.5);
        state.queue = current ? [current, ...remaining] : remaining;
        state.queueIndex = 0;
        showToast('Shuffle Mode: Random', '🔀');
      } else {
        showToast('Shuffle Mode: In Order', '📋');
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
        if (e.cancelable) e.preventDefault();
      }

      function handleMove(e) {
        if (!isDragging) return;
        const rect = barEl.getBoundingClientRect();
        const clientX = getClientX(e);
        const pct = (clientX - rect.left) / rect.width;
        updateScrubUI(pct);
        if (e.cancelable) e.preventDefault();
      }

      function handleEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        barEl.classList.remove('scrubbing');
        const dur = getTotalDuration();
        if (dur > 0 && Number.isFinite(dur)) {
          seekTo(dragPct * dur);
        }
        setTimeout(() => {
          state.isDraggingProgress = false;
        }, 120);
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
        const isClickOnBtn = (elements.queueBtn && elements.queueBtn.contains(e.target)) || 
                             (elements.mobPlayerQueueBtn && elements.mobPlayerQueueBtn.contains(e.target));
        if (!isClickInside && !isClickOnBtn) {
          closeQueueDrawer();
        }
      }
    }, true);

    document.addEventListener('touchend', (e) => {
      if (elements.queueDrawer && elements.queueDrawer.classList.contains('open')) {
        const isClickInside = elements.queueDrawer.contains(e.target);
        const isClickOnBtn = (elements.queueBtn && elements.queueBtn.contains(e.target)) || 
                             (elements.mobPlayerQueueBtn && elements.mobPlayerQueueBtn.contains(e.target));
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

    // Lyrics View Toggle & Close Handling (Restores Mobile Player Modal if opened from it)
    const handleCloseLyrics = () => {
      const returnToModal = state.openedLyricsFromMobilePlayer;
      state.openedLyricsFromMobilePlayer = false;
      const targetView = state.previousView && state.previousView !== 'lyrics' ? state.previousView : 'home';
      switchView(targetView);
      if (returnToModal && elements.mobilePlayerModal) {
        elements.mobilePlayerModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    };

    const toggleLyricsView = () => {
      if (!navigator.onLine) {
        showToast('Connect to internet to view lyrics', '⚡');
      }
      if (state.currentView === 'lyrics') {
        handleCloseLyrics();
      } else {
        switchView('lyrics');
      }
    };
    if (elements.lyricsBtn) elements.lyricsBtn.addEventListener('click', toggleLyricsView);
    if (elements.closeLyricsBtn) elements.closeLyricsBtn.addEventListener('click', handleCloseLyrics);

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

    // Rename Playlist Modal Handlers
    if (elements.renamePlaylistForm) {
      elements.renamePlaylistForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const playlistId = state._editingPlaylistId || state.activePlaylistId;
        const pl = state.customPlaylists.find(p => p.id === playlistId);
        const newName = (elements.renamePlaylistInput?.value || '').trim();
        if (pl && newName) {
          pl.name = newName;
          saveStoredPlaylists();
          renderSidebarPlaylists();
          updateLibraryUI();
          if (elements.playlistTitle && state.activePlaylistId === playlistId) elements.playlistTitle.textContent = pl.name;
          const titleEl = document.getElementById('mobPlaylistOptionsTitle');
          if (titleEl) titleEl.textContent = pl.name;
          showToast(`Playlist renamed to "${pl.name}"`, '✏️');
        }
        if (elements.renamePlaylistModal) elements.renamePlaylistModal.style.display = 'none';
      });
    }

    if (elements.closeRenamePlaylistModalBtn) {
      elements.closeRenamePlaylistModalBtn.addEventListener('click', () => {
        if (elements.renamePlaylistModal) elements.renamePlaylistModal.style.display = 'none';
      });
    }

    if (elements.cancelRenamePlaylistBtn) {
      elements.cancelRenamePlaylistBtn.addEventListener('click', () => {
        if (elements.renamePlaylistModal) elements.renamePlaylistModal.style.display = 'none';
      });
    }

    // Delete Playlist Confirmation Modal Handlers
    if (elements.closeDeletePlaylistModalBtn) {
      elements.closeDeletePlaylistModalBtn.addEventListener('click', () => {
        if (elements.deletePlaylistConfirmModal) elements.deletePlaylistConfirmModal.style.display = 'none';
        state._deletingPlaylistId = null;
        state._deletingPlaylistTitle = null;
      });
    }

    if (elements.cancelDeletePlaylistBtn) {
      elements.cancelDeletePlaylistBtn.addEventListener('click', () => {
        if (elements.deletePlaylistConfirmModal) elements.deletePlaylistConfirmModal.style.display = 'none';
        state._deletingPlaylistId = null;
        state._deletingPlaylistTitle = null;
      });
    }

    if (elements.confirmDeletePlaylistModalBtn) {
      elements.confirmDeletePlaylistModalBtn.addEventListener('click', () => {
        if (elements.deletePlaylistConfirmModal) elements.deletePlaylistConfirmModal.style.display = 'none';
        if (state._deletingPlaylistId) {
          executeDeletePlaylist(state._deletingPlaylistId, state._deletingPlaylistTitle);
        }
      });
    }

    // Share Song Listeners (Desktop player bar & Mobile sheet)
    if (elements.playerShareBtn) {
      elements.playerShareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        shareSong(state.currentTrack);
      });
    }

    if (elements.mobOptShareBtn) {
      elements.mobOptShareBtn.addEventListener('click', () => {
        if (elements.mobTrackOptionsModal) elements.mobTrackOptionsModal.style.display = 'none';
        if (state._optionsTrack) {
          shareSong(state._optionsTrack);
        } else {
          shareSong(state.currentTrack);
        }
      });
    }

    // Add to Playlist Modal Close & Done
    if (elements.closeAddToPlaylistBtn) {
      elements.closeAddToPlaylistBtn.addEventListener('click', () => {
        elements.addToPlaylistModal.style.display = 'none';
      });
    }
    if (elements.doneAddToPlaylistBtn) {
      elements.doneAddToPlaylistBtn.addEventListener('click', () => {
        elements.addToPlaylistModal.style.display = 'none';
      });
    }

    // Replay Navigation & Actions (Image 4 & 5)
    if (elements.navReplayBtn) {
      elements.navReplayBtn.addEventListener('click', () => switchView('replay'));
    }
    if (elements.topStreakBadge) {
      elements.topStreakBadge.addEventListener('click', () => switchView('replay'));
    }
    if (elements.playReplayBtn) {
      elements.playReplayBtn.addEventListener('click', playReplayTracks);
    }
    if (elements.shareReplayBtn) {
      elements.shareReplayBtn.addEventListener('click', shareReplay);
    }
    document.querySelectorAll('.replay-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        renderReplayView(pill.dataset.period || 'this-month');
      });
    });

    // Right Now Playing Panel Toggle & Handlers (Image 4 & 5)
    const toggleNowPlayingPanel = () => {
      const appEl = document.getElementById('app');
      const panel = elements.nowPlayingPanel;
      if (!panel || !appEl) return;
      const isOpen = panel.style.display !== 'none';
      if (isOpen) {
        panel.style.display = 'none';
        appEl.classList.remove('has-now-playing-panel');
        if (elements.nowPlayingPanelBtn) elements.nowPlayingPanelBtn.classList.remove('active');
      } else {
        panel.style.display = 'flex';
        appEl.classList.add('has-now-playing-panel');
        if (elements.nowPlayingPanelBtn) elements.nowPlayingPanelBtn.classList.add('active');
        if (state.currentTrack) {
          if (elements.nowPlayingCover) elements.nowPlayingCover.src = state.currentTrack.image || '';
          if (elements.nowPlayingTitle) elements.nowPlayingTitle.textContent = state.currentTrack.title || 'MusiSurf';
          if (elements.nowPlayingArtist) elements.nowPlayingArtist.textContent = state.currentTrack.artist || '—';
          if (elements.nowPlayingArtistBanner) elements.nowPlayingArtistBanner.src = state.currentTrack.image || '';
          if (elements.nowPlayingArtistName) elements.nowPlayingArtistName.textContent = state.currentTrack.artist || 'MusiSurf Artist';
          if (elements.nowPlayingMonthlyListeners) {
            const count = state.currentTrack.playCount ? state.currentTrack.playCount.toLocaleString() : '135,420,100';
            elements.nowPlayingMonthlyListeners.textContent = `${count} monthly listeners`;
          }
        }
      }
    };
    if (elements.nowPlayingPanelBtn) elements.nowPlayingPanelBtn.addEventListener('click', toggleNowPlayingPanel);
    if (elements.closeNowPlayingPanelBtn) elements.closeNowPlayingPanelBtn.addEventListener('click', toggleNowPlayingPanel);
    if (elements.nowPlayingHeartBtn) {
      elements.nowPlayingHeartBtn.addEventListener('click', () => {
        if (state.currentTrack) toggleLikeSong(state.currentTrack);
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

    // Two-Pane Settings Category Navigation (Image 1)
    document.querySelectorAll('.settings-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.settings-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.dataset.target;
        document.querySelectorAll('.settings-tab-view').forEach(view => {
          view.classList.toggle('active', view.id === targetId);
        });
      });
    });

    // Settings Search Filter
    const settingsSearchField = document.getElementById('settingsSearchInput');
    if (settingsSearchField) {
      settingsSearchField.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        document.querySelectorAll('.settings-tab-view .sound-card-item, .settings-tab-view .playback-feature-card').forEach(item => {
          const txt = item.textContent.toLowerCase();
          item.style.display = (!query || txt.includes(query)) ? '' : 'none';
        });
      });
    }

    // Audio Output Device Enumeration & Switching
    async function populateAudioOutputDevices(selectEl) {
      if (!selectEl || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        selectEl.innerHTML = '';
        const defOpt = document.createElement('option');
        defOpt.value = 'default';
        defOpt.textContent = 'Speakers (System Default)';
        selectEl.appendChild(defOpt);
        outputs.forEach(d => {
          if (d.deviceId !== 'default') {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || `Audio Output (${d.deviceId.slice(0, 8)})`;
            selectEl.appendChild(opt);
          }
        });
      } catch (err) {
        console.warn('Audio device enum note:', err);
      }
    }

    const outputSelect = elements.settingsAudioOutputSelect || document.getElementById('settingsAudioOutputSelect');
    if (outputSelect) {
      populateAudioOutputDevices(outputSelect);
      outputSelect.addEventListener('change', async (e) => {
        const deviceId = e.target.value;
        if (typeof elements.audio.setSinkId === 'function') {
          try {
            await elements.audio.setSinkId(deviceId === 'default' ? '' : deviceId);
            showToast('Audio output switched', '🔊');
          } catch (err) {
            console.warn('setSinkId error:', err);
          }
        }
      });
      if (navigator.mediaDevices) {
        navigator.mediaDevices.addEventListener('devicechange', () => {
          populateAudioOutputDevices(outputSelect);
        });
      }
    }

    // Equalizer Toggle Switch
    const eqToggle = elements.equalizerToggleSwitch || document.getElementById('equalizerToggleSwitch');
    const eqSliders = elements.equalizerSlidersWrap || document.getElementById('equalizerSlidersWrap');
    if (eqToggle && eqSliders) {
      eqToggle.addEventListener('change', () => {
        eqSliders.style.display = eqToggle.checked ? 'block' : 'none';
        state.settings.equalizerEnabled = eqToggle.checked;
        saveSettings();
        showToast(eqToggle.checked ? '10-Band Equalizer enabled' : 'Equalizer bypassed', '🎛️');
      });
    }

    // Equalizer Vertical Slider Gain Adjustments
    document.querySelectorAll('.eq-vertical-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const freq = e.target.dataset.freq;
        const gain = parseFloat(e.target.value) || 0;
        if (!state.settings.eqBands) state.settings.eqBands = {};
        state.settings.eqBands[freq] = gain;
        saveSettings();
      });
    });

    // Crossfade Slider (Image 2 Gradient Track)
    const crossfadeSlider = elements.crossfadeSlider || document.getElementById('crossfadeSlider');
    const liveTimeLabel = elements.liveCrossfadeSeconds || document.getElementById('liveCrossfadeSeconds');
    if (crossfadeSlider) {
      crossfadeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        state.settings.crossfade = val;
        if (liveTimeLabel) liveTimeLabel.textContent = `${val.toFixed(1)} s`;
        if (elements.crossfadeValueLabel) elements.crossfadeValueLabel.textContent = val === 0 ? 'Off' : `${val.toFixed(1)}s`;
      });
      crossfadeSlider.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value) || 0;
        state.settings.crossfade = val;
        saveSettings();
        showToast(val === 0 ? 'Crossfade turned off' : `Crossfade set to ${val.toFixed(1)} s`, '🎚️');
      });
    }

    // Automix & Skip Silence Toggles (Image 3)
    const automixSwitch = elements.automixToggleSwitch || document.getElementById('automixToggleSwitch');
    if (automixSwitch) {
      automixSwitch.addEventListener('change', () => {
        state.settings.automix = automixSwitch.checked;
        saveSettings();
        showToast(automixSwitch.checked ? 'Automix enabled' : 'Automix disabled', '🎶');
      });
    }

    const skipSilenceSwitch = elements.skipSilenceToggleSwitch || document.getElementById('skipSilenceToggleSwitch');
    const deadSilenceSwitch = elements.deadSilenceToggleSwitch || document.getElementById('deadSilenceToggleSwitch');

    if (skipSilenceSwitch) {
      skipSilenceSwitch.addEventListener('change', () => {
        state.settings.removeDeadSilence = skipSilenceSwitch.checked;
        if (deadSilenceSwitch) deadSilenceSwitch.checked = skipSilenceSwitch.checked;
        saveSettings();
        showToast(skipSilenceSwitch.checked ? 'Skip silence enabled (-42 dB)' : 'Skip silence disabled', '⚡');
      });
    }

    if (deadSilenceSwitch) {
      deadSilenceSwitch.addEventListener('change', () => {
        state.settings.removeDeadSilence = deadSilenceSwitch.checked;
        if (skipSilenceSwitch) skipSilenceSwitch.checked = deadSilenceSwitch.checked;
        saveSettings();
        showToast(deadSilenceSwitch.checked ? 'Remove dead silence enabled' : 'Remove dead silence disabled', '⚡');
      });
    }

    // Speed / Pitch Intact Controller (0.8x - 2.0x, Image 3)
    document.querySelectorAll('#speedPillsRow .speed-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#speedPillsRow .speed-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const speed = parseFloat(btn.dataset.speed) || 1.0;
        state.settings.playbackSpeed = speed;
        if (elements.audio) {
          elements.audio.playbackRate = speed;
          elements.audio.preservesPitch = true;
        }
        saveSettings();
        showToast(`Playback speed: ${speed}x (pitch intact)`, '⏩');
      });
    });

    // Streaming Quality Pills
    document.querySelectorAll('#streamQualityPills .sound-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#streamQualityPills .sound-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.settings.streamingQuality = btn.dataset.quality;
        saveSettings();
        showToast(`Streaming quality: ${btn.textContent}`, '📶');
      });
    });

    // Volume Leveling Pills
    document.querySelectorAll('#volumeLevelingPills .sound-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#volumeLevelingPills .sound-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.settings.volumeLeveling = btn.dataset.level;
        saveSettings();
        showToast(`Volume leveling: ${btn.textContent}`, '🔊');
      });
    });

    // Clear Offline Cache Button
    const clearCacheBtn = document.getElementById('clearCacheSettingsBtn');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', async () => {
        try {
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }
          showToast('Offline cache cleared successfully', '🧹');
        } catch (e) {
          showToast('Cache cleared', '🧹');
        }
      });
    }

    // Curated Podcasts Card Clicks in Explore Section
    document.querySelectorAll('.podcast-card').forEach(card => {
      card.addEventListener('click', () => {
        const query = card.dataset.query;
        if (query) {
          if (elements.globalSearchInput) elements.globalSearchInput.value = query;
          if (elements.clearSearchBtn) elements.clearSearchBtn.style.display = 'flex';
          switchView('search');
          performSearch(query);
        }
      });
    });

    // Export Format Modal Listeners
    if (elements.closeExportFormatModalBtn) {
      elements.closeExportFormatModalBtn.addEventListener('click', () => {
        if (elements.exportFormatModal) elements.exportFormatModal.style.display = 'none';
      });
    }
    if (elements.exportFormatModal) {
      elements.exportFormatModal.addEventListener('click', (e) => {
        if (e.target === elements.exportFormatModal) {
          elements.exportFormatModal.style.display = 'none';
        }
      });
    }
    if (elements.exportAsJsonBtn) {
      elements.exportAsJsonBtn.addEventListener('click', () => {
        exportCurrentPlaylist('json');
      });
    }
    if (elements.exportAsCsvBtn) {
      elements.exportAsCsvBtn.addEventListener('click', () => {
        exportCurrentPlaylist('csv');
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

    // Close Modals on Backdrop Click (Note: settingsModal is strictly excluded; can only close via cross button on grey circle)
    [elements.createPlaylistModal, elements.renamePlaylistModal, elements.deletePlaylistConfirmModal, elements.addToPlaylistModal, elements.exportFormatModal].forEach(modal => {
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
      if (isYouTubeActive()) return;
      if (state.isPlaying && !state.isDraggingProgress && state.currentTrack) {
        const cur = elements.audio.currentTime || 0;
        if (state.restoredResumeTime > 0 && cur >= 0.5) {
          state.restoredResumeTime = 0;
        }
        const dur = getTotalDuration();
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
      const isYtTrack = state.currentTrack?.source === 'youtube' || state.currentTrack?.ytId || (state.currentTrack?.id && state.currentTrack.id.startsWith('yt_'));
      if (isYtTrack) {
        const ytId = state.currentTrack.ytId || (state.currentTrack.id ? state.currentTrack.id.replace('yt_', '') : '');
        if (ytId && state.ytReady && state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
          if (!isContentFilterAllowed(state.currentTrack)) {
            showToast('Playback Blocked: MusiSurf strictly plays pure Music only.', '🚫');
            return;
          }
          try {
            state.activePlayerEngine = 'youtube';
            state.isPlaying = true;
            try {
              elements.audio.pause();
              elements.audio.removeAttribute('src');
              elements.audio.load();
            } catch (e) {}
            state.ytPlayer.loadVideoById(ytId);
            state.ytPlayer.setVolume(state.isMuted ? 0 : state.volume * 100);
            state.ytPlayer.playVideo();
            updatePlayPauseButton();
            return;
          } catch (e) {
            console.warn('YouTube fallback playback error:', e);
          }
        }
      }
      if (state.currentTrack?.streamUrl && elements.audio.src !== state.currentTrack.streamUrl) {
        console.log('Switching to MusiSurf stream proxy after error...');
        elements.audio.src = state.currentTrack.streamUrl;
        elements.audio.volume = state.isMuted ? 0 : state.volume;
        elements.audio.load();
        elements.audio.play().catch(e => {
          console.warn('Proxy retry error:', e);
          state.isPlaying = false;
          updatePlayPauseButton();
        });
      } else {
        console.warn('Audio stream error for track:', state.currentTrack?.title);
        state.isPlaying = false;
        updatePlayPauseButton();
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
      navigateToHomeTop();
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
          renderPlaylistView('local');
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
      elements.libHubLocalBtn.addEventListener('click', () => renderPlaylistView('local'));
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
        if (!navigator.onLine) {
          showToast('Connect to internet to view lyrics', '⚡');
        }
        state.openedLyricsFromMobilePlayer = true;
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

    if (elements.mobPlayerQueueBtn) {
      elements.mobPlayerQueueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (elements.queueDrawer) {
          const willOpen = !elements.queueDrawer.classList.contains('open');
          elements.queueDrawer.classList.toggle('open', willOpen);
          if (elements.queueDrawerBackdrop) elements.queueDrawerBackdrop.classList.toggle('active', willOpen);
          if (willOpen) updateQueueDrawerUI();
        }
      });
    }

    // Mobile Player 3-Bar Options Button & Bottom Sheet
    if (elements.closeMobOptionsBtn) {
      elements.closeMobOptionsBtn.addEventListener('click', () => {
        if (elements.mobTrackOptionsModal) elements.mobTrackOptionsModal.style.display = 'none';
      });
    }

    const mobOptLikeBtn = document.getElementById('mobOptLikeBtn');
    if (mobOptLikeBtn) {
      mobOptLikeBtn.addEventListener('click', () => {
        if (elements.mobTrackOptionsModal) elements.mobTrackOptionsModal.style.display = 'none';
        const target = state.contextTrack || state.currentTrack;
        if (target) {
          toggleLikeSong(target);
          updatePlayerTitlesWithTick(state.currentTrack);
          updateAllPlaylistTickBadges();
        }
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
          deleteOfflineTrackFromDB(target.id);
          showToast(`Removed "${target.title}" from downloaded songs`, '🗑️');
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

    if (elements.closeMobOptionsBtn && elements.mobTrackOptionsModal) {
      elements.closeMobOptionsBtn.addEventListener('click', () => {
        elements.mobTrackOptionsModal.style.display = 'none';
      });
    }

    if (elements.mobTrackOptionsModal) {
      elements.mobTrackOptionsModal.addEventListener('click', (e) => {
        if (e.target === elements.mobTrackOptionsModal) {
          elements.mobTrackOptionsModal.style.display = 'none';
        }
      });
    }

    // Mobile Playlist Options Bottom Sheet
    if (elements.closeMobPlaylistOptionsBtn && elements.mobilePlaylistOptionsModal) {
      elements.closeMobPlaylistOptionsBtn.addEventListener('click', () => {
        elements.mobilePlaylistOptionsModal.style.display = 'none';
      });
    }

    if (elements.mobilePlaylistOptionsModal) {
      elements.mobilePlaylistOptionsModal.addEventListener('click', (e) => {
        if (e.target === elements.mobilePlaylistOptionsModal) {
          elements.mobilePlaylistOptionsModal.style.display = 'none';
        }
      });
    }

    if (elements.mobOptExportPlaylistBtn) {
      elements.mobOptExportPlaylistBtn.addEventListener('click', () => {
        if (elements.mobilePlaylistOptionsModal) {
          elements.mobilePlaylistOptionsModal.style.display = 'none';
        }
        openExportPlaylistModal();
      });
    }

    if (elements.mobOptRenamePlaylistBtn) {
      elements.mobOptRenamePlaylistBtn.addEventListener('click', () => {
        if (elements.mobilePlaylistOptionsModal) {
          elements.mobilePlaylistOptionsModal.style.display = 'none';
        }
        promptRenameCurrentPlaylist();
      });
    }

    if (elements.mobOptDeletePlaylistBtn) {
      elements.mobOptDeletePlaylistBtn.addEventListener('click', () => {
        if (elements.mobilePlaylistOptionsModal) {
          elements.mobilePlaylistOptionsModal.style.display = 'none';
        }
        if (elements.deletePlaylistBtn) {
          elements.deletePlaylistBtn.click();
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
      if (elements.mobilePlaylistOptionsModal && elements.mobilePlaylistOptionsModal.style.display !== 'none') {
        elements.mobilePlaylistOptionsModal.style.display = 'none';
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
      if (elements.exportFormatModal && elements.exportFormatModal.style.display !== 'none') {
        elements.exportFormatModal.style.display = 'none';
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
      if (elements.renamePlaylistModal && elements.renamePlaylistModal.style.display !== 'none') {
        elements.renamePlaylistModal.style.display = 'none';
        return;
      }
      if (elements.deletePlaylistConfirmModal && elements.deletePlaylistConfirmModal.style.display !== 'none') {
        elements.deletePlaylistConfirmModal.style.display = 'none';
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

      if (e.code === 'Space' || e.key === ' ' || e.keyCode === 32) {
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
      } else if (e.key.toLowerCase() === 's') {
        if (elements.shuffleBtn) elements.shuffleBtn.click();
      } else if (e.key.toLowerCase() === 'r') {
        if (elements.repeatBtn) elements.repeatBtn.click();
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
        if (elements.renamePlaylistModal) elements.renamePlaylistModal.style.display = 'none';
        if (elements.deletePlaylistConfirmModal) elements.deletePlaylistConfirmModal.style.display = 'none';
        elements.addToPlaylistModal.style.display = 'none';
        if (elements.settingsModal) elements.settingsModal.style.display = 'none';
        if (elements.exportFormatModal) elements.exportFormatModal.style.display = 'none';
        if (elements.mobilePlayerModal) elements.mobilePlayerModal.style.display = 'none';
      }
    });
    if (elements.navDownloaded) {
      elements.navDownloaded.addEventListener('click', () => {
        renderPlaylistView('downloaded');
      });
    }

    if (elements.homeGoDownloadedBtn) {
      elements.homeGoDownloadedBtn.addEventListener('click', () => {
        renderPlaylistView('downloaded');
      });
    }

    if (elements.searchGoDownloadedBtn) {
      elements.searchGoDownloadedBtn.addEventListener('click', () => {
        renderPlaylistView('downloaded');
      });
    }

    // Network connection status changes & offline UI controller
    function updateOfflineModeUI(isOnline = navigator.onLine) {
      document.body.classList.toggle('is-offline', !isOnline);
      if (elements.offlineBanner) {
        elements.offlineBanner.style.display = isOnline ? 'none' : 'flex';
      }
      if (elements.homeOfflineState) {
        elements.homeOfflineState.style.display = isOnline ? 'none' : 'flex';
      }
      if (elements.searchOfflineState) {
        elements.searchOfflineState.style.display = isOnline ? 'none' : 'flex';
        if (!isOnline && elements.searchResultsWrapper) {
          elements.searchResultsWrapper.style.display = 'none';
        }
      }
    }

    function handleNetworkChange() {
      const isOnline = navigator.onLine;
      updateOfflineModeUI(isOnline);
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
    updateOfflineModeUI(navigator.onLine);

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
    loadStoredData();
    loadOfflineTracks();
    loadSettings();
    loadShuffleState();
    loadLocalTracksFromDB();
    setDynamicGreeting();
    setVolume(state.volume);
    updateLikedCountUI();
    renderSidebarPlaylists();
    setupEventListeners();
    loadTrendingShelves();
    renderSearchRecentUI();
    restoreLastPlayedState();
    updateProgress();

    // Restore previous active view / playlist if user refreshed while browsing
    let savedView = null;
    try {
      const savedStr = localStorage.getItem('musisurf_current_view');
      if (savedStr) savedView = JSON.parse(savedStr);
    } catch (e) {}

    if (savedView && savedView.view === 'playlist' && savedView.playlistId) {
      renderPlaylistView(savedView.playlistId);
    } else if (savedView && ['library', 'search', 'localMusic', 'liked', 'downloaded'].includes(savedView.view)) {
      switchView(savedView.view);
    } else {
      document.body.dataset.activeView = 'home';
      try {
        window.history.replaceState({ view: 'home', depth: 1 }, '', window.location.pathname);
      } catch (e) {}
    }

    if (elements.settingsModal) elements.settingsModal.style.display = 'none';

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
