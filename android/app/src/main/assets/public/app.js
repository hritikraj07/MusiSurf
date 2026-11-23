/**
 * MusiSurf — Complete Client Application
 * Ad-Free, Full-Length Music Streaming Web Player
 */

(function () {
  'use strict';

  // State Management
  const PREV_RESTART_THRESHOLD_SECONDS = 3.0;
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
    repeatMode: localStorage.getItem('musisurf_repeat_mode') || 'off', // 'off', 'all', 'one'
    volume: 0.8,
    isMuted: false,
    currentView: 'home', // 'home', 'search', 'explore', 'liked', 'playlist', 'lyrics', 'localMusic'
    isExploreMode: localStorage.getItem('musisurf_explore_mode') === 'true',
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
    autoplay: localStorage.getItem('musisurf_autoplay_enabled') !== 'false',
    playlistMode: localStorage.getItem('musisurf_playlist_playback_mode') || '1', // '1': In Order + Autoplay, '2': Shuffle Once + Autoplay, '3': Shuffle & Repeat Playlist
    recommendationQueue: [],
    rejectedRecommendationIds: new Set(),
    recoSession: {
      sessionId: 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      recommendedCanonicalIds: new Set(),
      playedCanonicalIds: new Set(),
      skippedCanonicalIds: new Map(), // canonicalId -> timestamp
      removedCanonicalIds: new Set(),
      recentArtists: [],
      seedHistory: [],
      pageOffsets: new Map(),
      requestInProgress: false,
    },
    playbackContext: { type: 'idle', playlistId: null, trackId: null },
    playlistProgressMap: {},
    sessionHistory: [],
    sessionProfile: { languages: [], artists: [], moods: [], recentTracks: [] },
    recommendationSeed: null,
    isFetchingRecommendations: false,
    playlistCycle: [],
    playlistCycleIndex: 0,
    lyrics: [],
    hasSyncedLyrics: false,
    activeLyricIndex: -1,
    openedLyricsFromMobilePlayer: false,
    vizMode: 'bars', // 'bars', 'wave', 'circle'
    ytPlayer: null,
    ytReady: false,
    settings: {
      removeDeadSilence: true,
      autoMixDuration: 5,
      get crossfade() { return this.autoMixDuration; },
      set crossfade(val) { this.autoMixDuration = val; }
    },
    userQueue: [], // Spotify-like priority manual queue
    contextQueue: [], // Context queue from playlist / album / recommendations
    contextIndex: 0,
    isAutoMixing: false,
    isCrossfading: false,
    isTransitioning: false,
    isTransitionPreloaded: false,
    preloadedNextTrack: null,
    lyricsCache: {}, // In-memory lyrics cache
    trackEpoch: 0,
    currentLyricsRequestId: 0,
    currentLyricsTrackId: null,
    _lastLyricsScrolledTrackId: null,
    isAwaitingRecommendations: false,
    consecutivePlaybackErrors: 0,
    lastAdvanceTimestamp: 0,
    lastCompletedTrackId: null,
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
    searchHistory: (() => {
      try {
        const raw = localStorage.getItem('musisurf_search_history');
        return raw ? JSON.parse(raw) : [];
      } catch (e) { return []; }
    })(),
    autocompleteCache: new Map(),
    autocompleteAbortController: null,
    selectedDropdownIndex: -1,
    discoveryData: null,
    restoredResumeTime: 0,
    contextTrack: null,
    totalListenedSeconds: (() => {
      try {
        const val = localStorage.getItem('musisurf_total_listened_sec');
        return val !== null ? parseInt(val, 10) || 0 : 0;
      } catch (e) { return 0; }
    })(),
    totalSongsPlayed: (() => {
      try {
        const val = localStorage.getItem('musisurf_total_songs_played');
        return val !== null ? parseInt(val, 10) || 0 : 0;
      } catch (e) { return 0; }
    })(),
    silenceCache: (() => {
      try {
        return JSON.parse(localStorage.getItem('musisurf_silence_cache') || '{}');
      } catch (e) { return {}; }
    })(),
    _currentTrackPlayedRecorded: false,
    _currentTrackListeningSeconds: 0,
    _lastTrackedPlaybackTime: null,
    _lastTrackedDeck: null,
    _tailSilenceStartTime: null,
    _lastStatsSaveTime: 0,
    activePlayerEngine: 'audio',
    activeSearchFilter: 'all',
    trackPlayCounts: (() => {
      try { return JSON.parse(localStorage.getItem('musisurf_track_play_counts') || '{}'); } catch (e) { return {}; }
    })()
  };

  // --------------------------------------------------------------------------
  // USER AUTHENTICATION & PROTECTED ACTION GUARDS
  // --------------------------------------------------------------------------
  let pendingAuthAction = null;

  function isAuthenticated() {
    return Boolean(state.currentUser && (state.currentUser.id || state.currentUser.email));
  }

  function requireAuthForAction(actionLabel = 'perform this action', onAuthenticated = null) {
    if (isAuthenticated()) {
      if (typeof onAuthenticated === 'function') {
        try { onAuthenticated(); } catch (e) { console.error(e); }
      }
      return true;
    }

    const cleanLabel = (actionLabel || '').trim().toLowerCase();
    const promptText = cleanLabel.startsWith('sign in')
      ? actionLabel
      : `Sign in or create an account to ${cleanLabel}.`;

    pendingAuthAction = typeof onAuthenticated === 'function' ? onAuthenticated : null;

    if (typeof window.openAuthModal === 'function') {
      window.openAuthModal('signin', promptText);
    } else {
      const authM = document.getElementById('authModal');
      if (authM) authM.style.display = 'flex';
      const alertEl = document.getElementById('authAlert');
      if (alertEl) {
        alertEl.className = 'auth-alert info';
        alertEl.textContent = promptText;
        alertEl.style.display = 'flex';
      }
    }

    return false;
  }

  function resumePendingAuthAction() {
    if (typeof pendingAuthAction === 'function') {
      const fn = pendingAuthAction;
      pendingAuthAction = null;
      try {
        fn();
      } catch (err) {
        console.warn('[Auth] Resume pending action error:', err);
      }
    }
  }

  // DOM Elements
  const elements = {
    // Audio elements (Dual-Deck for Equal-Power Crossfading)
    audio: document.getElementById('audioPlayer'),
    audioSecondary: document.getElementById('audioPlayerSecondary'),
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
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    sidebarLibSearchRow: document.getElementById('sidebarLibSearchRow'),
    sidebarLibSearchBox: document.getElementById('sidebarLibSearchBox'),
    sidebarLibSearchToggleBtn: document.getElementById('sidebarLibSearchToggleBtn'),
    sidebarLibSearchInput: document.getElementById('sidebarLibSearchInput'),
    sidebarLibSortBtn: document.getElementById('sidebarLibSortBtn'),

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
    replayTotalSongsCount: document.getElementById('replayTotalSongsCount'),
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
    trendingHindiSection: document.getElementById('trendingHindiSection'),
    trendingHindiCard: document.getElementById('trendingHindiCard'),
    trendingDateTag: document.getElementById('trendingDateTag'),
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
    playlistResumeIndicatorBtn: document.getElementById('playlistResumeIndicatorBtn'),
    playlistResumeIndicatorText: document.getElementById('playlistResumeIndicatorText'),
    restartPlaylistBtn: document.getElementById('restartPlaylistBtn'),
    shufflePlaylistBtn: document.getElementById('shufflePlaylistBtn'),
    playlistModeBadge: document.getElementById('playlistModeBadge'),
    pinPlaylistBtn: document.getElementById('pinPlaylistBtn'),
    renamePlaylistBtn: document.getElementById('renamePlaylistBtn'),
    playlistTracksSortSelect: document.getElementById('playlistTracksSortSelect'),
    deletePlaylistBtn: document.getElementById('deletePlaylistBtn'),
    exportPlaylistBtn: document.getElementById('exportPlaylistBtn'),
    playlistAddToQueueBtn: document.getElementById('playlistAddToQueueBtn'),
    playlistDownloadAllBtn: document.getElementById('playlistDownloadAllBtn'),
    mobilePlaylistMoreBtn: document.getElementById('mobilePlaylistMoreBtn'),
    mobilePlaylistOptionsModal: document.getElementById('mobilePlaylistOptionsModal'),
    closeMobPlaylistOptionsBtn: document.getElementById('closeMobPlaylistOptionsBtn'),
    mobOptAddPlaylistToQueueBtn: document.getElementById('mobOptAddPlaylistToQueueBtn'),
    mobOptDownloadPlaylistBtn: document.getElementById('mobOptDownloadPlaylistBtn'),
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
    lyricsStatusBadge: document.getElementById('lyricsStatusBadge'),
    lyricsLoading: document.getElementById('lyricsLoading'),
    lyricsLoadingText: document.getElementById('lyricsLoadingText'),
    lyricsLinesContainer: document.getElementById('lyricsLinesContainer'),
    lyricsScrollBody: document.getElementById('lyricsScrollBody'),
    closeLyricsBtn: document.getElementById('closeLyricsBtn'),
    lyricsSyncControls: document.getElementById('lyricsSyncControls'),
    lyricsSyncMinus: document.getElementById('lyricsSyncMinus'),
    lyricsSyncPlus: document.getElementById('lyricsSyncPlus'),
    lyricsSyncReset: document.getElementById('lyricsSyncReset'),
    lyricsSyncLabel: document.getElementById('lyricsSyncLabel'),
    lyricsFullscreenBtn: document.getElementById('lyricsFullscreenBtn'),
    lyricsEdgeGlow: document.getElementById('lyrics-edge-glow'),
    lyricsScriptToggleBtn: document.getElementById('lyricsScriptToggleBtn'),
    contributeLyricsModal: document.getElementById('contributeLyricsModal'),
    closeContributeLyricsBtn: document.getElementById('closeContributeLyricsBtn'),
    cancelContributeLyricsBtn: document.getElementById('cancelContributeLyricsBtn'),
    contributeLyricsForm: document.getElementById('contributeLyricsForm'),
    contributeTrackInput: document.getElementById('contributeTrackInput'),
    contributeArtistInput: document.getElementById('contributeArtistInput'),
    contributeLyricsText: document.getElementById('contributeLyricsText'),

    // Queue Drawer
    queueDrawer: document.getElementById('queueDrawer'),
    queueDrawerBackdrop: document.getElementById('queueDrawerBackdrop'),
    queueBtn: document.getElementById('queueBtn'),
    closeQueueBtn: document.getElementById('closeQueueBtn'),
    queueNowPlayingSection: document.getElementById('queueNowPlayingSection'),
    queueNowPlaying: document.getElementById('queueNowPlaying'),
    queueUserSection: document.getElementById('queueUserSection'),
    queueUserList: document.getElementById('queueUserList'),
    queueContextSection: document.getElementById('queueContextSection'),
    queueContextHeading: document.getElementById('queueContextHeading'),
    queueList: document.getElementById('queueList'),
    clearQueueBtn: document.getElementById('clearQueueBtn'),
    queueAutoplayToggleBtn: document.getElementById('queueAutoplayToggleBtn'),
    queueRecommendedSection: document.getElementById('queueRecommendedSection'),
    queueRecommendedHeading: document.getElementById('queueRecommendedHeading'),
    queueRecommendedList: document.getElementById('queueRecommendedList'),
    queueRecoVibePill: document.getElementById('queueRecoVibePill'),
    smartAutoplayToggleSwitch: document.getElementById('smartAutoplayToggleSwitch'),

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

    // PWA & Mobile Navigation (Home, Search, Library, Downloads)
    pwaInstallBtn: document.getElementById('pwaInstallBtn'),
    mobileNavBar: document.getElementById('mobileNavBar'),
    mobNavSlider: document.getElementById('mobNavSlider'),
    mobNavHome: document.getElementById('mobNavHome'),
    mobNavSearch: document.getElementById('mobNavSearch'),
    mobNavLibrary: document.getElementById('mobNavLibrary'),
    mobNavDownloads: document.getElementById('mobNavDownloads'),

    // Mobile Top Header Brand & Action Controls
    mobileTopBrand: document.getElementById('mobileTopBrand'),
    mobTopSearchBtn: document.getElementById('mobTopSearchBtn'),
    mobTopProfileBtn: document.getElementById('mobTopProfileBtn'),
    mobTopAvatar: document.getElementById('mobTopAvatar'),

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
    mobOptGoToQueueBtn: document.getElementById('mobOptGoToQueueBtn'),
    mobOptQueueBtn: document.getElementById('mobOptQueueBtn'),
    mobOptDownloadBtn: document.getElementById('mobOptDownloadBtn'),
    mobOptDownloadText: document.getElementById('mobOptDownloadText'),
    mobOptRemovePlaylistBtn: document.getElementById('mobOptRemovePlaylistBtn'),
    desktopHeaderBrand: document.getElementById('desktopHeaderBrand'),
    libHubSoundtrackBtn: document.getElementById('libHubSoundtrackBtn'),

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
    sidebarSettingsBtn: document.getElementById('sidebarSettingsBtn'),
    libSettingsBtn: document.getElementById('libSettingsBtn'),
    libFilterPillsBar: document.getElementById('libFilterPillsBar'),
    libHubGrid: document.getElementById('libHubGrid'),
    libPlaylistsSection: document.getElementById('libPlaylistsSection'),
    libHeaderAddPlaylistBtn: document.getElementById('libHeaderAddPlaylistBtn'),
    closeSettingsModalBtn: document.getElementById('closeSettingsModalBtn'),
    closeSettingsTopRightBtn: document.getElementById('closeSettingsTopRightBtn'),
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

    // Playlist Import System Elements
    settingsImportPlaylistBtn: document.getElementById('settingsImportPlaylistBtn'),
    triggerImportModalBtn: document.getElementById('triggerImportModalBtn'),
    drawerImportPlaylistBtn: document.getElementById('drawerImportPlaylistBtn'),
    importPlaylistModal: document.getElementById('importPlaylistModal'),
    closeImportPlaylistModalBtn: document.getElementById('closeImportPlaylistModalBtn'),
    cancelImportModalBtn: document.getElementById('cancelImportModalBtn'),
    importMethodLinkTab: document.getElementById('importMethodLinkTab') || document.getElementById('importMethodSpotifyTab'),
    importMethodSpotifyTab: document.getElementById('importMethodSpotifyTab'),
    importMethodYtMusicTab: document.getElementById('importMethodYtMusicTab'),
    importMethodFileTab: document.getElementById('importMethodFileTab'),
    importLinkBody: document.getElementById('importLinkBody'),
    importYtMusicBody: document.getElementById('importYtMusicBody'),
    importFileBody: document.getElementById('importFileBody'),
    importPlaylistUrlInput: document.getElementById('importPlaylistUrlInput'),
    importYtMusicUrlInput: document.getElementById('importYtMusicUrlInput'),
    importPasteUrlBtn: document.getElementById('importPasteUrlBtn'),
    importPasteYtMusicUrlBtn: document.getElementById('importPasteYtMusicUrlBtn'),
    spotifyDetectedIdPill: document.getElementById('spotifyDetectedIdPill'),
    ytDetectedIdPill: document.getElementById('ytDetectedIdPill'),
    spotifyConnectionTitle: document.getElementById('spotifyConnectionTitle'),
    spotifyConnectionDesc: document.getElementById('spotifyConnectionDesc'),
    spotifyConnectHeaderBtn: document.getElementById('spotifyConnectHeaderBtn'),
    spotifyDisconnectHeaderBtn: document.getElementById('spotifyDisconnectHeaderBtn'),
    spotifyAuthStatusDot: document.getElementById('spotifyAuthStatusDot'),
    ytConnectionTitle: document.getElementById('ytConnectionTitle'),
    ytConnectionDesc: document.getElementById('ytConnectionDesc'),
    ytConnectHeaderBtn: document.getElementById('ytConnectHeaderBtn'),
    ytDisconnectHeaderBtn: document.getElementById('ytDisconnectHeaderBtn'),
    ytAuthStatusDot: document.getElementById('ytAuthStatusDot'),
    spotifyAuthStatusText: document.getElementById('spotifyAuthStatusText'),
    importDropZone: document.getElementById('importDropZone'),
    importPlaylistFileInput: document.getElementById('importPlaylistFileInput'),
    importBrowseFileBtn: document.getElementById('importBrowseFileBtn'),
    importSelectedFileInfo: document.getElementById('importSelectedFileInfo'),
    importSelectedFileName: document.getElementById('importSelectedFileName'),
    importClearSelectedFileBtn: document.getElementById('importClearSelectedFileBtn'),
    importValidationError: document.getElementById('importValidationError'),
    startImportFetchBtn: document.getElementById('startImportFetchBtn'),
    importStepChoose: document.getElementById('importStepChoose'),
    importStepProgress: document.getElementById('importStepProgress'),
    importStepPreview: document.getElementById('importStepPreview'),
    importStepSuccess: document.getElementById('importStepSuccess'),
    importProgressStatusText: document.getElementById('importProgressStatusText'),
    importProgressBarFill: document.getElementById('importProgressBarFill'),
    importProgressCountText: document.getElementById('importProgressCountText'),
    importProgressLiveStats: document.getElementById('importProgressLiveStats'),
    importPreviewCover: document.getElementById('importPreviewCover'),
    importPreviewName: document.getElementById('importPreviewName'),
    importPreviewDesc: document.getElementById('importPreviewDesc'),
    importPreviewProviderTag: document.getElementById('importPreviewProviderTag'),
    importPreviewCountBadge: document.getElementById('importPreviewCountBadge'),
    statSourceTotal: document.getElementById('statSourceTotal'),
    statMatchedCount: document.getElementById('statMatchedCount'),
    statReviewCount: document.getElementById('statReviewCount'),
    statUnmatchedCount: document.getElementById('statUnmatchedCount'),
    importDuplicateNotice: document.getElementById('importDuplicateNotice'),
    importPreviewTracksBody: document.getElementById('importPreviewTracksBody'),
    importPreviewSummaryText: document.getElementById('importPreviewSummaryText'),
    backToChooseMethodBtn: document.getElementById('backToChooseMethodBtn'),
    confirmCreatePlaylistBtn: document.getElementById('confirmCreatePlaylistBtn'),
    importSuccessSub: document.getElementById('importSuccessSub'),
    closeImportSuccessBtn: document.getElementById('closeImportSuccessBtn'),
    openImportedPlaylistBtn: document.getElementById('openImportedPlaylistBtn'),
    candidateReviewModal: document.getElementById('candidateReviewModal'),
    closeCandidateReviewBtn: document.getElementById('closeCandidateReviewBtn'),
    candReviewSourceTitle: document.getElementById('candReviewSourceTitle'),
    candReviewSourceMeta: document.getElementById('candReviewSourceMeta'),
    candReviewList: document.getElementById('candReviewList'),
    candLeaveUnmatchedBtn: document.getElementById('candLeaveUnmatchedBtn'),
    refreshImportHistoryBtn: document.getElementById('refreshImportHistoryBtn'),
    settingsImportHistoryList: document.getElementById('settingsImportHistoryList'),

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
      return `<span class="downloaded-badge" title="Downloaded • 100% Offline Ready" aria-label="Downloaded"><svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="var(--accent-cyan, #38bdf8)"/><path d="M8 3.8v6.2m0 0l-2.4-2.4m2.4 2.4l2.4-2.4M4.8 12.2h6.4" stroke="#040e08" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
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

  const DEFAULT_ALBUM_ART = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';

  function logPlaybackDiag(category, message, details = null) {
    if (window.__MUSISURF_DEBUG__ || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      const ts = new Date().toISOString().substring(11, 23);
      const tag = `[MusiSurf:${category}]`;
      if (details) {
        console.log(`%c${ts} ${tag} ${message}`, 'color: #38bdf8; font-weight: bold;', details);
      } else {
        console.log(`%c${ts} ${tag} ${message}`, 'color: #38bdf8; font-weight: bold;');
      }
    }
  }

  // Stable track ID extractor for track change detection and async request validation
  function getStableTrackId(track) {
    if (!track) return '';
    return String(track.id || track.ytId || track.trackId || ((track.title || '').trim() + '__' + (track.artist || '').trim())).trim();
  }

  /**
   * Track-Change-Based Lyrics Scroll Reset Engine
   * Immediately resets the lyrics scroll body to the very top (scrollTop = 0)
   * whenever a new track becomes active, without waiting for the first active
   * lyric line, word highlight, or network response.
   */
  function resetLyricsScrollToTop(forced = false) {
    const currentTrack = state.currentTrack;
    const currentTrackId = getStableTrackId(currentTrack);

    // Guard: Only reset if forced or if active track identity has changed
    if (!forced && currentTrackId && currentTrackId === state._lastLyricsScrolledTrackId) {
      return;
    }
    if (currentTrackId) {
      state._lastLyricsScrolledTrackId = currentTrackId;
    }

    const container = elements.lyricsScrollBody || document.getElementById('lyricsScrollBody');
    if (container) {
      // Temporarily override CSS scroll-behavior: smooth to force an instant, zero-lag reset to top
      const prevBehavior = container.style.scrollBehavior;
      container.style.scrollBehavior = 'auto';
      container.scrollTop = 0;
      container.scrollLeft = 0;

      if (typeof container.scrollTo === 'function') {
        try {
          container.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        } catch (e) {
          container.scrollTo(0, 0);
        }
      }

      // Restore scrollBehavior on the next animation frame so future lyric sync is smooth
      requestAnimationFrame(() => {
        if (container) {
          container.style.scrollBehavior = prevBehavior || '';
        }
      });
    }

    // Also reset auxiliary containers if present
    const byId = document.getElementById('lyricsScrollBody');
    if (byId && byId !== container) {
      byId.scrollTop = 0;
    }

    // Reset previous lyric active highlight index so synchronization starts fresh
    state.activeLyricIndex = -1;
  }
  window.resetLyricsScrollToTop = resetLyricsScrollToTop;

  // Central Authoritative Track State Updater
  // Updates desktop player, mobile player modal, miniplayer, now playing panel, lyrics hero, MediaSession, and dynamic colors in a single atomic call.
  function applyAuthoritativeTrack(track, options = {}) {
    if (!track) return;

    state.currentTrack = track;
    const epoch = ++state.trackEpoch;
    state.currentTrackEpoch = epoch;

    logPlaybackDiag('TRACK_SET', `Authoritative track set [Epoch #${epoch}]: "${track.title}" - ${track.artist}`, {
      id: track.id,
      source: options.source || 'player',
      duration: track.durationStr || track.duration
    });

    const coverUrl = track.image || DEFAULT_ALBUM_ART;

    // 1. Desktop Player Bar
    updatePlayerTitlesWithTick(track);
    if (elements.playerArtist) elements.playerArtist.textContent = track.artist || '—';
    if (elements.playerCoverImg) {
      elements.playerCoverImg.onerror = function() {
        if (state.currentTrack?.id === track.id) {
          this.onerror = null;
          this.src = DEFAULT_ALBUM_ART;
        }
      };
      elements.playerCoverImg.src = coverUrl;
    }
    const totalDurStr = track.durationStr || formatTime(track.duration || 0);
    if (elements.totalDurationLabel) elements.totalDurationLabel.textContent = totalDurStr;

    // 2. Mobile Fullscreen Player
    if (elements.mobPlayerArtist) elements.mobPlayerArtist.textContent = track.artist || '—';
    if (elements.mobPlayerCover) {
      elements.mobPlayerCover.onerror = function() {
        if (state.currentTrack?.id === track.id) {
          this.onerror = null;
          this.src = DEFAULT_ALBUM_ART;
        }
      };
      elements.mobPlayerCover.src = coverUrl;
    }
    if (elements.mobTotalDuration) elements.mobTotalDuration.textContent = totalDurStr;

    // 3. Mobile Options Modal Cover & Meta
    if (elements.mobOptTitle) elements.mobOptTitle.textContent = track.title || 'MusiSurf';
    if (elements.mobOptArtist) elements.mobOptArtist.textContent = track.artist || '—';
    if (elements.mobOptCover) {
      elements.mobOptCover.onerror = function() {
        if (state.currentTrack?.id === track.id) {
          this.onerror = null;
          this.src = DEFAULT_ALBUM_ART;
        }
      };
      elements.mobOptCover.src = coverUrl;
    }

    // 4. In-App Floating Mini-Player (if present)
    if (elements.miniplayerCover) {
      elements.miniplayerCover.onerror = function() {
        if (state.currentTrack?.id === track.id) {
          this.onerror = null;
          this.src = DEFAULT_ALBUM_ART;
        }
      };
      elements.miniplayerCover.src = coverUrl;
    }
    if (elements.miniplayerTitle) elements.miniplayerTitle.textContent = track.title || 'MusiSurf';
    if (elements.miniplayerArtist) elements.miniplayerArtist.textContent = track.artist || '—';
    if (elements.miniplayerTotalTime) elements.miniplayerTotalTime.textContent = totalDurStr;
    if (elements.miniHeartBtn) {
      const isLiked = state.likedSongs && state.likedSongs.some(t => t.id === track.id);
      elements.miniHeartBtn.classList.toggle('liked', isLiked);
      elements.miniHeartBtn.classList.toggle('active', isLiked);
    }

    // 5. Lyrics View Hero Cover & Meta (Strictly Synchronized)
    if (elements.lyricsTrackTitle) elements.lyricsTrackTitle.textContent = track.title || '';
    if (elements.lyricsTrackArtist) elements.lyricsTrackArtist.textContent = track.artist || '';
    if (elements.lyricsAlbumCover) {
      elements.lyricsAlbumCover.onerror = function() {
        if (state.currentTrack?.id === track.id) {
          this.onerror = null;
          this.src = DEFAULT_ALBUM_ART;
        }
      };
      elements.lyricsAlbumCover.src = coverUrl;
      elements.lyricsAlbumCover.style.display = 'block';
    }

    // 6. Right Now Playing Sidebar & Replay Vinyl
    if (elements.nowPlayingCover) {
      elements.nowPlayingCover.onerror = function() { this.src = DEFAULT_ALBUM_ART; };
      elements.nowPlayingCover.src = coverUrl;
    }
    if (elements.nowPlayingTitle) elements.nowPlayingTitle.textContent = track.title || 'MusiSurf';
    if (elements.nowPlayingArtist) elements.nowPlayingArtist.textContent = track.artist || '—';
    if (elements.nowPlayingArtistBanner) {
      elements.nowPlayingArtistBanner.onerror = function() { this.src = DEFAULT_ALBUM_ART; };
      elements.nowPlayingArtistBanner.src = coverUrl;
    }
    if (elements.nowPlayingArtistName) elements.nowPlayingArtistName.textContent = track.artist || 'MusiSurf Artist';
    if (elements.replayVinylArt) {
      elements.replayVinylArt.onerror = function() { this.src = DEFAULT_ALBUM_ART; };
      elements.replayVinylArt.src = coverUrl;
    }

    // 7. System MediaSession Lockscreen & Notification Controls
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album || 'MusiSurf',
          artwork: [
            { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
            { src: coverUrl, sizes: '256x256', type: 'image/jpeg' },
            { src: coverUrl, sizes: '512x512', type: 'image/jpeg' }
          ]
        });
        navigator.mediaSession.playbackState = 'playing';
      } catch (e) {}
    }

    // 8. Like Heart, Table Highlights & Dynamic Atmospheric Background
    updateHeartIcon(track.id);
    highlightPlayingTrackInTables(track.id);
    applyLyricsDynamicBackground(track);

    if (elements.mobilePlayerModal && coverUrl) {
      extractDominantColor(coverUrl, track.id).then(([r, g, b]) => {
        if (state.currentTrack?.id !== track.id) return;
        const topR = Math.min(255, Math.floor(r * 0.32 + 8));
        const topG = Math.min(255, Math.floor(g * 0.32 + 8));
        const topB = Math.min(255, Math.floor(b * 0.32 + 10));
        const midR = Math.min(255, Math.floor(r * 0.10 + 6));
        const midG = Math.min(255, Math.floor(g * 0.10 + 6));
        const midB = Math.min(255, Math.floor(b * 0.10 + 8));
        elements.mobilePlayerModal.style.setProperty(
          '--mob-player-bg',
          `linear-gradient(180deg, rgb(${topR}, ${topG}, ${topB}) 0%, rgb(${midR}, ${midG}, ${midB}) 40%, #08090b 80%)`
        );
        const lyricsViewEl = document.getElementById('lyricsView');
        if (lyricsViewEl) {
          lyricsViewEl.style.setProperty('--lyrics-theme-color', `rgb(${topR}, ${topG}, ${topB})`);
        }
      }).catch(() => {});
    }

    if (state.currentView === 'lyrics') {
      updateLyricsEdgeGlowState();
    }

    // 9. Reset and Clean Lyrics View Immediately for New Track
    state.lyrics = [];
    state.hasSyncedLyrics = false;
    state.activeLyricIndex = -1;
    state.currentLyricsData = null;
    state.currentLyricsTrackId = track.id;
    if (elements.lyricsLinesContainer) elements.lyricsLinesContainer.innerHTML = '';
    updateMobileLyricsPreview(-3);
    if (elements.lyricsLoading) {
      elements.lyricsLoading.style.display = 'flex';
      const p = elements.lyricsLoading.querySelector('p');
      if (p) p.textContent = 'Searching for verified lyrics...';
    }
    if (elements.lyricsStatusBadge) {
      elements.lyricsStatusBadge.style.display = 'none';
      elements.lyricsStatusBadge.textContent = '';
    }
    if (elements.lyricsScriptToggleBtn) elements.lyricsScriptToggleBtn.style.display = 'none';
    if (elements.lyricsSyncControls) elements.lyricsSyncControls.style.display = 'none';

    // Track-change immediate lyrics scroll reset to top
    resetLyricsScrollToTop(true);

    // 10. Load Lyrics
    if (!options.skipLyrics) {
      loadLyricsForTrack(track);
    }
  }

  let lastAdvanceCallTime = 0;
  let lastAdvancedTrackId = null;

  // Idempotent Next-Track Advance Controller
  // Guarantees monotonic progression, prevents rapid double-advance race conditions,
  // and eliminates duplicate track replay bugs.
  function advanceToNextTrack(reason = 'unknown', completedTrackId = null) {
    if (state.isTrackLoading || state.isTransitioning) {
      logPlaybackDiag('ADVANCE_IGNORED', 'Ignored advance request while track is loading or transitioning');
      return;
    }
    const now = Date.now();
    logPlaybackDiag('ADVANCE_TRIGGER', `Advance requested [Reason: ${reason}]`, {
      completedTrackId,
      lastAdvancedTrackId,
      deltaMs: now - lastAdvanceCallTime
    });

    if (now - lastAdvanceCallTime < 600) {
      logPlaybackDiag('ADVANCE_IGNORED', 'Ignored rapid duplicate advance request');
      return;
    }

    if (completedTrackId && lastAdvancedTrackId === completedTrackId && (now - lastAdvanceCallTime < 1500)) {
      logPlaybackDiag('ADVANCE_IGNORED', 'Ignored duplicate advance for already completed track');
      return;
    }

    lastAdvanceCallTime = now;
    if (completedTrackId) lastAdvancedTrackId = completedTrackId;

    if (state.currentTrack) {
      if (reason === 'track_ended') {
        recordTrackPlayed(state.currentTrack);
      } else if (reason === 'playback_stream_error') {
        recordTrackSkipped(state.currentTrack);
      }
    }

    transitionToNextSong();
  }

  // Resilient Stream Error Recovery
  // Never lets the audio engine freeze indefinitely when a cellular hotspot / slow connection drops or blocks a stream.
  function handlePlaybackStreamError(track) {
    if (!track) return;
    state.consecutivePlaybackErrors = (state.consecutivePlaybackErrors || 0) + 1;
    logPlaybackDiag('STREAM_ERROR_HANDLER', `Handling playback stream error for "${track.title}" (consecutive errors: ${state.consecutivePlaybackErrors})`);

    if (state.consecutivePlaybackErrors > 4) {
      logPlaybackDiag('STREAM_ERROR_HALT', 'Too many consecutive stream failures. Pausing queue to avoid infinite loop.');
      showToast('Network unstable: too many playback errors', '📶');
      state.isPlaying = false;
      updatePlayPauseButton();
      return;
    }

    showToast(`Skipping unplayable stream: ${track.title}`, '⚠️');
    setTimeout(() => {
      advanceToNextTrack('playback_stream_error', track.id);
    }, 450);
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
      const storedUser = localStorage.getItem('musisurf_user');
      if (storedUser) {
        state.currentUser = JSON.parse(storedUser);
        if (state.currentUser) {
          if (typeof state.currentUser.totalListenedSeconds === 'number' && !state.totalListenedSeconds) {
            state.totalListenedSeconds = state.currentUser.totalListenedSeconds;
          }
          if (typeof state.currentUser.totalSongsPlayed === 'number' && !state.totalSongsPlayed) {
            state.totalSongsPlayed = state.currentUser.totalSongsPlayed;
          }
        }
      }

      // Only load user-created custom playlists and liked songs if signed in
      if (state.currentUser && (state.currentUser.id || state.currentUser.email)) {
        try {
          const storedLikes = localStorage.getItem('musisurf_liked');
          if (storedLikes) {
            state.likedSongs = JSON.parse(storedLikes);
            if (Array.isArray(state.likedSongs)) {
              const nowBase = Date.now();
              state.likedSongs.forEach((t, i) => {
                if (!t.addedAt) {
                  t.addedAt = nowBase - ((state.likedSongs.length - i) * 86400000);
                }
              });
            }
          }

          const storedPlaylists = localStorage.getItem('musisurf_playlists');
          if (storedPlaylists) {
            state.customPlaylists = JSON.parse(storedPlaylists);
            if (Array.isArray(state.customPlaylists)) {
              const nowBase = Date.now();
              state.customPlaylists.forEach(pl => {
                if (Array.isArray(pl.tracks)) {
                  pl.tracks.forEach((t, i) => {
                    if (!t.addedAt) {
                      t.addedAt = nowBase - ((pl.tracks.length - i) * 86400000);
                    }
                  });
                }
              });
            }
          }
        } catch (e) {
          console.warn('Error loading user library data:', e);
        }
      } else {
        state.likedSongs = [];
        state.customPlaylists = [];
      }

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
    if (!isAuthenticated()) return;
    try {
      localStorage.setItem('musisurf_liked', JSON.stringify(state.likedSongs));
      updateLikedCountUI();
    } catch (e) {
      console.warn('Error saving liked songs:', e);
    }
  }

  function saveStoredPlaylists() {
    if (!isAuthenticated()) return;
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
    if (typeof updateQuickPicksUI === 'function') updateQuickPicksUI();
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
    const count = Array.isArray(state.likedSongs) ? state.likedSongs.length : 0;
    if (elements.likedCountMeta) {
      elements.likedCountMeta.textContent = `${count} song${count === 1 ? '' : 's'} • Auto-saved`;
    }
    if (elements.libHubLikedMeta) {
      elements.libHubLikedMeta.textContent = `${count} song${count === 1 ? '' : 's'}`;
    }
    const navLiked = document.getElementById('navLikedBtn') || elements.navLiked;
    if (navLiked) {
      const wasHidden = navLiked.style.display === 'none' || (window.getComputedStyle && window.getComputedStyle(navLiked).display === 'none');
      if (count > 0) {
        navLiked.style.display = 'flex';
        if (wasHidden) {
          navLiked.classList.remove('slide-in-liked');
          void navLiked.offsetWidth; // Force CSS reflow to replay sliding animation
          navLiked.classList.add('slide-in-liked');
        }
      } else {
        navLiked.style.display = 'none';
        navLiked.classList.remove('slide-in-liked');
      }
    }
    const libHubLikedBtn = document.getElementById('libHubLikedBtn') || elements.libHubLikedBtn;
    if (libHubLikedBtn) {
      libHubLikedBtn.style.display = count > 0 ? '' : 'none';
    }
    const likedPills = document.querySelectorAll('.lib-pill[data-lib-filter="liked"]');
    likedPills.forEach(pill => {
      pill.style.display = count > 0 ? '' : 'none';
    });
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
    const keepAlive = document.getElementById('keepAliveAudio');
    if (!keepAlive) return;
    try {
      if (!keepAlive.src || !keepAlive.src.startsWith('data:audio')) {
        keepAlive.src = SILENT_AUDIO_URI;
        keepAlive.loop = true;
        keepAlive.volume = 0.0001;
      }
      if (keepAlive.paused) {
        keepAlive.play().catch(() => {});
      }
    } catch (e) {}
  }

  function stopBackgroundKeepAlive() {
    const keepAlive = document.getElementById('keepAliveAudio');
    if (keepAlive) {
      try {
        keepAlive.pause();
        keepAlive.removeAttribute('src');
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
      if (state.playbackContext && state.playbackContext.type === 'playlist') {
        saveCurrentPlaylistProgress({ immediate: true });
      }
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

      // Update Player UI Metadata through Authoritative Track Engine
      applyAuthoritativeTrack(track, { isRestoring: true, skipLyrics: true, source: 'restored_session' });
      const strDur = parseDurationToSeconds(track.durationStr);
      const metaDur = parseDurationToSeconds(track.duration);
      const savedDur = parseDurationToSeconds(saved.duration);
      const dur = (strDur > 15 ? strDur : null) || (metaDur > 15 ? metaDur : null) || (savedDur > 15 ? savedDur : null) || strDur || metaDur || savedDur || 0;
      if (elements.totalDurationLabel) elements.totalDurationLabel.textContent = track.durationStr || formatTime(dur);
      if (elements.mobTotalDuration) elements.mobTotalDuration.textContent = track.durationStr || formatTime(dur);
      updateQueueDrawerUI();

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

      // Fetch synchronized lyrics with full track object
      loadLyricsForTrack(track);

      // Prepare restored audio WITHOUT autoplay (leaves player strictly paused until user explicitly clicks Play)
      state.isPlaying = false;
      updatePlayPauseButton();
      // Do NOT set audio.src or call audio.load() on initial startup.
      // This prevents stale/expired CDN URL error events from triggering autoplay loops.
    } catch (e) {
      console.warn('Error restoring last played track:', e);
    }
  }

  // ==========================================================================
  // DUAL-DECK AUDIO CONTROLLER & EQUAL-POWER CROSSFADE ENGINE
  // ==========================================================================
  const primaryAudioDeck = document.getElementById('audioPlayer');
  const secondaryAudioDeck = document.getElementById('audioPlayerSecondary');
  let activeDeckIndex = 0; // 0 = primaryAudioDeck, 1 = secondaryAudioDeck

  function getActiveDeck() {
    return activeDeckIndex === 0 ? (primaryAudioDeck || elements.audio) : (secondaryAudioDeck || elements.audioSecondary);
  }

  function getSecondaryDeck() {
    return activeDeckIndex === 0 ? (secondaryAudioDeck || elements.audioSecondary) : (primaryAudioDeck || elements.audio);
  }

  function swapActiveDeck() {
    activeDeckIndex = activeDeckIndex === 0 ? 1 : 0;
    elements.audio = getActiveDeck();
    elements.audioSecondary = getSecondaryDeck();
  }

  // ============================================================================
  // Canonical Track Identity & Session Deduplication Engine
  // ============================================================================
  function normalizeString(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\(\[\{].*?[\)\]\}]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractPrimaryArtist(artistStr) {
    if (!artistStr || typeof artistStr !== 'string') return '';
    const first = artistStr.split(/[,&/|]|\bfeat\.?\b|\bft\.?\b/i)[0];
    return normalizeString(first);
  }

  function extractVersionTag(titleStr) {
    if (!titleStr || typeof titleStr !== 'string') return 'standard';
    const lower = titleStr.toLowerCase();
    if (lower.includes('acoustic')) return 'acoustic';
    if (lower.includes('unplugged')) return 'unplugged';
    if (lower.includes('live')) return 'live';
    if (lower.includes('remix') || lower.includes('mix')) return 'remix';
    if (lower.includes('reprise')) return 'reprise';
    if (lower.includes('lofi') || lower.includes('lo-fi')) return 'lofi';
    if (lower.includes('slowed') || lower.includes('reverb')) return 'slowed_reverb';
    if (lower.includes('cover')) return 'cover';
    if (lower.includes('instrumental')) return 'instrumental';
    return 'standard';
  }

  function getCanonicalTrackId(track) {
    if (!track || typeof track !== 'object') return '';

    // Priority 1: ISRC
    if (track.isrc && typeof track.isrc === 'string') {
      const isrcClean = track.isrc.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (isrcClean.length >= 10 && isrcClean.length <= 15) {
        return `isrc_${isrcClean}`;
      }
    }

    // Priority 2: Canonical Provider Track ID
    const rawId = String(track.id || track.trackId || track.originalId || track.ytId || '').trim();
    if (rawId) {
      if (rawId.startsWith('saavn_')) {
        const core = rawId.replace(/^saavn_/, '');
        if (core) return `saavn_${core}`;
      }
      if (rawId.startsWith('yt_')) {
        const core = rawId.replace(/^yt_/, '');
        if (core) return `yt_${core}`;
      }
      if (track.source === 'saavn' || track.hasDirectAudio) {
        return `saavn_${rawId}`;
      }
      if (track.source === 'youtube' || track.ytId) {
        return `yt_${rawId}`;
      }
      if (!rawId.startsWith('fp_') && !rawId.startsWith('id_') && rawId.length >= 4) {
        return `id_${rawId}`;
      }
    }

    // Priority 3: Normalized Fingerprint Fallback (Title + Primary Artist + Version)
    const normTitle = normalizeString(track.title);
    const primaryArtist = extractPrimaryArtist(track.artist);
    const version = extractVersionTag(track.title);

    if (normTitle && primaryArtist) {
      return `fp_${normTitle}__${primaryArtist}__${version}`;
    }
    if (normTitle) {
      return `fp_${normTitle}__unknown__${version}`;
    }

    return rawId ? `id_${rawId}` : '';
  }

  function getTrackFingerprint(track) {
    if (!track || typeof track !== 'object') return '';
    const normTitle = normalizeString(track.title);
    const primaryArtist = extractPrimaryArtist(track.artist);
    const version = extractVersionTag(track.title);
    return `${normTitle}:::${primaryArtist}:::${version}`;
  }

  function areTracksIdentical(trackA, trackB) {
    if (!trackA || !trackB) return false;
    if (trackA === trackB) return true;

    const idA = getCanonicalTrackId(trackA);
    const idB = getCanonicalTrackId(trackB);

    // Exact canonical ID match
    if (idA && idB && idA === idB) return true;

    // Cross-provider originalId match
    const origA = String(trackA.originalId || trackA.id || '').replace(/^saavn_/, '');
    const origB = String(trackB.originalId || trackB.id || '').replace(/^saavn_/, '');
    if (origA && origB && origA === origB && origA.length >= 4) return true;

    // Guard: If both have explicit distinct IDs and distinct original IDs, they are different tracks!
    if (trackA.id && trackB.id && String(trackA.id) !== String(trackB.id) && origA !== origB) {
      return false;
    }

    // Fingerprint match (Title + Primary Artist + Version)
    const fpA = getTrackFingerprint(trackA);
    const fpB = getTrackFingerprint(trackB);
    if (fpA && fpB && fpA === fpB && !fpA.startsWith(':::')) {
      return true;
    }

    return false;
  }

  // Stable Track Identity Comparison (delegates to areTracksIdentical)
  function isSameTrack(t1, t2) {
    if (!t1 || !t2) return false;
    if (t1 === t2) return true;
    return areTracksIdentical(t1, t2);
  }

  // Session Persistence & Tracking Helpers
  function saveRecoSession() {
    try {
      if (!state.recoSession) return;
      const data = {
        sessionId: state.recoSession.sessionId,
        recommendedCanonicalIds: Array.from(state.recoSession.recommendedCanonicalIds || []).slice(-300),
        playedCanonicalIds: Array.from(state.recoSession.playedCanonicalIds || []).slice(-200),
        skippedCanonicalIds: Array.from(state.recoSession.skippedCanonicalIds?.entries() || []).slice(-100),
        removedCanonicalIds: Array.from(state.recoSession.removedCanonicalIds || []).slice(-100),
        recentArtists: (state.recoSession.recentArtists || []).slice(-15),
        seedHistory: (state.recoSession.seedHistory || []).slice(-15),
        pageOffsets: Array.from(state.recoSession.pageOffsets?.entries() || []).slice(-50),
        updatedAt: Date.now()
      };
      localStorage.setItem('musisurf_reco_session', JSON.stringify(data));
    } catch (e) {}
  }

  function loadRecoSession() {
    try {
      if (!state.recoSession) return;
      const raw = localStorage.getItem('musisurf_reco_session');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      // Expire session if older than 24 hours
      if (data.updatedAt && Date.now() - data.updatedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem('musisurf_reco_session');
        return;
      }
      if (data.sessionId) state.recoSession.sessionId = data.sessionId;
      if (Array.isArray(data.recommendedCanonicalIds)) {
        state.recoSession.recommendedCanonicalIds = new Set(data.recommendedCanonicalIds);
      }
      if (Array.isArray(data.playedCanonicalIds)) {
        state.recoSession.playedCanonicalIds = new Set(data.playedCanonicalIds);
      }
      if (Array.isArray(data.skippedCanonicalIds)) {
        state.recoSession.skippedCanonicalIds = new Map(data.skippedCanonicalIds);
      }
      if (Array.isArray(data.removedCanonicalIds)) {
        state.recoSession.removedCanonicalIds = new Set(data.removedCanonicalIds);
      }
      if (Array.isArray(data.recentArtists)) {
        state.recoSession.recentArtists = data.recentArtists;
      }
      if (Array.isArray(data.seedHistory)) {
        state.recoSession.seedHistory = data.seedHistory;
      }
      if (Array.isArray(data.pageOffsets)) {
        state.recoSession.pageOffsets = new Map(data.pageOffsets);
      }
    } catch (e) {}
  }

  function recordTrackRecommended(track) {
    if (!track || !state.recoSession) return;
    const cid = getCanonicalTrackId(track);
    if (cid) {
      state.recoSession.recommendedCanonicalIds.add(cid);
    }
    const fp = getTrackFingerprint(track);
    if (fp) {
      state.recoSession.recommendedCanonicalIds.add(`fp_${fp}`);
    }
    const primaryArt = extractPrimaryArtist(track.artist);
    if (primaryArt) {
      state.recoSession.recentArtists = (state.recoSession.recentArtists || []).filter(a => a !== primaryArt);
      state.recoSession.recentArtists.push(primaryArt);
      if (state.recoSession.recentArtists.length > 15) {
        state.recoSession.recentArtists.shift();
      }
    }
    saveRecoSession();
  }

  function recordTrackPlayed(track) {
    if (!track || !state.recoSession) return;
    const cid = getCanonicalTrackId(track);
    if (cid) {
      state.recoSession.playedCanonicalIds.add(cid);
    }
    const fp = getTrackFingerprint(track);
    if (fp) {
      state.recoSession.playedCanonicalIds.add(`fp_${fp}`);
    }
    if (cid) {
      state.recoSession.seedHistory = (state.recoSession.seedHistory || []).filter(id => id !== cid);
      state.recoSession.seedHistory.push(cid);
      if (state.recoSession.seedHistory.length > 15) {
        state.recoSession.seedHistory.shift();
      }
    }
    saveRecoSession();
  }

  function recordTrackSkipped(track) {
    if (!track || !state.recoSession) return;
    const cid = getCanonicalTrackId(track);
    if (cid) {
      state.recoSession.skippedCanonicalIds.set(cid, Date.now());
    }
    const fp = getTrackFingerprint(track);
    if (fp) {
      state.recoSession.skippedCanonicalIds.set(`fp_${fp}`, Date.now());
    }
    saveRecoSession();
  }

  function recordTrackRemoved(track) {
    if (!track || !state.recoSession) return;
    const cid = getCanonicalTrackId(track);
    if (cid) {
      state.recoSession.removedCanonicalIds.add(cid);
    }
    const fp = getTrackFingerprint(track);
    if (fp) {
      state.recoSession.removedCanonicalIds.add(`fp_${fp}`);
    }
    saveRecoSession();
  }

  function buildRecommendationExclusionList(seedTrack = null) {
    const excludeSet = new Set();
    if (!state.recoSession) return [];

    // 1. Currently playing
    if (state.currentTrack) {
      const cid = getCanonicalTrackId(state.currentTrack);
      if (cid) excludeSet.add(cid);
      const fp = getTrackFingerprint(state.currentTrack);
      if (fp) excludeSet.add(`fp_${fp}`);
      if (state.currentTrack.id) excludeSet.add(state.currentTrack.id);
    }

    // 2. Queued tracks
    (state.userQueue || []).forEach(t => {
      const cid = getCanonicalTrackId(t);
      if (cid) excludeSet.add(cid);
      const fp = getTrackFingerprint(t);
      if (fp) excludeSet.add(`fp_${fp}`);
      if (t.id) excludeSet.add(t.id);
    });

    (state.recommendationQueue || []).forEach(t => {
      const cid = getCanonicalTrackId(t);
      if (cid) excludeSet.add(cid);
      const fp = getTrackFingerprint(t);
      if (fp) excludeSet.add(`fp_${fp}`);
      if (t.id) excludeSet.add(t.id);
    });

    // 3. Recommended in active session
    if (state.recoSession.recommendedCanonicalIds) {
      state.recoSession.recommendedCanonicalIds.forEach(id => excludeSet.add(id));
    }

    // 4. Played in active session
    if (state.recoSession.playedCanonicalIds) {
      state.recoSession.playedCanonicalIds.forEach(id => excludeSet.add(id));
    }

    // 5. Manually removed from queue
    if (state.recoSession.removedCanonicalIds) {
      state.recoSession.removedCanonicalIds.forEach(id => excludeSet.add(id));
    }

    // 6. Recently skipped within 15-minute cooldown
    const now = Date.now();
    const SKIP_COOLDOWN_MS = 15 * 60 * 1000;
    if (state.recoSession.skippedCanonicalIds) {
      for (const [id, ts] of state.recoSession.skippedCanonicalIds.entries()) {
        if (now - ts < SKIP_COOLDOWN_MS) {
          excludeSet.add(id);
        } else {
          state.recoSession.skippedCanonicalIds.delete(id);
        }
      }
    }

    if (seedTrack) {
      const cid = getCanonicalTrackId(seedTrack);
      if (cid) excludeSet.add(cid);
      const fp = getTrackFingerprint(seedTrack);
      if (fp) excludeSet.add(`fp_${fp}`);
      if (seedTrack.id) excludeSet.add(seedTrack.id);
    }

    return Array.from(excludeSet).filter(Boolean);
  }

  // Load existing session history on startup
  loadRecoSession();

  // Sound Capsule & Listening Statistics Sync
  function saveListeningStats() {
    try {
      localStorage.setItem('musisurf_total_listened_sec', String(Math.floor(state.totalListenedSeconds || 0)));
      localStorage.setItem('musisurf_total_songs_played', String(state.totalSongsPlayed || 0));
      if (state.currentUser) {
        state.currentUser.totalListenedSeconds = state.totalListenedSeconds;
        state.currentUser.totalSongsPlayed = state.totalSongsPlayed;
        localStorage.setItem('musisurf_user', JSON.stringify(state.currentUser));
      }
    } catch (e) {}
  }

  function updateSoundCapsuleUI() {
    const totalMinutes = Math.floor((state.totalListenedSeconds || 0) / 60);
    const totalSongs = state.totalSongsPlayed || 0;
    if (elements.replayMinutesCount) {
      elements.replayMinutesCount.textContent = totalMinutes.toLocaleString();
    }
    if (elements.replayTotalSongsCount) {
      elements.replayTotalSongsCount.textContent = totalSongs.toLocaleString();
    }
  }

  function checkAndRecordSongPlayed(deck) {
    if (!state.currentTrack || state._currentTrackPlayedRecorded) return;
    const dur = (deck && deck.duration) || state.currentTrack.duration || 0;
    // Meaningful listening threshold: >= 20s (or >= 30% if dur > 0)
    const threshold = (dur > 0 && dur < 60) ? Math.max(10, dur * 0.3) : 20;
    if (state._currentTrackListeningSeconds >= threshold) {
      state._currentTrackPlayedRecorded = true;
      state.totalSongsPlayed = (state.totalSongsPlayed || 0) + 1;
      saveListeningStats();
      updateSoundCapsuleUI();
      recordTrackPlay(state.currentTrack);

      // Record verified play in Neon Postgres if signed in
      if (isAuthenticated()) {
        fetch('/api/soundtrack/record-play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            trackId: state.currentTrack.id,
            title: state.currentTrack.title,
            artist: state.currentTrack.artist,
            album: state.currentTrack.album,
            thumbnailUrl: state.currentTrack.image || state.currentTrack.artwork,
            durationSeconds: Math.round(dur),
            listenedSeconds: Math.floor(state._currentTrackListeningSeconds || 0),
            isCompleted: Boolean(dur > 0 && state._currentTrackListeningSeconds >= (dur * 0.9))
          })
        }).catch(err => console.warn('[Soundtrack] Play recording error:', err.message));
      }
    }
  }

  function accumulatePlaybackTime(deck) {
    if (!deck || deck.paused || !state.isPlaying || state.isTrackLoading || isYouTubeActive()) {
      state._lastTrackedPlaybackTime = null;
      return;
    }
    const cur = deck.currentTime;
    if (state._lastTrackedDeck === deck && typeof state._lastTrackedPlaybackTime === 'number') {
      const delta = cur - state._lastTrackedPlaybackTime;
      // Contiguous playback tick (ignore seeks and jumps)
      if (delta > 0 && delta < 2.0) {
        state.totalListenedSeconds = (state.totalListenedSeconds || 0) + delta;
        state._currentTrackListeningSeconds = (state._currentTrackListeningSeconds || 0) + delta;
        checkAndRecordSongPlayed(deck);

        const now = Date.now();
        if (now - (state._lastStatsSaveTime || 0) >= 5000) {
          state._lastStatsSaveTime = now;
          saveListeningStats();
        }
        updateSoundCapsuleUI();
      }
    }
    state._lastTrackedPlaybackTime = cur;
    state._lastTrackedDeck = deck;
  }

  // Authoritative Playback History Stack & Persistent Cursor Navigation
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
  // ==========================================================================
  // Strict rule: Trims digital dead silence ONLY at track start and track end.
  // NEVER scans, skips, or cuts quiet passages, dramatic pauses, or acoustic parts in the middle.
  const SILENCE_DB_THRESHOLD = -45;
  const SILENCE_LINEAR_THRESHOLD = Math.pow(10, SILENCE_DB_THRESHOLD / 20); // ~0.005623
  const MAX_START_TRIM = 8.0; // 8.0s safety cap (or 15% of track duration)
  const MAX_END_TRIM = 12.0;  // 12.0s safety cap (or 20% of track duration)
  const ANTI_CLICK_PRE_PAD = 0.03;  // 30ms anti-click margin before first note
  const ANTI_CLICK_POST_PAD = 0.05; // 50ms anti-click margin after reverb tail

  let audioContextInstance = null;
  function getAudioContext() {
    if (!audioContextInstance && (window.AudioContext || window.webkitAudioContext)) {
      try {
        audioContextInstance = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('AudioContext creation note:', e);
      }
    }
    return audioContextInstance;
  }

  // ==========================================================================
  // PLAYBACK LIFECYCLE DIAGNOSTICS & TELEMETRY (Development / Gated Debug)
  // ==========================================================================
  window.__playbackDiagnosticsLog = window.__playbackDiagnosticsLog || [];
  function logPlaybackDiagnostic(event, details = {}) {
    try {
      const isDebugActive = Boolean(window.__MUSISURF_PLAYBACK_DEBUG__ || (typeof localStorage !== 'undefined' && localStorage.getItem('musisurf_debug_audio') === 'true'));
      const act = typeof getActiveDeck === 'function' ? getActiveDeck() : null;
      const ctx = audioContextInstance;
      const entry = {
        event,
        trackId: details.trackId || state.currentTrack?.id || null,
        trackTitle: details.trackTitle || state.currentTrack?.title || null,
        audioContextState: ctx ? ctx.state : 'uninitialized',
        paused: act ? act.paused : null,
        readyState: act ? act.readyState : null,
        currentTime: act ? Number(act.currentTime.toFixed(2)) : null,
        src: act ? (act.currentSrc || act.src || '') : '',
        isPlayingState: state.isPlaying,
        isTrackLoading: state.isTrackLoading,
        timestamp: Date.now(),
        ...details
      };
      window.__playbackDiagnosticsLog.push(entry);
      if (window.__playbackDiagnosticsLog.length > 250) {
        window.__playbackDiagnosticsLog.shift();
      }
      if (isDebugActive) {
        console.debug(`[MusiSurf Audio Engine Diagnostic: ${event}]`, entry);
      }
    } catch (e) {}
  }

  function getTrackSilenceCacheKey(track) {
    if (!track) return '';
    return String(track.id || track.ytId || track.audioUrl || `${track.title || ''}::${track.artist || ''}`);
  }

  // ==========================================================================
  // BULLETPROOF TWO-TIER EDGE SILENCE DETECTION & AUDIO BOUNDS (Start & End Only)
  // ==========================================================================
  const trackEdgeSilenceCache = new Map();
  const SILENCE_CACHE_KEY_V1 = 'musisurf_edge_bounds_v1';
  const SILENCE_CACHE_KEY_LEGACY = 'musisurf_edge_silence_cache';

  function loadEdgeSilenceLocalStorage() {
    try {
      const raw = localStorage.getItem(SILENCE_CACHE_KEY_V1) || localStorage.getItem(SILENCE_CACHE_KEY_LEGACY);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
          if (v && typeof v.effectiveStart === 'number') {
            trackEdgeSilenceCache.set(k, v);
          } else if (v && typeof v.startOffset === 'number') {
            trackEdgeSilenceCache.set(k, {
              effectiveStart: v.startOffset,
              effectiveEnd: v.endingSilenceSec ? Math.max(0, (v.rawDuration || 0) - v.endingSilenceSec) : (v.rawDuration || 0),
              rawDuration: v.rawDuration || 0,
              analyzed: true
            });
          }
        }
      }
    } catch (e) {}
  }
  loadEdgeSilenceLocalStorage();

  function persistEdgeSilenceCache() {
    try {
      const obj = {};
      const entries = Array.from(trackEdgeSilenceCache.entries()).slice(-500);
      for (const [k, v] of entries) {
        obj[k] = v;
      }
      localStorage.setItem(SILENCE_CACHE_KEY_V1, JSON.stringify(obj));
    } catch (e) {}
  }

  function seekToEffectiveStart(audioEl, effectiveStart) {
    if (!audioEl || typeof effectiveStart !== 'number' || effectiveStart <= 0.05) return;
    const target = effectiveStart;

    const doSeek = () => {
      try {
        if (Math.abs(audioEl.currentTime - target) > 0.08) {
          audioEl.currentTime = target;
        }
      } catch (e) {}
    };

    if (audioEl.readyState >= 1) { // HAVE_METADATA
      doSeek();
    } else {
      audioEl.addEventListener('loadedmetadata', doSeek, { once: true });
    }

    // Guard against browser currentTime reset when play() starts
    const verifySeek = () => {
      try {
        if (audioEl.currentTime < target - 0.1) {
          audioEl.currentTime = target;
        }
      } catch (e) {}
    };
    audioEl.addEventListener('canplay', verifySeek, { once: true });
    audioEl.addEventListener('playing', verifySeek, { once: true });
  }

  async function getOrAnalyzeTrackEdges(track, streamUrl, audioElem = null) {
    if (!track) return { effectiveStart: 0, effectiveEnd: 0, rawDuration: 0, analyzed: true };
    const key = getTrackSilenceCacheKey(track);

    if (trackEdgeSilenceCache.has(key)) {
      const cached = trackEdgeSilenceCache.get(key);
      if (cached && cached.analyzed) {
        track._effectiveStart = cached.effectiveStart;
        track._effectiveEnd = cached.effectiveEnd;
        track._silenceStartOffset = cached.effectiveStart;
        return cached;
      }
    }

    const rawDur = track.duration || (audioElem && audioElem.duration) || 0;

    if (state.settings.removeDeadSilence === false) {
      const res = { effectiveStart: 0, effectiveEnd: rawDur, rawDuration: rawDur, analyzed: true };
      trackEdgeSilenceCache.set(key, res);
      track._effectiveStart = 0;
      track._effectiveEnd = rawDur;
      track._silenceStartOffset = 0;
      return res;
    }

    // Tier A: Express Backend Fast Edge-Boundary Endpoint
    try {
      const resolvedUrl = streamUrl || track.streamUrl || track.audioUrl || '';
      const endpoint = `/api/audio/silence-bounds?trackId=${encodeURIComponent(key)}&url=${encodeURIComponent(resolvedUrl)}&duration=${encodeURIComponent(rawDur)}`;
      
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6500);

      const resp = await fetch(endpoint, { signal: ctrl.signal });
      clearTimeout(timer);

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success) {
          const effectiveStart = typeof data.effectiveStart === 'number' ? data.effectiveStart : 0;
          const effectiveEnd = (typeof data.effectiveEnd === 'number' && data.effectiveEnd > effectiveStart) 
            ? data.effectiveEnd 
            : (data.duration || rawDur);
          const dur = (typeof data.duration === 'number' && data.duration > 0) ? data.duration : rawDur;

          const result = {
            effectiveStart,
            effectiveEnd,
            rawDuration: dur,
            analyzed: true,
            source: data.source || 'server'
          };

          console.log(`[SilenceTrim] Track: "${track.title || key}" | start: ${result.effectiveStart.toFixed(2)}s | end: ${result.effectiveEnd.toFixed(2)}s / raw ${(result.rawDuration || rawDur).toFixed(2)}s`);

          trackEdgeSilenceCache.set(key, result);
          track._silenceStartOffset = result.effectiveStart;
          track._effectiveStart = result.effectiveStart;
          track._effectiveEnd = result.effectiveEnd;
          persistEdgeSilenceCache();

          // Late-arrival jump if track started playing while server analysis was in flight
          const actDeck = getActiveDeck();
          if (actDeck && state.isPlaying && state.currentTrack) {
            const currentKey = getTrackSilenceCacheKey(state.currentTrack);
            if (currentKey === key && result.effectiveStart > 0.05 && actDeck.currentTime < result.effectiveStart - 0.15) {
              try {
                console.log(`[SilenceTrim] Late-arrival jump from ${actDeck.currentTime.toFixed(2)}s to ${result.effectiveStart.toFixed(2)}s`);
                actDeck.currentTime = result.effectiveStart;
              } catch (e) {}
            }
          }

          return result;
        }
      }
    } catch (serverErr) {
      // Backend request aborted or network offline, proceed to fallback
    }

    // Tier B: Local Buffer / AudioContext Fallback (Zero CORS via stream-proxy or local blob)
    try {
      const ctx = getAudioContext();
      if (!ctx) throw new Error('AudioContext unavailable');
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      let arrayBuf = null;
      if (track.fileBlob || track.audioBlob) {
        const blob = track.fileBlob || track.audioBlob;
        arrayBuf = await blob.arrayBuffer();
      } else {
        const proxyUrl = `/api/audio/stream-proxy?url=${encodeURIComponent(streamUrl || track.audioUrl || '')}`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(proxyUrl, {
          headers: { Range: 'bytes=0-450000' },
          signal: ctrl.signal
        });
        clearTimeout(t);
        if (res.ok || res.status === 206) {
          arrayBuf = await res.arrayBuffer();
        }
      }

      if (arrayBuf) {
        const audioBuffer = await new Promise((resolve, reject) => {
          ctx.decodeAudioData(arrayBuf, resolve, reject);
        });

        if (audioBuffer) {
          const sampleRate = audioBuffer.sampleRate;
          const channelData = audioBuffer.getChannelData(0);
          const windowSize = Math.max(1, Math.floor(sampleRate * 0.005));
          const effectiveRawDur = rawDur > 0 ? rawDur : (audioBuffer.duration || 0);
          const maxStartTrimLimit = Math.min(MAX_START_TRIM, effectiveRawDur > 0 ? effectiveRawDur * 0.18 : MAX_START_TRIM);
          const maxStartSample = Math.min(channelData.length, Math.floor(sampleRate * maxStartTrimLimit));

          let firstAudibleSample = 0;
          let foundAudibleStart = false;

          for (let i = 0; i < maxStartSample - windowSize; i += Math.floor(windowSize / 2)) {
            let sumSq = 0;
            for (let j = 0; j < windowSize; j++) {
              const s = channelData[i + j];
              sumSq += s * s;
            }
            const rms = Math.sqrt(sumSq / windowSize);
            if (rms >= SILENCE_LINEAR_THRESHOLD) {
              firstAudibleSample = i;
              foundAudibleStart = true;
              break;
            }
          }

          let effectiveStart = 0;
          if (foundAudibleStart) {
            const firstAudibleSec = firstAudibleSample / sampleRate;
            if (firstAudibleSec >= 0.12) {
              effectiveStart = Math.max(0, firstAudibleSec - ANTI_CLICK_PRE_PAD);
              effectiveStart = Math.round(effectiveStart * 100) / 100;
            }
          }

          const fallbackResult = {
            effectiveStart,
            effectiveEnd: rawDur,
            rawDuration: effectiveRawDur,
            analyzed: true,
            source: 'client_fallback'
          };

          trackEdgeSilenceCache.set(key, fallbackResult);
          track._silenceStartOffset = fallbackResult.effectiveStart;
          track._effectiveStart = fallbackResult.effectiveStart;
          track._effectiveEnd = fallbackResult.effectiveEnd;
          persistEdgeSilenceCache();
          return fallbackResult;
        }
      }
    } catch (e) {}

    const fallback = {
      effectiveStart: 0,
      effectiveEnd: rawDur,
      rawDuration: rawDur,
      analyzed: true,
      source: 'safe_default'
    };
    trackEdgeSilenceCache.set(key, fallback);
    track._silenceStartOffset = 0;
    track._effectiveStart = 0;
    track._effectiveEnd = rawDur;
    return fallback;
  }

  // Backward compatibility alias for legacy callers
  function detectTrackStartSilence(track, streamUrl) {
    return getOrAnalyzeTrackEdges(track, streamUrl).then(res => res.effectiveStart);
  }

  function saveSilenceCache() {
    persistEdgeSilenceCache();
  }

  // ==========================================================================
  // TRUE DUAL-DECK AUTOMIX ENGINE (Equal-Power Cosine/Sine Overlap)
  // ==========================================================================
  function formatAutoMixLabel(sec) {
    const s = Math.round((parseFloat(sec) || 0) * 10) / 10;
    if (s <= 0) return 'Off (0s)';
    if (s <= 3) return `${s}s overlap (Quick)`;
    if (s <= 6) return `${s}s overlap (Smooth)`;
    if (s <= 9) return `${s}s overlap (Extended)`;
    return `${s}s overlap (Long)`;
  }

  function formatAutoMixHeadline(sec) {
    const s = Math.round((parseFloat(sec) || 0) * 10) / 10;
    if (s <= 0) return '0.0 s (Off)';
    return `${s.toFixed(1)} s`;
  }

  function formatCrossfadeLabel(sec) {
    return formatAutoMixLabel(sec);
  }

  let autoMixTransitionId = 0;
  let autoMixState = null;
  let autoMixAnimFrame = null;
  let autoMixIntervalTimer = null;
  let crossfadeFadeInTimer = null;

  function cancelActiveAutoMix(destroyStandby = false) {
    autoMixTransitionId++;
    if (autoMixAnimFrame) {
      cancelAnimationFrame(autoMixAnimFrame);
      autoMixAnimFrame = null;
    }
    if (autoMixIntervalTimer) {
      clearInterval(autoMixIntervalTimer);
      autoMixIntervalTimer = null;
    }

    if (autoMixState) {
      const { outgoingDeck, incomingDeck } = autoMixState;
      if (outgoingDeck) {
        outgoingDeck._fadeHandler = null;
        try {
          outgoingDeck.pause();
          outgoingDeck.volume = 0;
        } catch (e) {}
      }
      if (incomingDeck) {
        incomingDeck._fadeHandler = null;
        if (destroyStandby) {
          try {
            incomingDeck.pause();
            incomingDeck.removeAttribute('src');
            incomingDeck.load();
          } catch (e) {}
          incomingDeck.volume = 0;
        }
      }
      autoMixState = null;
    }

    state.isAutoMixing = false;
    state.isCrossfading = false;

    if (destroyStandby) {
      state.isTransitionPreloaded = false;
      state.preloadedNextTrack = null;
      activeDeckIndex = 0;
      elements.audio = getActiveDeck();
      elements.audioSecondary = getSecondaryDeck();
      const sec = getSecondaryDeck();
      if (sec) {
        sec._fadeHandler = null;
        try {
          sec.pause();
          sec.removeAttribute('src');
          sec.load();
        } catch (e) {}
        sec.volume = 0;
      }
    }

    const act = getActiveDeck();
    if (act) {
      act._fadeHandler = null;
      act.volume = state.isMuted ? 0 : (state.volume || 0.8);
    }
  }

  function cancelActiveCrossfade(destroyPreload = false) {
    cancelActiveAutoMix(destroyPreload);
  }

  function fadeAudioOutAndPause(callback) {
    cancelActiveAutoMix(false);
    try {
      getActiveDeck().pause();
    } catch (e) {}
    getActiveDeck().volume = state.isMuted ? 0 : (state.volume || 0.8);
    if (typeof callback === 'function') callback();
  }

  function applyCrossfadeIn() {
    cancelActiveAutoMix(false);
    if (crossfadeFadeInTimer) {
      clearInterval(crossfadeFadeInTimer);
      crossfadeFadeInTimer = null;
    }
    const act = getActiveDeck();
    const targetVol = state.isMuted ? 0 : (state.volume || 0.8);
    if (targetVol <= 0) {
      if (act) act.volume = 0;
      return;
    }
    if (act) act.volume = 0;
    const startTime = Date.now();
    const rampMs = 350;
    crossfadeFadeInTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / rampMs);
      if (act) act.volume = targetVol * progress;
      if (progress >= 1) {
        clearInterval(crossfadeFadeInTimer);
        crossfadeFadeInTimer = null;
        if (act) act.volume = targetVol;
      }
    }, 20);
  }

  function startDualDeckAutoMix(nextTrackObj, streamUrl, actualFadeSec) {
    if (!nextTrackObj || state.isAutoMixing || state.isTransitioning) return;
    const autoMixSec = actualFadeSec || state.settings.autoMixDuration || 0;
    if (autoMixSec <= 0) {
      transitionToNextSong(nextTrackObj);
      return;
    }

    const outgoing = getActiveDeck();
    const incoming = getSecondaryDeck();
    if (!outgoing || !incoming) return;

    const transitionId = ++autoMixTransitionId;
    state.isAutoMixing = true;
    state.isCrossfading = true;

    const masterVol = state.isMuted ? 0 : (state.volume || 0.8);
    const durationMs = autoMixSec * 1000;
    const startTime = performance.now();

    if (!incoming.src || incoming.src !== streamUrl) {
      incoming.src = streamUrl;
      incoming.load();
    }
    incoming.volume = 0;

    const edgeInfo = trackEdgeSilenceCache.get(getTrackSilenceCacheKey(nextTrackObj));
    const startOffset = (edgeInfo && edgeInfo.effectiveStart) || nextTrackObj._silenceStartOffset || 0;
    try {
      incoming.currentTime = startOffset;
    } catch (e) {}

    autoMixState = {
      transitionId,
      incomingTrack: nextTrackObj,
      outgoingDeck: outgoing,
      incomingDeck: incoming,
      startTime,
      durationMs,
      actualFadeSec: autoMixSec,
      paused: false,
      pausedAt: 0,
      uiSwitched: false,
      masterVol
    };

    const stepFade = () => {
      if (!state.isAutoMixing || !autoMixState || autoMixState.transitionId !== transitionId) return;
      if (autoMixState.paused) return;

      const now = performance.now();
      const elapsed = now - autoMixState.startTime;
      const progress = Math.max(0, Math.min(1, elapsed / autoMixState.durationMs));

      // Mathematical Equal-Power Crossfade curves (Zero acoustic dip):
      // cos^2(p) + sin^2(p) = 1.0 everywhere across the overlap
      const outGain = Math.cos(progress * 0.5 * Math.PI);
      const inGain = Math.sin(progress * 0.5 * Math.PI);

      const currentMaster = state.isMuted ? 0 : (state.volume || 0.8);
      outgoing.volume = Math.max(0, Math.min(1, currentMaster * outGain));
      incoming.volume = Math.max(0, Math.min(1, currentMaster * inGain));

      // Early / Midpoint UI & Metadata switch (Atomic Handoff)
      if (progress >= 0.25 && !autoMixState.uiSwitched) {
        autoMixState.uiSwitched = true;
        checkAndRecordSongPlayed(outgoing);
        recordRecentlyPlayed(nextTrackObj);
        applyAuthoritativeTrack(nextTrackObj, { source: 'automix_handoff' });
        updateQueueDrawerUI();
      }

      if (progress >= 1) {
        finalizeDualDeckAutoMix(nextTrackObj, currentMaster, transitionId);
      }
    };

    incoming.play().then(() => {
      if (autoMixTransitionId !== transitionId) return;
      const loop = () => {
        if (state.isAutoMixing && autoMixState && autoMixState.transitionId === transitionId) {
          stepFade();
          if (state.isAutoMixing) {
            autoMixAnimFrame = requestAnimationFrame(loop);
          }
        }
      };
      autoMixAnimFrame = requestAnimationFrame(loop);
      autoMixIntervalTimer = setInterval(stepFade, 25);
      incoming._fadeHandler = stepFade;
      outgoing._fadeHandler = stepFade;
    }).catch(err => {
      console.warn('Dual-deck AutoMix play note:', err);
      cancelActiveAutoMix(false);
      transitionToNextSong(nextTrackObj);
    });
  }

  function startEqualPowerCrossfade(nextTrackObj, streamUrl, overrideCfSec) {
    startDualDeckAutoMix(nextTrackObj, streamUrl, overrideCfSec);
  }

  function finalizeDualDeckAutoMix(nextTrackObj, masterVol, transitionId) {
    if (autoMixTransitionId !== transitionId) return;

    if (autoMixAnimFrame) {
      cancelAnimationFrame(autoMixAnimFrame);
      autoMixAnimFrame = null;
    }
    if (autoMixIntervalTimer) {
      clearInterval(autoMixIntervalTimer);
      autoMixIntervalTimer = null;
    }

    const outgoing = getActiveDeck();
    const incoming = getSecondaryDeck();

    if (outgoing) {
      outgoing._fadeHandler = null;
      try {
        outgoing.pause();
        outgoing.removeAttribute('src');
        outgoing.load();
      } catch (e) {}
      outgoing.volume = 0;
    }

    if (incoming) {
      incoming._fadeHandler = null;
      incoming.volume = masterVol;
    }

    swapActiveDeck();
    elements.audio = getActiveDeck();
    elements.audioSecondary = getSecondaryDeck();
    elements.audio.volume = masterVol;

    state.isAutoMixing = false;
    state.isCrossfading = false;
    autoMixState = null;
    state.isTransitionPreloaded = false;
    state.preloadedNextTrack = null;
    state._currentTrackPlayedRecorded = false;
    state._currentTrackListeningSeconds = 0;
    state._lastTrackedPlaybackTime = null;
    state.consecutivePlaybackErrors = 0;

    if (state.userQueue && state.userQueue.length > 0 && areTracksIdentical(state.userQueue[0], nextTrackObj)) {
      state.userQueue.shift();
    } else if (state.recommendationQueue && state.recommendationQueue.length > 0 && areTracksIdentical(state.recommendationQueue[0], nextTrackObj)) {
      state.recommendationQueue.shift();
      state.contextQueue = [nextTrackObj];
      state.contextIndex = 0;
    } else if (state.contextQueue && state.contextQueue.length > state.contextIndex + 1 && areTracksIdentical(state.contextQueue[state.contextIndex + 1], nextTrackObj)) {
      state.contextIndex++;
    }

    recordRecentlyPlayed(nextTrackObj);
    recordTrackPlayed(nextTrackObj);
    applyAuthoritativeTrack(nextTrackObj, { source: 'automix_finalized' });
    updateQueueDrawerUI();
    schedulePreloadNextTrack(1500);
  }

  function finalizeCrossfade(nextTrackObj, masterVol) {
    finalizeDualDeckAutoMix(nextTrackObj, masterVol, autoMixTransitionId);
  }

  // ============================================================================
  // Smart Autoplay & Session Vibe Profiler
  // ============================================================================
  const CLIENT_MOOD_KEYWORDS = {
    romantic: ['romantic', 'love', 'pyaar', 'ishq', 'dil', 'tum', 'tere', 'humsafar', 'slow', 'acoustic', 'ballad', 'mohabbat', 'pehla', 'janam', 'kasam'],
    sad: ['sad', 'dard', 'judaai', 'bewafa', 'heartbreak', 'tears', 'alone', 'broken', 'roothna', 'yaad', 'tanha', 'rona', 'bikhra', 'chhod', 'alvida'],
    energetic: ['party', 'dance', 'banger', 'remix', 'club', 'dhol', 'bhangra', 'nach', 'dj', 'bass', 'high energy', 'beat', 'swag'],
    chill: ['chill', 'lofi', 'unplugged', 'acoustic', 'sunset', 'peaceful', 'calm', 'relax', 'vibes', 'soft'],
    sufi: ['sufi', 'qawwali', 'bhajan', 'spiritual', 'khwaja', 'maula', 'allah']
  };

  function detectClientMood(track) {
    if (!track) return 'romantic';
    const text = `${track.title || ''} ${track.artist || ''} ${track.album || ''}`.toLowerCase();
    for (const [mood, words] of Object.entries(CLIENT_MOOD_KEYWORDS)) {
      if (words.some(w => text.includes(w))) return mood;
    }
    return 'romantic';
  }

  function detectClientLanguage(track) {
    if (!track) return 'hindi';
    if (track.language && track.language !== 'unknown') return track.language.toLowerCase();
    const text = `${track.title || ''} ${track.artist || ''}`.toLowerCase();
    if (/[\u0900-\u097F]/.test(text)) return 'hindi';
    if (/[\u0A00-\u0A7F]/.test(text)) return 'punjabi';
    if (/[\u0600-\u06FF]/.test(text)) return 'urdu';
    const punjabiArtists = ['diljit', 'karan aujla', 'sidhu moose', 'ap dhillon', 'shubh', 'guru randhawa', 'ammy virk', 'b praak', 'jassie gill', 'harrdy sandhu'];
    if (punjabiArtists.some(pa => text.includes(pa))) return 'punjabi';
    const englishArtists = ['taylor swift', 'ed sheeran', 'weeknd', 'drake', 'bieber', 'billie eilish', 'bruno mars', 'dua lipa', 'coldplay'];
    if (englishArtists.some(ea => text.includes(ea))) return 'english';
    return 'hindi';
  }

  function updateSessionProfile(track) {
    if (!track) return;
    if (!state.sessionHistory) state.sessionHistory = [];
    if (!state.sessionHistory.includes(track.id)) {
      state.sessionHistory.push(track.id);
      if (state.sessionHistory.length > 60) state.sessionHistory.shift();
    }

    const lang = detectClientLanguage(track);
    const mood = detectClientMood(track);
    const artist = (track.artist || '').split(',')[0].trim();

    if (!state.sessionProfile) {
      state.sessionProfile = { languages: [], artists: [], moods: [], recentTracks: [] };
    }

    if (!state.sessionProfile.languages) state.sessionProfile.languages = [];
    state.sessionProfile.languages.unshift(lang);
    if (state.sessionProfile.languages.length > 5) state.sessionProfile.languages.pop();

    if (!state.sessionProfile.moods) state.sessionProfile.moods = [];
    state.sessionProfile.moods.unshift(mood);
    if (state.sessionProfile.moods.length > 5) state.sessionProfile.moods.pop();

    if (artist) {
      if (!state.sessionProfile.artists) state.sessionProfile.artists = [];
      state.sessionProfile.artists.unshift(artist);
      if (state.sessionProfile.artists.length > 5) state.sessionProfile.artists.pop();
    }

    if (!state.sessionProfile.recentTracks) state.sessionProfile.recentTracks = [];
    state.sessionProfile.recentTracks.unshift(track);
    if (state.sessionProfile.recentTracks.length > 5) state.sessionProfile.recentTracks.pop();
  }

  // ==========================================================================
  // CENTRALIZED MASHUP DETECTION & RECOMMENDATION ELIGIBILITY ENGINE
  // ==========================================================================
  function isMashupTrack(track) {
    if (!track) return false;
    const rawTitle = track.title || '';
    const rawArtist = track.artist || track.singers || '';
    const rawAlbum = track.album || '';
    const rawDesc = track.description || '';

    const normalize = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
    const title = normalize(rawTitle);
    const artist = normalize(rawArtist);
    const album = normalize(rawAlbum);
    const desc = normalize(rawDesc);
    const combined = `${title} ${artist} ${album} ${desc}`;

    // 1. Explicit mashup keywords in title or album
    if (/\b(dj\s+)?mash[\s\-_]*up(s)?\b/i.test(title)) return true;
    if (/\b(dj\s+)?mash[\s\-_]*up(s)?\b/i.test(album)) return true;
    if (/\bmash[\s\-_]*up(s)?\b/i.test(artist)) return true;

    // 2. Specific mashup phrase combinations
    if (/\bmash[\s\-_]*up\s+(mix|version|edit|compilation|medley|cover|session|special)\b/i.test(combined)) return true;
    if (/\b(mashup\s+medley|medley\s+mashup|mega\s*mashup)\b/i.test(combined)) return true;

    // 3. Theme/Genre mashup combinations (e.g. "Bollywood Mashup", "Romantic Mashup")
    if (/\b(romantic|bollywood|punjabi|hindi|love|lo[\-_]?fi|chill|acoustic|wedding|dance|party|club|retro|90s|80s|2000s|monsoon|sad|breakup|heartbreak)\s+mash[\s\-_]*up\b/i.test(combined)) return true;

    // 4. Multi-song "Song A vs Song B" collision pattern
    if (/\b[\w\s]{2,}\s+vs\.?\s+[\w\s]{2,}/i.test(title)) return true;

    // 5. Multi-song collision title pattern (e.g. 3+ songs combined by slashes)
    if (/^[\w\s]{2,}\s*\/\s*[\w\s]{2,}\s*\/\s*[\w\s]{2,}/i.test(title) && !title.includes('ost') && !title.includes('soundtrack')) return true;

    // 6. Explicit multi-song mashup brackets
    if (/([\w\s]{2,})\s+(x|vs\.?)\s+([\w\s]{2,})\s+[\(\[](.*?mash[\s\-_]*up.*?)[\]\)]/i.test(rawTitle)) return true;

    // NOT a mashup: Official remixes, live, acoustic, extended mixes
    return false;
  }

  function isEligibleForRecommendation(track) {
    if (!track) return false;
    const trackId = track.id || track.trackId || track.ytId;
    const title = track.title;
    if (!trackId || !title || String(title).trim().length === 0) return false;
    if (isMashupTrack(track)) return false;
    return true;
  }

  function cleanRecommendationQueue() {
    if (!Array.isArray(state.recommendationQueue)) return;
    state.recommendationQueue = state.recommendationQueue.filter(t => isEligibleForRecommendation(t));
  }

  // ==========================================================================
  // ACCOUNT-SYNCED PLAYLIST PLAYBACK PROGRESS & RESUME ENGINE
  // ==========================================================================
  let playlistProgressDebounceTimer = null;
  let lastSavedProgressTimestamp = 0;

  async function loadAccountPlaylistProgress() {
    if (state.currentUser && state.currentUser.email) {
      try {
        const res = await fetch('/api/library/playlists-progress', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.progress) {
            state.playlistProgressMap = data.progress;
            if (state.currentView === 'playlist' && state.viewingPlaylistId) {
              updatePlaylistResumeUI(state.viewingPlaylistId);
            }
          }
        }
      } catch (err) {
        console.warn('[Progress] Failed to fetch account progress:', err.message);
      }
    } else {
      try {
        const raw = localStorage.getItem('musisurf_guest_playlist_progress');
        if (raw) {
          state.playlistProgressMap = JSON.parse(raw) || {};
          if (state.currentView === 'playlist' && state.viewingPlaylistId) {
            updatePlaylistResumeUI(state.viewingPlaylistId);
          }
        }
      } catch (e) {}
    }
  }

  function saveCurrentPlaylistProgress({ immediate = false, isCompleted = false } = {}) {
    if (!state.playbackContext || state.playbackContext.type !== 'playlist') return;
    const playlistId = state.playbackContext.playlistId || state.activePlaylistId;
    if (!playlistId || !state.currentTrack) return;

    const doSave = async () => {
      const curTime = getCurrentPlaybackTime();
      const totalDur = getTotalDuration() || state.currentTrack.duration || 0;

      let trackIndex = 0;
      if (state.activePlaylistTracks && Array.isArray(state.activePlaylistTracks)) {
        trackIndex = Math.max(0, state.activePlaylistTracks.findIndex(t => String(t.id) === String(state.currentTrack.id)));
      } else if (typeof state.contextIndex === 'number') {
        trackIndex = state.contextIndex;
      }

      const existing = (state.playlistProgressMap && state.playlistProgressMap[playlistId]) || {};
      const nextVersion = (existing.version || 0) + 1;

      const payload = {
        playlistId: String(playlistId),
        trackId: String(state.currentTrack.id),
        trackIndex,
        positionSeconds: Math.max(0, parseFloat(curTime) || 0),
        durationSeconds: Math.max(0, parseInt(totalDur, 10) || 0),
        playbackMode: String(state.playlistMode || '1'),
        shuffleState: {
          playlistCycle: (state.playlistCycle || []).map(t => String(t.id)),
          playlistCycleIndex: state.playlistCycleIndex || 0
        },
        isCompleted: Boolean(isCompleted),
        version: nextVersion,
        lastPlayedAt: new Date().toISOString()
      };

      if (!state.playlistProgressMap) state.playlistProgressMap = {};
      state.playlistProgressMap[playlistId] = payload;
      lastSavedProgressTimestamp = Date.now();

      if (state.currentView === 'playlist' && state.viewingPlaylistId === playlistId) {
        updatePlaylistResumeUI(playlistId);
      }

      if (state.currentUser && state.currentUser.email) {
        try {
          if (immediate && typeof navigator !== 'undefined' && navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon(`/api/library/playlists/${encodeURIComponent(playlistId)}/progress`, blob);
          } else {
            fetch(`/api/library/playlists/${encodeURIComponent(playlistId)}/progress`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload),
              keepalive: immediate
            }).catch(() => {});
          }
        } catch (e) {}
      } else {
        try {
          localStorage.setItem('musisurf_guest_playlist_progress', JSON.stringify(state.playlistProgressMap));
        } catch (e) {}
      }
    };

    if (immediate) {
      if (playlistProgressDebounceTimer) clearTimeout(playlistProgressDebounceTimer);
      doSave();
    } else {
      if (Date.now() - lastSavedProgressTimestamp < 5000) return;
      if (playlistProgressDebounceTimer) clearTimeout(playlistProgressDebounceTimer);
      playlistProgressDebounceTimer = setTimeout(doSave, 1200);
    }
  }

  function updatePlaylistResumeUI(playlistId) {
    const progress = state.playlistProgressMap && state.playlistProgressMap[playlistId];
    const listToPlay = state.viewingPlaylistTracks || [];
    const resumeBtn = document.getElementById('playlistResumeIndicatorBtn');
    const resumeText = document.getElementById('playlistResumeIndicatorText');
    const restartBtn = document.getElementById('restartPlaylistBtn');

    if (!progress || !progress.trackId || !listToPlay.length) {
      if (resumeBtn) resumeBtn.style.display = 'none';
      if (restartBtn) restartBtn.style.display = 'none';
      if (elements.playAllPlaylistBtn) elements.playAllPlaylistBtn.title = 'Play All';
      return;
    }

    const savedTrack = listToPlay.find(t => String(t.id) === String(progress.trackId));
    const isPlayingThis = (
      state.isPlaying &&
      String(state.activePlaylistId) === String(playlistId) &&
      state.currentTrack &&
      String(state.currentTrack.id) === String(progress.trackId)
    );

    if (savedTrack && !progress.isCompleted) {
      const posStr = formatTime(progress.positionSeconds || 0);
      const shortTitle = savedTrack.title.length > 20 ? savedTrack.title.slice(0, 18) + '...' : savedTrack.title;

      if (resumeBtn && resumeText) {
        resumeText.textContent = `Continue from ${shortTitle} • ${posStr}`;
        resumeBtn.style.display = 'none'; // Hidden as per user request
      }
      if (restartBtn) {
        restartBtn.style.display = 'none'; // Hidden as per user request
      }
      if (elements.playAllPlaylistBtn && !isPlayingThis) {
        elements.playAllPlaylistBtn.title = `Continue from ${shortTitle} (${posStr})`;
      }
    } else {
      if (resumeBtn) resumeBtn.style.display = 'none';
      if (restartBtn) restartBtn.style.display = 'none';
      if (elements.playAllPlaylistBtn) elements.playAllPlaylistBtn.title = 'Play All';
    }
  }

  function startPlaylistPlaybackFromTrack(playlistId, listToPlay, startIndex = 0) {
    if (!listToPlay || listToPlay.length === 0) return;
    state.activePlaylistTracks = [...listToPlay];
    state.activePlaylistId = playlistId;
    state.viewingPlaylistId = playlistId;
    state.playbackContext = {
      type: 'playlist',
      playlistId: playlistId,
      trackId: listToPlay[startIndex]?.id
    };

    const plObj = state.customPlaylists?.find(p => String(p.id) === String(playlistId));
    if (plObj) {
      plObj.lastPlayedAt = Date.now();
      saveStoredPlaylists();
    }

    initPlaylistCycle(listToPlay, startIndex);
    const startingTrack = (state.playlistCycle && state.playlistCycle.length > 0) ? state.playlistCycle[0] : listToPlay[startIndex];
    saveCurrentPlaylistProgress({ immediate: true });
    playTrack(startingTrack, state.contextQueue);
    updatePlayPauseButton();
    updatePlaylistResumeUI(playlistId);
  }

  function resumePlaylistPlayback(playlistId, listToPlay, progress) {
    if (!listToPlay || listToPlay.length === 0) return;
    state.activePlaylistTracks = [...listToPlay];
    state.activePlaylistId = playlistId;
    state.viewingPlaylistId = playlistId;

    let targetIndex = listToPlay.findIndex(t => String(t.id) === String(progress.trackId));
    if (targetIndex === -1) {
      targetIndex = (progress.trackIndex >= 0 && progress.trackIndex < listToPlay.length) ? progress.trackIndex : 0;
    }
    const targetTrack = listToPlay[targetIndex] || listToPlay[0];
    if (!targetTrack) return;

    state.playbackContext = {
      type: 'playlist',
      playlistId: playlistId,
      trackId: targetTrack.id
    };

    if (progress.playbackMode) {
      state.playlistMode = String(progress.playbackMode);
      localStorage.setItem('musisurf_playlist_playback_mode', state.playlistMode);
      updatePlaylistModeUI();
    }

    const mode = state.playlistMode || '1';
    if (mode === '1') {
      state.contextQueue = [...listToPlay];
      state.contextIndex = targetIndex;
      state.playlistCycle = [...listToPlay];
      state.playlistCycleIndex = targetIndex;
    } else {
      if (progress.shuffleState && Array.isArray(progress.shuffleState.playlistCycle) && progress.shuffleState.playlistCycle.length > 0) {
        const idMap = new Map(listToPlay.map(t => [String(t.id), t]));
        const restoredCycle = progress.shuffleState.playlistCycle.map(id => idMap.get(String(id))).filter(Boolean);
        for (const t of listToPlay) {
          if (!restoredCycle.some(rc => String(rc.id) === String(t.id))) {
            restoredCycle.push(t);
          }
        }
        state.playlistCycle = restoredCycle.length > 0 ? restoredCycle : [...listToPlay];
        state.playlistCycleIndex = Math.max(0, state.playlistCycle.findIndex(t => String(t.id) === String(targetTrack.id)));
        if (state.playlistCycleIndex === -1) state.playlistCycleIndex = 0;
        state.contextQueue = [...state.playlistCycle];
        state.contextIndex = state.playlistCycleIndex;
      } else {
        initPlaylistCycle(listToPlay, targetIndex);
      }
    }

    const resumePos = Math.max(0, parseFloat(progress.positionSeconds) || 0);
    playTrack(targetTrack, state.contextQueue, true, resumePos);
    updatePlayPauseButton();
    updatePlaylistResumeUI(playlistId);
    showToast(`Resumed "${targetTrack.title}" (${formatTime(resumePos)}) ↺`, '▶️');
  }

  let recommendationFetchAbort = null;
  async function replenishRecommendationQueue(seedTrack = null, force = false) {
    if (!state.autoplay && !force) return;
    if (state.recoSession?.requestInProgress && !force) return;

    // Maintain optimal queue depth (target 5-10 upcoming recommendation tracks)
    if (!force && state.recommendationQueue && state.recommendationQueue.length > 4) {
      return;
    }

    // Seed Selection Priority:
    // 1. Current playing track
    // 2. Last track in existing recommendation queue (for continuous vibe flow)
    // 3. Stored recommendation seed
    let seed = seedTrack || state.currentTrack;
    if (!seed && state.recommendationQueue && state.recommendationQueue.length > 0) {
      seed = state.recommendationQueue[state.recommendationQueue.length - 1];
    }
    if (!seed) seed = state.recommendationSeed;
    if (!seed || !seed.title) return;

    if (state.recoSession) state.recoSession.requestInProgress = true;
    state.isFetchingRecommendations = true;
    if (elements.queueRecoVibePill) {
      elements.queueRecoVibePill.textContent = '✨ Finding vibe matches...';
    }

    try {
      if (recommendationFetchAbort) {
        recommendationFetchAbort.abort();
      }
      recommendationFetchAbort = new AbortController();

      const seedCid = getCanonicalTrackId(seed);
      const queryKey = seedCid || normalizeString(seed.title);
      const page = (state.recoSession?.pageOffsets?.get(queryKey)) || 1;

      const excludeIds = buildRecommendationExclusionList(seed);
      const recentArtists = (state.recoSession?.recentArtists || []).slice(-10).join(',');
      const seedHistory = (state.recoSession?.seedHistory || []).slice(-10).join(',');

      const lang = seed.language || (state.sessionProfile?.languages?.[0]) || detectClientLanguage(seed);
      const params = new URLSearchParams({
        seedId: seed.id || '',
        title: seed.title || '',
        artist: seed.artist || '',
        language: lang || '',
        page: String(page),
        recentArtists: recentArtists,
        seedHistory: seedHistory,
        excludeIds: excludeIds.join(','),
        limit: '12'
      });

      const res = await fetch(`/api/recommendations?${params.toString()}`, {
        signal: recommendationFetchAbort.signal
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.results)) {
          // Advance pagination offset for next cycle
          if (state.recoSession?.pageOffsets) {
            state.recoSession.pageOffsets.set(queryKey, page + 1);
          }

          const latestExclude = new Set(buildRecommendationExclusionList(seed));
          const newTracks = [];

          for (const t of data.results) {
            if (!t) continue;
            const cid = getCanonicalTrackId(t);
            const fp = getTrackFingerprint(t);
            const rawId = String(t.id || '');

            // Strict exclusion against active session history and current queues
            if (cid && latestExclude.has(cid)) continue;
            if (fp && latestExclude.has(`fp_${fp}`)) continue;
            if (rawId && latestExclude.has(rawId)) continue;

            // Content & Mashup filter
            if (!isEligibleForRecommendation(t)) {
              if (cid) latestExclude.add(cid);
              continue;
            }

            // Intra-batch duplicate prevention
            if (newTracks.some(existing => areTracksIdentical(existing, t))) {
              continue;
            }

            // Immediately mark recommended to prevent concurrent duplicate inserts
            recordTrackRecommended(t);
            if (cid) latestExclude.add(cid);
            if (fp) latestExclude.add(`fp_${fp}`);
            newTracks.push(t);
          }

          if (!state.recommendationQueue) state.recommendationQueue = [];
          state.recommendationQueue.push(...newTracks);

          saveRecoSession();

          if (elements.queueRecoVibePill) {
            const vibeText = data.vibe ? (data.vibe.charAt(0).toUpperCase() + data.vibe.slice(1)) : 'Autoplay';
            const langText = data.language ? (data.language.charAt(0).toUpperCase() + data.language.slice(1)) : '';
            elements.queueRecoVibePill.textContent = `✨ ${langText} ${vibeText}`.trim();
          }

          updateQueueDrawerUI();

          if (state.isAwaitingRecommendations && state.recommendationQueue.length > 0) {
            state.isAwaitingRecommendations = false;
            const nextReco = state.recommendationQueue.shift();
            logPlaybackDiag('AUTOPLAY_RESUME', `Resuming playback with newly arrived track: "${nextReco.title}"`);
            showToast(`Now playing recommendation: "${nextReco.title}"`, '✨');
            recordTrackPlayed(nextReco);
            state.contextQueue = [nextReco];
            state.contextIndex = 0;
            playTrack(nextReco, [nextReco], true);
          } else {
            schedulePreloadNextTrack(1200);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Recommendation fetch warning:', err.message);
        if (state.isAwaitingRecommendations) {
          state.isAwaitingRecommendations = false;
          // Never loop back into played songs as fallback!
          state.isPlaying = false;
          updatePlayPauseButton();
          showToast('End of automatic recommendations for this vibe', '🎵');
        }
      }
    } finally {
      if (state.recoSession) state.recoSession.requestInProgress = false;
      state.isFetchingRecommendations = false;
      if (elements.queueRecoVibePill && elements.queueRecoVibePill.textContent.includes('Finding')) {
        elements.queueRecoVibePill.textContent = '✨ Smart Autoplay';
      }
    }
  }

  // Alias for backward compatibility across all existing caller sites
  function fetchRecommendationBatch(seedTrack = null, force = false) {
    return replenishRecommendationQueue(seedTrack, force);
  }

  // Fisher-Yates shuffle that ensures boundary separation
  function generateShuffledPlaylistCycle(tracks, avoidStartTrackId = null) {
    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) return [];
    if (tracks.length === 1) return [...tracks];
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Avoid repeating last track at cycle boundary
    if (avoidStartTrackId && shuffled[0].id === avoidStartTrackId && shuffled.length > 1) {
      const swapIdx = Math.floor(Math.random() * (shuffled.length - 1)) + 1;
      [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
    }
    return shuffled;
  }

  function initPlaylistCycle(tracks, startIndex = 0) {
    if (!tracks || tracks.length === 0) return;
    const mode = state.playlistMode || '1';

    if (mode === '1') {
      // Mode 1: Play in order, then autoplay
      state.contextQueue = [...tracks];
      state.contextIndex = startIndex;
      state.playlistCycle = [...tracks];
      state.playlistCycleIndex = startIndex;
    } else if (mode === '2') {
      // Mode 2: Shuffle playlist once, then autoplay
      const selectedTrack = tracks[startIndex] || tracks[0];
      const remaining = tracks.filter((t, i) => i !== startIndex);
      const shuffledRemaining = generateShuffledPlaylistCycle(remaining);
      state.playlistCycle = [selectedTrack, ...shuffledRemaining];
      state.playlistCycleIndex = 0;
      state.contextQueue = [...state.playlistCycle];
      state.contextIndex = 0;
    } else if (mode === '3') {
      // Mode 3: Shuffle and repeat active playlist indefinitely
      const selectedTrack = tracks[startIndex] || tracks[0];
      const remaining = tracks.filter((t, i) => i !== startIndex);
      const shuffledRemaining = generateShuffledPlaylistCycle(remaining);
      state.playlistCycle = [selectedTrack, ...shuffledRemaining];
      state.playlistCycleIndex = 0;
      state.contextQueue = [...state.playlistCycle];
      state.contextIndex = 0;
    }
  }

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
    if (window.MusiSurfPlayback && window.MusiSurfPlayback.coordinator && window.MusiSurfPlayback.coordinator.isNativeActive) {
      window.MusiSurfPlayback.coordinator.setRepeatMode(state.repeatMode);
    }
    updateRepeatUI();
  }

  function updatePlaylistModeUI() {
    const mode = String(state.playlistMode || '1');
    state.isShuffled = (mode !== '1');
    state.isPlaylistShuffle = state.isShuffled;

    const shuffleBtns = [
      elements.shufflePlaylistBtn,
      elements.shuffleBtn,
      elements.mobShuffleBtn,
      elements.miniShuffleBtn
    ].filter(Boolean);

    let iconSvg = '';
    let modeTitle = '';

    if (mode === '1') {
      // Mode 1: Plays playlist in order (Default Shuffle / Shuffle: Off)
      iconSvg = `
        <svg class="mode-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 4l3 3l-3 3"/>
          <path d="M18 20l3 -3l-3 -3"/>
          <path d="M3 7h3a5 5 0 0 1 5 5a5 5 0 0 0 5 5h5"/>
          <path d="M21 7h-5a4.978 4.978 0 0 0 -3 1m-4 8a4.984 4.984 0 0 1 -3 1h-3"/>
        </svg>`;
      modeTitle = 'Shuffle: Off (Plays in order) • Click to Shuffle';
    } else if (mode === '2') {
      // Mode 2: Random play from playlist
      iconSvg = `
        <svg class="mode-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 3h5v5"/>
          <path d="M4 20L21 3"/>
          <path d="M21 16v5h-5"/>
          <path d="M15 15l6 6"/>
          <path d="M4 4l5 5"/>
        </svg>`;
      modeTitle = 'Shuffle: On (Random order) • Click for Shuffle & Loop';
    } else if (mode === '3') {
      // Mode 3: Random and loop of playlist
      iconSvg = `
        <svg class="mode-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <path d="m18 4 3 3-3 3"/>
          <path d="m18 20 3-3-3-3"/>
          <path d="M3 7h3a5 5 0 0 1 5 5a5 5 0 0 0 5 5h5"/>
          <path d="M3 17h3a5 5 0 0 0 5-5a5 5 0 0 1 5-5h5"/>
        </svg>`;
      modeTitle = 'Shuffle: Loop & Repeat • Click for In Order';
    }

    shuffleBtns.forEach(btn => {
      btn.innerHTML = iconSvg;
      btn.title = modeTitle;
      btn.classList.remove('mode-1', 'mode-2', 'mode-3', 'active');
      btn.classList.add(`mode-${mode}`);
      if (mode !== '1') {
        btn.classList.add('active');
      }
    });
  }

  function cyclePlaylistMode() {
    let modeNum = parseInt(state.playlistMode || '1', 10);
    modeNum = (modeNum % 3) + 1;
    state.playlistMode = String(modeNum);
    state.isShuffled = (modeNum !== 1);
    state.isPlaylistShuffle = state.isShuffled;
    localStorage.setItem('musisurf_playlist_playback_mode', state.playlistMode);
    saveShuffleState();

    if (state.playlistMode === '1') {
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
    }

    updatePlaylistModeUI();

    if (state.isShuffled && state.queue.length > 1) {
      const current = state.currentTrack;
      const remaining = state.queue.filter(t => t.id !== current?.id);
      remaining.sort(() => Math.random() - 0.5);
      state.queue = current ? [current, ...remaining] : remaining;
      state.queueIndex = 0;
    }

    // If currently playing a playlist, gracefully adapt upcoming cycle
    if (state.activePlaylistTracks && state.activePlaylistTracks.length > 0 && state.currentTrack) {
      const curId = state.currentTrack.id;
      if (state.playlistMode === '1') {
        state.contextQueue = [...state.activePlaylistTracks];
        state.contextIndex = Math.max(0, state.activePlaylistTracks.findIndex(t => t.id === curId));
        state.playlistCycle = [...state.activePlaylistTracks];
        state.playlistCycleIndex = state.contextIndex;
      } else if (state.playlistMode === '2') {
        const remaining = state.activePlaylistTracks.filter(t => t.id !== curId);
        state.playlistCycle = [state.currentTrack, ...generateShuffledPlaylistCycle(remaining)];
        state.playlistCycleIndex = 0;
        state.contextQueue = [...state.playlistCycle];
        state.contextIndex = 0;
      } else if (state.playlistMode === '3') {
        const remaining = state.activePlaylistTracks.filter(t => t.id !== curId);
        state.playlistCycle = [state.currentTrack, ...generateShuffledPlaylistCycle(remaining)];
        state.playlistCycleIndex = 0;
        state.contextQueue = [...state.playlistCycle];
        state.contextIndex = 0;
      }
    }
    updateQueueDrawerUI();
  }

  function toggleAutoplay() {
    state.autoplay = !state.autoplay;
    localStorage.setItem('musisurf_autoplay_enabled', state.autoplay ? 'true' : 'false');
    if (elements.smartAutoplayToggleSwitch) elements.smartAutoplayToggleSwitch.checked = state.autoplay;
    if (elements.queueAutoplayToggleBtn) {
      elements.queueAutoplayToggleBtn.classList.toggle('active', state.autoplay);
      const txt = elements.queueAutoplayToggleBtn.querySelector('.autoplay-text');
      if (txt) txt.textContent = state.autoplay ? 'Autoplay On' : 'Autoplay Off';
    }
    showToast(`Smart Autoplay ${state.autoplay ? 'Enabled ✨' : 'Disabled ⏸️'}`, state.autoplay ? '✨' : '⏸️');
    if (state.autoplay && (!state.recommendationQueue || state.recommendationQueue.length === 0)) {
      fetchRecommendationBatch();
    }
    updateQueueDrawerUI();
  }

  function setAutoplay(val) {
    state.autoplay = Boolean(val);
    localStorage.setItem('musisurf_autoplay_enabled', state.autoplay ? 'true' : 'false');
    if (elements.smartAutoplayToggleSwitch) elements.smartAutoplayToggleSwitch.checked = state.autoplay;
    if (elements.queueAutoplayToggleBtn) {
      elements.queueAutoplayToggleBtn.classList.toggle('active', state.autoplay);
      const txt = elements.queueAutoplayToggleBtn.querySelector('.autoplay-text');
      if (txt) txt.textContent = state.autoplay ? 'Autoplay On' : 'Autoplay Off';
    }
    showToast(`Smart Autoplay ${state.autoplay ? 'Enabled ✨' : 'Disabled ⏸️'}`, state.autoplay ? '✨' : '⏸️');
    if (state.autoplay && (!state.recommendationQueue || state.recommendationQueue.length === 0)) {
      fetchRecommendationBatch();
    }
    updateQueueDrawerUI();
  }

  function getNextUpcomingTrack() {
    // 1. User manual queue has highest priority
    if (state.userQueue && state.userQueue.length > 0) {
      return state.userQueue[0];
    }

    // 2. Repeat one mode
    if (state.repeatMode === 'one' && state.currentTrack) {
      return state.currentTrack;
    }

    // 3. Active playlist context based on selected mode
    if (state.activePlaylistTracks && state.activePlaylistTracks.length > 0) {
      const mode = state.playlistMode || '1';

      if (mode === '1') {
        // Mode 1: In Order + Autoplay
        if (state.contextQueue && state.contextIndex + 1 < state.contextQueue.length) {
          return state.contextQueue[state.contextIndex + 1];
        }
        // At end of playlist in Mode 1: transition to recommendations!
        if (state.autoplay && state.recommendationQueue && state.recommendationQueue.length > 0) {
          return state.recommendationQueue[0];
        }
      } else if (mode === '2') {
        // Mode 2: Shuffle Once + Autoplay
        if (state.playlistCycle && state.playlistCycleIndex + 1 < state.playlistCycle.length) {
          return state.playlistCycle[state.playlistCycleIndex + 1];
        }
        // At end of shuffled playlist in Mode 2: transition to recommendations!
        if (state.autoplay && state.recommendationQueue && state.recommendationQueue.length > 0) {
          return state.recommendationQueue[0];
        }
      } else if (mode === '3') {
        // Mode 3: Shuffle & Repeat Playlist
        if (state.playlistCycle && state.playlistCycleIndex + 1 < state.playlistCycle.length) {
          return state.playlistCycle[state.playlistCycleIndex + 1];
        }
        // At end of cycle in Mode 3: next cycle's candidate (never leave playlist!)
        const candidate = state.activePlaylistTracks.find(t => t.id !== state.currentTrack?.id) || state.activePlaylistTracks[0];
        return candidate;
      }
    }

    // 4. Non-playlist context: standalone track from search or active context
    if (state.contextQueue && state.contextQueue.length > state.contextIndex + 1) {
      return state.contextQueue[state.contextIndex + 1];
    }

    // 5. Smart Autoplay recommendation queue
    if (state.autoplay && state.recommendationQueue && state.recommendationQueue.length > 0) {
      return state.recommendationQueue[0];
    }

    // 6. Global repeat all fallback
    if (state.repeatMode === 'all' && state.contextQueue && state.contextQueue.length > 0) {
      return state.contextQueue[0];
    }

    return null;
  }

  let preloadDebounceTimer = null;
  function schedulePreloadNextTrack(delayMs = 1500) {
    if (preloadDebounceTimer) clearTimeout(preloadDebounceTimer);
    preloadDebounceTimer = setTimeout(() => {
      preloadNextTrackForTransition();
    }, delayMs);
  }

  function preloadNextTrackForTransition() {
    if (state.isTransitionPreloaded || state.isAutoMixing || state.isCrossfading || state.isTransitioning) return;
    const nextTrackCandidate = getNextUpcomingTrack();
    if (!nextTrackCandidate) return;

    if (state.preloadedNextTrack && isSameTrack(state.preloadedNextTrack, nextTrackCandidate)) {
      state.isTransitionPreloaded = true;
      return;
    }

    state.isTransitionPreloaded = true;
    state.preloadedNextTrack = nextTrackCandidate;
    const secDeck = getSecondaryDeck();
    if (!secDeck) return;

    const isYtNext = nextTrackCandidate.source === 'youtube' || nextTrackCandidate.ytId || (nextTrackCandidate.id && nextTrackCandidate.id.startsWith('yt_'));
    if (isYtNext && !nextTrackCandidate.streamUrl) {
      const ytId = nextTrackCandidate.ytId || (nextTrackCandidate.id ? nextTrackCandidate.id.replace('yt_', '') : '');
      if (ytId) nextTrackCandidate.streamUrl = `/api/yt-stream?id=${encodeURIComponent(ytId)}`;
    }

    const nextAudioSrc = nextTrackCandidate.audioUrl || nextTrackCandidate.streamUrl || (nextTrackCandidate.audioBlob ? URL.createObjectURL(nextTrackCandidate.audioBlob) : null);
    if (nextAudioSrc) {
      secDeck.src = nextAudioSrc;
      secDeck.preload = 'auto';
      secDeck.volume = 0;
      secDeck.load();
      if (state.settings.removeDeadSilence) {
        getOrAnalyzeTrackEdges(nextTrackCandidate, nextAudioSrc, secDeck).catch(() => {});
      }
    }
  }

  // Authoritative Track Restart Engine (Single Source of Truth for Repeat One & Previous <= 3s)
  function restartCurrentTrack(reason = 'repeat-one') {
    const track = state.currentTrack;
    if (!track) return;

    logPlaybackDiag('RESTART_TRACK', `Restarting track "${track.title}" [Reason: ${reason}]`);

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
      showToast(`Repeating: "${track.title}" 🔂`, '🔂');
    } else if (reason.startsWith('previous')) {
      showToast(`Restarted: "${track.title}" 0:00`, '⏮');
    }
  }

  // Instant Next-Track Switcher (<10ms deck swap when preloaded)
  function transitionToNextSong(targetTrack = null, queueContext = null, options = {}) {
    if (state.isTransitioning) return;
    state.isTransitioning = true;
    setTimeout(() => { state.isTransitioning = false; }, 350);

    cancelActiveAutoMix(false);

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
      }
      // 3. Active Playlist Context (Modes 1, 2, 3)
      else if (state.activePlaylistTracks && state.activePlaylistTracks.length > 0) {
        const mode = state.playlistMode || '1';

        if (mode === '1') {
          // Mode 1: In order
          if (state.contextQueue && state.contextIndex + 1 < state.contextQueue.length) {
            state.contextIndex++;
            nextSong = state.contextQueue[state.contextIndex];
            if (state.playbackContext && state.playbackContext.type === 'playlist') {
              state.playbackContext.trackId = nextSong?.id;
              saveCurrentPlaylistProgress({ immediate: true });
            }
          } else if (state.autoplay) {
            // End of playlist -> Mark completed and Switch to recommendations!
            saveCurrentPlaylistProgress({ immediate: true, isCompleted: true });
            state.activePlaylistTracks = null;
            state.activePlaylistId = null;
            state.playbackContext = { type: 'recommendation', playlistId: null, trackId: null };
            if (state.recommendationQueue && state.recommendationQueue.length > 0) {
              nextSong = state.recommendationQueue.shift();
              switchedToRecommendations = true;
              fromRecommendations = true;
            } else {
              fetchRecommendationBatch(state.currentTrack, true);
            }
          }
        } else if (mode === '2') {
          // Mode 2: Shuffle once
          if (state.playlistCycle && state.playlistCycleIndex + 1 < state.playlistCycle.length) {
            state.playlistCycleIndex++;
            nextSong = state.playlistCycle[state.playlistCycleIndex];
            state.contextIndex = state.playlistCycleIndex;
            if (state.playbackContext && state.playbackContext.type === 'playlist') {
              state.playbackContext.trackId = nextSong?.id;
              saveCurrentPlaylistProgress({ immediate: true });
            }
          } else if (state.autoplay) {
            // End of shuffled playlist -> Mark completed and Switch to recommendations!
            saveCurrentPlaylistProgress({ immediate: true, isCompleted: true });
            state.activePlaylistTracks = null;
            state.activePlaylistId = null;
            state.playbackContext = { type: 'recommendation', playlistId: null, trackId: null };
            if (state.recommendationQueue && state.recommendationQueue.length > 0) {
              nextSong = state.recommendationQueue.shift();
              switchedToRecommendations = true;
              fromRecommendations = true;
            } else {
              fetchRecommendationBatch(state.currentTrack, true);
            }
          }
        } else if (mode === '3') {
          // Mode 3: Shuffle & Repeat playlist
          if (state.playlistCycle && state.playlistCycleIndex + 1 < state.playlistCycle.length) {
            state.playlistCycleIndex++;
            nextSong = state.playlistCycle[state.playlistCycleIndex];
            state.contextIndex = state.playlistCycleIndex;
          } else {
            // Cycle complete! Generate fresh cycle avoiding boundary repetition
            const lastId = state.currentTrack?.id;
            state.playlistCycle = generateShuffledPlaylistCycle(state.activePlaylistTracks, lastId);
            state.playlistCycleIndex = 0;
            state.contextQueue = [...state.playlistCycle];
            state.contextIndex = 0;
            nextSong = state.playlistCycle[0];
            loopedPlaylist = true;
          }
          if (state.playbackContext && state.playbackContext.type === 'playlist') {
            state.playbackContext.trackId = nextSong?.id;
            saveCurrentPlaylistProgress({ immediate: true });
          }
        }
      }
      // 4. Standalone track from search or ongoing autoplay
      else if (state.contextQueue && state.contextIndex + 1 < state.contextQueue.length) {
        state.contextIndex++;
        nextSong = state.contextQueue[state.contextIndex];
      }
      // 5. Smart Autoplay recommendation queue
      else if (state.autoplay) {
        if (state.recommendationQueue && state.recommendationQueue.length > 0) {
          nextSong = state.recommendationQueue.shift();
          switchedToRecommendations = true;
          fromRecommendations = true;
        } else {
          // Fetch immediately if recommendations ran low
          fetchRecommendationBatch(state.currentTrack, true);
        }
      }
      // 6. Repeat All fallback
      else if (state.repeatMode === 'all' && state.contextQueue && state.contextQueue.length > 0) {
        state.contextIndex = 0;
        nextSong = state.contextQueue[0];
      }
    }

    if (!nextSong) {
      state.isTransitioning = false;
      if (state.autoplay && state.currentTrack) {
        state.isAwaitingRecommendations = true;
        logPlaybackDiag('AUTOPLAY_WAIT', 'Queue exhausted. Waiting for recommendation batch over network...');
        showToast('Loading next vibe recommendation...', '✨');
        fetchRecommendationBatch(state.currentTrack, true);
      } else {
        logPlaybackDiag('PLAYBACK_STOP', 'Queue finished with no autoplay active');
        state.isPlaying = false;
        updatePlayPauseButton();
      }
      return;
    }

    if (switchedToRecommendations) {
      showToast('Playlist finished • Continuing with vibe recommendations ✨', '✨');
    } else if (loopedPlaylist) {
      showToast('Looping playlist with fresh shuffle 🔀🔁', '🔁');
    }

    // Refill recommendation queue if running low (<= 4 tracks left)
    if (state.autoplay && state.recommendationQueue && state.recommendationQueue.length <= 4) {
      fetchRecommendationBatch(nextSong);
    }

    // Keep queue updated
    state.queue = [nextSong, ...state.userQueue, ...(state.contextQueue ? state.contextQueue.slice(state.contextIndex + 1) : [])];
    state.queueIndex = 0;
    updateQueueDrawerUI();

    const secDeck = getSecondaryDeck();
    const actDeck = getActiveDeck();
    const isPreloaded = state.isTransitionPreloaded && 
                        state.preloadedNextTrack && 
                        isSameTrack(state.preloadedNextTrack, nextSong) && 
                        secDeck && 
                        secDeck.src && 
                        secDeck.readyState >= 2;

    if (isPreloaded) {
      const masterVol = state.isMuted ? 0 : (state.volume || 0.8);
      try {
        actDeck.pause();
      } catch (e) {}

      const startOffset = nextSong._silenceStartOffset || 0;
      try {
        if (startOffset > 0) secDeck.currentTime = startOffset;
      } catch (e) {}

      secDeck.volume = masterVol;
      const p = secDeck.play();
      if (p) p.catch(() => {});

      swapActiveDeck();
      elements.audio = getActiveDeck();
      elements.audioSecondary = getSecondaryDeck();

      state.isPlaying = true;
      state.isTrackLoading = false;
      state._currentTrackPlayedRecorded = false;
      state._currentTrackListeningSeconds = 0;
      state._lastTrackedPlaybackTime = null;
      state._tailSilenceStartTime = null;
      state.isTransitionPreloaded = false;
      state.preloadedNextTrack = null;
      state.consecutivePlaybackErrors = 0;

      updatePlayPauseButton();
      if (fromRecommendations) {
        state.contextQueue = [nextSong];
        state.contextIndex = 0;
      }
      applyAuthoritativeTrack(nextSong, { source: 'preloaded_deck_swap' });
      recordRecentlyPlayed(nextSong);
      recordTrackPlayed(nextSong);
      updateSessionProfile(nextSong);
      schedulePreloadNextTrack(1500);
      state.isTransitioning = false;
    } else {
      state.isTransitioning = false;
      if (fromRecommendations) {
        state.contextQueue = [nextSong];
        state.contextIndex = 0;
        playTrack(nextSong, [nextSong], true);
      } else if (fromUserQueue) {
        playTrack(nextSong, 'PRESERVE_CONTEXT', true);
      } else {
        playTrack(nextSong, queueContext || state.contextQueue, true);
      }
    }
  }

  function checkPlaybackCrossfadeAndTransitions(cur, dur) {
    if (!state.isPlaying || state.isTrackLoading || isYouTubeActive() || state.isTransitioning) return;
    const actDeck = getActiveDeck();
    if (!actDeck || actDeck.paused || actDeck.seeking) return;
    if (dur <= 0 || !Number.isFinite(dur) || !Number.isFinite(cur)) return;

    const currentTrack = state.currentTrack;
    if (!currentTrack) return;

    // Coordinated Edge Dead Silence & AutoMix
    const key = getTrackSilenceCacheKey(currentTrack);
    const edgeInfo = trackEdgeSilenceCache.get(key);
    const effectiveStart = (edgeInfo && typeof edgeInfo.effectiveStart === 'number') 
      ? edgeInfo.effectiveStart 
      : (currentTrack._effectiveStart || currentTrack._silenceStartOffset || 0);
    const effectiveEnd = (edgeInfo && typeof edgeInfo.effectiveEnd === 'number' && edgeInfo.effectiveEnd > effectiveStart) 
      ? edgeInfo.effectiveEnd 
      : (currentTrack._effectiveEnd || dur);

    const effectiveTimeLeft = effectiveEnd - cur;

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
      : (state.settings.crossfade || 0);

    if (autoMixSec > 0 && (effectiveEnd - effectiveStart) > 4) {
      // Clamped overlap blend duration (max 40% of track playable span)
      const actualFadeSec = Math.min(autoMixSec, Math.max(1, Math.floor((effectiveEnd - effectiveStart) * 0.4)));

      // Preload incoming track well ahead: Math.max(actualFadeSec + 6, 12) seconds
      const preloadLeadTime = Math.max(actualFadeSec + 6, 12);
      if (effectiveTimeLeft <= preloadLeadTime && !state.isTransitionPreloaded && !state.isAutoMixing && !state.isCrossfading) {
        preloadNextTrackForTransition();
      }

      // Start Dual-Deck Overlap exactly when effectiveTimeLeft <= actualFadeSec
      if (effectiveTimeLeft <= actualFadeSec && !state.isAutoMixing && !state.isCrossfading && state.preloadedNextTrack) {
        const secDeck = getSecondaryDeck();
        if (secDeck && secDeck.src) {
          const nextKey = getTrackSilenceCacheKey(state.preloadedNextTrack);
          const nextEdge = trackEdgeSilenceCache.get(nextKey);
          if (nextEdge && nextEdge.effectiveStart > 0.05) {
            seekToEffectiveStart(secDeck, nextEdge.effectiveStart);
          }
          startDualDeckAutoMix(state.preloadedNextTrack, secDeck.src, actualFadeSec);
        }
      }
    } else {
      // Hard Cut (0s AutoMix) - Preload 5s ahead
      if (effectiveTimeLeft <= 5 && !state.isTransitionPreloaded && !state.isAutoMixing && !state.isCrossfading) {
        preloadNextTrackForTransition();
      }
      // Instant Hard Cut at effectiveEnd without playing trailing dead air!
      if (effectiveTimeLeft <= 0.04 && !state.isAutoMixing && !state.isCrossfading && !state.isTransitioning) {
        transitionToNextSong();
      }
    }
  }

  // Background-safe interval backup for high-precision end cut and AutoMix
  setInterval(() => {
    if (state.isPlaying && !state.isTrackLoading && !state.isTransitioning && state.currentTrack && !isYouTubeActive()) {
      const cur = getCurrentPlaybackTime();
      const dur = getTotalDuration();
      if (dur > 0 && Number.isFinite(dur) && Number.isFinite(cur)) {
        checkPlaybackCrossfadeAndTransitions(cur, dur);
      }
    }
  }, 100);
  // Shuffle Mode & Per-Playlist Shuffle Persistence Controller
  function saveShuffleState() {
    try {
      localStorage.setItem('musisurf_shuffle_mode', JSON.stringify({
        isShuffled: !!state.isShuffled,
        isPlaylistShuffle: !!state.isPlaylistShuffle
      }));
      if (state.playlistShuffleMap) {
        localStorage.setItem('musisurf_playlist_shuffle_map', JSON.stringify(state.playlistShuffleMap));
      }
    } catch (e) {}
  }

  function loadShuffleState() {
    try {
      const savedMode = localStorage.getItem('musisurf_playlist_playback_mode');
      if (savedMode) {
        state.playlistMode = savedMode;
        state.isShuffled = (savedMode !== '1');
        state.isPlaylistShuffle = state.isShuffled;
      }
      updatePlaylistModeUI();

      const rawMap = localStorage.getItem('musisurf_playlist_shuffle_map');
      if (rawMap) {
        state.playlistShuffleMap = JSON.parse(rawMap);
      } else {
        state.playlistShuffleMap = {};
      }
    } catch (e) {}
  }

  function isPlaylistShuffled(pId) {
    if (!pId) return !!state.isPlaylistShuffle;
    if (state.playlistShuffleMap && state.playlistShuffleMap[pId] !== undefined) {
      return !!state.playlistShuffleMap[pId];
    }
    return !!state.isPlaylistShuffle;
  }

  function setPlaylistShuffled(pId, val) {
    state.isPlaylistShuffle = !!val;
    state.isShuffled = !!val;
    if (!state.playlistShuffleMap) state.playlistShuffleMap = {};
    if (pId) state.playlistShuffleMap[pId] = !!val;
    saveShuffleState();
  }

  // Strict Content Filter: Strictly Pure Music Only (Zero podcasts, zero gaming, vlogs, reactions)
  function isContentFilterAllowed(t) {
    if (!t) return false;
    // Local device and JioSaavn tracks are 100% verified pure studio music
    if (t.isLocal || t.source === 'saavn' || t.source === 'jiosaavn') return true;

    const title = (t.title || '').toLowerCase();
    const artist = (t.artist || '').toLowerCase();

    // 1. Podcasts and episodes are completely blocked
    const isPodcast = title.includes('podcast') || title.includes('episode') ||
                      artist.includes('podcast') || artist.includes('episode') ||
                      Boolean(t.isPodcast) || /\b(full episode|ep\s*\d+|ep\.\s*\d+)\b/i.test(title);
    if (isPodcast) return false;

    // 2. Non-music video content signatures in title are strictly blocked
    const NON_MUSIC_REGEX = /\b(gameplay|walkthrough|playthrough|let'?s play|gaming|gamer|speedrun|minecraft|roblox|fortnite|gta\s*v?|grand theft auto|valorant|call of duty|cod|warzone|apex legends|pubg|genshin|clash royale|brawl stars|clash of clans|smp|hardcore world|survival mode|world #?\d+|episode #?\d+|unboxing|tech review|phone review|pc build|tutorial|how to (fix|code|build|make|install|play game|draw|use)|guide for|coding in|python|javascript|java|c\+\+|html|css|react|programming|full course|course for|learn \w+ in \d+|lecture|lesson \d+|class \d+|study with me|news live|breaking news|daily news|headline news|mukbang|daily vlog|vlog \d+|prank|reaction to|reacting to|reacts to|interviews? with|press conference|speech at|court hearing|highlights? (hd|4k)?|match highlights|cricket highlights|football highlights|tiktok compilation|fails compilation|meme compilation|trailer \d|official trailer|teaser)\b/i;
    if (NON_MUSIC_REGEX.test(title)) return false;

    // 3. Non-music creator channels are strictly blocked
    const NON_MUSIC_CHANNEL_REGEX = /\b(gaming|gamer|walkthroughs?|playthroughs?|vlogs?|vlogger|tech news|breaking news|news live|tutorials?|academy|university|lectures?|course|coding|software|sports live|freecodecamp|tedx|ted talk)\b/i;
    if (NON_MUSIC_CHANNEL_REGEX.test(artist)) return false;

    // 4. Category check: if categoryId is present and not '10', block it
    if (t.categoryId && String(t.categoryId) !== '10' && String(t.categoryId) !== '0') {
      return false;
    }

    // 5. Positive music validation requirement:
    // Must possess positive music evidence (not just absence of banned words)
    const hasPositiveMusicToken = /\b(official (music )?video|music video|official audio|audio|song|lyric video|lyrics|audio track|soundtrack|original soundtrack|ost|score|remix|lofi|slowed|reverb|cover|instrumental|acoustic|unplugged|piano|guitar|orchestra|feat\.?|ft\.?|prod\.? by|album|single|ep)\b/i.test(title);
    const isVerifiedArtist = Boolean(t.isVerified) || /(- topic|vevo|records|music|entertainment)$/i.test(artist);
    const hasArtistAndAlbum = Boolean(t.album && t.album !== 'Single' && t.artist && t.artist !== 'Universal Artist');
    const isCategoryTen = String(t.categoryId) === '10';

    if (!hasPositiveMusicToken && !isVerifiedArtist && !hasArtistAndAlbum && !isCategoryTen) {
      return false;
    }

    return true;
  }

  function recordTrackPlay(track) {
    if (!track) return;
    const key = track.id || track.title;
    if (!key) return;
    if (!state.trackPlayCounts) state.trackPlayCounts = {};
    const entry = state.trackPlayCounts[key] || { count: 0, track: null, lastPlayed: 0 };
    entry.count = (entry.count || 0) + 1;
    entry.lastPlayed = Date.now();
    entry.track = {
      id: track.id || key,
      title: track.title,
      artist: track.artist,
      image: track.image,
      duration: track.duration,
      durationStr: track.durationStr,
      album: track.album || 'Single',
      audioUrl: track.audioUrl,
      streamUrl: track.streamUrl,
      ytId: track.ytId,
      source: track.source
    };
    state.trackPlayCounts[key] = entry;
    try {
      localStorage.setItem('musisurf_track_play_counts', JSON.stringify(state.trackPlayCounts));
    } catch (e) {}
  }

  let activePlayToken = 0;
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

    // Android Native Media3 ExoPlayer delegation if running inside Capacitor Android APK
    if (window.MusiSurfPlayback && window.MusiSurfPlayback.coordinator && window.MusiSurfPlayback.coordinator.isNativeActive) {
      state.currentTrack = track;
      state.isPlaying = true;
      state.isTrackLoading = false;
      if (queueList && Array.isArray(queueList)) {
        state.contextQueue = [...queueList];
        state.contextIndex = state.contextQueue.findIndex(t => areTracksIdentical(t, track));
        if (state.contextIndex === -1) {
          state.contextQueue = [track];
          state.contextIndex = 0;
        }
        state.queue = [track, ...state.userQueue, ...state.contextQueue.slice(state.contextIndex + 1)];
      }
      if (addToHistory && (!state.history.length || state.history[0]?.id !== track.id)) {
        state.history.unshift(track);
        if (state.history.length > 50) state.history.pop();
      }
      updatePlayerUI(track);
      updateMediaSession(track);
      updatePlayPauseButton();
      updateQueueDrawerUI();
      highlightPlayingTrackInTables(track.id);
      savePlaybackState();
      loadLyricsForTrack(track);
      await window.MusiSurfPlayback.coordinator.playTrack(track, state.queue, { startTime: customStartTime });
      return;
    }

    // Guard: If clicking the CURRENTLY PLAYING song without explicit custom seek
    const actForGuard = getActiveDeck();
    const currentDeckSrc = actForGuard ? (actForGuard.currentSrc || actForGuard.src || '') : '';
    const hasValidDeckSource = Boolean(currentDeckSrc && currentDeckSrc !== '' && !currentDeckSrc.startsWith('data:audio') && !currentDeckSrc.endsWith('/') && !actForGuard.error);

    if (!forceReload && options?.transitionReason !== 'repeat-one' && previousTrack && isSameTrack(track, previousTrack) && customStartTime === 0 && hasValidDeckSource && actForGuard && actForGuard.readyState >= 1) {
      logPlaybackDiagnostic('same-track-resume-guard', { trackId: track.id, hasValidDeckSource, readyState: actForGuard.readyState });
      if (queueList && Array.isArray(queueList)) {
        state.contextQueue = [...queueList];
        state.contextIndex = state.contextQueue.findIndex(t => areTracksIdentical(t, track));
        if (state.contextIndex === -1) {
          state.contextQueue = [track];
          state.contextIndex = 0;
        }
      }
      if (!state.isPlaying || actForGuard.paused) {
        state.isPlaying = true;
        state.isTrackLoading = false;
        actForGuard.volume = state.isMuted ? 0 : (state.volume || 0.8);
        updatePlayPauseButton();

        let sameTrackHandled = false;
        let sameTrackWatchdog = setTimeout(() => {
          if (!sameTrackHandled && (!state.isPlaying || actForGuard.paused)) {
            console.warn('Same-track resume play stalled, executing recovery reload');
            logPlaybackDiagnostic('same-track-resume-watchdog-triggered', { trackId: track.id });
            sameTrackHandled = true;
            cleanupSameTrackListeners();
            playTrack(track, queueList, false, (actForGuard && actForGuard.currentTime > 0) ? actForGuard.currentTime : 0, true);
          }
        }, 1500);

        function cleanupSameTrackListeners() {
          if (sameTrackWatchdog) {
            clearTimeout(sameTrackWatchdog);
            sameTrackWatchdog = null;
          }
          actForGuard.removeEventListener('playing', onSameTrackSuccess);
          actForGuard.removeEventListener('timeupdate', onSameTrackSuccess);
        }

        function onSameTrackSuccess() {
          if (sameTrackHandled) return;
          sameTrackHandled = true;
          cleanupSameTrackListeners();
          state.isPlaying = true;
          state.isTrackLoading = false;
          actForGuard.volume = state.isMuted ? 0 : (state.volume || 0.8);
          updatePlayPauseButton();
          logPlaybackDiagnostic('same-track-resume-success', { trackId: track.id });
        }

        actForGuard.addEventListener('playing', onSameTrackSuccess, { once: true });
        actForGuard.addEventListener('timeupdate', onSameTrackSuccess, { once: true });

        const playPromise = actForGuard.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            onSameTrackSuccess();
          }).catch(err => {
            if (err.name === 'AbortError') return;
            if (sameTrackHandled) return;
            sameTrackHandled = true;
            cleanupSameTrackListeners();
            console.warn('Same-track resume play error, recovering with full playTrack:', err);
            logPlaybackDiagnostic('same-track-resume-failed', { trackId: track.id, error: err.message });
            state.isPlaying = false;
            state.isTrackLoading = false;
            updatePlayPauseButton();
            playTrack(track, queueList, false, (actForGuard && actForGuard.currentTime > 0) ? actForGuard.currentTime : 0, true);
          });
        }
      }
      return;
    }

    state._currentTrackPlayedRecorded = false;
    state._currentTrackListeningSeconds = 0;
    state._lastTrackedPlaybackTime = null;
    state._tailSilenceStartTime = null;

    cancelActiveAutoMix(true);
    state.isTransitioning = true;
    setTimeout(() => { state.isTransitioning = false; }, 350);

    const currentToken = ++activePlayToken;
    state.isTrackLoading = true;
    updatePlayPauseButton();
    logPlaybackDiagnostic('play-track-start', { trackId: track.id, title: track.title, customStartTime });

    // Reset deck pointer to primary deck for new user-initiated playback
    activeDeckIndex = 0;
    elements.audio = getActiveDeck();
    elements.audioSecondary = getSecondaryDeck();

    // Immediately stop and silence both audio decks to prevent stale playback or overlap
    try {
      if (elements.audio) {
        elements.audio._playToken = currentToken;
        if (!elements.audio.paused) elements.audio.pause();
      }
      if (elements.audioSecondary) {
        elements.audioSecondary._playToken = 0;
        if (!elements.audioSecondary.paused) elements.audioSecondary.pause();
        elements.audioSecondary.removeAttribute('src');
        elements.audioSecondary.load();
      }
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

    // Reset progress and scrubber safeguards for new track
    lastKnownPlaybackTime = customStartTime || 0;
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
      if (elements.miniplayerScrubberFill) elements.miniplayerScrubberFill.style.width = '0%';
      if (elements.progressBuffer) elements.progressBuffer.style.width = '0%';
    }

    recordRecentlyPlayed(track);
    recordTrackPlayed(track);

    // Track playback history for previous song button navigation
    if (options?.isHistoryNav || addToHistory !== false) {
      recordPlaybackHistoryEntry(track, options);
    }

    // Spotify-like Queue Management: Isolated search results vs context playlist
    if (queueList === 'PRESERVE_CONTEXT') {
      // Intentionally preserve state.contextQueue and state.contextIndex (e.g. playing user manual queue item)
    } else if (queueList && Array.isArray(queueList)) {
      state.contextQueue = [...queueList];
      let matchIdx = -1;
      if (typeof options?.explicitIndex === 'number' && options.explicitIndex >= 0 && options.explicitIndex < state.contextQueue.length) {
        matchIdx = options.explicitIndex;
      } else {
        matchIdx = state.contextQueue.findIndex(t => areTracksIdentical(t, track));
        if (matchIdx === -1) {
          matchIdx = state.contextQueue.findIndex(t => t && String(t.id) === String(track.id));
        }
      }
      state.contextIndex = matchIdx !== -1 ? matchIdx : 0;
      if (state.activePlaylistId || state.viewingPlaylistId) {
        state.playbackContext = {
          type: 'playlist',
          playlistId: state.activePlaylistId || state.viewingPlaylistId,
          trackId: track.id
        };
      }
    } else if (queueList === null) {
      // Standalone track played (e.g. from search results) - does NOT pollute upcoming queue or overwrite playlist progress
      state.activePlaylistTracks = null;
      state.activePlaylistId = null;
      state.playbackContext = {
        type: state.currentView === 'search' ? 'search' : 'standalone',
        playlistId: null,
        trackId: track.id
      };
      state.contextQueue = [track];
      state.contextIndex = 0;
      state.recommendationSeed = track;
    }
    state.queue = [track, ...state.userQueue, ...state.contextQueue.slice(state.contextIndex + 1)];
    state.queueIndex = 0;

    // Immediately record updated progress if in playlist context
    if (state.playbackContext && state.playbackContext.type === 'playlist') {
      saveCurrentPlaylistProgress({ immediate: true });
    }

    // Update Session Profile and initiate background recommendation fetching
    updateSessionProfile(track);
    if (state.autoplay && (!state.recommendationQueue || state.recommendationQueue.length <= 4)) {
      fetchRecommendationBatch(track);
    }

    track._introTrimmed = false;

    // Reset playback engine and silence trimmer state for new track
    state.activePlayerEngine = (track.source === 'youtube' && !track.hasDirectAudio) ? 'youtube' : 'audio';
    if (state.settings.removeDeadSilence) {
      state.isTrimmingStartSilence = true;
      state.trailingSilenceFrames = 0;
    }

    // Apply Authoritative Track Metadata Across All Surfaces (Bar, Mobile Modal, Miniplayer, Lyrics View, MediaSession)
    applyAuthoritativeTrack(track, { source: 'play_track', skipLyrics: true });

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
        if (headerSub) headerSub.textContent = 'PLAYING FROM PLAYLIST';
        if (headerName) headerName.textContent = 'NONE';
        headerTitleWrap.style.visibility = 'visible';
      }
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
      } else if (state.settings.removeDeadSilence !== false) {
        const edgeKey = getTrackSilenceCacheKey(track);
        const cached = trackEdgeSilenceCache.get(edgeKey);
        if (cached && cached.effectiveStart > 0.05) {
          seekToEffectiveStart(elements.audio, cached.effectiveStart);
        }
        getOrAnalyzeTrackEdges(track, blobUrl, elements.audio).then(edges => {
          if (edges && edges.effectiveStart > 0.05 && state.isPlaying) {
            seekToEffectiveStart(elements.audio, edges.effectiveStart);
          }
        }).catch(() => {});
      }
      if ((state.settings.autoMixDuration || state.settings.crossfade || 0) > 0) {
        applyCrossfadeIn();
      }
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
        } else if (state.settings.removeDeadSilence !== false) {
          const edgeKey = getTrackSilenceCacheKey(track);
          const cached = trackEdgeSilenceCache.get(edgeKey);
          if (cached && cached.effectiveStart > 0.05) {
            seekToEffectiveStart(elements.audio, cached.effectiveStart);
          }
          getOrAnalyzeTrackEdges(track, blobUrl, elements.audio).then(edges => {
            if (edges && edges.effectiveStart > 0.05 && state.isPlaying) {
              seekToEffectiveStart(elements.audio, edges.effectiveStart);
            }
          }).catch(() => {});
        }
        if ((state.settings.autoMixDuration || state.settings.crossfade || 0) > 0) {
          applyCrossfadeIn();
        }
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
          const act = getActiveDeck();
          logPlaybackDiagnostic('source-assigned', { trackId: track.id, audioSrc });

          if (forceReload || act.src !== audioSrc) {
            act.src = audioSrc;
            try { act.load(); } catch (e) {}
          }
          if (customStartTime > 0) {
            let startSeeked = false;
            const applyInitialSeekAndPlay = () => {
              if (startSeeked || currentToken !== activePlayToken) return;
              startSeeked = true;
              try { act.currentTime = customStartTime; } catch (e) {}
              if (currentToken === activePlayToken && (state.isPlaying || state.isTrackLoading)) {
                act.play().then(() => {
                  if (currentToken === activePlayToken) {
                    state.isPlaying = true;
                    state.isTrackLoading = false;
                    updatePlayPauseButton();
                    logPlaybackDiagnostic('initial-seek-play-resolved', { trackId: track.id });
                  }
                }).catch(err => {
                  if (currentToken === activePlayToken && err.name !== 'AbortError') {
                    console.warn('Initial seek play error:', err);
                  }
                });
              }
            };
            if (act.readyState >= 1) {
              applyInitialSeekAndPlay();
            } else {
              act.addEventListener('loadedmetadata', applyInitialSeekAndPlay, { once: true });
              act.addEventListener('canplay', applyInitialSeekAndPlay, { once: true });
            }
          } else {
            if (act.readyState >= 1) {
              try { act.currentTime = 0; } catch (e) {}
            }
            if (state.settings.removeDeadSilence !== false) {
              const edgeKey = getTrackSilenceCacheKey(track);
              const cached = trackEdgeSilenceCache.get(edgeKey);
              if (cached && cached.effectiveStart > 0.05) {
                seekToEffectiveStart(act, cached.effectiveStart);
              }
              getOrAnalyzeTrackEdges(track, audioSrc, act).then(edges => {
                if (edges && edges.effectiveStart > 0.05 && (state.isPlaying || state.isTrackLoading)) {
                  seekToEffectiveStart(act, edges.effectiveStart);
                }
              }).catch(() => {});
            }
          }
          const onAudioReady = () => {
            if (currentToken === activePlayToken) {
              state.consecutivePlaybackErrors = 0;
              if (act.paused && (state.isPlaying || state.isTrackLoading)) {
                act.play().then(() => {
                  if (currentToken === activePlayToken) {
                    state.isPlaying = true;
                    state.isTrackLoading = false;
                    updatePlayPauseButton();
                  }
                }).catch(() => {});
              }
              schedulePreloadNextTrack(1500);
            }
          };
          act.addEventListener('playing', onAudioReady, { once: true });
          act.addEventListener('canplay', onAudioReady, { once: true });
          if ((state.settings.autoMixDuration || state.settings.crossfade || 0) > 0) {
            applyCrossfadeIn();
          } else {
            act.volume = state.isMuted ? 0 : state.volume;
          }

          if (customStartTime <= 0) {
            logPlaybackDiagnostic('play-invoked', { trackId: track.id });
            const playPromise = act.play();
            if (playPromise !== undefined) {
              playPromise.then(() => {
                if (currentToken === activePlayToken) {
                  state.isPlaying = true;
                  state.isTrackLoading = false;
                  updatePlayPauseButton();
                  logPlaybackDiagnostic('play-resolved', { trackId: track.id });
                }
              }).catch(err => {
                if (currentToken !== activePlayToken) return;
                logPlaybackDiagnostic('play-rejected', { trackId: track.id, errorName: err.name, errorMessage: err.message });
                if (err.name === 'AbortError') {
                  const retryPlay = () => {
                    if (currentToken === activePlayToken && act.paused) {
                      act.play().then(() => {
                        if (currentToken === activePlayToken) {
                          state.isPlaying = true;
                          state.isTrackLoading = false;
                          updatePlayPauseButton();
                          logPlaybackDiagnostic('abort-retry-play-resolved', { trackId: track.id });
                        }
                      }).catch(retryErr => {
                        logPlaybackDiagnostic('abort-retry-play-failed', { trackId: track.id, error: retryErr.message });
                      });
                    }
                  };
                  if (act.readyState >= 2) {
                    retryPlay();
                  } else {
                    act.addEventListener('canplay', retryPlay, { once: true });
                    act.addEventListener('loadeddata', retryPlay, { once: true });
                  }
                  return;
                }
              if (err.name === 'NotAllowedError') {
                console.warn('Autoplay prevented by browser:', err);
                state.isPlaying = false;
                state.isTrackLoading = false;
                updatePlayPauseButton();
                showToast('Tap play to start audio', '▶');
                return;
              }
              console.warn('Direct stream playback error, checking fallbacks:', err);
              if (streamUrl && act.src !== streamUrl) {
                act.src = streamUrl;
                try { act.load(); } catch (e) {}
                act.play().then(() => {
                  if (currentToken === activePlayToken) {
                    state.isPlaying = true;
                    state.isTrackLoading = false;
                    updatePlayPauseButton();
                  }
                }).catch(directErr => {
                  if (currentToken !== activePlayToken || directErr.name === 'AbortError') return;
                  console.warn('Stream proxy fallback failed:', directErr);
                  handlePlaybackStreamError(track);
                });
              } else if (isYtTrack) {
                // Secondary fallback to YouTube iframe if direct audio extraction fails
                const ytId = track.ytId || (track.id ? track.id.replace('yt_', '') : '');
                if (ytId && state.ytReady && state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
                  if (!isContentFilterAllowed(track)) {
                    showToast('Playback Blocked: MusiSurf strictly plays Music and Podcasts only.', '🚫');
                    return;
                  }
                  try {
                    state.activePlayerEngine = 'youtube';
                    try {
                      act.pause();
                      act.removeAttribute('src');
                    } catch (e) {}
                    state.ytPlayer.loadVideoById(ytId);
                    state.ytPlayer.setVolume(state.isMuted ? 0 : state.volume * 100);
                    state.ytPlayer.playVideo();
                    state.isPlaying = true;
                    state.isTrackLoading = false;
                    updatePlayPauseButton();
                  } catch (e) {
                    console.warn('YouTube fallback playback error:', e);
                    handlePlaybackStreamError(track);
                  }
                } else {
                  handlePlaybackStreamError(track);
                }
              } else {
                handlePlaybackStreamError(track);
              }
            });
          }
        }
      } else if (isYtTrack) {
          // Fallback directly to YouTube iframe player if no audioSrc
          const ytId = track.ytId || (track.id ? track.id.replace('yt_', '') : '');
          if (ytId && state.ytReady && state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
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
            state.isPlaying = true;
            state.isTrackLoading = false;
            updatePlayPauseButton();
          } else {
            handlePlaybackStreamError(track);
          }
        } else {
          handlePlaybackStreamError(track);
        }
      }
    }

    if (!state.isPlaying) {
      state.isTrackLoading = true;
    }
    updatePlayPauseButton();
    updateQueueDrawerUI();
    highlightPlayingTrackInTables(track.id);
    savePlaybackState();

    // Fetch synchronized lyrics with full track object
    loadLyricsForTrack(track);
  }

  function togglePlayPause() {
    // Synchronously resume AudioContext within user gesture loop to prevent sound hanging
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (e) {}

    if (window.MusiSurfPlayback && window.MusiSurfPlayback.coordinator && window.MusiSurfPlayback.coordinator.isNativeActive) {
      if (!state.currentTrack) {
        if (state.viewingPlaylistTracks && state.viewingPlaylistTracks.length > 0) {
          state.activePlaylistId = state.viewingPlaylistId;
          state.activePlaylistTracks = [...state.viewingPlaylistTracks];
          playTrack(state.viewingPlaylistTracks[0], state.viewingPlaylistTracks);
        } else if (state.activePlaylistTracks && state.activePlaylistTracks.length > 0) {
          playTrack(state.activePlaylistTracks[0], state.activePlaylistTracks);
        } else if (state.queue && state.queue.length > 0) {
          playTrack(state.queue[0]);
        }
        return;
      }
      window.MusiSurfPlayback.coordinator.togglePlayPause();
      return;
    }

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

    const currentDeck = getActiveDeck();

    // Determine actual playback status from the active engine
    const isActuallyPlaying = isYouTubeActive()
      ? (state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function' && state.ytPlayer.getPlayerState() === 1)
      : (currentDeck && !currentDeck.paused && !currentDeck.ended && currentDeck.currentTime > 0);

    if (state.isPlaying || isActuallyPlaying) {
      // Smooth fade-out pause or pause dual decks during active AutoMix
      state.isPlaying = false;
      if (state.isAutoMixing && autoMixState) {
        autoMixState.paused = true;
        autoMixState.pausedAt = performance.now();
        if (autoMixState.outgoingDeck) {
          try { autoMixState.outgoingDeck.pause(); } catch (e) {}
        }
        if (autoMixState.incomingDeck) {
          try { autoMixState.incomingDeck.pause(); } catch (e) {}
        }
      } else {
        fadeAudioOutAndPause(() => {
          if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') {
            try { state.ytPlayer.pauseVideo(); } catch (e) {}
          }
        });
      }
      updatePlayPauseButton();
    } else {
      logPlaybackDiagnostic('togglePlayPause-resume-initiated');

      if (state.isAutoMixing && autoMixState && autoMixState.paused) {
        const pauseDuration = performance.now() - (autoMixState.pausedAt || performance.now());
        autoMixState.startTime += pauseDuration;
        autoMixState.paused = false;
        if (autoMixState.outgoingDeck) {
          autoMixState.outgoingDeck.play().catch(() => {});
        }
        if (autoMixState.incomingDeck) {
          autoMixState.incomingDeck.play().catch(() => {});
        }
        state.isPlaying = true;
        updatePlayPauseButton();
        return;
      }

      const resumeTime = state.restoredResumeTime || 0;

      if (isYouTubeActive() || state.activePlayerEngine === 'youtube') {
        if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.playVideo === 'function') {
          try {
            state.ytPlayer.playVideo();
            state.isPlaying = true;
            state.isTrackLoading = false;
            updatePlayPauseButton();
          } catch (e) {}
        }
      } else {
        const act = getActiveDeck();
        const currentSrc = act ? (act.currentSrc || act.src || '') : '';
        const hasValidSrc = Boolean(currentSrc && currentSrc !== '' && !currentSrc.startsWith('data:audio') && !currentSrc.endsWith('/') && !act.error);
        const currentDeckTime = (act && Number.isFinite(act.currentTime) && act.currentTime > 0) ? act.currentTime : (getCurrentPlaybackTime() || 0);
        const resumeTime = state.restoredResumeTime || currentDeckTime || 0;

        // If active audio deck has no loaded source or is uninitialized (e.g. freshly restored after page refresh),
        // route to full authoritative playTrack with resume position!
        if (!hasValidSrc || act.readyState === 0 || act.error) {
          logPlaybackDiagnostic('togglePlayPause-delegating-to-playTrack', { resumeTime, hasValidSrc, readyState: act ? act.readyState : null });
          playTrack(state.currentTrack, state.queue, false, resumeTime, true);
          return;
        }

        // Clear any lingering fadeout timer and restore playback volume immediately
        if (crossfadeFadeInTimer) {
          clearInterval(crossfadeFadeInTimer);
          crossfadeFadeInTimer = null;
        }
        if (crossfadeFadeOutTimer) {
          clearInterval(crossfadeFadeOutTimer);
          crossfadeFadeOutTimer = null;
        }
        const masterVol = state.isMuted ? 0 : (state.volume || 0.8);
        act.volume = masterVol;

        // Immediately reflect playing state so controls show Pause button without freezing
        state.isPlaying = true;
        state.isTrackLoading = false;
        updatePlayPauseButton();

        logPlaybackDiagnostic('togglePlayPause-resume-play', { resumeTime, currentDeckTime });

        let resumeHandled = false;
        let resumeWatchdog = setTimeout(() => {
          if (!resumeHandled && (!state.isPlaying || act.paused)) {
            console.warn('Audio resume stalled after pause, executing seamless recovery reload');
            logPlaybackDiagnostic('togglePlayPause-resume-watchdog-triggered', { resumeTime });
            resumeHandled = true;
            cleanupResumeListeners();
            playTrack(state.currentTrack, state.queue, false, (act && act.currentTime > 0) ? act.currentTime : resumeTime, true);
          }
        }, 1500);

        function cleanupResumeListeners() {
          if (resumeWatchdog) {
            clearTimeout(resumeWatchdog);
            resumeWatchdog = null;
          }
          act.removeEventListener('playing', onResumeSuccess);
          act.removeEventListener('timeupdate', onResumeSuccess);
        }

        function onResumeSuccess() {
          if (resumeHandled) return;
          resumeHandled = true;
          cleanupResumeListeners();
          state.isPlaying = true;
          state.isTrackLoading = false;
          act.volume = masterVol;
          updatePlayPauseButton();
          logPlaybackDiagnostic('togglePlayPause-resume-success');
        }

        act.addEventListener('playing', onResumeSuccess, { once: true });
        act.addEventListener('timeupdate', onResumeSuccess, { once: true });

        const resumePromise = act.play();
        if (resumePromise !== undefined) {
          resumePromise.then(() => {
            onResumeSuccess();
          }).catch(err => {
            if (err.name === 'AbortError') return;
            if (resumeHandled) return;
            resumeHandled = true;
            cleanupResumeListeners();
            console.warn('Audio resume error, attempting full recovery playTrack:', err);
            logPlaybackDiagnostic('togglePlayPause-resume-failed', { error: err.message });
            playTrack(state.currentTrack, state.queue, false, (act && act.currentTime > 0) ? act.currentTime : resumeTime, true);
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

    // Toggle Play/Pause on Local Files Hero Play Button
    if (elements.playAllLocalBtn) {
      const isPlayingLocal = state.isPlaying && state.currentTrack && state.currentTrack.isLocal;
      elements.playAllLocalBtn.classList.toggle('is-playing', !!isPlayingLocal);
      const localPlay = elements.playAllLocalBtn.querySelector('.play-icon');
      const localPause = elements.playAllLocalBtn.querySelector('.pause-icon');
      const localText = document.getElementById('playAllLocalBtnText');
      if (localPlay && localPause) {
        localPlay.style.setProperty('display', isPlayingLocal ? 'none' : 'inline-block', 'important');
        localPause.style.setProperty('display', isPlayingLocal ? 'inline-block' : 'none', 'important');
      }
      if (localText) {
        localText.textContent = isPlayingLocal ? 'Pause' : 'Play';
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
      const isCurrentPlaylistPlaying = !!(
        state.isPlaying &&
        state.activePlaylistId &&
        state.viewingPlaylistId &&
        String(state.activePlaylistId) === String(state.viewingPlaylistId) &&
        (!state.currentTrack || viewingTracks.length === 0 || viewingTracks.some(t => String(t.id) === String(state.currentTrack.id)))
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
      const isThisPlPlaying = !!(
        state.isPlaying &&
        state.currentTrack &&
        String(state.activePlaylistId) === String(plId)
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

    // Sync MediaSession playbackState & background keep-alive for mobile & tab switching
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
      } catch (e) {}
    }
    if (state.isPlaying) {
      startBackgroundKeepAlive();
    } else {
      stopBackgroundKeepAlive();
    }

    if (state.currentView === 'lyrics') {
      updateLyricsEdgeGlowState();
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

    if (window.MusiSurfPlayback && window.MusiSurfPlayback.coordinator && window.MusiSurfPlayback.coordinator.isNativeActive) {
      try {
        showToast(`Downloading "${track.title}" for offline playback...`, '⬇');
        await window.MusiSurfPlayback.coordinator.downloadManager.download(track);
        addToDownloadedPlaylist(track);
        showToast(`✓ "${track.title}" downloaded for offline playback!`, '✓');
      } catch (err) {
        console.error('[DownloadManager Native] Error downloading song:', err);
        showToast('Download failed. Please check network connection.', '⚠️');
      }
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

  // Spotify-like Queue Functions: Add to Queue & Play Next
  function addToQueue(track) {
    if (!track) return;
    if (!state.currentTrack) {
      playTrack(track);
      showToast(`Playing "${track.title}"`, '▶');
      return;
    }
    state.userQueue.push(track);
    state.queue = [state.currentTrack, ...state.userQueue, ...state.contextQueue.slice(state.contextIndex + 1)];
    if (window.MusiSurfPlayback && window.MusiSurfPlayback.coordinator && window.MusiSurfPlayback.coordinator.isNativeActive) {
      window.MusiSurfPlayback.coordinator.queueManager.addToQueue(track);
    }
    updateQueueDrawerUI();
    showToast(`Added to queue: "${track.title}"`, '➕');
  }

  function playNext(track) {
    if (!track) return;
    if (!state.currentTrack) {
      playTrack(track);
      showToast(`Playing "${track.title}"`, '▶');
      return;
    }
    state.userQueue.unshift(track);
    state.queue = [state.currentTrack, ...state.userQueue, ...state.contextQueue.slice(state.contextIndex + 1)];
    if (window.MusiSurfPlayback && window.MusiSurfPlayback.coordinator && window.MusiSurfPlayback.coordinator.isNativeActive) {
      window.MusiSurfPlayback.coordinator.queueManager.playNext(track);
    }
    updateQueueDrawerUI();
    showToast(`Will play next: "${track.title}"`, '⏭');
  }

  function nextTrack() {
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
          showToast(`Playing: "${forwardEntry.track.title}"`, '⏭');
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
  }

  function prevTrack() {
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
          showToast(`Playing previous: "${targetEntry.track.title}"`, '⏮');
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
  }

  function onTrackEnded() {
    if (state.isCrossfading || state.isTrackLoading || state.isTransitioning) return;
    const completedTrack = state.currentTrack;
    logPlaybackDiag('TRACK_ENDED', `onTrackEnded fired for "${completedTrack?.title}"`, {
      id: completedTrack?.id,
      repeatMode: state.repeatMode
    });

    if (state.repeatMode === 'one' && completedTrack) {
      restartCurrentTrack('repeat-one');
      return;
    }
    advanceToNextTrack('track_ended', completedTrack?.id);
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

  let lastKnownPlaybackTime = 0;

  function getCurrentPlaybackTime() {
    if (window.MusiSurfPlayback && window.MusiSurfPlayback.coordinator && window.MusiSurfPlayback.coordinator.isNativeActive) {
      return window.MusiSurfPlayback.coordinator.getCurrentTime();
    }
    const act = (typeof getActiveDeck === 'function') ? getActiveDeck() : elements.audio;
    if (act && Number.isFinite(act.currentTime) && act.currentTime > 0) {
      return act.currentTime;
    }
    if (state.isTrackLoading) {
      return state.restoredResumeTime || 0;
    }

    let rawTime = null;

    // 1. Primary check based on active playback engine
    if (state.activePlayerEngine === 'youtube') {
      if (state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function') {
        try {
          const ytCur = state.ytPlayer.getCurrentTime();
          if (Number.isFinite(ytCur) && ytCur >= 0) rawTime = ytCur;
        } catch (e) {}
      }
    } else {
      if (Number.isFinite(elements.audio.currentTime) && elements.audio.currentTime >= 0) {
        rawTime = elements.audio.currentTime;
      }
    }

    // 2. Cross-engine fallbacks if primary reported null or 0
    if (rawTime === null || (rawTime === 0 && lastKnownPlaybackTime > 0.5)) {
      if (state.activePlayerEngine !== 'youtube' && state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function') {
        try {
          const pState = typeof state.ytPlayer.getPlayerState === 'function' ? state.ytPlayer.getPlayerState() : -1;
          if (pState === 1 || pState === 2 || pState === 3) {
            const ytCur = state.ytPlayer.getCurrentTime();
            if (Number.isFinite(ytCur) && ytCur > 0) {
              state.activePlayerEngine = 'youtube';
              rawTime = ytCur;
            }
          }
        } catch (e) {}
      } else if (state.activePlayerEngine === 'youtube' && !elements.audio.paused && elements.audio.currentTime > 0) {
        state.activePlayerEngine = 'audio';
        rawTime = elements.audio.currentTime;
      }
    }

    if (rawTime !== null && Number.isFinite(rawTime) && rawTime >= 0) {
      lastKnownPlaybackTime = rawTime;
      return rawTime;
    }

    return lastKnownPlaybackTime || 0;
  }

  function parseDurationToSeconds(val) {
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) return val;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.includes(':')) {
        const parts = trimmed.split(':').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          return parts[0] * 60 + parts[1];
        }
        if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
          return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
      }
      const num = Number(trimmed);
      if (Number.isFinite(num) && num > 0) return num;
    }
    return 0;
  }

  function getTotalDuration() {
    if (window.MusiSurfPlayback && window.MusiSurfPlayback.coordinator && window.MusiSurfPlayback.coordinator.isNativeActive) {
      const natDur = window.MusiSurfPlayback.coordinator.getDuration();
      if (Number.isFinite(natDur) && natDur > 0) return natDur;
    }
    // 1. Check all valid sources of duration
    const strDur = parseDurationToSeconds(state.currentTrack?.durationStr);
    const metaDur = parseDurationToSeconds(state.currentTrack?.duration);
    const labelDur = parseDurationToSeconds(elements.totalDurationLabel?.textContent) || parseDurationToSeconds(elements.mobTotalDuration?.textContent);

    // Realistic track durations (>15s) always take absolute precedence over short streamed chunk durations (like 8s)
    const validDurs = [strDur, metaDur, labelDur].filter(d => Number.isFinite(d) && d > 15);
    if (validDurs.length > 0) {
      const bestDur = Math.max(...validDurs);
      if (state.currentTrack && state.currentTrack.duration !== bestDur) {
        state.currentTrack.duration = bestDur;
        state.currentTrack.durationStr = formatTime(bestDur);
      }
      return bestDur;
    }

    // 2. Audio element duration - protect against partial streamed chunk durations (e.g. 8s from ytdl)
    const audioDur = Number(elements.audio?.duration) || 0;
    if (Number.isFinite(audioDur) && audioDur > 15 && audioDur !== Infinity) {
      return audioDur;
    }

    // 3. If YouTube player has duration
    if (state.ytPlayer && typeof state.ytPlayer.getDuration === 'function') {
      try {
        const dur = state.ytPlayer.getDuration();
        if (Number.isFinite(dur) && dur > 15) return dur;
      } catch (e) {}
    }

    // 4. Final fallback to any positive finite duration
    const anyDur = [strDur, metaDur, labelDur, audioDur].find(d => Number.isFinite(d) && d > 0 && d !== Infinity);
    if (anyDur) return anyDur;

    return 0;
  }

  function seekTo(seconds) {
    if (state.isAutoMixing) {
      cancelActiveAutoMix(true);
    }
    const total = getTotalDuration();
    const targetSeconds = Math.max(0, Math.min(total > 0 ? total : 99999, Number(seconds) || 0));
    lastKnownPlaybackTime = targetSeconds;

    if (window.MusiSurfPlayback && window.MusiSurfPlayback.coordinator && window.MusiSurfPlayback.coordinator.isNativeActive) {
      window.MusiSurfPlayback.coordinator.seek(targetSeconds);
      return;
    }

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
        const autoMixVal = typeof state.settings.autoMixDuration === 'number' ? state.settings.autoMixDuration : (state.settings.crossfade || 0);
        if (autoMixVal > 0 && total > 0 && (total - targetSeconds) > autoMixVal) {
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

    if (state.isAutoMixing && autoMixState) {
      autoMixState.masterVol = state.isMuted ? 0 : state.volume;
      const elapsed = performance.now() - autoMixState.startTime;
      const progress = Math.max(0, Math.min(1, elapsed / autoMixState.durationMs));
      const outGain = Math.cos(progress * 0.5 * Math.PI);
      const inGain = Math.sin(progress * 0.5 * Math.PI);
      if (autoMixState.outgoingDeck) autoMixState.outgoingDeck.volume = Math.max(0, Math.min(1, autoMixState.masterVol * outGain));
      if (autoMixState.incomingDeck) autoMixState.incomingDeck.volume = Math.max(0, Math.min(1, autoMixState.masterVol * inGain));
    } else {
      elements.audio.volume = state.isMuted ? 0 : state.volume;
    }
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

      if (state.isTrackLoading) {
        elements.currentTimeLabel.textContent = formatTime(state.restoredResumeTime || 0);
        if (elements.mobCurrentTime) elements.mobCurrentTime.textContent = formatTime(state.restoredResumeTime || 0);
        elements.progressFill.style.width = '0%';
        if (elements.mobProgressFill) elements.mobProgressFill.style.width = '0%';
        if (elements.miniPlayerFill) elements.miniPlayerFill.style.width = '0%';
        if (elements.miniplayerScrubberFill) elements.miniplayerScrubberFill.style.width = '0%';
        return;
      }

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
        if (isYouTubeActive() && state.isPlaying) {
          state.totalListenedSeconds = (state.totalListenedSeconds || 0) + 1;
          state._currentTrackListeningSeconds = (state._currentTrackListeningSeconds || 0) + 1;
          checkAndRecordSongPlayed(null);
          if (state.totalListenedSeconds % 5 === 0) {
            saveListeningStats();
          }
          updateSoundCapsuleUI();
        }
      }

      if (dur > 0 && Number.isFinite(dur)) {
        const pct = Math.max(0, Math.min(100, (cur / dur) * 100));
        elements.progressFill.style.width = `${pct}%`;
        if (elements.mobProgressFill) elements.mobProgressFill.style.width = `${pct}%`;
        if (elements.miniPlayerFill) elements.miniPlayerFill.style.width = `${pct}%`;

        // Update buffer bar for HTML5 audio
        if (elements.audio.buffered && elements.audio.buffered.length > 0) {
          try {
            const bufEnd = elements.audio.buffered.end(elements.audio.buffered.length - 1);
            elements.progressBuffer.style.width = `${Math.min(100, (bufEnd / dur) * 100)}%`;
          } catch (e) {}
        }
      } else {
        elements.progressFill.style.width = '0%';
        if (elements.mobProgressFill) elements.mobProgressFill.style.width = '0%';
        if (elements.miniPlayerFill) elements.miniPlayerFill.style.width = '0%';
      }

      // Check Equal-Power Crossfade & Background Deck Preloading
      checkPlaybackCrossfadeAndTransitions(cur, dur);

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
  // SYNCHRONIZED LYRICS ENGINE & SMART AUTO-TIMING CONVERTER
  // ==========================================================================
  // Request tracking & abort controller to prevent async race conditions
  state.currentLyricsRequestId = 0;
  state.lyricsAbortController = null;
  state.currentLyricsData = null;
  state.lyricsScriptMode = 'native'; // 'native' (Devanagari/Gurmukhi/Urdu) or 'latin'
  state.lyricsLoadingTimers = [];

  // Persistent Verified Lyrics Database (Client-Side LocalStorage, 250 items, 7-day TTL)
  const VERIFIED_LYRICS_STORAGE_KEY = 'musisurf_verified_lyrics_v3';
  const VERIFIED_LYRICS_MAX_ENTRIES = 250;
  const VERIFIED_LYRICS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Clear previous version storage keys on startup to ensure no stale/corrupted entries persist
  try {
    localStorage.removeItem('musisurf_verified_lyrics_v1');
    localStorage.removeItem('musisurf_verified_lyrics_v2');
  } catch (e) {}

  function getPersistentVerifiedLyrics(cacheKey, expectedArtist = null) {
    if (!cacheKey) return null;
    try {
      const raw = localStorage.getItem(VERIFIED_LYRICS_STORAGE_KEY);
      if (!raw) return null;
      const store = JSON.parse(raw);
      const entry = store[cacheKey];
      if (!entry || !entry.data) return null;

      // Anti-wrong-lyrics validation: Verify artist if present in entry
      if (expectedArtist) {
        if (!entry.data.artistName) {
          delete store[cacheKey];
          try { localStorage.setItem(VERIFIED_LYRICS_STORAGE_KEY, JSON.stringify(store)); } catch (e) {}
          return null;
        }
        const normExpected = expectedArtist.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normCand = entry.data.artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normExpected && normCand && !normExpected.includes(normCand) && !normCand.includes(normExpected)) {
          // Corrupt or mismatched entry detected: purge from client localStorage immediately
          delete store[cacheKey];
          try { localStorage.setItem(VERIFIED_LYRICS_STORAGE_KEY, JSON.stringify(store)); } catch (e) {}
          return null;
        }
      }

      if (Date.now() - (entry.timestamp || 0) > VERIFIED_LYRICS_TTL_MS) {
        delete store[cacheKey];
        try { localStorage.setItem(VERIFIED_LYRICS_STORAGE_KEY, JSON.stringify(store)); } catch (e) {}
        return null;
      }
      return entry.data;
    } catch (e) {
      return null;
    }
  }

  function setPersistentVerifiedLyrics(cacheKey, data) {
    if (!cacheKey || !data) return;
    try {
      const raw = localStorage.getItem(VERIFIED_LYRICS_STORAGE_KEY);
      let store = raw ? JSON.parse(raw) : {};
      const keys = Object.keys(store);
      if (keys.length >= VERIFIED_LYRICS_MAX_ENTRIES && !store[cacheKey]) {
        keys.sort((a, b) => (store[a].timestamp || 0) - (store[b].timestamp || 0));
        delete store[keys[0]];
      }
      store[cacheKey] = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(VERIFIED_LYRICS_STORAGE_KEY, JSON.stringify(store));
    } catch (e) {}
  }

  async function loadLyricsForTrack(trackOrTitle, maybeArtist, maybeOptions) {
    let trackObj = null;
    let title = '';
    let artist = '';
    let album = '';
    let duration = 0;
    let trackId = '';

    if (trackOrTitle && typeof trackOrTitle === 'object') {
      trackObj = trackOrTitle;
      title = trackObj.title || '';
      artist = trackObj.artist || '';
      album = trackObj.album || '';
      duration = Math.round(trackObj.duration || parseDurationToSeconds(trackObj.durationStr) || getTotalDuration() || 0);
      trackId = trackObj.id || (title + '__' + artist);
    } else {
      title = trackOrTitle || (state.currentTrack?.title) || '';
      artist = maybeArtist || (state.currentTrack?.artist) || '';
      album = state.currentTrack?.album || '';
      duration = Math.round(state.currentTrack?.duration || parseDurationToSeconds(state.currentTrack?.durationStr) || getTotalDuration() || 0);
      trackId = state.currentTrack?.id || (title + '__' + artist);
    }

    if (!title) {
      if (elements.lyricsLoading) elements.lyricsLoading.style.display = 'none';
      return;
    }

    // Abort previous in-flight lyrics request (prevent race conditions when skipping)
    if (state.lyricsAbortController) {
      try { state.lyricsAbortController.abort(); } catch (e) {}
    }
    state.lyricsAbortController = new AbortController();
    const abortSignal = state.lyricsAbortController.signal;
    const reqId = ++state.currentLyricsRequestId;
    const targetEpoch = state.trackEpoch || 0;

    // Reset state & UI immediately (clean previous song's lyrics immediately)
    elements.lyricsLoading.style.display = 'flex';
    const loadingP = elements.lyricsLoadingText || elements.lyricsLoading.querySelector('p');
    if (loadingP) loadingP.textContent = 'Checking saved verified lyrics...';

    elements.lyricsLinesContainer.innerHTML = '';
    state.lyrics = [];
    state.hasSyncedLyrics = false;
    state.activeLyricIndex = -1;
    state.currentLyricsData = null;
    state.currentLyricsTrackId = trackId;
    updateMobileLyricsPreview(-3);
    resetLyricsScrollToTop(true);

    if (elements.lyricsStatusBadge) {
      elements.lyricsStatusBadge.style.display = 'none';
      elements.lyricsStatusBadge.textContent = '';
    }
    if (elements.lyricsScriptToggleBtn) {
      elements.lyricsScriptToggleBtn.style.display = 'none';
    }
    if (elements.lyricsSyncControls) {
      elements.lyricsSyncControls.style.display = 'none';
    }

    // Update Hero Art & Meta immediately to match currently requested song
    if (elements.lyricsTrackTitle) elements.lyricsTrackTitle.textContent = title;
    if (elements.lyricsTrackArtist) elements.lyricsTrackArtist.textContent = artist;
    if (elements.lyricsAlbumCover) {
      elements.lyricsAlbumCover.onerror = function() {
        if (state.currentTrack?.id === trackId) {
          this.onerror = null;
          this.src = DEFAULT_ALBUM_ART;
        }
      };
      elements.lyricsAlbumCover.src = trackObj?.image || state.currentTrack?.image || DEFAULT_ALBUM_ART;
      elements.lyricsAlbumCover.style.display = 'block';
    }

    // Check memory cache or persistent verified local store first
    const cacheKey = `${title.toLowerCase().trim()}___${artist.toLowerCase().trim()}`;
    let cachedData = (state.lyricsCache && state.lyricsCache[cacheKey]) || getPersistentVerifiedLyrics(cacheKey, artist);
    if (cachedData && cachedData.artistName && artist) {
      const normExp = artist.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normCand = cachedData.artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normExp && normCand && !normExp.includes(normCand) && !normCand.includes(normExp)) {
        if (state.lyricsCache) delete state.lyricsCache[cacheKey];
        cachedData = null;
      }
    }
    if (cachedData) {
      if (!state.lyricsCache) state.lyricsCache = {};
      state.lyricsCache[cacheKey] = cachedData;
      // Guard: Only render cached lyrics if STILL the current active track and epoch
      if (targetEpoch === state.trackEpoch && state.currentTrack?.id === trackId) {
        if (state.lyricsLoadingTimers) {
          state.lyricsLoadingTimers.forEach(id => clearTimeout(id));
          state.lyricsLoadingTimers = [];
        }
        elements.lyricsLoading.style.display = 'none';
        if (cachedData.syncedLyrics) {
          state.currentLyricsData = cachedData;
          state.rawSyncedLyrics = cachedData.syncedLyrics;
          const parsed = parseLrc(cachedData.syncedLyrics, (state.lyricsAutoIntroOffset || 0) + (state.lyricsManualOffset || 0));
          renderLyricsLines(parsed, cachedData.language, cachedData.script, cachedData);
          return;
        } else if (cachedData.plainLyrics) {
          state.currentLyricsData = cachedData;
          renderPlainLyrics(cachedData.plainLyrics, cachedData.language, cachedData.script, cachedData);
          return;
        }
      }
    }

    // Offline check
    if (!navigator.onLine) {
      if (targetEpoch === state.trackEpoch && state.currentTrack?.id === trackId) {
        elements.lyricsLoading.style.display = 'none';
        elements.lyricsLinesContainer.innerHTML = `
          <div class="lyrics-offline-state" style="text-align: center; color: var(--text-secondary); padding: 80px 20px;">
            <div style="width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 50%; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); display: flex; align-items: center; justify-content: center; color: var(--accent-cyan, #38bdf8);">
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
            <p style="font-size: 0.92rem; color: var(--text-secondary); max-width: 380px; margin: 0 auto;">Live lyrics stream from verified sources. Connect to internet to sing along.</p>
          </div>
        `;
      }
      return;
    }

    // Cancel previous loading step timers & setup progressive discovery feedback
    if (state.lyricsLoadingTimers && state.lyricsLoadingTimers.length) {
      state.lyricsLoadingTimers.forEach(id => clearTimeout(id));
    }
    state.lyricsLoadingTimers = [];

    const setLyricsStatusText = (text) => {
      if (elements.lyricsLoadingText) {
        elements.lyricsLoadingText.textContent = text;
      } else if (elements.lyricsLoading) {
        const p = elements.lyricsLoading.querySelector('p');
        if (p) p.textContent = text;
      }
    };

    setLyricsStatusText('Checking saved verified lyrics...');
    state.lyricsLoadingTimers.push(setTimeout(() => setLyricsStatusText('Searching primary synchronized providers...'), 600));
    state.lyricsLoadingTimers.push(setTimeout(() => setLyricsStatusText('Checking regional and verified catalog...'), 1800));
    state.lyricsLoadingTimers.push(setTimeout(() => setLyricsStatusText('Scanning additional verified sources...'), 3200));
    state.lyricsLoadingTimers.push(setTimeout(() => setLyricsStatusText('Verifying song identity & synchronization...'), 4500));

    try {
      let queryStr = `track=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
      if (album) queryStr += `&album=${encodeURIComponent(album)}`;
      if (duration > 0) queryStr += `&duration=${duration}`;

      const res = await fetch(`/api/lyrics?${queryStr}`, { signal: abortSignal });
      const data = await res.json();

      // Clear progressive status timers
      if (state.lyricsLoadingTimers && state.lyricsLoadingTimers.length) {
        state.lyricsLoadingTimers.forEach(id => clearTimeout(id));
        state.lyricsLoadingTimers = [];
      }

      // Guard against stale response (network delay over hotspot)
      if (reqId !== state.currentLyricsRequestId || targetEpoch !== state.trackEpoch || (state.currentTrack && state.currentTrack.id !== trackId)) {
        logPlaybackDiag('STALE_LYRICS', `Discarded stale lyrics response for "${title}"`, { reqId, targetEpoch, trackId });
        return;
      }

      elements.lyricsLoading.style.display = 'none';

      if (data && data.success) {
        state.currentLyricsData = data;
        if (!state.lyricsCache) state.lyricsCache = {};
        state.lyricsCache[cacheKey] = data;
        setPersistentVerifiedLyrics(cacheKey, data);

        if (data.syncedLyrics) {
          state.rawSyncedLyrics = data.syncedLyrics;
          const trackDur = duration || Math.round(getTotalDuration() || 0);
          const lrcDur = data.duration ? parseInt(data.duration, 10) : 0;
          let autoIntroOffset = 0;
          if (trackDur > 0 && lrcDur > 0) {
            const delta = trackDur - lrcDur;
            if (delta > 2 && delta < 60) {
              autoIntroOffset = delta;
            }
          }
          state.lyricsAutoIntroOffset = autoIntroOffset;

          const trackKey = trackId;
          let manualOffset = 0;
          try {
            const saved = localStorage.getItem(`musisurf_lyrics_offset_${trackKey}`);
            if (saved !== null) manualOffset = parseFloat(saved) || 0;
          } catch (e) {}
          state.lyricsManualOffset = manualOffset;
          updateLyricsSyncControlsUI();

          const parsed = parseLrc(data.syncedLyrics, autoIntroOffset + manualOffset);
          if (parsed.length > 0) {
            renderLyricsLines(parsed, data.language, data.script, data);
            return;
          }
        }

        if (data.plainLyrics) {
          renderPlainLyrics(data.plainLyrics, data.language, data.script, data);
          return;
        }
      }

      // No verified lyrics found across providers -> Honest Unavailable State
      renderLyricsUnavailable(title, artist, trackId);
    } catch (err) {
      if (state.lyricsLoadingTimers && state.lyricsLoadingTimers.length) {
        state.lyricsLoadingTimers.forEach(id => clearTimeout(id));
        state.lyricsLoadingTimers = [];
      }
      if (err.name === 'AbortError') return;
      console.warn('Lyrics fetch failed:', err);
      if (reqId !== state.currentLyricsRequestId || targetEpoch !== state.trackEpoch || (state.currentTrack && state.currentTrack.id !== trackId)) return;
      elements.lyricsLoading.style.display = 'none';
      renderLyricsUnavailable(title, artist, trackId);
    }
  }

  function updateLyricsSyncControlsUI() {
    if (!elements.lyricsSyncLabel) return;
    const total = (state.lyricsAutoIntroOffset || 0) + (state.lyricsManualOffset || 0);
    const sign = total > 0 ? '+' : '';
    elements.lyricsSyncLabel.textContent = `Sync: ${sign}${total.toFixed(1)}s`;
  }

  function adjustLyricsOffset(delta) {
    if (!state.rawSyncedLyrics) return;
    state.lyricsManualOffset = Number(((state.lyricsManualOffset || 0) + delta).toFixed(1));
    const trackKey = state.currentTrack?.id || (state.currentTrack?.title + '_' + state.currentTrack?.artist);
    try {
      localStorage.setItem(`musisurf_lyrics_offset_${trackKey}`, state.lyricsManualOffset.toString());
    } catch (e) {}
    updateLyricsSyncControlsUI();
    const parsed = parseLrc(state.rawSyncedLyrics, (state.lyricsAutoIntroOffset || 0) + state.lyricsManualOffset);
    if (parsed.length > 0) {
      state.lyrics = parsed;
      state.hasSyncedLyrics = true;
      renderLyricsLines(parsed, state.currentLyricsData?.language, state.currentLyricsData?.script, state.currentLyricsData);
    }
  }

  function resetLyricsOffset() {
    if (!state.rawSyncedLyrics) return;
    state.lyricsManualOffset = 0;
    const trackKey = state.currentTrack?.id || (state.currentTrack?.title + '_' + state.currentTrack?.artist);
    try {
      localStorage.removeItem(`musisurf_lyrics_offset_${trackKey}`);
    } catch (e) {}
    updateLyricsSyncControlsUI();
    const parsed = parseLrc(state.rawSyncedLyrics, state.lyricsAutoIntroOffset || 0);
    if (parsed.length > 0) {
      state.lyrics = parsed;
      state.hasSyncedLyrics = true;
      renderLyricsLines(parsed, state.currentLyricsData?.language, state.currentLyricsData?.script, state.currentLyricsData);
    }
  }

  function parseLrc(lrcText, extraOffset = 0) {
    const lines = lrcText.split('\n');
    const result = [];
    const timeReg = /\[(\d{2}):(\d{2})\.?(\d{2,3})?\]/g;
    const wordTimeReg = /<(\d{2}):(\d{2})\.?(\d{2,3})?>/g;
    let offset = 0;
    const offsetMatch = lrcText.match(/\[offset:\s*([+-]?\d+)\]/i);
    if (offsetMatch) {
      offset = (parseInt(offsetMatch[1], 10) || 0) / 1000;
    }
    const combinedOffset = offset + (Number(extraOffset) || 0);

    for (const line of lines) {
      const matches = [...line.matchAll(timeReg)];
      let rawText = line.replace(timeReg, '').replace(/^[\[(][^\])]+[\])]\s*/, '').trim();

      if (rawText && !/^[\[(].+[\])]$/.test(rawText) && !/^(verse|chorus|bridge|outro|intro|hook|मुखड़ा|अंतरा|कोरस|समाप्ति|स्थायी)\s*\d*[:\-]?$/i.test(rawText)) {
        // Extract enhanced word timestamps if available (e.g. <00:12.34> word)
        let wordsWithTime = null;
        if (wordTimeReg.test(rawText)) {
          wordTimeReg.lastIndex = 0;
          const wordParts = rawText.split(/(<\d{2}:\d{2}\.?\d{0,3}>)/).filter(Boolean);
          wordsWithTime = [];
          let curWordTime = null;
          for (const part of wordParts) {
            const wm = part.match(/<(\d{2}):(\d{2})\.?(\d{2,3})?>/);
            if (wm) {
              const m = parseInt(wm[1], 10);
              const s = parseInt(wm[2], 10);
              const ms = wm[3] ? parseInt(wm[3].padEnd(3, '0').slice(0, 3), 10) : 0;
              curWordTime = Math.max(0, m * 60 + s + (ms / 1000) + combinedOffset);
            } else if (part.trim()) {
              wordsWithTime.push({
                text: part.trim(),
                time: curWordTime
              });
            }
          }
        }

        const cleanText = rawText.replace(wordTimeReg, '').trim();

        for (const match of matches) {
          const mins = parseInt(match[1], 10);
          const secs = parseInt(match[2], 10);
          const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
          const time = Math.max(0, mins * 60 + secs + (ms / 1000) + combinedOffset);
          result.push({
            time,
            text: cleanText,
            wordsWithTime: (wordsWithTime && wordsWithTime.length > 0) ? wordsWithTime : null
          });
        }
      }
    }

    result.sort((a, b) => a.time - b.time);
    return result;
  }

  function renderLyricsLines(lyrics, language = 'English', script = 'Latin', data = null) {
    elements.lyricsLinesContainer.innerHTML = '';
    const sampleText = lyrics.map(l => l.text).slice(0, 5).join(' ');
    const hasUrduScript = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(sampleText);
    const isRtl = hasUrduScript;
    const langCode = (hasUrduScript ? 'ur' : (language === 'Hindi' ? 'hi' : (language === 'Punjabi' ? 'pa' : 'en')));

    if (isRtl) {
      elements.lyricsLinesContainer.setAttribute('dir', 'rtl');
      elements.lyricsLinesContainer.classList.add('rtl-lyrics');
    } else {
      elements.lyricsLinesContainer.removeAttribute('dir');
      elements.lyricsLinesContainer.classList.remove('rtl-lyrics');
    }

    state.lyrics = lyrics;
    state.hasSyncedLyrics = true;

    // Synchronized Badge removed per user instruction
    if (elements.lyricsStatusBadge) {
      elements.lyricsStatusBadge.textContent = '';
      elements.lyricsStatusBadge.style.display = 'none';
    }

    if (elements.lyricsScriptToggleBtn) {
      elements.lyricsScriptToggleBtn.style.display = 'none';
    }

    if (elements.lyricsSyncControls) {
      elements.lyricsSyncControls.style.display = 'flex';
    }

    lyrics.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'lyric-line' + (isRtl ? ' rtl-lyrics' : '');
      div.dataset.index = idx;
      div.dataset.time = item.time;
      div.dataset.lang = langCode;
      if (isRtl) div.setAttribute('dir', 'rtl');

      const tokens = item.text.split(/(\s+)/);
      let wordIdx = 0;
      div.innerHTML = tokens.map(tok => {
        if (/^\s+$/.test(tok)) return tok;
        const wHtml = `<span class="lyric-word" data-w="${wordIdx}">${escapeHtml(tok)}</span>`;
        wordIdx++;
        return wHtml;
      }).join('');
      div.dataset.totalWords = wordIdx;

      div.addEventListener('click', () => {
        seekTo(item.time);
      });
      elements.lyricsLinesContainer.appendChild(div);
    });

    state.activeLyricIndex = -1;
    updateMobileLyricsPreview(0);
    syncLyricsWithTime(getCurrentPlaybackTime());
  }

  function renderPlainLyrics(plainText, language = 'English', script = 'Latin', data = null) {
    elements.lyricsLinesContainer.innerHTML = '';
    state.lyrics = [];
    state.hasSyncedLyrics = false;
    state.activeLyricIndex = -1;

    const hasUrduScript = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(plainText || '');
    const isRtl = hasUrduScript;
    const langCode = (hasUrduScript ? 'ur' : (language === 'Hindi' ? 'hi' : (language === 'Punjabi' ? 'pa' : 'en')));

    if (isRtl) {
      elements.lyricsLinesContainer.setAttribute('dir', 'rtl');
      elements.lyricsLinesContainer.classList.add('rtl-lyrics');
    } else {
      elements.lyricsLinesContainer.removeAttribute('dir');
      elements.lyricsLinesContainer.classList.remove('rtl-lyrics');
    }

    if (elements.lyricsSyncControls) {
      elements.lyricsSyncControls.style.display = 'none';
    }

    // Plain Lyrics Badge removed per user instruction
    if (elements.lyricsStatusBadge) {
      elements.lyricsStatusBadge.textContent = '';
      elements.lyricsStatusBadge.style.display = 'none';
    }

    if (elements.lyricsScriptToggleBtn) {
      elements.lyricsScriptToggleBtn.style.display = 'none';
    }

    const container = document.createElement('div');
    container.className = 'lyrics-plain-container' + (isRtl ? ' rtl-lyrics' : '');
    if (isRtl) container.setAttribute('dir', 'rtl');

    const pre = document.createElement('div');
    pre.className = 'lyrics-plain-text' + (isRtl ? ' rtl-lyrics' : '');
    pre.dataset.lang = langCode;
    if (isRtl) pre.setAttribute('dir', 'rtl');
    pre.textContent = plainText;
    container.appendChild(pre);

    elements.lyricsLinesContainer.appendChild(container);
    state.currentLyricsData = data || { plainLyrics: plainText, language, script };
    updateMobileLyricsPreview(-1);
    resetLyricsScrollToTop(true);
  }

  function renderLyricsUnavailable(title, artist, trackId) {
    elements.lyricsLinesContainer.innerHTML = '';
    state.lyrics = [];
    state.hasSyncedLyrics = false;
    state.activeLyricIndex = -1;
    state.currentLyricsData = null;
    resetLyricsScrollToTop(true);

    if (elements.lyricsSyncControls) elements.lyricsSyncControls.style.display = 'none';
    if (elements.lyricsStatusBadge) elements.lyricsStatusBadge.style.display = 'none';
    if (elements.lyricsScriptToggleBtn) elements.lyricsScriptToggleBtn.style.display = 'none';

    const box = document.createElement('div');
    box.className = 'lyrics-unavailable-box';
    box.innerHTML = `
      <div class="lyrics-unavailable-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
          <line x1="2" y1="2" x2="22" y2="22" stroke-width="2.2" />
        </svg>
      </div>
      <h3 class="lyrics-unavailable-title">Lyrics aren't available for this track yet</h3>
      <p class="lyrics-unavailable-sub">We couldn't find verified lyrics for "${escapeHtml(title)}" by ${escapeHtml(artist)}.</p>
      <button class="lyrics-contribute-btn" id="lyricsContributeBtn" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Lyrics
      </button>
    `;

    const contributeBtn = box.querySelector('#lyricsContributeBtn');
    if (contributeBtn) {
      contributeBtn.addEventListener('click', () => {
        openContributeLyricsModal(title, artist);
      });
    }

    elements.lyricsLinesContainer.appendChild(box);
    updateMobileLyricsPreview(-2);
  }

  function toggleLyricsScript() {
    if (!state.currentLyricsData || !state.currentLyricsData.hasDevanagariAlt) return;
    const isCurrentlyLatin = state.lyricsScriptMode === 'latin';
    state.lyricsScriptMode = isCurrentlyLatin ? 'native' : 'latin';

    const d = state.currentLyricsData;
    if (d.syncedLyrics) {
      const activeLrc = state.lyricsScriptMode === 'latin'
        ? (d.romanizedSyncedLyrics || d.syncedLyrics)
        : (d.syncedLyrics);
      const parsed = parseLrc(activeLrc, (state.lyricsAutoIntroOffset || 0) + (state.lyricsManualOffset || 0));
      renderLyricsLines(parsed, d.language, state.lyricsScriptMode === 'latin' ? 'Latin' : 'Devanagari', d);
    } else if (d.plainLyrics) {
      const activePlain = state.lyricsScriptMode === 'latin'
        ? (d.romanizedPlainLyrics || d.plainLyrics)
        : (d.plainLyrics);
      renderPlainLyrics(activePlain, d.language, state.lyricsScriptMode === 'latin' ? 'Latin' : 'Devanagari', d);
    }
  }

  function openContributeLyricsModal(title, artist) {
    if (!elements.contributeLyricsModal) return;
    if (elements.contributeTrackInput) elements.contributeTrackInput.value = title || state.currentTrack?.title || '';
    if (elements.contributeArtistInput) elements.contributeArtistInput.value = artist || state.currentTrack?.artist || '';
    if (elements.contributeLyricsText) elements.contributeLyricsText.value = '';
    elements.contributeLyricsModal.style.display = 'flex';
  }

  function updateMobileLyricsPreview(activeIdx = -1) {
    const container = document.getElementById('mobLyricsPreviewLines');
    if (!container) return;

    if (activeIdx === -3) {
      container.innerHTML = '<div class="mob-lyrics-preview-placeholder">Loading lyrics preview...</div>';
      return;
    }
    if (activeIdx === -2) {
      container.innerHTML = '<div class="mob-lyrics-preview-placeholder">Lyrics aren\'t available for this track yet</div>';
      return;
    }

    if (state.hasSyncedLyrics && state.lyrics && state.lyrics.length > 0) {
      const total = state.lyrics.length;
      let currentActive = activeIdx >= 0 ? activeIdx : 0;
      let start = Math.max(0, currentActive - 1);
      if (start + 4 > total) {
        start = Math.max(0, total - 4);
      }
      const end = Math.min(total, start + 4);
      const slice = state.lyrics.slice(start, end);

      container.innerHTML = slice.map((item, i) => {
        const actualIdx = start + i;
        const isActive = actualIdx === currentActive && activeIdx >= 0;
        return `<div class="mob-lyrics-preview-line ${isActive ? 'active' : ''}">${escapeHtml(item.text)}</div>`;
      }).join('');
    } else if (state.currentLyricsData && state.currentLyricsData.plainLyrics) {
      const rawLines = state.currentLyricsData.plainLyrics.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('['));
      const slice = rawLines.slice(0, 4);
      if (slice.length > 0) {
        container.innerHTML = slice.map((line, i) => `<div class="mob-lyrics-preview-line ${i === 0 ? 'active' : ''}">${escapeHtml(line)}</div>`).join('');
      } else {
        container.innerHTML = '';
      }
    } else {
      container.innerHTML = '';
    }
  }

  function syncLyricsWithTime(currentTime) {
    if (!state.hasSyncedLyrics || !state.lyrics || state.lyrics.length === 0) return;

    // Slight pre-roll (0.15s) for natural human reading alignment
    const lyricClock = (Number(currentTime) || 0) + 0.15;
    let activeIdx = -1;
    for (let i = 0; i < state.lyrics.length; i++) {
      if (lyricClock >= state.lyrics[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }

    if (activeIdx !== state.activeLyricIndex) {
      state.activeLyricIndex = activeIdx;
      updateMobileLyricsPreview(activeIdx);
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
          lineEl.querySelectorAll('.lyric-word').forEach(w => w.classList.remove('singing', 'glowing', 'sung'));
        } else {
          lineEl.classList.remove('active', 'passed');
          lineEl.querySelectorAll('.lyric-word').forEach(w => w.classList.remove('singing', 'glowing', 'sung'));
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

    // Word-by-Word Live Glow Karaoke Engine (Desktop & Mobile)
    if (activeIdx >= 0 && state.lyrics[activeIdx]) {
      const activeLineEl = elements.lyricsLinesContainer.querySelector(`.lyric-line[data-index="${activeIdx}"]`);
      if (activeLineEl) {
        const item = state.lyrics[activeIdx];
        const words = activeLineEl.querySelectorAll('.lyric-word');
        const numWords = words.length;

        if (item.wordsWithTime && item.wordsWithTime.length > 0) {
          item.wordsWithTime.forEach((wData, wI) => {
            const wEl = words[wI];
            if (!wEl) return;
            const nextWTime = (wI + 1 < item.wordsWithTime.length) ? item.wordsWithTime[wI + 1].time : (wData.time + 1.2);
            if (wData.time != null && lyricClock >= wData.time) {
              if (lyricClock < nextWTime) {
                wEl.classList.add('singing', 'glowing');
                wEl.classList.remove('sung');
              } else {
                wEl.classList.add('sung', 'glowing');
                wEl.classList.remove('singing');
              }
            } else {
              wEl.classList.remove('singing', 'glowing', 'sung');
            }
          });
        } else if (numWords > 0) {
          // Smooth progressive word interpolation across line duration
          const curLineTime = item.time;
          const nextLineTime = (activeIdx + 1 < state.lyrics.length) ? state.lyrics[activeIdx + 1].time : (curLineTime + 4.5);
          const lineDuration = Math.max(0.6, Math.min(7.0, nextLineTime - curLineTime));
          const lineElapsed = Math.max(0, lyricClock - curLineTime);
          const lineProgress = Math.max(0, Math.min(1, lineElapsed / lineDuration));

          const currentWordFloat = lineProgress * numWords;
          const currentWordIdx = Math.floor(currentWordFloat);

          words.forEach((wEl, wI) => {
            if (wI < currentWordIdx) {
              wEl.classList.add('sung', 'glowing');
              wEl.classList.remove('singing');
            } else if (wI === currentWordIdx) {
              wEl.classList.add('singing', 'glowing');
              wEl.classList.remove('sung');
            } else {
              wEl.classList.remove('singing', 'glowing', 'sung');
            }
          });
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
          grad.addColorStop(0, '#0284c7');
          grad.addColorStop(0.5, '#38bdf8');
          grad.addColorStop(1, '#ec4899');

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

  // Strict Devotional, Religious & AI-Slop Filter (User Rule: Never show bhajans, qawwali, or AI-slop songs on homepage)
  const DEVOTIONAL_KEYWORDS = [
    // Hindu Devotional / Bhakti / Aarti / Chalisa
    'bhajan', 'bhajans', 'aarti', 'aarati', 'arti', 'chalisa', 'stotram', 'stotra',
    'stuti', 'mantra', 'shloka', 'sloka', 'ashtakam', 'sivastakam', 'shivastakam',
    'katha', 'satsang', 'kirtan', 'keertan', 'dhun', 'bhakti', 'devotional',
    'tulsi vivah', 'tulsi माता', 'tulsi pooja', 'tulsi aarti', 'tulsa ki aayi',
    'shiv tandav', 'hanuman chalisa', 'mata rani', 'khatu shyam', 'har har shambhu',
    'om namah shivay', 'jai ganesh', 'jai shree ram', 'ram siya ram', 'ram aayenge',
    'krishna bhajan', 'shyam teri bansi', 'radha rani bhajan', 'durga aarti',
    'laxmi aarti', 'ganesh aarti', 'bholenath bhajan', 'amritwani', 'vrindavan dham',
    'shri krishna', 'govind', 'gopala', 'radhe radhe', 'hare rama', 'hare krishna',

    // Islamic Devotional / Qawwali / Naat / Hamd / Dua
    'qawwali', 'qawali', 'kawwali', 'kawali', 'naat', 'naat sharif', 'hamd',
    'duaa', 'dua', 'ya allah', 'allah', 'khwaja', 'ajmer sharif', 'pir', 'peer',
    'sufiana kalam', 'kalam', 'manqabat', 'marsiya', 'nohay', 'tasbeeh',
    'mere aansuon', 'sada sun le', 'dil ki duaa', 'ya nabi', 'subhanallah', 'alhamdulillah',

    // Sikh Devotional
    'gurbani', 'shabad', 'waheguru', 'ardas', 'simran', 'japji sahib', 'rehras sahib',
    'sukhmani sahib', 'darbar sahib', 'golden temple',

    // Christian Devotional
    'christian prayer', 'gospel song', 'jesus song', 'yeshu bhajan', 'masih song',

    // AI Slop & Fake Compilation Keywords
    'best qawwali 202', 'best bhajan 202', 'superhit qawwali', 'superhit bhajan',
    'top 10 qawwali', 'top 10 bhajan', 'ai cover', 'ai generated', 'ai song',
    'ai voice', 'reels viral audio', 'status video'
  ];

  const DEVOTIONAL_ARTISTS = [
    'bhajan', 'bhakti', 'bajao bhakti', 't-series bhakti', 'bhajan india',
    'shemaroo bhakti', 'spiritual', 'iskcon', 'divine chants', 'anup jalota',
    'anuradha paudwal - devotional', 'lakhbir singh lakha', 'kanhiya mittal',
    'the quantum souls', 'fan of', 'fans of', 'tribute to', 'ai cover', 'ai generated',
    'suno', 'udio', 'soundraw', 'afternight vibes', 'qawwali junction'
  ];

  const DEVOTIONAL_DEVANAGARI = /(भजन|आरती|चालीसा|स्तोत्र|स्तुति|मंत्र|श्लोक|कथा|कीर्तन|धुन|भक्ति|तुलसी|हनुमान|माता रानी|खाटू श्याम|भोलेनाथ|कव्वाली|नात|दुआ|अल्लाह|ख्वाजा|सदा सुन ले|आंसुओं|मदीना|मक्का)/i;

  function isDevotionalOrBhajan(track) {
    if (!track) return false;
    const title = (track.title || '').toLowerCase();
    const artist = (track.artist || '').toLowerCase();
    const album = (track.album || '').toLowerCase();
    const text = `${title} ${artist} ${album}`;

    // 1. AI Slop & Fake Fan Mill Filter (e.g. "Fan Of Nusrat Fateh Ali Khan", "AI Cover")
    if (/^(?:fan|fans)\s+of\b/i.test(artist) || /\b(?:tribute to|ai cover|ai music|ai voice|ai version)\b/i.test(artist)) {
      return true;
    }

    // 2. Devanagari Devotional Regex
    if (DEVOTIONAL_DEVANAGARI.test(track.title || '') || DEVOTIONAL_DEVANAGARI.test(track.artist || '')) {
      return true;
    }

    // 3. Keywords in Title, Artist, Album
    for (const kw of DEVOTIONAL_KEYWORDS) {
      if (text.includes(kw)) return true;
    }

    // 4. Artist Match
    for (const art of DEVOTIONAL_ARTISTS) {
      if (artist.includes(art)) return true;
    }

    return false;
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
      if (!t || (!t.audioUrl && !t.streamUrl) || isDevotionalOrBhajan(t)) continue;
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

  // ==========================================================================
  // Daily Trending Hindi Song Homepage Feature Engine
  // ==========================================================================
  async function loadDailyTrendingHindiSong() {
    if (!elements.trendingHindiCard) return;

    try {
      const res = await fetch('/api/trending/daily');
      if (!res.ok) {
        if (elements.trendingHindiSection) elements.trendingHindiSection.style.display = 'none';
        return;
      }
      const json = await res.json();
      if (!json.success || !json.data) {
        if (elements.trendingHindiSection) elements.trendingHindiSection.style.display = 'none';
        return;
      }

      const song = json.data;
      state.dailyTrendingHindiSong = song;

      // Format date in Asia/Kolkata
      if (elements.trendingDateTag && song.date_ist) {
        try {
          const [y, m, d] = song.date_ist.split('-');
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const monthName = months[parseInt(m, 10) - 1] || m;
          elements.trendingDateTag.textContent = `Today • ${parseInt(d, 10)} ${monthName} ${y}`;
        } catch (e) {
          elements.trendingDateTag.textContent = 'Today • India Trends';
        }
      }

      renderDailyTrendingHindiCard(song);
      if (elements.trendingHindiSection) elements.trendingHindiSection.style.display = '';
    } catch (err) {
      console.warn('Daily trending Hindi song load notice:', err.message);
      if (elements.trendingHindiSection) elements.trendingHindiSection.style.display = 'none';
    }
  }

  function renderDailyTrendingHindiCard(song) {
    if (!elements.trendingHindiCard || !song) return;

    const matched = song.matched_track || {};
    const trackToPlay = {
      id: matched.id || song.matched_track_id,
      title: song.title || matched.title,
      artist: song.artist || matched.artist,
      album: song.album || matched.album || 'Single',
      duration: matched.duration || 210,
      image: song.thumbnail_url || matched.image,
      thumbnailUrl: song.thumbnail_url || matched.image,
      streamUrl: matched.streamUrl,
      source: matched.source || song.platform_source,
      hasDirectAudio: matched.hasDirectAudio !== false
    };

    // Build verified source badge icon & label
    let sourceBadgeHtml = '';
    if (song.platform_source === 'youtube_instagram') {
      sourceBadgeHtml = `
        <span class="trending-source-badge" title="Verified trend on YouTube & Instagram Reels">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
          <span>Trending on YouTube and Instagram</span>
        </span>`;
    } else if (song.platform_source === 'instagram') {
      sourceBadgeHtml = `
        <span class="trending-source-badge" title="Verified trending audio on Instagram Reels">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
          <span>Trending on Instagram</span>
        </span>`;
    } else {
      sourceBadgeHtml = `
        <span class="trending-source-badge" title="Verified trend on YouTube India">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          <span>Trending on YouTube</span>
        </span>`;
    }

    // Factual view metric
    const viewCount = song.verified_metrics?.viewCount || 0;
    let viewText = 'Viral in India • #1 Today';
    if (viewCount > 1000000) {
      viewText = `🔥 ${(viewCount / 1000000).toFixed(1)}M+ views • Top India Music Trend`;
    } else if (viewCount > 100000) {
      viewText = `🔥 ${Math.round(viewCount / 1000)}k+ views • Top India Music Trend`;
    }

    elements.trendingHindiCard.innerHTML = `
      <div class="trending-card-artwork-box">
        <img src="${trackToPlay.image}" alt="${escapeHtml(trackToPlay.title)}" class="trending-card-artwork" loading="lazy">
      </div>
      <div class="trending-card-content">
        <div class="trending-card-badges-row">
          ${sourceBadgeHtml}
          <span class="trending-rank-tag">#1 Trending Hindi Song</span>
        </div>
        <h3 class="trending-song-title" title="${escapeHtml(trackToPlay.title)}">${escapeHtml(trackToPlay.title)}</h3>
        <p class="trending-song-artists" title="${escapeHtml(trackToPlay.artist)}">${escapeHtml(trackToPlay.artist)}${trackToPlay.album && trackToPlay.album !== 'Single' ? ' • ' + escapeHtml(trackToPlay.album) : ''}</p>
        <div class="trending-factual-metric">
          <span>${viewText}</span>
        </div>
        <div class="trending-card-actions">
          <button class="trending-play-btn" id="trendingPlayBtn">
            <svg viewBox="0 0 24 24" class="trending-play-icon">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span class="trending-play-text">Play Now</span>
          </button>
          <button class="trending-action-icon-btn" id="trendingQueueBtn" title="Play Next">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 17px; height: 17px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="trending-action-icon-btn" id="trendingLikeBtn" title="Save to Liked Songs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 17px; height: 17px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
        </div>
      </div>
    `;

    // Wire Play Button to MusiSurf Authoritative Audio Engine
    const playBtn = elements.trendingHindiCard.querySelector('#trendingPlayBtn');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.currentTrack && areTracksIdentical(state.currentTrack, trackToPlay)) {
          togglePlayPause();
        } else {
          state.activePlaylistId = null;
          playTrack(trackToPlay, [trackToPlay]);
        }
      });
    }

    // Wire Queue Button
    const queueBtn = elements.trendingHindiCard.querySelector('#trendingQueueBtn');
    if (queueBtn) {
      queueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!state.userQueue) state.userQueue = [];
        state.userQueue.push(trackToPlay);
        state.queue = [state.currentTrack, ...state.userQueue, ...state.contextQueue.slice(state.contextIndex + 1)];
        updateQueueDrawerUI();
        showToast(`Added to queue: "${trackToPlay.title}"`, '⏭');
      });
    }

    // Wire Like Button
    const likeBtn = elements.trendingHindiCard.querySelector('#trendingLikeBtn');
    if (likeBtn) {
      likeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLikeSong(trackToPlay);
      });
    }
  }

  async function loadTrendingShelves() {
    try {
      const res = await fetch(`/api/trending?t=${Date.now()}&refresh=1`);
      const data = await res.json();

      if (!data.success || !data.sections) {
        if (elements.quickPicksGrid) elements.quickPicksGrid.innerHTML = '';
        if (elements.shelvesContainer) elements.shelvesContainer.innerHTML = '<p style="padding: 40px; color: var(--text-secondary);">Trending music loaded.</p>';
        return;
      }

      if (elements.shelvesContainer) elements.shelvesContainer.innerHTML = '';

      // Cache daily top trending tracks (strictly non-bhajan) for homepage quick picks
      if (Array.isArray(data.dailyTopTracks) && data.dailyTopTracks.length > 0) {
        state.dailyTopTracks = data.dailyTopTracks.filter(t => !isDevotionalOrBhajan(t));
      } else {
        state.dailyTopTracks = [];
      }

      // Populate Recently Played Quick Picks (strictly sign-in gated, rendered only if played)
      updateQuickPicksUI();

      // Populate Curated Shelves - strictly unique albums & non-devotional
      data.sections.forEach(section => {
        const filteredTracks = (section.tracks || []).filter(t => !isDevotionalOrBhajan(t));
        const distinctTracks = deduplicateAndShuffleAlbums(filteredTracks, 10);
        const shelf = createShelfElement({ ...section, tracks: distinctTracks });
        elements.shelvesContainer.appendChild(shelf);
      });
    } catch (err) {
      console.warn('Failed to load trending shelves:', err);
      if (elements.quickPicksGrid) elements.quickPicksGrid.innerHTML = '';
      if (elements.shelvesContainer) elements.shelvesContainer.innerHTML = '<p style="padding: 40px; color: var(--text-secondary);">Unable to load trending catalog. Use Search to play any song!</p>';
    } finally {
      dismissSplashScreen();
    }
  }

  function renderQuickPicks(tracks) {
    if (!elements.quickPicksGrid) return;
    elements.quickPicksGrid.innerHTML = '';
    tracks.forEach(track => {
      const tile = document.createElement('div');
      tile.className = 'quick-pick-tile';
      tile._trackData = track;
      const imgUrl = track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80';
      tile.innerHTML = `
        <img src="${imgUrl}" alt="${escapeHtml(track.title)}" class="quick-pick-img">
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

  function updateQuickPicksUI() {
    const heroWelcome = document.getElementById('heroWelcomeSection') || document.querySelector('.hero-welcome');
    const isSignedIn = !!(state.currentUser && state.currentUser.email);
    const validRecents = (state.recentlyPlayed || []).filter(t => t && t.id && t.title && t.type !== 'playlist');

    if (!isSignedIn || validRecents.length === 0) {
      if (heroWelcome) heroWelcome.style.display = 'none';
      if (elements.quickPicksGrid) elements.quickPicksGrid.innerHTML = '';
      return;
    }

    if (heroWelcome) heroWelcome.style.display = 'block';
    if (elements.greetingHeading) elements.greetingHeading.textContent = 'Recently played';
    renderQuickPicks(validRecents.slice(0, 6));
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

  // ==========================================================================
  // SEARCH HISTORY & PERSISTENCE (Account-Synced with Neon DB & Local Fallback)
  // ==========================================================================
  async function syncUserSearchHistory() {
    try {
      if (state.currentUser && state.currentUser.id) {
        const res = await fetch('/api/search/history');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.history)) {
            const merged = Array.from(new Set([...data.history, ...state.searchHistory])).slice(0, 30);
            state.searchHistory = merged;
            try { localStorage.setItem('musisurf_search_history', JSON.stringify(merged)); } catch (e) {}
          }
        }
      }
    } catch (err) {
      console.warn('[Search] History sync note:', err.message);
    }
  }

  function saveSearchHistoryQuery(query) {
    const q = (query || '').trim();
    if (!q || q.length < 2) return;
    state.searchHistory = [q, ...state.searchHistory.filter(h => h.toLowerCase() !== q.toLowerCase())].slice(0, 30);
    try { localStorage.setItem('musisurf_search_history', JSON.stringify(state.searchHistory)); } catch (e) {}

    if (state.currentUser && state.currentUser.id) {
      fetch('/api/search/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      }).catch(() => {});
    }
  }

  function removeSearchHistoryQuery(query) {
    const q = (query || '').trim();
    state.searchHistory = state.searchHistory.filter(h => h.toLowerCase() !== q.toLowerCase());
    try { localStorage.setItem('musisurf_search_history', JSON.stringify(state.searchHistory)); } catch (e) {}

    if (state.currentUser && state.currentUser.id) {
      fetch('/api/search/history?query=' + encodeURIComponent(q), { method: 'DELETE' }).catch(() => {});
    }
  }

  function clearAllSearchHistory() {
    state.searchHistory = [];
    try { localStorage.removeItem('musisurf_search_history'); } catch (e) {}

    if (state.currentUser && state.currentUser.id) {
      fetch('/api/search/history', { method: 'DELETE' }).catch(() => {});
    }
  }

  // ==========================================================================
  // DISCOVERY & LIVE AUTOCOMPLETE SYSTEM
  // ==========================================================================

  // Empty State Dropdown: Recent Searches, Trending Queries, and Popular Songs
  async function renderSearchDiscoveryDropdown() {
    if (!elements.searchAutocompleteDropdown) return;
    state.selectedDropdownIndex = -1;

    // Fetch discovery data if not yet cached
    if (!state.discoveryData) {
      try {
        const res = await fetch('/api/search/discovery');
        if (res.ok) {
          const d = await res.json();
          if (d.success) state.discoveryData = d;
        }
      } catch (e) {}
    }

    const discovery = state.discoveryData || {
      trendingSearches: ['Arijit Singh', 'Kesariya', 'Pasoori', 'Tu Hai Kahan', 'Sanam Teri Kasam', 'Diljit Dosanjh', 'Coldplay'],
      popularSongs: [],
      topArtists: []
    };

    const recentSearches = (state.searchHistory || []).slice(0, 5);
    const recentPlayed = (state.recentlyPlayed || []).filter(t => t.type !== 'playlist').slice(0, 3);

    let html = '';

    // 1. Recent Searches with Delete Buttons
    if (recentSearches.length > 0) {
      html += `
        <div class="dropdown-section-title">
          <span>Recent Searches</span>
          <button type="button" class="dropdown-clear-all-btn" id="dropdownClearAllSearchesBtn">Clear all</button>
        </div>
        <div class="dropdown-section-group">
      `;
      recentSearches.forEach(term => {
        html += `
          <div class="search-suggestion-item query-item" data-action="search" data-query="${escapeHtml(term)}">
            <svg class="suggestion-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span class="suggestion-text">${escapeHtml(term)}</span>
            <button type="button" class="sugg-delete-btn" title="Remove" data-query="${escapeHtml(term)}" aria-label="Remove search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        `;
      });
      html += `</div>`;
    }

    // 2. Trending Searches
    if (discovery.trendingSearches && discovery.trendingSearches.length > 0) {
      html += `
        <div class="dropdown-section-title">
          <span>Trending Searches</span>
        </div>
        <div class="dropdown-section-group">
      `;
      discovery.trendingSearches.slice(0, 5).forEach(term => {
        html += `
          <div class="search-suggestion-item query-item" data-action="search" data-query="${escapeHtml(term)}">
            <svg class="suggestion-search-icon" viewBox="0 0 24 24" fill="currentColor" style="color: #ff5252 !important;">
              <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
            </svg>
            <span class="suggestion-text">${escapeHtml(term)}</span>
            <svg class="suggestion-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        `;
      });
      html += `</div>`;
    }

    // 3. Recently Played (only when empty and user has listened)
    if (recentPlayed.length > 0) {
      html += `
        <div class="dropdown-section-title">
          <span>Recently Played</span>
        </div>
        <div class="dropdown-section-group">
      `;
      recentPlayed.forEach(track => {
        html += `
          <div class="search-suggestion-item track-item" data-action="play-track" data-track-id="${escapeHtml(track.id)}" data-query="${escapeHtml(track.title)}">
            <img src="${track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=80&auto=format&fit=crop&q=80'}" alt="${escapeHtml(track.title)}" class="sugg-thumb" loading="lazy">
            <div class="sugg-info">
              <span class="sugg-title">${escapeHtml(track.title)}</span>
              <span class="sugg-subtitle">${escapeHtml(track.artist || 'Artist')}</span>
            </div>
            <span class="sugg-badge">Song</span>
          </div>
        `;
      });
      html += `</div>`;
    }

    elements.searchAutocompleteDropdown.innerHTML = html;
    elements.searchAutocompleteDropdown.style.display = 'block';

    // Clear all button
    const clearAllBtn = elements.searchAutocompleteDropdown.querySelector('#dropdownClearAllSearchesBtn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearAllSearchHistory();
        renderSearchDiscoveryDropdown();
      });
    }

    // Individual delete buttons
    elements.searchAutocompleteDropdown.querySelectorAll('.sugg-delete-btn').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const q = btn.dataset.query;
        if (q) {
          removeSearchHistoryQuery(q);
          renderSearchDiscoveryDropdown();
        }
      });
    });

    // Suggestion selection
    elements.searchAutocompleteDropdown.querySelectorAll('.search-suggestion-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        if (e.target.closest('.sugg-delete-btn')) return;
        e.preventDefault();
        const action = el.dataset.action;
        const query = el.dataset.query;
        const trackId = el.dataset.trackId;

        if (action === 'play-track' && trackId) {
          const tr = (state.recentlyPlayed || []).find(t => t.id === trackId);
          elements.searchAutocompleteDropdown.style.display = 'none';
          if (tr) playTrack(tr, null);
        } else if (query) {
          elements.globalSearchInput.value = query;
          elements.searchAutocompleteDropdown.style.display = 'none';
          switchView('search');
          saveSearchHistoryQuery(query);
          performSearch(query);
        }
      });
    });
  }

  // Live Typeahead Autocomplete Handler with In-Flight Request Cancellation & Debouncing
  async function handleSearchAutocomplete(query) {
    if (!elements.searchAutocompleteDropdown) return;
    const q = (query || '').trim();

    // If query is empty, immediately show discovery interface
    if (!q) {
      renderSearchDiscoveryDropdown();
      return;
    }

    // Abort previous in-flight autocomplete request
    if (state.autocompleteAbortController) {
      state.autocompleteAbortController.abort();
    }
    state.autocompleteAbortController = new AbortController();
    const signal = state.autocompleteAbortController.signal;

    state.selectedDropdownIndex = -1;

    // Check client-side autocomplete cache
    const cacheKey = q.toLowerCase();
    if (state.autocompleteCache && state.autocompleteCache.has(cacheKey)) {
      renderAutocompleteResults(q, state.autocompleteCache.get(cacheKey));
      return;
    }

    try {
      const res = await fetch(`/api/search/autocomplete?q=${encodeURIComponent(q)}`, { signal });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.suggestions) return;

      if (!state.autocompleteCache) state.autocompleteCache = new Map();
      state.autocompleteCache.set(cacheKey, data.suggestions);
      if (state.autocompleteCache.size > 100) {
        const first = state.autocompleteCache.keys().next().value;
        state.autocompleteCache.delete(first);
      }

      // Check input still matches
      if (elements.globalSearchInput.value.trim().toLowerCase() === q.toLowerCase()) {
        renderAutocompleteResults(q, data.suggestions);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Autocomplete fetch note:', err);
      }
    }
  }

  // Render Categorized Autocomplete Results
  function renderAutocompleteResults(query, suggestions) {
    if (!elements.searchAutocompleteDropdown) return;
    if (!elements.globalSearchInput.value.trim()) return;

    const { songs = [], artists = [], albums = [], lyricsMatches = [], queries = [] } = suggestions;
    const hasAny = songs.length > 0 || artists.length > 0 || albums.length > 0 || lyricsMatches.length > 0 || queries.length > 0;

    if (!hasAny) {
      elements.searchAutocompleteDropdown.innerHTML = `
        <div class="dropdown-empty-state">
          <p>No matches found for "<strong>${escapeHtml(query)}</strong>"</p>
          <p style="font-size: 11px; color: #727272; margin-top: 4px;">Try searching for an artist, song title, or lyric line</p>
        </div>
      `;
      elements.searchAutocompleteDropdown.style.display = 'block';
      return;
    }

    let html = '';

    // Merge any distinct lyric matches into songs so they appear cleanly under Songs (no lyrics-match badge or quote snippets)
    if (lyricsMatches.length > 0) {
      lyricsMatches.forEach(lyr => {
        if (!songs.some(s => (s.id && s.id === lyr.id) || (s.title && s.title.toLowerCase() === (lyr.title || '').toLowerCase()))) {
          songs.push({
            id: lyr.id || `yt_${lyr.title}`,
            title: lyr.title,
            artist: lyr.artist || 'Artist',
            image: lyr.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=80&auto=format&fit=crop&q=80'
          });
        }
      });
    }

    // 1. Song Suggestions
    if (songs.length > 0) {
      html += `
        <div class="dropdown-section-title">
          <span>Songs</span>
        </div>
        <div class="dropdown-section-group">
      `;
      songs.slice(0, 5).forEach(song => {
        html += `
          <div class="search-suggestion-item track-item" data-action="play-song" data-song='${escapeHtml(JSON.stringify(song))}'>
            <img src="${song.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=80&auto=format&fit=crop&q=80'}" alt="${escapeHtml(song.title)}" class="sugg-thumb" loading="lazy">
            <div class="sugg-info">
              <span class="sugg-title">${escapeHtml(song.title)}</span>
              <span class="sugg-subtitle">${escapeHtml(song.artist || 'Artist')}</span>
            </div>
            <span class="sugg-badge">Song</span>
          </div>
        `;
      });
      html += `</div>`;
    }

    // 3. Artist Suggestions
    if (artists.length > 0) {
      html += `
        <div class="dropdown-section-title">
          <span>Artists</span>
        </div>
        <div class="dropdown-section-group">
      `;
      artists.slice(0, 2).forEach(artist => {
        html += `
          <div class="search-suggestion-item artist-item" data-action="search" data-query="${escapeHtml(artist.name)}">
            <img src="${artist.image || 'https://www.jiosaavn.com/_i/3.0/artist-default-film.png'}" alt="${escapeHtml(artist.name)}" class="sugg-thumb artist-thumb" loading="lazy">
            <div class="sugg-info">
              <span class="sugg-title">${escapeHtml(artist.name)}</span>
              <span class="sugg-subtitle">Artist</span>
            </div>
            <span class="sugg-badge">Artist</span>
          </div>
        `;
      });
      html += `</div>`;
    }

    // 4. Query Completions
    if (queries.length > 0) {
      html += `
        <div class="dropdown-section-title">
          <span>Suggestions</span>
        </div>
        <div class="dropdown-section-group">
      `;
      queries.slice(0, 4).forEach(qText => {
        html += `
          <div class="search-suggestion-item query-item" data-action="search" data-query="${escapeHtml(qText)}">
            <svg class="suggestion-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span class="suggestion-text">${escapeHtml(qText)}</span>
            <svg class="suggestion-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        `;
      });
      html += `</div>`;
    }

    elements.searchAutocompleteDropdown.innerHTML = html;
    elements.searchAutocompleteDropdown.style.display = 'block';

    // Suggestion selection
    elements.searchAutocompleteDropdown.querySelectorAll('.search-suggestion-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const action = el.dataset.action;
        const queryText = el.dataset.query;
        const songData = el.dataset.song;

        if (action === 'play-song' && songData) {
          try {
            const song = JSON.parse(songData);
            elements.searchAutocompleteDropdown.style.display = 'none';
            saveSearchHistoryQuery(song.title);
            playTrack(song, null);
          } catch (err) {
            console.error('Play song from autocomplete error:', err);
          }
        } else if (queryText) {
          elements.globalSearchInput.value = queryText;
          elements.searchAutocompleteDropdown.style.display = 'none';
          switchView('search');
          saveSearchHistoryQuery(queryText);
          performSearch(queryText);
        }
      });
    });
  }

  // Keyboard navigation through suggestions dropdown
  function handleSearchKeydown(e) {
    const dropdown = elements.searchAutocompleteDropdown;
    const isDropdownOpen = dropdown && dropdown.style.display !== 'none';
    const items = isDropdownOpen ? dropdown.querySelectorAll('.search-suggestion-item') : [];

    if (e.key === 'ArrowDown') {
      if (items.length > 0) {
        e.preventDefault();
        state.selectedDropdownIndex = (state.selectedDropdownIndex + 1) % items.length;
        updateDropdownSelection(items);
      }
    } else if (e.key === 'ArrowUp') {
      if (items.length > 0) {
        e.preventDefault();
        state.selectedDropdownIndex = (state.selectedDropdownIndex - 1 + items.length) % items.length;
        updateDropdownSelection(items);
      }
    } else if (e.key === 'Enter') {
      if (isDropdownOpen && state.selectedDropdownIndex >= 0 && items[state.selectedDropdownIndex]) {
        e.preventDefault();
        items[state.selectedDropdownIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      } else {
        clearTimeout(searchDebounceTimer);
        const query = elements.globalSearchInput.value.trim();
        if (query) {
          if (dropdown) dropdown.style.display = 'none';
          switchView('search');
          saveSearchHistoryQuery(query);
          performSearch(query);
        }
      }
    } else if (e.key === 'Escape') {
      if (dropdown) dropdown.style.display = 'none';
      state.selectedDropdownIndex = -1;
    }
  }

  function updateDropdownSelection(items) {
    items.forEach((item, idx) => {
      if (idx === state.selectedDropdownIndex) {
        item.classList.add('keyboard-selected');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.classList.remove('keyboard-selected');
      }
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
        } else if (filterType === 'lyrics') {
          row.style.display = track.isLyricsMatch ? '' : 'none';
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
      if (filterType === 'lyrics' && !top.isLyricsMatch) showTop = false;
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

    if (query.length > 0) {
      if (elements.clearSearchBtn) elements.clearSearchBtn.style.display = 'flex';
      if (elements.searchRecentSection) elements.searchRecentSection.style.display = 'none';
      switchView('search');

      handleSearchAutocomplete(query);

      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        performSearch(query);
      }, 300);
    } else {
      if (state.autocompleteAbortController) {
        state.autocompleteAbortController.abort();
      }
      if (elements.clearSearchBtn) elements.clearSearchBtn.style.display = 'none';
      if (elements.searchResultsWrapper) elements.searchResultsWrapper.style.display = 'none';
      if (elements.searchEmptyState) elements.searchEmptyState.style.display = 'none';
      if (elements.searchRecentSection) elements.searchRecentSection.style.display = 'none';
      if (elements.searchBrowseSection) elements.searchBrowseSection.style.display = 'block';
      renderSearchDiscoveryDropdown();
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

    saveSearchHistoryQuery(query);

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

      renderSearchResults(data.results, data);
    } catch (err) {
      console.warn('Search failed:', err);
      elements.searchLoading.style.display = 'none';
      elements.searchEmptyState.style.display = 'flex';
    }
  }

  function renderSearchResults(results, meta = {}) {
    elements.searchResultsWrapper.style.display = 'block';
    elements.resultsCount.textContent = results.length;

    // Top Result: strictly synchronized with the search bar autocomplete top song
    const currentQ = (elements.globalSearchInput?.value || meta.query || '').trim().toLowerCase();
    const acCache = state.autocompleteCache?.get(currentQ) || state.autocompleteCache?.get(`ac_${currentQ}`);
    const topAcSong = (acCache?.songs && acCache.songs[0]) || (acCache?.suggestions?.songs && acCache.suggestions.songs[0]);
    if (topAcSong && results && results.length > 1) {
      const cleanAcTitle = (topAcSong.title || '').toLowerCase().trim();
      const matchIdx = results.findIndex(t => 
        (t.id && topAcSong.id && (String(t.id) === String(topAcSong.id) || String(t.id) === `saavn_${topAcSong.id}` || String(t.id).replace(/^saavn_/, '') === String(topAcSong.id).replace(/^saavn_/, ''))) ||
        (t.title && t.title.toLowerCase().trim() === cleanAcTitle)
      );
      if (matchIdx > 0) {
        const [matched] = results.splice(matchIdx, 1);
        results.unshift(matched);
      }
    }

    const top = results[0];
    const isTopLiked = state.likedSongs.some(s => s.id === top.id);
    const isPlayingThisTop = state.isPlaying && state.currentTrack && state.currentTrack.id === top.id;
    const isLyricsMatch = Boolean(top.isLyricsMatch);
    const lyricSnippet = top.matchedLine || null;

    elements.topResultCard.dataset.trackId = top.id;
    elements.topResultCard._trackData = top;
    elements.topResultCard.className = `top-result-card ${isPlayingThisTop ? 'playing' : ''}`;
    elements.topResultCard.innerHTML = `
      <div class="top-result-header-row">
        <img src="${top.image}" alt="${escapeHtml(top.title)}" class="top-result-img" loading="lazy" decoding="async">
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
          state.activePlaylistTracks = null;
          playTrack(top, null); // Search result plays ONLY selected song
        }
        return;
      }
      if (state.currentTrack && state.currentTrack.id === top.id) {
        togglePlayPause();
      } else {
        state.activePlaylistId = null;
        state.activePlaylistTracks = null;
        playTrack(top, null); // Search result plays ONLY selected song
      }
    };

    // First 4 tracks in preview list
    elements.topSongsList.innerHTML = '';
    const previewSongs = results.slice(0, 4);
    previewSongs.forEach(track => {
      const row = createSongRow(track, null);
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
      const tr = createTableRow(track, idx + 1, null, false);
      tbody.appendChild(tr);
    });

    elements.fullSongsTable.appendChild(table);
    applySearchFilter(state.activeSearchFilter || 'all');
    if (state.currentTrack) {
      highlightPlayingTrackInTables(state.currentTrack.id);
    }
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

    // Contextual "Remove from this Playlist" button (visible when track is in current playlist or any custom playlist)
    if (elements.mobOptRemovePlaylistBtn) {
      const currentPlId = (state.currentView === 'playlist' && state.viewingPlaylistId) 
        ? state.viewingPlaylistId 
        : (state.activePlaylistId && !['liked', 'downloaded', 'local'].includes(state.activePlaylistId) ? state.activePlaylistId : null);
      
      const isTargetInCurrent = currentPlId && state.customPlaylists?.some(p => p.id === currentPlId && (p.tracks || []).some(t => String(t.id) === String(track.id)));
      const containingPl = state.customPlaylists?.find(p => (p.tracks || []).some(t => String(t.id) === String(track.id)));

      if (isTargetInCurrent || containingPl) {
        elements.mobOptRemovePlaylistBtn.style.display = 'flex';
        const span = elements.mobOptRemovePlaylistBtn.querySelector('span');
        if (span) {
          span.textContent = isTargetInCurrent ? 'Remove from this Playlist' : `Remove from ${containingPl.name}`;
        }
      } else {
        elements.mobOptRemovePlaylistBtn.style.display = 'none';
      }
    }



    if (elements.mobTrackOptionsModal) {
      elements.mobTrackOptionsModal.style.display = 'flex';
      try { window.history.pushState({ modal: 'mobTrackOptions' }, '', window.location.pathname); } catch (e) {}
    }
  }

  function createSongRow(track, queueList, rowIndex = -1) {
    const row = document.createElement('div');
    const isDownloaded = isTrackDownloaded(track.id);
    const isPlaying = Boolean(state.currentTrack && isSameTrack(state.currentTrack, track));
    row.className = `song-row ${isPlaying ? 'playing' : ''} ${isDownloaded ? 'is-downloaded' : ''}`;
    row.dataset.trackId = track.id;
    row._trackData = track;

    const badgeHtml = getDownloadedBadgeHtml(track.id);
    const tickHtml = getPlaylistTickBadgeHtml(track.id);
    const formattedTitle = escapeHtml(track.title);
    const formattedArtist = escapeHtml(track.artist);

    row.innerHTML = `
      <img src="${track.image}" alt="${escapeHtml(track.title)}" class="song-thumb" loading="lazy" decoding="async">
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
      if (e.target.closest('.song-action-btn') || e.target.closest('.drag-handle-lines') || e.target.closest('.col-drag-handle')) {
        e.stopPropagation();
        return;
      }
      if (!navigator.onLine && !isTrackDownloaded(track.id)) {
        e.stopPropagation();
        showToast("You're offline! Listen to your downloaded songs.", '⚡');
        return;
      }
      let startIdx = (typeof rowIndex === 'number' && rowIndex >= 0)
        ? rowIndex
        : (Array.isArray(queueList) ? queueList.findIndex(t => areTracksIdentical(t, track)) : 0);
      if (startIdx < 0 && Array.isArray(queueList)) {
        startIdx = queueList.findIndex(t => t && String(t.id) === String(track.id));
      }
      if (startIdx < 0) startIdx = 0;

      if (state.currentView === 'search' || state.currentView === 'home') {
        state.activePlaylistId = null;
        state.activePlaylistTracks = null;
        state.playbackContext = {
          type: state.currentView === 'search' ? 'search' : 'standalone',
          playlistId: null,
          trackId: track.id
        };
      } else if (state.currentView === 'playlist' && state.viewingPlaylistId) {
        state.activePlaylistId = state.viewingPlaylistId;
        state.activePlaylistTracks = queueList;
        state.playbackContext = {
          type: 'playlist',
          playlistId: state.viewingPlaylistId,
          trackId: track.id
        };
        const plObj = state.customPlaylists?.find(p => p.id === state.viewingPlaylistId);
        if (plObj) {
          plObj.lastPlayedAt = Date.now();
          saveStoredPlaylists();
        }
        initPlaylistCycle(queueList, startIdx);
        saveCurrentPlaylistProgress({ immediate: true });
      }
      playTrack(track, queueList, true, 0, false, { explicitIndex: startIdx });
    });

    return row;
  }

  function formatDateAdded(ts) {
    if (!ts) return 'Today';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return 'Today';
    const now = new Date();
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((nowDate.getTime() - dDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function createTableRow(track, index, queueList, isPlaylistTable = false, isCustomSort = false) {
    const tr = document.createElement('tr');
    const isDownloaded = isTrackDownloaded(track.id);
    const isPlaying = Boolean(state.currentTrack && isSameTrack(state.currentTrack, track));
    tr.className = `${isPlaying ? 'playing' : ''} ${isDownloaded ? 'is-downloaded' : ''}`;
    tr.dataset.trackId = track.id;
    tr._trackData = track;

    const badgeHtml = getDownloadedBadgeHtml(track.id);
    const tickHtml = getPlaylistTickBadgeHtml(track.id);
    const formattedTitle = escapeHtml(track.title);
    const formattedArtist = escapeHtml(track.artist);
    const dateAddedCellHtml = isPlaylistTable ? `<td class="col-date-added">${formatDateAdded(track.addedAt)}</td>` : '';
    const dragHandleCellHtml = isCustomSort ? `
      <td class="col-drag-handle">
        <button class="drag-handle-lines" title="Drag to reorder" aria-label="Drag to reorder" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="4" y1="8" x2="20" y2="8"/>
            <line x1="4" y1="12" x2="20" y2="12"/>
            <line x1="4" y1="16" x2="20" y2="16"/>
          </svg>
        </button>
      </td>
    ` : '';

    tr.innerHTML = `
      <td class="col-num">
        <span class="track-num-text">${index}</span>
        <span class="playing-equalizer-bars" aria-hidden="true">
          <span class="eq-bar eq-bar-1"></span>
          <span class="eq-bar eq-bar-2"></span>
          <span class="eq-bar eq-bar-3"></span>
          <span class="eq-bar eq-bar-4"></span>
        </span>
      </td>
      <td class="col-title">
        <div class="table-title-cell">
          <img src="${track.image}" alt="${escapeHtml(track.title)}" class="table-cover" loading="lazy" decoding="async">
          <div>
            <div class="table-title-main"><span class="title-text-main" title="${escapeHtml(track.title)}">${formattedTitle}</span>${tickHtml}${badgeHtml}</div>
            <div class="table-artist-sub" title="${escapeHtml(track.artist)}">${formattedArtist}</div>
          </div>
        </div>
      </td>
      <td class="col-album"><span class="col-album-text" title="${escapeHtml(track.album || 'Single')}">${escapeHtml(track.album || 'Single')}</span></td>
      ${dateAddedCellHtml}
      <td class="col-duration">${track.durationStr || '3:30'}</td>
      <td class="col-actions">
        <button class="song-action-btn song-more-trigger" title="More Options">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"/>
            <circle cx="12" cy="12" r="2"/>
            <circle cx="12" cy="19" r="2"/>
          </svg>
        </button>
      </td>
      ${dragHandleCellHtml}
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
      let startIdx = (typeof rowIndex === 'number' && rowIndex >= 0)
        ? rowIndex
        : (Array.isArray(queueList) ? queueList.findIndex(t => areTracksIdentical(t, track)) : 0);
      if (startIdx < 0 && Array.isArray(queueList)) {
        startIdx = queueList.findIndex(t => t && String(t.id) === String(track.id));
      }
      if (startIdx < 0) startIdx = 0;

      if (state.currentView === 'search' || state.currentView === 'home') {
        state.activePlaylistId = null;
        state.activePlaylistTracks = null;
        state.playbackContext = {
          type: state.currentView === 'search' ? 'search' : 'standalone',
          playlistId: null,
          trackId: track.id
        };
      } else if (state.currentView === 'playlist' && state.viewingPlaylistId) {
        state.activePlaylistId = state.viewingPlaylistId;
        state.activePlaylistTracks = queueList;
        state.playbackContext = {
          type: 'playlist',
          playlistId: state.viewingPlaylistId,
          trackId: track.id
        };
        const plObj = state.customPlaylists?.find(p => p.id === state.viewingPlaylistId);
        if (plObj) {
          plObj.lastPlayedAt = Date.now();
          saveStoredPlaylists();
        }
        initPlaylistCycle(queueList, startIdx);
        saveCurrentPlaylistProgress({ immediate: true });
      }
      playTrack(track, queueList, true, 0, false, { explicitIndex: startIdx });
    });

    return tr;
  }

  function highlightPlayingTrackInTables(trackId) {
    const targetIdStr = trackId ? String(trackId) : null;
    document.querySelectorAll('[data-track-id]').forEach(el => {
      const elId = el.dataset.trackId;
      const isMatch = Boolean(
        targetIdStr && (
          elId === targetIdStr ||
          `saavn_${elId}` === targetIdStr ||
          elId === `saavn_${targetIdStr}` ||
          (state.currentTrack && (
            (el._trackData && isSameTrack(el._trackData, state.currentTrack)) ||
            (el.dataset.trackId && String(state.currentTrack.id) === String(el.dataset.trackId))
          ))
        )
      );
      if (isMatch) {
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
    if (!isAuthenticated()) {
      requireAuthForAction('like songs', () => toggleLikeSong(track));
      return;
    }
    if (!track) return;
    const idx = state.likedSongs.findIndex(s => s.id === track.id);
    if (idx >= 0) {
      state.likedSongs.splice(idx, 1);
      showToast(`Removed "${track.title}" from Liked Songs`, '♡');
    } else {
      const trackWithDate = { ...track, addedAt: track.addedAt || Date.now() };
      state.likedSongs.unshift(trackWithDate);
      showToast(`Added "${track.title}" to Liked Songs`, '♥');

      // Sliding animation if this was first song added to Liked Songs
      if (state.likedSongs.length === 1) {
        const likedCard = document.getElementById('libHubLikedCard') || document.querySelector('.library-item[data-playlist-id="liked"]') || document.querySelector('.sidebar-item-liked');
        if (likedCard) {
          likedCard.classList.remove('playlist-card-slide-in');
          void likedCard.offsetWidth;
          likedCard.classList.add('playlist-card-slide-in');
          setTimeout(() => likedCard.classList.remove('playlist-card-slide-in'), 1000);
        }
      }
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

    // Neon Postgres Cloud Persistence
    if (state.currentUser && state.currentUser.id) {
      fetch('/api/library/likes/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ track })
      }).catch(err => console.warn('[Neon Likes] Persistence sync error:', err.message));
    }
  }

  function updateHeartIcon(currentTrackId) {
    if (!currentTrackId && state.currentTrack) {
      currentTrackId = state.currentTrack.id;
    }
    const isLiked = !!(state.likedSongs && state.likedSongs.some(s => String(s.id) === String(currentTrackId)));
    
    // 1. Desktop Player Heart Button
    if (elements.playerHeartBtn) {
      elements.playerHeartBtn.classList.toggle('liked', isLiked);
      const svg = elements.playerHeartBtn.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', isLiked ? '#ff3b5c' : 'none');
        svg.style.color = isLiked ? '#ff3b5c' : '';
      }
    }

    // 2. Mobile Fullscreen Player Heart Button
    if (elements.mobPlayerHeartBtn) {
      elements.mobPlayerHeartBtn.classList.toggle('liked', isLiked);
      const mobSvg = elements.mobPlayerHeartBtn.querySelector('svg');
      if (mobSvg) {
        mobSvg.setAttribute('fill', isLiked ? '#ff3b5c' : 'none');
        mobSvg.style.color = isLiked ? '#ff3b5c' : '';
      }
    }

    // 3. Mini Player Heart Button
    if (elements.miniHeartBtn) {
      elements.miniHeartBtn.classList.toggle('liked', isLiked);
      const miniSvg = elements.miniHeartBtn.querySelector('svg');
      if (miniSvg) {
        miniSvg.setAttribute('fill', isLiked ? '#ff3b5c' : 'none');
        miniSvg.style.color = isLiked ? '#ff3b5c' : '';
      }
    }

    // 4. Now Playing Heart Button
    if (elements.nowPlayingHeartBtn) {
      elements.nowPlayingHeartBtn.classList.toggle('liked', isLiked);
      const npSvg = elements.nowPlayingHeartBtn.querySelector('svg');
      if (npSvg) {
        npSvg.setAttribute('fill', isLiked ? '#ff3b5c' : 'none');
        npSvg.style.color = isLiked ? '#ff3b5c' : '';
      }
    }

    // 5. Song Row Heart Icons in Current Track Tables / Queues
    if (currentTrackId) {
      const matchSelector = `[data-track-id="${currentTrackId}"]`;
      document.querySelectorAll(matchSelector).forEach(el => {
        const rowHeart = el.matches('.song-action-btn') ? el : el.querySelector('.song-action-btn');
        if (rowHeart) {
          rowHeart.classList.toggle('liked', isLiked);
          const svg = rowHeart.querySelector('svg');
          if (svg) {
            svg.setAttribute('fill', isLiked ? '#ff3b5c' : 'none');
            svg.style.color = isLiked ? '#ff3b5c' : '';
          }
        }
      });
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

      if (typeof imgSrc === 'string' && imgSrc.startsWith('http') && !imgSrc.includes('/api/image-proxy')) {
        img.src = `/api/image-proxy?url=${encodeURIComponent(imgSrc)}`;
      } else {
        img.src = imgSrc;
      }
    });
  }

  // Cinematic Moving Border Animation Controller (Timeline 1.mov: Desktop, Mobile & Fullscreen)
  function isDesktopWebGlowEligible() {
    return true; // Supported and active on all viewports (desktop, mobile, fullscreen)
  }

  function updateCinematicBorderDimensions() {
    const glowEl = elements.lyricsEdgeGlow || document.getElementById('lyrics-edge-glow');
    if (!glowEl) return;
    const rects = glowEl.querySelectorAll('rect');
    if (!rects || rects.length === 0) return;

    const w = glowEl.clientWidth;
    const h = glowEl.clientHeight;
    if (w > 10 && h > 10) {
      const rx = w <= 768 ? 12 : 16;
      const rectW = Math.max(10, w - 6);
      const rectH = Math.max(10, h - 6);
      rects.forEach(r => {
        r.setAttribute('x', '3');
        r.setAttribute('y', '3');
        r.setAttribute('width', rectW.toString());
        r.setAttribute('height', rectH.toString());
        r.setAttribute('rx', rx.toString());
        r.setAttribute('ry', rx.toString());
        r.setAttribute('pathLength', '1000');
      });
    }
  }

  function updateLyricsEdgeGlowState() {
    const glowEl = elements.lyricsEdgeGlow || document.getElementById('lyrics-edge-glow');
    if (!glowEl) return;

    const isLyricsActive = state.currentView === 'lyrics';

    if (!isLyricsActive) {
      glowEl.classList.remove('is-active', 'is-playing');
      return;
    }

    glowEl.classList.add('is-active');
    updateCinematicBorderDimensions();

    // Playing state: song is actively playing and audio is not paused
    const actDeck = getActiveDeck();
    const isPlaying = !!(state.isPlaying && actDeck && !actDeck.paused);
    glowEl.classList.toggle('is-playing', isPlaying);

    const track = state.currentTrack;
    if (track) {
      if (window.albumThemeExtractor && typeof window.albumThemeExtractor.applyThemeToEdgeGlow === 'function') {
        window.albumThemeExtractor.applyThemeToEdgeGlow(track, glowEl, track.id);
      }
    }
  }

  async function applyLyricsDynamicBackground(track) {
    const lyricsViewEl = document.getElementById('lyricsView');
    const glowEl = elements.lyricsEdgeGlow || document.getElementById('lyrics-edge-glow');
    const current = track || state.currentTrack;
    if (!current || !current.image) {
      document.documentElement.style.setProperty('--lyrics-theme-color', '#2d3748');
      document.documentElement.style.setProperty('--lyrics-theme-rgb', '45, 55, 72');
      if (lyricsViewEl) {
        lyricsViewEl.style.setProperty('--lyrics-theme-color', '#2d3748');
        lyricsViewEl.style.setProperty('--lyrics-theme-rgb', '45, 55, 72');
      }
      if (glowEl) {
        glowEl.style.setProperty('--lyrics-theme-color', '#2d3748');
        glowEl.style.setProperty('--lyrics-theme-rgb', '45, 55, 72');
      }
      return;
    }
    try {
      const [r, g, b] = await extractDominantColor(current.image, current.id || current.title || 'lyrics');
      // Rich vibrant tones that match the artwork without being dim/pitch-black
      const topR = Math.min(255, Math.max(35, Math.floor(r * 0.95)));
      const topG = Math.min(255, Math.max(35, Math.floor(g * 0.95)));
      const topB = Math.min(255, Math.max(35, Math.floor(b * 0.95)));
      const rgbStr = `${topR}, ${topG}, ${topB}`;

      // Perceived luminance calculation: L = 0.299R + 0.587G + 0.114B
      const lum = 0.299 * topR + 0.587 * topG + 0.114 * topB;
      // When artwork colors are overly bright (e.g. bright yellow, light cyan, pale orange),
      // scale down the luminance for the background card so it provides deep comfortable darkness
      // while retaining the rich saturated hue, glow, and borders without blinding glare.
      let cardR = topR;
      let cardG = topG;
      let cardB = topB;
      if (lum > 115) {
        const factor = 95 / lum;
        cardR = Math.min(255, Math.max(25, Math.round(topR * factor)));
        cardG = Math.min(255, Math.max(25, Math.round(topG * factor)));
        cardB = Math.min(255, Math.max(25, Math.round(topB * factor)));
      }
      const cardRgbStr = `${cardR}, ${cardG}, ${cardB}`;

      document.documentElement.style.setProperty('--lyrics-theme-rgb', rgbStr);
      document.documentElement.style.setProperty('--lyrics-theme-color', `rgb(${rgbStr})`);
      document.documentElement.style.setProperty('--lyrics-card-rgb', cardRgbStr);
      document.documentElement.style.setProperty('--lyrics-card-color', `rgb(${cardRgbStr})`);
      if (lyricsViewEl) {
        lyricsViewEl.style.setProperty('--lyrics-theme-rgb', rgbStr);
        lyricsViewEl.style.setProperty('--lyrics-theme-color', `rgb(${rgbStr})`);
        lyricsViewEl.style.setProperty('--lyrics-card-rgb', cardRgbStr);
        lyricsViewEl.style.setProperty('--lyrics-card-color', `rgb(${cardRgbStr})`);
        lyricsViewEl.style.setProperty('--glow-primary', `rgb(${rgbStr})`);
        lyricsViewEl.style.setProperty('--glow-secondary', `rgb(${rgbStr})`);
        lyricsViewEl.style.setProperty('--glow-tertiary', `rgb(${rgbStr})`);
        lyricsViewEl.style.setProperty('--glow-quaternary', `rgb(${rgbStr})`);
      }
      if (glowEl) {
        glowEl.style.setProperty('--lyrics-theme-rgb', rgbStr);
        glowEl.style.setProperty('--lyrics-theme-color', `rgb(${rgbStr})`);
        glowEl.style.setProperty('--glow-primary', `rgb(${rgbStr})`);
        glowEl.style.setProperty('--glow-secondary', `rgb(${rgbStr})`);
        glowEl.style.setProperty('--glow-tertiary', `rgb(${rgbStr})`);
        glowEl.style.setProperty('--glow-quaternary', `rgb(${rgbStr})`);
      }
      const mobLyricsCard = document.getElementById('mobLyricsPreviewCard');
      if (mobLyricsCard) {
        mobLyricsCard.style.setProperty('--lyrics-theme-rgb', rgbStr);
        mobLyricsCard.style.setProperty('--lyrics-theme-color', `rgb(${rgbStr})`);
        mobLyricsCard.style.setProperty('--lyrics-card-rgb', cardRgbStr);
        mobLyricsCard.style.setProperty('--lyrics-card-color', `rgb(${cardRgbStr})`);
      }
      if (elements.lyricsFullscreenBtn) {
        elements.lyricsFullscreenBtn.style.setProperty('--lyrics-theme-rgb', rgbStr);
        elements.lyricsFullscreenBtn.style.setProperty('--lyrics-theme-color', `rgb(${rgbStr})`);
        elements.lyricsFullscreenBtn.style.background = `rgba(${rgbStr}, 0.55)`;
        elements.lyricsFullscreenBtn.style.borderColor = `rgba(${rgbStr}, 0.45)`;
        elements.lyricsFullscreenBtn.style.boxShadow = `0 4px 16px rgba(0, 0, 0, 0.35), 0 0 14px rgba(${rgbStr}, 0.35)`;
      }
    } catch (e) {
      document.documentElement.style.setProperty('--lyrics-theme-color', '#2d3748');
      document.documentElement.style.setProperty('--lyrics-theme-rgb', '45, 55, 72');
      document.documentElement.style.setProperty('--lyrics-card-rgb', '30, 36, 48');
      document.documentElement.style.setProperty('--lyrics-card-color', '#1e2430');
      if (lyricsViewEl) {
        lyricsViewEl.style.setProperty('--lyrics-theme-color', '#2d3748');
        lyricsViewEl.style.setProperty('--lyrics-theme-rgb', '45, 55, 72');
        lyricsViewEl.style.setProperty('--lyrics-card-rgb', '30, 36, 48');
        lyricsViewEl.style.setProperty('--lyrics-card-color', '#1e2430');
        lyricsViewEl.style.setProperty('--glow-primary', '#2d3748');
        lyricsViewEl.style.setProperty('--glow-secondary', '#2d3748');
        lyricsViewEl.style.setProperty('--glow-tertiary', '#2d3748');
        lyricsViewEl.style.setProperty('--glow-quaternary', '#2d3748');
      }
      if (glowEl) {
        glowEl.style.setProperty('--lyrics-theme-color', '#2d3748');
        glowEl.style.setProperty('--lyrics-theme-rgb', '45, 55, 72');
        glowEl.style.setProperty('--glow-primary', '#2d3748');
        glowEl.style.setProperty('--glow-secondary', '#2d3748');
        glowEl.style.setProperty('--glow-tertiary', '#2d3748');
        glowEl.style.setProperty('--glow-quaternary', '#2d3748');
      }
      const mobLyricsCard = document.getElementById('mobLyricsPreviewCard');
      if (mobLyricsCard) {
        mobLyricsCard.style.setProperty('--lyrics-theme-rgb', '45, 55, 72');
        mobLyricsCard.style.setProperty('--lyrics-theme-color', '#2d3748');
        mobLyricsCard.style.setProperty('--lyrics-card-rgb', '30, 36, 48');
        mobLyricsCard.style.setProperty('--lyrics-card-color', '#1e2430');
      }
      if (elements.lyricsFullscreenBtn) {
        elements.lyricsFullscreenBtn.style.setProperty('--lyrics-theme-rgb', '45, 55, 72');
        elements.lyricsFullscreenBtn.style.setProperty('--lyrics-theme-color', '#2d3748');
        elements.lyricsFullscreenBtn.style.background = 'rgba(45, 55, 72, 0.55)';
        elements.lyricsFullscreenBtn.style.borderColor = 'rgba(255, 255, 255, 0.35)';
        elements.lyricsFullscreenBtn.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.35)';
      }
    }
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

  function addEntirePlaylistToQueue(tracks, playlistTitle) {
    if (!tracks || tracks.length === 0) {
      showToast('Playlist has no songs to queue', 'ℹ');
      return;
    }
    if (!state.currentTrack) {
      playTrack(tracks[0], tracks);
      showToast(`Playing "${tracks[0].title}" & queued ${tracks.length - 1} songs`, '▶');
      return;
    }
    let addedCount = 0;
    tracks.forEach(track => {
      if (!state.currentTrack || track.id !== state.currentTrack.id) {
        state.userQueue.push(track);
        if (window.MusiSurfPlayback && window.MusiSurfPlayback.coordinator && window.MusiSurfPlayback.coordinator.isNativeActive) {
          window.MusiSurfPlayback.coordinator.queueManager.addToQueue(track);
        }
        addedCount++;
      }
    });
    state.queue = [state.currentTrack, ...state.userQueue, ...state.contextQueue.slice(state.contextIndex + 1)];
    updateQueueDrawerUI();
    showToast(`Added ${addedCount} song${addedCount === 1 ? '' : 's'} to queue`, '➕');
  }

  async function downloadEntirePlaylist(tracks, playlistTitle) {
    if (!tracks || tracks.length === 0) {
      showToast('Playlist has no songs to download', 'ℹ');
      return;
    }
    const toDownload = tracks.filter(t => !isTrackDownloaded(t.id));
    if (toDownload.length === 0) {
      showToast('All songs in this playlist are already downloaded!', '✓');
      return;
    }
    showToast(`Starting download of ${toDownload.length} song${toDownload.length === 1 ? '' : 's'}...`, '⬇');
    let downloadedCount = 0;
    for (const track of toDownload) {
      try {
        await downloadSong(track);
        downloadedCount++;
      } catch (err) {
        console.warn(`Failed downloading "${track.title}":`, err);
      }
    }
    showToast(`✓ Downloaded ${downloadedCount} song${downloadedCount === 1 ? '' : 's'} for offline playback!`, '✓');
  }

  function renderPlaylistView(playlistId, options = {}) {
    state.viewingPlaylistId = playlistId;
    document.body.dataset.playlistId = playlistId;
    if (playlistId === 'downloaded') {
      document.body.classList.add('in-downloaded-playlist');
    } else {
      document.body.classList.remove('in-downloaded-playlist');
    }
    switchView('playlist', { force: true, pushHistory: options.pushHistory !== false });
    if (playlistId === 'downloaded' && typeof updateMobNav === 'function') {
      updateMobNav('mobNavDownloads');
    }

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
      if (elements.mobilePlaylistMoreBtn) elements.mobilePlaylistMoreBtn.style.display = tracks.length > 0 ? 'inline-flex' : 'none';
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
      if (elements.mobilePlaylistMoreBtn) elements.mobilePlaylistMoreBtn.style.display = tracks.length > 0 ? 'inline-flex' : 'none';
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
      if (elements.mobilePlaylistMoreBtn) elements.mobilePlaylistMoreBtn.style.display = tracks.length > 0 ? 'inline-flex' : 'none';
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

    // Sort handling for playlist tracks: default to 'recents'
    const sortSelect = document.getElementById('playlistTracksSortSelect');
    const sortMode = sortSelect ? sortSelect.value : 'recents';
    syncCustomDropdown('playlistTracksSortDropdown', sortMode);

    let sortedTracks = [...tracks];
    if (sortMode === 'title') {
      sortedTracks.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortMode === 'artist') {
      sortedTracks.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
    } else if (sortMode === 'recents') {
      sortedTracks.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
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
    const isCustomSort = isCustom && sortMode === 'custom';
    if (elements.playlistTracksTable) {
      elements.playlistTracksTable.classList.toggle('custom-sort-active', isCustomSort);
    }
    elements.playlistTracksBody.innerHTML = '';
    if (sortedTracks.length === 0) {
      elements.playlistEmptyState.style.display = 'block';
    } else {
      elements.playlistEmptyState.style.display = 'none';
      sortedTracks.forEach((track, idx) => {
        const tr = createTableRow(track, idx + 1, sortedTracks, true, isCustomSort);
        elements.playlistTracksBody.appendChild(tr);
      });

      // Custom Sort: Drag-and-Drop & Touch Reordering (ONLY when Custom Sort is active)
      if (isCustomSort) {
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

    // Play / Resume Playlist Click
    elements.playAllPlaylistBtn.onclick = (e) => {
      if (e) e.stopPropagation();
      const listToPlay = (sortedTracks && sortedTracks.length > 0) ? sortedTracks : tracks;
      if (!listToPlay || listToPlay.length === 0) {
        showToast('Playlist is empty, add some songs first!', 'ℹ️');
        return;
      }

      const isCurrentPlaylistTrack = !!(
        state.currentTrack &&
        String(state.activePlaylistId) === String(playlistId) &&
        listToPlay.some(t => String(t.id) === String(state.currentTrack.id))
      );

      if (isCurrentPlaylistTrack) {
        togglePlayPause();
      } else {
        const progress = state.playlistProgressMap && state.playlistProgressMap[playlistId];
        if (progress && progress.trackId && !progress.isCompleted) {
          resumePlaylistPlayback(playlistId, listToPlay, progress);
        } else {
          startPlaylistPlaybackFromTrack(playlistId, listToPlay, 0);
        }
      }
    };

    // Restart playlist button (explicit start fresh from song 1)
    if (elements.restartPlaylistBtn) {
      elements.restartPlaylistBtn.onclick = (e) => {
        if (e) e.stopPropagation();
        const listToPlay = (sortedTracks && sortedTracks.length > 0) ? sortedTracks : tracks;
        startPlaylistPlaybackFromTrack(playlistId, listToPlay, 0);
        showToast('Starting playlist from beginning ↺', '↺');
      };
    }

    // Resume indicator button click
    if (elements.playlistResumeIndicatorBtn) {
      elements.playlistResumeIndicatorBtn.onclick = (e) => {
        if (e) e.stopPropagation();
        const listToPlay = (sortedTracks && sortedTracks.length > 0) ? sortedTracks : tracks;
        const progress = state.playlistProgressMap && state.playlistProgressMap[playlistId];
        if (progress && progress.trackId && !progress.isCompleted) {
          resumePlaylistPlayback(playlistId, listToPlay, progress);
        } else {
          startPlaylistPlaybackFromTrack(playlistId, listToPlay, 0);
        }
      };
    }

    updatePlaylistResumeUI(playlistId);

    // 3-Mode Playback Button (Mode 1: In Order + Autoplay, Mode 2: Shuffle Once + Autoplay, Mode 3: Shuffle & Repeat Playlist)
    updatePlaylistModeUI();

    elements.shufflePlaylistBtn.onclick = () => {
      cyclePlaylistMode();
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

    // Add Entire Playlist to Queue (Desktop Icon)
    if (elements.playlistAddToQueueBtn) {
      elements.playlistAddToQueueBtn.style.display = tracks.length > 0 ? 'inline-flex' : 'none';
      elements.playlistAddToQueueBtn.onclick = (e) => {
        if (e) e.stopPropagation();
        const listToQueue = (sortedTracks && sortedTracks.length > 0) ? sortedTracks : tracks;
        addEntirePlaylistToQueue(listToQueue, title);
      };
    }

    // Download Entire Playlist (Desktop Icon)
    if (elements.playlistDownloadAllBtn) {
      const canDownload = playlistId !== 'downloaded' && playlistId !== 'local' && tracks.length > 0;
      elements.playlistDownloadAllBtn.style.display = canDownload ? 'inline-flex' : 'none';
      elements.playlistDownloadAllBtn.onclick = (e) => {
        if (e) e.stopPropagation();
        const listToDownload = (sortedTracks && sortedTracks.length > 0) ? sortedTracks : tracks;
        downloadEntirePlaylist(listToDownload, title);
      };
    }

    // Mobile 3-horizontal-bars button to open playlist options bottom sheet
    if (elements.mobilePlaylistMoreBtn) {
      elements.mobilePlaylistMoreBtn.onclick = (e) => {
        e.stopPropagation();
        if (elements.mobilePlaylistOptionsModal) {
          const titleEl = document.getElementById('mobPlaylistOptionsTitle');
          const subEl = document.getElementById('mobPlaylistOptionsSub');
          if (titleEl) titleEl.textContent = title;
          if (subEl) {
            subEl.textContent = `${tracks.length} songs • ${isCustom ? 'Custom Playlist' : 'Playlist'}`;
          }

          const listToActOn = (sortedTracks && sortedTracks.length > 0) ? sortedTracks : tracks;

          if (elements.mobOptAddPlaylistToQueueBtn) {
            elements.mobOptAddPlaylistToQueueBtn.style.display = tracks.length > 0 ? 'flex' : 'none';
            elements.mobOptAddPlaylistToQueueBtn.onclick = () => {
              elements.mobilePlaylistOptionsModal.style.display = 'none';
              addEntirePlaylistToQueue(listToActOn, title);
            };
          }

          if (elements.mobOptDownloadPlaylistBtn) {
            const canDownload = playlistId !== 'downloaded' && playlistId !== 'local' && tracks.length > 0;
            elements.mobOptDownloadPlaylistBtn.style.display = canDownload ? 'flex' : 'none';
            elements.mobOptDownloadPlaylistBtn.onclick = () => {
              elements.mobilePlaylistOptionsModal.style.display = 'none';
              downloadEntirePlaylist(listToActOn, title);
            };
          }

          if (elements.mobOptRenamePlaylistBtn) {
            elements.mobOptRenamePlaylistBtn.style.display = isCustom ? 'flex' : 'none';
          }

          if (elements.mobOptDeletePlaylistBtn) {
            elements.mobOptDeletePlaylistBtn.style.display = isCustom ? 'flex' : 'none';
          }

          const pl = state.customPlaylists.find(p => p.id === playlistId);
          if (elements.mobOptPinPlaylistBtn) {
            elements.mobOptPinPlaylistBtn.style.display = pl ? 'flex' : 'none';
            if (pl) {
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
          }

          elements.mobilePlaylistOptionsModal.style.display = 'flex';
        }
      };
    }
  }

  // Delete Custom Playlist Confirmation (MusiSurf Dark Themed Modal)
  function promptDeleteCurrentPlaylist(playlistId, title) {
    if (!isAuthenticated()) {
      requireAuthForAction('manage playlists');
      return;
    }
    if (!playlistId || playlistId === 'liked' || playlistId === 'downloaded' || playlistId === 'local') return;
    const pl = state.customPlaylists.find(p => p.id === playlistId);
    const safeTitle = (pl && pl.name) ? pl.name : (title && title !== 'NONE' && title !== 'undefined' ? title : (elements.playlistTitle?.textContent || 'Playlist'));
    state._deletingPlaylistId = playlistId;
    state._deletingPlaylistTitle = safeTitle;
    if (elements.deletePlaylistConfirmModal) {
      if (elements.deletePlaylistModalTargetName) {
        elements.deletePlaylistModalTargetName.textContent = (safeTitle || 'Playlist').trim();
      }
      const subEl = document.getElementById('deletePlaylistModalTargetSub');
      if (subEl) {
        const trackCount = pl && Array.isArray(pl.tracks) ? pl.tracks.length : 0;
        subEl.textContent = `${trackCount} ${trackCount === 1 ? 'song' : 'songs'} • Custom Playlist`;
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
    if (state.currentUser && state.currentUser.id && !playlistId.startsWith('pl_')) {
      fetch(`/api/library/playlists/${playlistId}`, {
        method: 'DELETE',
        credentials: 'include'
      }).catch(err => console.warn('[Neon Playlists] Delete error:', err.message));
    }
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
    if (!isAuthenticated()) {
      requireAuthForAction('manage playlists');
      return;
    }
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

  // ==========================================================================
  // EXTERNAL PLAYLIST IMPORT & TRANSFER CONTROLLER
  // ==========================================================================

  const importWorkflowState = {
    method: 'link', // 'link' or 'file'
    selectedFile: null,
    selectedFileContent: '',
    parsedPlaylist: null,
    matchResults: [],
    matchedStats: null,
    currentReviewIndex: -1,
    duplicateExisting: null,
    createdPlaylistId: null
  };

  function resetImportModalUI() {
    importWorkflowState.method = 'link';
    importWorkflowState.selectedFile = null;
    importWorkflowState.selectedFileContent = '';
    importWorkflowState.parsedPlaylist = null;
    importWorkflowState.matchResults = [];
    importWorkflowState.matchedStats = null;
    importWorkflowState.currentReviewIndex = -1;
    importWorkflowState.duplicateExisting = null;

    if (elements.importStepChoose) elements.importStepChoose.style.display = 'block';
    if (elements.importStepProgress) elements.importStepProgress.style.display = 'none';
    if (elements.importStepPreview) elements.importStepPreview.style.display = 'none';
    if (elements.importStepSuccess) elements.importStepSuccess.style.display = 'none';

    if (elements.importPlaylistUrlInput) elements.importPlaylistUrlInput.value = '';
    if (elements.importYtMusicUrlInput) elements.importYtMusicUrlInput.value = '';
    if (elements.importPlaylistFileInput) elements.importPlaylistFileInput.value = '';
    if (elements.importSelectedFileInfo) elements.importSelectedFileInfo.style.display = 'none';
    if (elements.importDropZone) elements.importDropZone.style.display = 'block';
    if (elements.importValidationError) elements.importValidationError.style.display = 'none';
    if (elements.importDuplicateNotice) elements.importDuplicateNotice.style.display = 'none';
    if (elements.spotifyDetectedIdPill) elements.spotifyDetectedIdPill.style.display = 'none';
    if (elements.ytDetectedIdPill) elements.ytDetectedIdPill.style.display = 'none';

    // Reset tabs
    switchImportTab('spotify');
    checkSpotifyAuthStatus();
    checkGoogleAuthStatus();
  }

  function checkSpotifyAuthStatus() {
    fetch('/api/auth/spotify/status')
      .then(res => res.json())
      .then(data => {
        if (elements.spotifyAuthStatusDot) {
          if (data && data.connected) {
            elements.spotifyAuthStatusDot.className = 'status-indicator-dot dot-green';
            if (elements.spotifyConnectionTitle) elements.spotifyConnectionTitle.textContent = 'Spotify — Connected';
            if (elements.spotifyConnectionDesc) elements.spotifyConnectionDesc.textContent = 'Your Spotify account is connected for automatic importing.';
            if (elements.spotifyConnectHeaderBtn) elements.spotifyConnectHeaderBtn.style.display = 'none';
            if (elements.spotifyDisconnectHeaderBtn) elements.spotifyDisconnectHeaderBtn.style.display = 'inline-block';
          } else {
            elements.spotifyAuthStatusDot.className = 'status-indicator-dot dot-gray';
            if (elements.spotifyConnectionTitle) elements.spotifyConnectionTitle.textContent = 'Spotify — Not Connected';
            if (elements.spotifyConnectionDesc) elements.spotifyConnectionDesc.textContent = 'Connect your Spotify account to import playlists.';
            if (elements.spotifyConnectHeaderBtn) elements.spotifyConnectHeaderBtn.style.display = 'inline-block';
            if (elements.spotifyDisconnectHeaderBtn) elements.spotifyDisconnectHeaderBtn.style.display = 'none';
          }
        }
      })
      .catch(() => {});
  }

  function checkGoogleAuthStatus() {
    fetch('/api/auth/google/status')
      .then(res => res.json())
      .then(data => {
        if (elements.ytAuthStatusDot) {
          if (data && data.connected) {
            elements.ytAuthStatusDot.className = 'status-indicator-dot dot-green';
            if (elements.ytConnectionTitle) elements.ytConnectionTitle.textContent = 'YouTube Music — Connected';
            if (elements.ytConnectionDesc) elements.ytConnectionDesc.textContent = 'Your Google account is connected for automatic importing.';
            if (elements.ytConnectHeaderBtn) elements.ytConnectHeaderBtn.style.display = 'none';
            if (elements.ytDisconnectHeaderBtn) elements.ytDisconnectHeaderBtn.style.display = 'inline-block';
          } else {
            elements.ytAuthStatusDot.className = 'status-indicator-dot dot-gray';
            if (elements.ytConnectionTitle) elements.ytConnectionTitle.textContent = 'YouTube Music — Not Connected';
            if (elements.ytConnectionDesc) elements.ytConnectionDesc.textContent = 'Connect your Google account to import supported YouTube Music playlists.';
            if (elements.ytConnectHeaderBtn) elements.ytConnectHeaderBtn.style.display = 'inline-block';
            if (elements.ytDisconnectHeaderBtn) elements.ytDisconnectHeaderBtn.style.display = 'none';
          }
        }
      })
      .catch(() => {});
  }

  function clientExtractSpotifyPlaylistInfo(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (trimmed.startsWith('spotify:playlist:')) {
      const parts = trimmed.replace('spotify:playlist:', '').split('?');
      const id = parts[0].trim();
      const params = new URLSearchParams(parts[1] || '');
      const hasPt = Boolean(params.get('pt'));
      const hasSi = Boolean(params.get('si'));
      return /^[a-zA-Z0-9]{15,35}$/.test(id) ? {
        id,
        hasPtToken: hasPt,
        hasSharingParams: hasPt || hasSi,
        pt: params.get('pt') || '',
        si: params.get('si') || ''
      } : null;
    }
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.toLowerCase();
      if (host !== 'open.spotify.com' && host !== 'play.spotify.com' && host !== 'spotify.com') {
        return null;
      }
      const segments = parsed.pathname.split('/').filter(Boolean);
      const idx = segments.indexOf('playlist');
      if (idx !== -1 && segments[idx + 1]) {
        const id = segments[idx + 1].trim();
        const hasPt = Boolean(parsed.searchParams.get('pt'));
        const hasSi = Boolean(parsed.searchParams.get('si'));
        return /^[a-zA-Z0-9]{15,35}$/.test(id) ? {
          id,
          hasPtToken: hasPt,
          hasSharingParams: hasPt || hasSi,
          pt: parsed.searchParams.get('pt') || '',
          si: parsed.searchParams.get('si') || ''
        } : null;
      }
    } catch (e) {}
    return null;
  }

  function clientExtractYouTubePlaylistId(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    const ytRegex = /^(PL|OLAK5uy_|RDCLAK5uy_|RD|UU|FL|LL|TL|VL)[a-zA-Z0-9_\-]{8,120}$/i;
    if (ytRegex.test(trimmed)) return trimmed.replace(/^VL/i, '');
    try {
      const parsed = new URL(trimmed);
      const list = parsed.searchParams.get('list');
      if (list && list.length >= 8) return list.replace(/^VL/i, '');
      const segments = parsed.pathname.split('/').filter(Boolean);
      const bIdx = segments.indexOf('browse');
      if (bIdx !== -1 && segments[bIdx + 1]) {
        return segments[bIdx + 1].replace(/^VL/i, '');
      }
    } catch (e) {}
    return null;
  }

  function switchImportTab(method) {
    if (method === 'link') method = 'spotify';
    importWorkflowState.method = method;

    if (elements.importMethodSpotifyTab) elements.importMethodSpotifyTab.classList.toggle('active', method === 'spotify');
    if (elements.importMethodLinkTab && elements.importMethodLinkTab !== elements.importMethodSpotifyTab) {
      elements.importMethodLinkTab.classList.toggle('active', method === 'spotify');
    }
    if (elements.importMethodYtMusicTab) elements.importMethodYtMusicTab.classList.toggle('active', method === 'ytmusic');
    if (elements.importMethodFileTab) elements.importMethodFileTab.classList.toggle('active', method === 'file');

    if (elements.importLinkBody) elements.importLinkBody.style.display = method === 'spotify' ? 'block' : 'none';
    if (elements.importYtMusicBody) elements.importYtMusicBody.style.display = method === 'ytmusic' ? 'block' : 'none';
    if (elements.importFileBody) elements.importFileBody.style.display = method === 'file' ? 'block' : 'none';
    if (elements.importValidationError) elements.importValidationError.style.display = 'none';
  }

  function promptSpotifyConnect() {
    const url = (elements.importPlaylistUrlInput?.value || '').trim();
    const info = clientExtractSpotifyPlaylistInfo(url);
    const pendingQuery = url ? `?pending_url=${encodeURIComponent(url)}&pending_id=${encodeURIComponent(info?.id || '')}` : '';

    fetch('/api/auth/spotify/status')
      .then(res => res.json())
      .then(data => {
        if (data && data.configured) {
          window.location.href = `/api/auth/spotify/login${pendingQuery}`;
        } else {
          showImportError('Spotify integration is not configured on the server. Please add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the server environment.');
        }
      })
      .catch(() => {
        window.location.href = `/api/auth/spotify/login${pendingQuery}`;
      });
  }

  function promptGoogleConnect() {
    const url = (elements.importYtMusicUrlInput?.value || '').trim();
    const ytId = clientExtractYouTubePlaylistId(url);
    const pendingQuery = url ? `?pending_url=${encodeURIComponent(url)}&pending_id=${encodeURIComponent(ytId || '')}` : '';

    fetch('/api/auth/google/status')
      .then(res => res.json())
      .then(data => {
        if (data && data.configured) {
          window.location.href = `/api/auth/google/login${pendingQuery}`;
        } else {
          showImportError('Google integration is not configured on the server. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the server environment.');
        }
      })
      .catch(() => {
        window.location.href = `/api/auth/google/login${pendingQuery}`;
      });
  }

  function showImportError(msg, requiresAuth = false, code = null) {
    if (!elements.importValidationError) {
      showToast(msg, '⚠️');
      return;
    }

    elements.importValidationError.style.display = 'block';

    if (code === 'ERR_SPOTIFY_ITEMS_RESTRICTED') {
      elements.importValidationError.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 5px;">Spotify API Permission Restriction</div>
        <p style="margin: 0 0 10px 0; font-size: 0.83rem; line-height: 1.45; opacity: 0.95;">${escapeHtml(msg)}</p>
        <div class="import-error-actions">
          <button type="button" class="import-error-action-btn primary-action" id="errorBtnConnectOwner">
            Connect Owner Account
          </button>
          <button type="button" class="import-error-action-btn" id="errorBtnFallbackFile">
            Import via Playlist File (CSV/M3U)
          </button>
        </div>
      `;
      const btnOwner = elements.importValidationError.querySelector('#errorBtnConnectOwner');
      if (btnOwner) btnOwner.onclick = () => promptSpotifyConnect();
      const btnFile = elements.importValidationError.querySelector('#errorBtnFallbackFile');
      if (btnFile) btnFile.onclick = () => switchImportTab('file');
      return;
    }

    if (code === 'ERR_SPOTIFY_AUTH_REQUIRED' || (requiresAuth && importWorkflowState.method === 'spotify')) {
      elements.importValidationError.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 5px;">Spotify Authorization Required</div>
        <p style="margin: 0 0 10px 0; font-size: 0.83rem; line-height: 1.45; opacity: 0.95;">${escapeHtml(msg)}</p>
        <div class="import-error-actions">
          <button type="button" class="import-error-action-btn primary-action" id="errorBtnConnectSpotify">
            Connect Spotify
          </button>
          <button type="button" class="import-error-action-btn" id="errorBtnSwitchFile">
            Import via Playlist File
          </button>
        </div>
      `;
      const btnConn = elements.importValidationError.querySelector('#errorBtnConnectSpotify');
      if (btnConn) btnConn.onclick = () => promptSpotifyConnect();
      const btnFile = elements.importValidationError.querySelector('#errorBtnSwitchFile');
      if (btnFile) btnFile.onclick = () => switchImportTab('file');
      return;
    }

    if (code === 'ERR_YTMUSIC_AUTH_REQUIRED' || code === 'ERR_GOOGLE_AUTH_EXPIRED' || (requiresAuth && importWorkflowState.method === 'ytmusic')) {
      elements.importValidationError.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 5px;">Google Authorization Required</div>
        <p style="margin: 0 0 10px 0; font-size: 0.83rem; line-height: 1.45; opacity: 0.95;">${escapeHtml(msg)}</p>
        <div class="import-error-actions">
          <button type="button" class="import-error-action-btn primary-action" id="errorBtnConnectGoogle" style="background: rgba(255, 0, 0, 0.25); border-color: rgba(255, 0, 0, 0.5); color: #ff5252;">
            Connect Google Account
          </button>
          <button type="button" class="import-error-action-btn" id="errorBtnSwitchFileYt">
            Import via Playlist File
          </button>
        </div>
      `;
      const btnGoogle = elements.importValidationError.querySelector('#errorBtnConnectGoogle');
      if (btnGoogle) btnGoogle.onclick = () => promptGoogleConnect();
      const btnFile = elements.importValidationError.querySelector('#errorBtnSwitchFileYt');
      if (btnFile) btnFile.onclick = () => switchImportTab('file');
      return;
    }

    elements.importValidationError.textContent = msg;
  }

  function openImportPlaylistModal() {
    resetImportModalUI();
    if (elements.importPlaylistModal) {
      elements.importPlaylistModal.style.display = 'flex';
    }
  }

  function closeImportPlaylistModal() {
    if (elements.importPlaylistModal) {
      elements.importPlaylistModal.style.display = 'none';
    }
  }

  async function loadImportHistoryUI() {
    if (!elements.settingsImportHistoryList) return;
    try {
      const res = await fetch('/api/import/history', { credentials: 'include' });
      const data = await res.json();
      const list = data && Array.isArray(data.history) ? data.history : [];
      if (list.length === 0) {
        elements.settingsImportHistoryList.innerHTML = '<div class="import-history-empty">No playlists imported yet. Paste a link or upload a file above to transfer your playlists!</div>';
        return;
      }
      elements.settingsImportHistoryList.innerHTML = '';
      list.forEach(item => {
        const div = document.createElement('div');
        div.className = 'import-history-item';
        const dateStr = item.importedAt ? new Date(item.importedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently';
        div.innerHTML = `
          <div class="import-history-left">
            <span class="import-history-badge">${escapeHtml(item.provider || 'SPOTIFY')}</span>
            <div>
              <h4 class="import-history-name">${escapeHtml(item.playlistName || 'Imported Playlist')}</h4>
              <p class="import-history-meta">${item.trackCount || 0} songs • ${dateStr}</p>
            </div>
          </div>
          <button type="button" class="sound-pill-btn" style="padding: 4px 10px; font-size: 0.78rem;">Open</button>
        `;
        const openBtn = div.querySelector('button');
        openBtn.onclick = () => {
          if (elements.settingsModal) elements.settingsModal.style.display = 'none';
          if (item.playlistId) renderPlaylistView(item.playlistId);
        };
        elements.settingsImportHistoryList.appendChild(div);
      });
    } catch (err) {
      console.warn('[ImportHistory] Load note:', err.message);
    }
  }

  async function startImportWorkflow() {
    if (elements.importValidationError) elements.importValidationError.style.display = 'none';

    let payload = {};
    if (importWorkflowState.method === 'spotify' || importWorkflowState.method === 'link') {
      const url = (elements.importPlaylistUrlInput?.value || '').trim();
      if (!url) {
        showImportError('Please enter a Spotify playlist URL or URI.');
        return;
      }
      payload.url = url;
    } else if (importWorkflowState.method === 'ytmusic') {
      const url = (elements.importYtMusicUrlInput?.value || '').trim();
      if (!url) {
        showImportError('Please enter a YouTube Music or YouTube playlist link.');
        return;
      }
      payload.url = url;
    } else {
      if (!importWorkflowState.selectedFileContent) {
        showImportError('Please select or drop a playlist file to upload.');
        return;
      }
      payload.fileContent = importWorkflowState.selectedFileContent;
      payload.filename = importWorkflowState.selectedFile?.name || 'playlist.m3u';
    }

    // Step 2: Show progress screen
    if (elements.importStepChoose) elements.importStepChoose.style.display = 'none';
    if (elements.importStepProgress) elements.importStepProgress.style.display = 'block';
    if (elements.importProgressStatusText) elements.importProgressStatusText.textContent = 'Connecting to provider & reading tracks...';
    if (elements.importProgressBarFill) elements.importProgressBarFill.style.width = '25%';

    try {
      // 1. Parse playlist
      const parseRes = await fetch('/api/import/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const parseData = await parseRes.json();
      if (!parseRes.ok || !parseData.success || !parseData.playlist) {
        const errorMsg = parseData.error || 'Failed to parse playlist';
        const errObj = new Error(errorMsg);
        errObj.requiresAuth = Boolean(parseData.requiresAuth);
        errObj.code = parseData.code;
        throw errObj;
      }

      const externalPlaylist = parseData.playlist;
      importWorkflowState.parsedPlaylist = externalPlaylist;

      if (!externalPlaylist.tracks || externalPlaylist.tracks.length === 0) {
        throw new Error('This playlist contains 0 tracks or is empty.');
      }

      // Update progress
      if (elements.importProgressStatusText) {
        elements.importProgressStatusText.textContent = `Matching ${externalPlaylist.tracks.length} songs against MusiSurf catalogue...`;
      }
      if (elements.importProgressBarFill) elements.importProgressBarFill.style.width = '60%';
      if (elements.importProgressCountText) {
        elements.importProgressCountText.textContent = `Processing ${externalPlaylist.tracks.length} tracks`;
      }

      // 2. Match tracks
      const matchRes = await fetch('/api/import/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playlist: externalPlaylist })
      });
      const matchData = await matchRes.json();
      if (!matchRes.ok || !matchData.success) {
        throw new Error(matchData.error || 'Failed to match tracks');
      }

      importWorkflowState.matchResults = matchData.results || [];
      importWorkflowState.matchedStats = matchData.stats || {};

      // 3. Check for potential duplicate imports
      try {
        const dupRes = await fetch('/api/import/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: externalPlaylist.name,
            externalId: externalPlaylist.externalPlaylistId || ''
          })
        });
        const dupData = await dupRes.json();
        if (dupData && dupData.exists) {
          importWorkflowState.duplicateExisting = dupData.existing;
        }
      } catch (dupErr) {
        console.warn('[Import] Duplicate check note:', dupErr.message);
      }

      if (elements.importProgressBarFill) elements.importProgressBarFill.style.width = '100%';

      // Move to Step 3: Preview Screen
      renderImportPreviewUI();

    } catch (err) {
      console.error('[Import] Workflow error:', err);
      if (elements.importStepProgress) elements.importStepProgress.style.display = 'none';
      if (elements.importStepChoose) elements.importStepChoose.style.display = 'block';
      showImportError(err.message || 'Import failed. Check the URL/file and try again.', err.requiresAuth, err.code);
    }
  }

  function renderImportPreviewUI() {
    if (elements.importStepProgress) elements.importStepProgress.style.display = 'none';
    if (elements.importStepChoose) elements.importStepChoose.style.display = 'none';
    if (elements.importStepPreview) elements.importStepPreview.style.display = 'block';

    const pl = importWorkflowState.parsedPlaylist || {};
    const results = importWorkflowState.matchResults || [];

    // Header info
    if (elements.importPreviewName) elements.importPreviewName.textContent = pl.name || 'Imported Playlist';
    if (elements.importPreviewDesc) elements.importPreviewDesc.textContent = pl.description || `Transfer from ${pl.provider || 'external'}`;
    if (elements.importPreviewProviderTag) elements.importPreviewProviderTag.textContent = (pl.provider || 'SPOTIFY').toUpperCase();
    if (elements.importPreviewCountBadge) elements.importPreviewCountBadge.textContent = `${results.length} tracks`;

    if (elements.importPreviewCover) {
      if (pl.artwork) {
        elements.importPreviewCover.src = pl.artwork;
        elements.importPreviewCover.style.display = 'block';
      } else {
        elements.importPreviewCover.src = '/icons/icon-192.png';
      }
    }

    // Stats calculations
    let matched = 0;
    let review = 0;
    let unmatched = 0;

    results.forEach(r => {
      if (r.excluded) return;
      if (r.status === 'matched') matched++;
      else if (r.status === 'review') review++;
      else unmatched++;
    });

    if (elements.statSourceTotal) elements.statSourceTotal.textContent = results.length;
    if (elements.statMatchedCount) elements.statMatchedCount.textContent = matched;
    if (elements.statReviewCount) elements.statReviewCount.textContent = review;
    if (elements.statUnmatchedCount) elements.statUnmatchedCount.textContent = unmatched;

    // Duplicate Banner
    if (elements.importDuplicateNotice) {
      elements.importDuplicateNotice.style.display = importWorkflowState.duplicateExisting ? 'flex' : 'none';
    }

    // Render Track Rows
    if (elements.importPreviewTracksBody) {
      elements.importPreviewTracksBody.innerHTML = '';
      results.forEach((r, idx) => {
        const row = document.createElement('div');
        row.className = `import-track-row ${r.excluded ? 'is-excluded' : ''}`;
        row.dataset.resultIndex = idx;

        const thumbUrl = r.matchedTrack?.image || r.source?.artwork || '/icons/icon.svg';
        const displayTitle = r.matchedTrack?.title || r.source?.title || 'Unknown Title';
        const displayArtist = r.matchedTrack?.artist || r.source?.artist || 'Various Artists';

        let badgeHtml = '';
        if (r.status === 'matched') {
          badgeHtml = `<span class="match-status-badge badge-matched" title="${r.confidence}% Match">✓ Matched</span>`;
        } else if (r.status === 'review') {
          badgeHtml = `<span class="match-status-badge badge-review" role="button" title="Click to review candidates">⚠️ Review</span>`;
        } else {
          badgeHtml = `<span class="match-status-badge badge-unmatched" title="Song not found in MusiSurf catalogue">✕ Not Found</span>`;
        }

        row.innerHTML = `
          <span style="color: var(--text-subdued);">${idx + 1}</span>
          <div class="import-track-title-cell">
            <img src="${thumbUrl}" class="import-track-thumb" alt="Track Art" onerror="this.src='/icons/icon.svg'" />
            <span class="import-track-title-text" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</span>
          </div>
          <span class="import-track-artist-text" title="${escapeHtml(displayArtist)}">${escapeHtml(displayArtist)}</span>
          <div>${badgeHtml}</div>
          <div>
            <button type="button" class="exclude-track-btn" title="${r.excluded ? 'Include track' : 'Exclude track'}">${r.excluded ? '↩' : '&times;'}</button>
          </div>
        `;

        // Review click
        const reviewBadge = row.querySelector('.badge-review');
        if (reviewBadge) {
          reviewBadge.addEventListener('click', () => openCandidateReview(idx));
        }

        // Exclude / Include button
        const excludeBtn = row.querySelector('.exclude-track-btn');
        if (excludeBtn) {
          excludeBtn.addEventListener('click', () => {
            r.excluded = !r.excluded;
            renderImportPreviewUI();
          });
        }

        elements.importPreviewTracksBody.appendChild(row);
      });
    }

    // Summary footer text
    if (elements.importPreviewSummaryText) {
      elements.importPreviewSummaryText.textContent = `Ready to import ${matched} playable songs out of ${results.length} source songs. Unmatched entries will be excluded from playback.`;
    }
  }

  function openCandidateReview(resultIndex) {
    importWorkflowState.currentReviewIndex = resultIndex;
    const r = importWorkflowState.matchResults[resultIndex];
    if (!r) return;

    if (elements.candReviewSourceTitle) elements.candReviewSourceTitle.textContent = r.source.title || '';
    if (elements.candReviewSourceMeta) {
      elements.candReviewSourceMeta.textContent = `${r.source.artist || ''} • ${formatDuration(r.source.duration || 0)}`;
    }

    if (elements.candReviewList) {
      elements.candReviewList.innerHTML = '';
      const candidates = r.candidates || [];
      if (candidates.length === 0) {
        elements.candReviewList.innerHTML = '<div style="color: var(--text-subdued); padding: 12px; text-align: center;">No alternative candidates found</div>';
      } else {
        candidates.forEach(cand => {
          const card = document.createElement('div');
          card.className = 'candidate-card-item';
          const score = Math.round(cand.score ? cand.score * 100 : r.confidence);
          card.innerHTML = `
            <div class="candidate-card-left">
              <img src="${cand.image || '/icons/icon.svg'}" class="candidate-thumb" alt="Thumb" onerror="this.src='/icons/icon.svg'" />
              <div>
                <h4 class="candidate-title">${escapeHtml(cand.title)}</h4>
                <p class="candidate-sub">${escapeHtml(cand.artist)} • ${formatDuration(cand.duration || 0)}</p>
              </div>
            </div>
            <span class="candidate-score-badge">${score}% Match</span>
          `;
          card.onclick = () => {
            r.matchedTrack = cand;
            r.status = 'matched';
            r.confidence = score;
            if (elements.candidateReviewModal) elements.candidateReviewModal.style.display = 'none';
            renderImportPreviewUI();
          };
          elements.candReviewList.appendChild(card);
        });
      }
    }

    if (elements.candidateReviewModal) elements.candidateReviewModal.style.display = 'flex';
  }

  async function executeConfirmImport() {
    const pl = importWorkflowState.parsedPlaylist;
    const results = importWorkflowState.matchResults || [];
    if (!pl) return;

    // Collect confirmed playable tracks in source order (preserving intentional duplicates!)
    const confirmedPlayableTracks = [];
    results.forEach(r => {
      if (!r.excluded && r.status === 'matched' && r.matchedTrack && r.matchedTrack.id) {
        confirmedPlayableTracks.push(r.matchedTrack);
      }
    });

    if (confirmedPlayableTracks.length === 0) {
      showToast('No playable songs matched to import.', '⚠️');
      return;
    }

    const dupRadio = document.querySelector('input[name="duplicateAction"]:checked');
    const duplicateAction = dupRadio ? dupRadio.value : 'create_new';

    try {
      if (elements.confirmCreatePlaylistBtn) {
        elements.confirmCreatePlaylistBtn.disabled = true;
        elements.confirmCreatePlaylistBtn.innerHTML = '<span>Creating Playlist...</span>';
      }

      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          playlistName: pl.name,
          description: pl.description,
          coverUrl: pl.artwork,
          confirmedTracks: confirmedPlayableTracks,
          provider: pl.provider || 'spotify',
          externalPlaylistId: pl.externalPlaylistId || '',
          duplicateAction: duplicateAction,
          targetPlaylistId: importWorkflowState.duplicateExisting?.id || null
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create playlist');
      }

      const created = data.playlist;
      importWorkflowState.createdPlaylistId = created.id;

      // Ensure client local state is synchronized
      const existingIdx = state.customPlaylists.findIndex(p => p.id === created.id);
      if (existingIdx !== -1) {
        state.customPlaylists[existingIdx] = created;
      } else {
        state.customPlaylists.push(created);
      }
      saveStoredPlaylists();
      renderSidebarPlaylists();
      updateLibraryUI();

      // Show Step 4: Success View
      if (elements.importStepPreview) elements.importStepPreview.style.display = 'none';
      if (elements.importStepSuccess) elements.importStepSuccess.style.display = 'block';
      if (elements.importSuccessSub) {
        elements.importSuccessSub.textContent = `Created playlist "${created.name}" with ${confirmedPlayableTracks.length} playable songs.`;
      }

      showToast(`✓ Imported playlist "${created.name}"!`, '🎉');

      // Refresh settings import history
      loadImportHistoryUI();

    } catch (err) {
      console.error('[Import] Creation error:', err);
      showToast(err.message || 'Failed to create playlist', '❌');
    } finally {
      if (elements.confirmCreatePlaylistBtn) {
        elements.confirmCreatePlaylistBtn.disabled = false;
        elements.confirmCreatePlaylistBtn.innerHTML = '<span>Confirm & Create Playlist</span>';
      }
    }
  }

  function renderSidebarPlaylists() {
    if (!elements.customPlaylistsList) return;
    elements.customPlaylistsList.innerHTML = '';

    const sortMode = localStorage.getItem('musisurf_sidebar_lib_sort') || 'recents';
    const searchQuery = (state.sidebarLibSearchQuery || '').trim().toLowerCase();

    // Sort playlists: pinned playlists first, then unpinned by lastPlayedAt or alphabetical
    let sorted = [...(state.customPlaylists || [])];
    if (searchQuery) {
      sorted = sorted.filter(pl => (pl.name || '').toLowerCase().includes(searchQuery));
    }

    sorted.sort((a, b) => {
      const aPinned = Boolean(a.isPinned);
      const bPinned = Boolean(b.isPinned);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      if (sortMode === 'alphabetical') {
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
      }
      return (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0);
    });

    sorted.forEach((pl, idx) => {
      const div = document.createElement('div');
      div.className = `playlist-list-item library-item ${pl.isPinned ? 'is-pinned' : ''}`;
      div.dataset.playlistId = pl.id;
      div.innerHTML = `
        <div class="playlist-cover-mini">
          ${createPlaylistCollageHtml(pl.tracks)}
        </div>
        <div class="library-item-info">
          <span class="library-item-title">${escapeHtml(pl.name)}</span>
          <span class="library-item-meta">${pl.isPinned ? '📌 ' : ''}Playlist • ${escapeHtml(pl.owner || 'Hritik Raj')}</span>
        </div>
        ${pl.isPinned ? '<span class="sidebar-pin-icon" title="Pinned">📌</span>' : ''}
      `;

      // Regular Row Click (Opens playlist)
      div.addEventListener('click', () => {
        renderPlaylistView(pl.id);
      });
      elements.customPlaylistsList.appendChild(div);
    });
  }

  // ==========================================================================
  // QUEUE DRAWER CONTROLLER
  // ==========================================================================
  let draggedUserQueueIndex = null;

  function updateQueueDrawerUI() {
    // 1. Now Playing Section
    if (elements.queueNowPlaying) {
      if (state.currentTrack) {
        elements.queueNowPlaying.innerHTML = `
          <div class="queue-now-playing-card">
            <div class="queue-now-playing-cover">
              <img src="${state.currentTrack.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80'}" alt="${escapeHtml(state.currentTrack.title)}" class="queue-now-playing-img">
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
    }

    // 2. Next In Queue (User-queued items with drag-and-drop reordering)
    if (elements.queueUserSection && elements.queueUserList) {
      if (state.userQueue && state.userQueue.length > 0) {
        elements.queueUserSection.style.display = 'block';
        elements.queueUserList.innerHTML = '';
        const fragment = document.createDocumentFragment();

        state.userQueue.forEach((t, i) => {
          const card = document.createElement('div');
          card.className = 'queue-card user-queue-item';
          card.draggable = true;
          card.dataset.index = i;
          card.innerHTML = `
            <div class="queue-drag-handle" title="Drag to reorder">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
              </svg>
            </div>
            <img src="${t.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80'}" alt="${escapeHtml(t.title)}" class="queue-img" loading="lazy">
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

          // Drag and drop reordering handlers
          card.addEventListener('dragstart', (e) => {
            draggedUserQueueIndex = i;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', i);
          });

          card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            card.classList.add('drag-over');
          });

          card.addEventListener('dragleave', () => {
            card.classList.remove('drag-over');
          });

          card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');
            const targetIdx = i;
            if (draggedUserQueueIndex !== null && draggedUserQueueIndex !== targetIdx) {
              const [movedItem] = state.userQueue.splice(draggedUserQueueIndex, 1);
              state.userQueue.splice(targetIdx, 0, movedItem);
              state.queue = [state.currentTrack, ...state.userQueue, ...state.contextQueue.slice(state.contextIndex + 1)];
              updateQueueDrawerUI();
              showToast('Queue reordered', '✓');
            }
            draggedUserQueueIndex = null;
          });

          card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            document.querySelectorAll('.queue-card.drag-over').forEach(el => el.classList.remove('drag-over'));
            draggedUserQueueIndex = null;
          });

          card.querySelector('.remove-queue-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            state.userQueue.splice(i, 1);
            state.queue = [state.currentTrack, ...state.userQueue, ...state.contextQueue.slice(state.contextIndex + 1)];
            updateQueueDrawerUI();
          });

          card.addEventListener('click', (e) => {
            if (e.target.closest('.remove-queue-btn') || e.target.closest('.queue-drag-handle')) return;
            state.userQueue.splice(i, 1);
            playTrack(t, null, true);
          });

          fragment.appendChild(card);
        });
        elements.queueUserList.appendChild(fragment);
      } else {
        elements.queueUserSection.style.display = 'none';
        elements.queueUserList.innerHTML = '';
      }
    }

    // 3. Next Up Section (Upcoming from Context / Playlist)
    if (elements.queueList) {
      elements.queueList.innerHTML = '';

      if (elements.queueContextHeading) {
        if (state.activePlaylistId === 'liked') {
          elements.queueContextHeading.textContent = 'Next from: Liked Songs';
        } else if (state.activePlaylistId === 'downloaded') {
          elements.queueContextHeading.textContent = 'Next from: Downloaded';
        } else if (state.activePlaylistId === 'local') {
          elements.queueContextHeading.textContent = 'Next from: Local Files';
        } else if (state.activePlaylistId && state.customPlaylists) {
          const pl = state.customPlaylists.find(p => p.id === state.activePlaylistId);
          elements.queueContextHeading.textContent = pl ? `Next from: ${pl.name}` : 'Next Up';
        } else {
          elements.queueContextHeading.textContent = 'Next Up';
        }
      }

      const upcoming = state.contextQueue ? state.contextQueue.slice(state.contextIndex + 1, state.contextIndex + 50) : [];

      if (upcoming.length === 0) {
        elements.queueList.innerHTML = '<span style="color: var(--text-muted); font-size: 0.82rem; padding: 10px 0; display: block;">No upcoming songs in context</span>';
      } else {
        const fragment = document.createDocumentFragment();
        upcoming.forEach((t, i) => {
          const card = document.createElement('div');
          card.className = 'queue-card';
          card.innerHTML = `
            <img src="${t.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80'}" alt="${escapeHtml(t.title)}" class="queue-img" loading="lazy">
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
            state.contextQueue.splice(state.contextIndex + 1 + i, 1);
            state.queue = [state.currentTrack, ...state.userQueue, ...state.contextQueue.slice(state.contextIndex + 1)];
            updateQueueDrawerUI();
          });

          card.addEventListener('click', () => {
            state.contextIndex = state.contextIndex + 1 + i;
            playTrack(t, state.contextQueue, true);
          });

          fragment.appendChild(card);
        });
        elements.queueList.appendChild(fragment);
      }
    }

    // 4. Recommended Section (Smart Endless Recommendations)
    if (elements.queueRecommendedSection && elements.queueRecommendedList) {
      if (elements.queueAutoplayToggleBtn) {
        elements.queueAutoplayToggleBtn.classList.toggle('active', Boolean(state.autoplay));
        const txt = elements.queueAutoplayToggleBtn.querySelector('.autoplay-text');
        if (txt) txt.textContent = state.autoplay ? 'Autoplay' : 'Autoplay Off';
      }

      if (!state.autoplay) {
        elements.queueRecommendedList.innerHTML = '<span style="color: var(--text-muted); font-size: 0.82rem; padding: 10px 0; display: block;">Smart Autoplay is currently turned off</span>';
      } else if (!state.recommendationQueue || state.recommendationQueue.length === 0) {
        if (state.isFetchingRecommendations) {
          elements.queueRecommendedList.innerHTML = '<span style="color: var(--text-muted); font-size: 0.82rem; padding: 10px 0; display: block;">✨ Finding vibe matches based on your listening...</span>';
        } else {
          elements.queueRecommendedList.innerHTML = '<span style="color: var(--text-muted); font-size: 0.82rem; padding: 10px 0; display: block;">Upcoming recommendations will automatically generate here</span>';
        }
      } else {
        elements.queueRecommendedList.innerHTML = '';
        const fragment = document.createDocumentFragment();

        state.recommendationQueue.forEach((t, i) => {
          const card = document.createElement('div');
          card.className = 'queue-card queue-reco-card';
          card.innerHTML = `
            <img src="${t.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80'}" alt="${escapeHtml(t.title)}" class="queue-img" loading="lazy">
            <div class="queue-card-info">
              <div class="queue-card-title">${escapeHtml(t.title)}${getPlaylistTickBadgeHtml(t.id)}${getDownloadedBadgeHtml(t.id)}</div>
              <div class="queue-card-artist">${escapeHtml(t.artist)}</div>
            </div>
            <div class="queue-card-actions">
              <button class="reco-action-btn reco-play-btn" title="Play Now" aria-label="Play Now">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </button>
              <button class="reco-action-btn reco-add-btn" title="Add to Manual Queue" aria-label="Add to Queue">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <button class="reco-action-btn remove-queue-btn" title="Dismiss recommendation" aria-label="Dismiss">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          `;

          // Play immediately
          card.querySelector('.reco-play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            recordTrackPlayed(t);
            state.recommendationQueue.splice(i, 1);
            playTrack(t, null, true);
          });

          // Add to manual user queue
          card.querySelector('.reco-add-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const [item] = state.recommendationQueue.splice(i, 1);
            addToQueue(item);
          });

          // Dismiss
          card.querySelector('.remove-queue-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            recordTrackRemoved(t);
            state.recommendationQueue.splice(i, 1);
            updateQueueDrawerUI();
            if (state.recommendationQueue.length <= 4) {
              fetchRecommendationBatch();
            }
          });

          card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            recordTrackPlayed(t);
            state.recommendationQueue.splice(i, 1);
            playTrack(t, null, true);
          });

          fragment.appendChild(card);
        });

        elements.queueRecommendedList.appendChild(fragment);
      }
    }
  }

  function openQueueDrawer() {
    if (elements.queueDrawer) {
      elements.queueDrawer.classList.add('open');
      if (elements.queueBtn) elements.queueBtn.classList.add('active');
      if (elements.queueDrawerBackdrop) elements.queueDrawerBackdrop.classList.add('active');
      requestAnimationFrame(updateQueueDrawerUI);
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
  // VIEW NAVIGATION CONTROLLER & HISTORY MANAGEMENT (Go Previous / Ahead)
  // ==========================================================================
  const appHistory = {
    stack: [{ view: 'home', playlistId: null }],
    index: 0,
    push(viewName, playlistId = null) {
      const current = this.stack[this.index];
      if (current && current.view === viewName && current.playlistId === playlistId) {
        this.updateButtons();
        return;
      }
      if (this.index < this.stack.length - 1) {
        this.stack = this.stack.slice(0, this.index + 1);
      }
      this.stack.push({ view: viewName, playlistId });
      this.index = this.stack.length - 1;
      this.updateButtons();
    },
    back() {
      if (this.index > 0) {
        this.index--;
        this.apply(this.stack[this.index]);
      }
    },
    forward() {
      if (this.index < this.stack.length - 1) {
        this.index++;
        this.apply(this.stack[this.index]);
      }
    },
    apply(item) {
      if (!item) return;
      if (item.view === 'playlist' && item.playlistId) {
        renderPlaylistView(item.playlistId, { pushHistory: false });
      } else {
        switchView(item.view, { pushHistory: false, force: true });
      }
      this.updateButtons();
    },
    updateButtons() {
      const canGoBack = this.index > 0;
      const canGoForward = this.index < this.stack.length - 1;
      if (elements.historyBackBtn) {
        elements.historyBackBtn.disabled = !canGoBack;
        elements.historyBackBtn.style.opacity = canGoBack ? '1' : '0.4';
        elements.historyBackBtn.style.cursor = canGoBack ? 'pointer' : 'default';
        elements.historyBackBtn.title = canGoBack ? 'Go back (Previous)' : 'No previous page';
      }
      if (elements.historyForwardBtn) {
        elements.historyForwardBtn.disabled = !canGoForward;
        elements.historyForwardBtn.style.opacity = canGoForward ? '1' : '0.4';
        elements.historyForwardBtn.style.cursor = canGoForward ? 'pointer' : 'default';
        elements.historyForwardBtn.title = canGoForward ? 'Go forward (Ahead)' : 'No forward page';
      }
    }
  };

  let navHistoryStack = ['home'];

  // Mobile Bottom Navigation Tabs Sync with Sliding Indicator
  const updateMobNav = (btnId) => {
    const map = {
      mobNavHome: 0,
      mobNavSearch: 1,
      mobNavLibrary: 2,
      mobNavDownloads: 3
    };
    const idx = map[btnId] !== undefined ? map[btnId] : 0;
    if (elements.mobileNavBar) {
      elements.mobileNavBar.style.setProperty('--nav-idx', idx);
    }
    const allMobBtns = [elements.mobNavHome, elements.mobNavSearch, elements.mobNavLibrary, elements.mobNavDownloads];
    allMobBtns.forEach(btn => {
      if (btn) btn.classList.toggle('active', btn.id === btnId);
    });
  };

  function switchView(viewName, options = {}) {
    const pushHistory = options.pushHistory !== false;
    const force = options.force === true;
    if (state.currentView === viewName && !force) return;

    state.previousView = state.currentView;
    state.currentView = viewName;
    document.body.dataset.activeView = viewName;

    // Ambient Edge Border Glow (Desktop Web Lyrics Window Only)
    if (viewName === 'lyrics') {
      updateLyricsEdgeGlowState();
    } else {
      const glowEl = elements.lyricsEdgeGlow || document.getElementById('lyrics-edge-glow');
      if (glowEl) glowEl.classList.remove('is-active', 'is-playing');
    }

    if (viewName !== 'lyrics' && document.body.classList.contains('lyrics-fullscreen-active')) {
      exitLyricsFullscreen();
    }

    if (viewName !== 'playlist') {
      state.viewingPlaylistId = null;
      state.viewingPlaylistTracks = null;
      delete document.body.dataset.playlistId;
      document.body.classList.remove('in-downloaded-playlist');
    } else if (state.viewingPlaylistId !== 'downloaded') {
      document.body.classList.remove('in-downloaded-playlist');
    }

    // Persist active view so refreshing page returns to current location
    try {
      localStorage.setItem('musisurf_current_view', JSON.stringify({
        view: viewName,
        playlistId: viewName === 'playlist' ? (state.viewingPlaylistId || state.activePlaylistId) : null
      }));
    } catch (e) {}

    if (pushHistory) {
      const currentPlId = viewName === 'playlist' ? (state.viewingPlaylistId || state.activePlaylistId) : null;
      appHistory.push(viewName, currentPlId);
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
      if (elements.searchRecentSection) elements.searchRecentSection.style.display = 'none';
      if (!elements.globalSearchInput || !elements.globalSearchInput.value.trim()) {
        if (elements.searchBrowseSection) elements.searchBrowseSection.style.display = 'block';
      }
    }
    if (!navigator.onLine && typeof updateOfflineModeUI === 'function') {
      updateOfflineModeUI(false);
    }
    if (viewName === 'lyrics') {
      if (state.currentTrack) {
        applyLyricsDynamicBackground(state.currentTrack);
        if (elements.lyricsTrackTitle) elements.lyricsTrackTitle.textContent = state.currentTrack.title || 'Song Title';
        if (elements.lyricsTrackArtist) elements.lyricsTrackArtist.textContent = state.currentTrack.artist || 'Artist';
        if (elements.lyricsAlbumCover) {
          elements.lyricsAlbumCover.onerror = function() {
            if (state.currentTrack) {
              this.onerror = null;
              this.src = DEFAULT_ALBUM_ART;
            }
          };
          elements.lyricsAlbumCover.src = state.currentTrack.image || DEFAULT_ALBUM_ART;
          elements.lyricsAlbumCover.style.display = 'block';
        }
        if (state.currentLyricsTrackId !== state.currentTrack.id || !state.lyrics || state.lyrics.length === 0) {
          resetLyricsScrollToTop(true);
          loadLyricsForTrack(state.currentTrack);
        } else {
          const curTime = getCurrentPlaybackTime();
          const firstLineTime = (state.lyrics && state.lyrics[0]) ? state.lyrics[0].time : 999999;
          if (curTime < firstLineTime) {
            resetLyricsScrollToTop(true);
          }
          state.activeLyricIndex = -1;
          requestAnimationFrame(() => {
            syncLyricsWithTime(getCurrentPlaybackTime());
          });
        }
      } else {
        if (elements.lyricsTrackTitle) elements.lyricsTrackTitle.textContent = 'No Song Playing';
        if (elements.lyricsTrackArtist) elements.lyricsTrackArtist.textContent = 'Play a track to view lyrics';
        if (elements.lyricsAlbumCover) {
          elements.lyricsAlbumCover.src = DEFAULT_ALBUM_ART;
        }
      }
    }

    // Sync mobile bottom navigation bar (Home, Search, Library, Downloads)
    if (typeof updateMobNav === 'function') {
      if (viewName === 'home') {
        updateMobNav('mobNavHome');
      } else if (viewName === 'search') {
        updateMobNav('mobNavSearch');
      } else if (viewName === 'library') {
        updateMobNav('mobNavLibrary');
      } else if (viewName === 'playlist') {
        if (state.viewingPlaylistId === 'downloaded' || state.activePlaylistId === 'downloaded') {
          updateMobNav('mobNavDownloads');
        } else {
          updateMobNav('mobNavLibrary');
        }
      } else if (viewName === 'localMusic') {
        updateMobNav('mobNavLibrary');
      }
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

        const isCustomSort = sortMode === 'custom';
        const dragHandleBtnHtml = isCustomSort
          ? `<button class="drag-handle-btn" title="Drag to reorder" aria-label="Drag to reorder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
            </button>`
          : '';

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
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; width: 100%;">
                <span class="card-title">${escapeHtml(pl.name)}</span>
                ${dragHandleBtnHtml}
              </div>
              <span class="card-artist">${(pl.tracks || []).length} songs</span>
            </div>
          `;

          // Draggable reordering in Library Hub grid: ONLY enabled when sort is 'custom'
          if (isCustomSort) {
            const getDropPosition = (clientX, clientY, rect) => {
              if (clientY < rect.top + rect.height * 0.35) return false;
              if (clientY > rect.top + rect.height * 0.65) return true;
              return clientX > rect.left + rect.width / 2;
            };

            const clearDragIndicators = () => {
              if (elements.libCustomPlaylistsGrid) {
                elements.libCustomPlaylistsGrid.querySelectorAll('.custom-playlist-card').forEach(el => {
                  el.classList.remove('drag-insert-before', 'drag-insert-after', 'drag-over-row');
                });
              }
            };

            card.setAttribute('draggable', 'true');
            card.dataset.playlistId = pl.id;

          card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', pl.id);
            card.classList.add('is-dragging');
          });

          card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const rect = card.getBoundingClientRect();
            const isAfter = getDropPosition(e.clientX, e.clientY, rect);
            clearDragIndicators();
            card.classList.toggle('drag-insert-after', isAfter);
            card.classList.toggle('drag-insert-before', !isAfter);
          });

          card.addEventListener('dragleave', () => {
            card.classList.remove('drag-insert-before', 'drag-insert-after', 'drag-over-row');
          });

          card.addEventListener('drop', (e) => {
            e.preventDefault();
            clearDragIndicators();
            const fromId = e.dataTransfer.getData('text/plain');
            const toId = pl.id;
            if (fromId && toId && fromId !== toId) {
              const rect = card.getBoundingClientRect();
              const isAfter = getDropPosition(e.clientX, e.clientY, rect);
              const fromIdx = state.customPlaylists.findIndex(p => p.id === fromId);
              const targetIdx = state.customPlaylists.findIndex(p => p.id === toId);
              if (fromIdx !== -1 && targetIdx !== -1) {
                let newIdx = isAfter
                  ? (fromIdx < targetIdx ? targetIdx : targetIdx + 1)
                  : (fromIdx < targetIdx ? targetIdx - 1 : targetIdx);
                newIdx = Math.max(0, Math.min(newIdx, state.customPlaylists.length - 1));
                if (newIdx !== fromIdx) {
                  const [moved] = state.customPlaylists.splice(fromIdx, 1);
                  state.customPlaylists.splice(newIdx, 0, moved);
                  localStorage.setItem('musisurf_playlist_sort', 'custom');
                  if (elements.libPlaylistSortSelect) elements.libPlaylistSortSelect.value = 'custom';
                  syncCustomDropdown('libPlaylistSortDropdown', 'custom');
                  saveStoredPlaylists();
                  updateLibraryUI();
                  renderSidebarPlaylists();
                  showToast(`Reordered "${moved.name}" to position ${newIdx + 1}`, '↕️');
                }
              }
            }
          });

          card.addEventListener('dragend', () => {
            card.classList.remove('is-dragging');
            clearDragIndicators();
          });

          // Touch drag support for mobile in Library Grid
          const cardDragHandle = card.querySelector('.drag-handle-btn') || card;
          let isTouchDraggingCard = false;
          let cardDraggedId = null;

          cardDragHandle.addEventListener('touchstart', (e) => {
            if (e.target.closest('.card-play-btn')) return;
            if (!e.touches || e.touches.length === 0) return;
            isTouchDraggingCard = true;
            cardDraggedId = pl.id;
            card.classList.add('is-dragging');
          }, { passive: true });

          cardDragHandle.addEventListener('touchmove', (e) => {
            if (!isTouchDraggingCard || !e.touches || e.touches.length === 0) return;
            const touch = e.touches[0];
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.custom-playlist-card');
            clearDragIndicators();
            if (targetEl && targetEl !== card) {
              const rect = targetEl.getBoundingClientRect();
              const isAfter = getDropPosition(touch.clientX, touch.clientY, rect);
              targetEl.classList.toggle('drag-insert-after', isAfter);
              targetEl.classList.toggle('drag-insert-before', !isAfter);
            }
          }, { passive: true });

          cardDragHandle.addEventListener('touchend', (e) => {
            if (!isTouchDraggingCard) return;
            isTouchDraggingCard = false;
            card.classList.remove('is-dragging');
            const lastTouch = e.changedTouches && e.changedTouches[0];
            if (lastTouch) {
              const targetEl = document.elementFromPoint(lastTouch.clientX, lastTouch.clientY)?.closest('.custom-playlist-card');
              if (targetEl && targetEl.dataset.playlistId && targetEl.dataset.playlistId !== cardDraggedId) {
                const rect = targetEl.getBoundingClientRect();
                const isAfter = getDropPosition(lastTouch.clientX, lastTouch.clientY, rect);
                const fromId = cardDraggedId;
                const toId = targetEl.dataset.playlistId;
                const fromIdx = state.customPlaylists.findIndex(p => p.id === fromId);
                const targetIdx = state.customPlaylists.findIndex(p => p.id === toId);
                if (fromIdx !== -1 && targetIdx !== -1) {
                  let newIdx = isAfter
                    ? (fromIdx < targetIdx ? targetIdx : targetIdx + 1)
                    : (fromIdx < targetIdx ? targetIdx - 1 : targetIdx);
                  newIdx = Math.max(0, Math.min(newIdx, state.customPlaylists.length - 1));
                  if (newIdx !== fromIdx) {
                    const [moved] = state.customPlaylists.splice(fromIdx, 1);
                    state.customPlaylists.splice(newIdx, 0, moved);
                    localStorage.setItem('musisurf_playlist_sort', 'custom');
                    if (elements.libPlaylistSortSelect) elements.libPlaylistSortSelect.value = 'custom';
                    syncCustomDropdown('libPlaylistSortDropdown', 'custom');
                    saveStoredPlaylists();
                    updateLibraryUI();
                    renderSidebarPlaylists();
                    showToast(`Reordered "${moved.name}" to position ${newIdx + 1}`, '↕️');
                  }
                }
              }
            }
            clearDragIndicators();
          });
        }

          card.querySelector('.card-play-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (pl.tracks && pl.tracks.length > 0) {
              const isThisPlTrack = state.activePlaylistId === pl.id && state.currentTrack && pl.tracks.some(t => t.id === state.currentTrack.id);
              if (isThisPlTrack) {
                togglePlayPause();
              } else {
                try {
                  if (elements.audio) { elements.audio.pause(); elements.audio.currentTime = 0; }
                  if (state.ytReady && state.ytPlayer && typeof state.ytPlayer.stopVideo === 'function') {
                    state.ytPlayer.stopVideo();
                  }
                } catch (err) {}

                state.isPlaylistShuffle = false;
                state.isShuffled = false;
                saveShuffleState();
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
    if (!isAuthenticated()) {
      requireAuthForAction('add songs to playlists', () => openAddToPlaylistModal(track));
      return;
    }
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
      if (!isAuthenticated()) {
        requireAuthForAction('create a playlist');
        return;
      }
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
      if (!isAuthenticated()) {
        requireAuthForAction('like songs');
        return;
      }
      isAlreadyLiked = state.likedSongs.some(t => t.id === track.id);
      const chk = likedItem.querySelector('.modal-playlist-checkbox');
      if (isAlreadyLiked) {
        state.likedSongs = state.likedSongs.filter(t => t.id !== track.id);
        chk.classList.remove('checked');
        showToast('Removed from Liked Songs', 'ℹ');
      } else {
        const trackWithDate = { ...track, addedAt: track.addedAt || Date.now() };
        state.likedSongs.unshift(trackWithDate);
        chk.classList.add('checked');
        showToast('Added to Liked Songs', '♥');
      }
      saveStoredLikes();
      updateLikedCountUI();
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
          if (!isAuthenticated()) {
            requireAuthForAction('add songs to playlists');
            return;
          }
          inThisPl = pl.tracks.some(t => t.id === track.id);
          const chk = item.querySelector('.modal-playlist-checkbox');
          if (inThisPl) {
            pl.tracks = pl.tracks.filter(t => t.id !== track.id);
            chk.classList.remove('checked');
            showToast(`Removed from "${pl.name}"`, 'ℹ');
            if (state.currentUser && state.currentUser.id && !pl.id.startsWith('pl_')) {
              fetch(`/api/library/playlists/${pl.id}/tracks/${encodeURIComponent(track.id)}`, {
                method: 'DELETE',
                credentials: 'include'
              }).catch(() => {});
            }
          } else {
            const trackWithDate = { ...track, addedAt: track.addedAt || Date.now() };
            pl.tracks.push(trackWithDate);
            chk.classList.add('checked');
            showToast(`Added to "${pl.name}"`, '✓');
            if (state.currentUser && state.currentUser.id && !pl.id.startsWith('pl_')) {
              fetch(`/api/library/playlists/${pl.id}/tracks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ track })
              }).catch(() => {});
            }
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

    // AutoMix Duration & Edge Dead Silence Migration
    try {
      const legacyCf = localStorage.getItem('musisurf_crossfade');
      const savedAutoMix = localStorage.getItem('musisurf_automix_duration');
      if (savedAutoMix !== null) {
        state.settings.autoMixDuration = parseFloat(savedAutoMix) || 0;
      } else if (legacyCf !== null && state.settings.autoMixDuration === undefined) {
        state.settings.autoMixDuration = parseFloat(legacyCf) || 0;
      }
    } catch (e) {}

    const autoMixVal = typeof state.settings.autoMixDuration === 'number' 
      ? state.settings.autoMixDuration 
      : (typeof state.settings.crossfade === 'number' ? state.settings.crossfade : 5);
    state.settings.autoMixDuration = autoMixVal;
    state.settings.crossfade = autoMixVal;

    if (elements.crossfadeSlider) elements.crossfadeSlider.value = autoMixVal;
    if (elements.liveCrossfadeSeconds) elements.liveCrossfadeSeconds.textContent = formatAutoMixHeadline(autoMixVal);
    if (elements.crossfadeValueLabel) elements.crossfadeValueLabel.textContent = formatAutoMixLabel(autoMixVal);

    // Skip Silence & Automix - Always ON by default for every song unless explicitly toggled off
    if (state.settings.removeDeadSilence === undefined) {
      state.settings.removeDeadSilence = true;
    }
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

    // Sync Mobile Drawer Controls
    const drawerCfSlider = document.getElementById('drawerCrossfadeSlider');
    const drawerCfVal = document.getElementById('drawerCrossfadeVal') || document.getElementById('drawerCrossfadeValue');
    const drawerSkipSilToggle = document.getElementById('drawerSkipSilenceToggle');
    const drawerQualitySelect = document.getElementById('drawerAudioQualitySelect');

    if (drawerCfSlider) drawerCfSlider.value = autoMixVal;
    if (drawerCfVal) drawerCfVal.textContent = formatAutoMixLabel(autoMixVal);
    if (drawerSkipSilToggle) drawerSkipSilToggle.checked = state.settings.removeDeadSilence !== false;
    if (drawerQualitySelect) drawerQualitySelect.value = state.settings.streamingQuality || state.settings.audioQuality || 'high';
  }

  function saveSettings() {
    try {
      localStorage.setItem('musisurf_settings', JSON.stringify(state.settings));
      if (typeof state.settings.autoMixDuration === 'number') {
        localStorage.setItem('musisurf_automix_duration', state.settings.autoMixDuration.toString());
        localStorage.setItem('musisurf_crossfade', state.settings.autoMixDuration.toString()); // backward compatibility
      }
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
    if (!isAuthenticated()) return;
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
    if (!state.localTracks || state.localTracks.length === 0) return;
    if (!confirm('Are you sure you want to remove all local tracks from MusiSurf?')) return;
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

  const DEFAULT_LOCAL_COVER = '/icons/local-folder.svg';

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
          <td class="col-num">
            <span class="track-num-text">${idx + 1}</span>
            <span class="playing-equalizer-bars" aria-hidden="true">
              <span class="eq-bar eq-bar-1"></span>
              <span class="eq-bar eq-bar-2"></span>
              <span class="eq-bar eq-bar-3"></span>
              <span class="eq-bar eq-bar-4"></span>
            </span>
          </td>
          <td class="col-title">
            <div class="table-title-cell">
              <img src="${escapeHtml(track.image || DEFAULT_LOCAL_COVER)}" alt="${formattedTitle}" class="table-cover" onerror="this.src='${DEFAULT_LOCAL_COVER}'">
              <div>
                <div class="table-title-main"><span class="title-text-main" title="${formattedTitle}">${formattedTitle}</span>${getPlaylistTickBadgeHtml(track.id)}${getDownloadedBadgeHtml(track.id)}</div>
                <div class="table-artist-sub" title="${formattedArtist}">${formattedArtist}</div>
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
    if (!isAuthenticated()) {
      requireAuthForAction('add local songs', () => handleLocalAudioFiles(fileList));
      return;
    }
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

  // Floating In-App Miniplayer Management (Completely Removed as Requested)
  function toggleMiniPlayer(forceOpen = null) {
    if (elements.floatingMiniplayer) elements.floatingMiniplayer.style.display = 'none';
    return;
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
        elements.miniHeartBtn.style.color = isLiked ? '#38bdf8' : '';
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
    const miniQueueBtn = document.getElementById('miniQueueBtn');
    if (miniQueueBtn) {
      miniQueueBtn.addEventListener('click', () => {
        if (elements.queueBtn) elements.queueBtn.click();
      });
    }
  }

  // ==========================================================================
  // REPLAY FEATURE CONTROLLER (Redesigned Compact Sound Capsule & Top Song Only)
  // ==========================================================================
  function renderReplayView(period = 'this-month') {
    state._replayPeriod = period;

    const replayAuthGate = document.getElementById('replayAuthGate');
    const replayDashboard = document.getElementById('replayCompactDashboard');
    const replaySignInGateBtn = document.getElementById('replaySignInGateBtn');

    if (replaySignInGateBtn && !replaySignInGateBtn._listenerAttached) {
      replaySignInGateBtn._listenerAttached = true;
      replaySignInGateBtn.addEventListener('click', () => openAuthModal('signin'));
    }

    // Strict Sign-In Gate: unauthenticated guest users see clean locked prompt
    if (!isAuthenticated()) {
      if (replayAuthGate) replayAuthGate.style.display = 'flex';
      if (replayDashboard) replayDashboard.style.display = 'none';
      return;
    }

    if (replayAuthGate) replayAuthGate.style.display = 'none';
    if (replayDashboard) replayDashboard.style.display = 'grid';

    document.querySelectorAll('.replay-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.period === period);
    });

    // Real dynamic Sound Capsule statistics from Neon Postgres
    fetchAndRenderSoundtrackStats();
  }

  async function fetchAndRenderSoundtrackStats() {
    try {
      const res = await fetch('/api/soundtrack/stats', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) {
          const replayAuthGate = document.getElementById('replayAuthGate');
          const replayDashboard = document.getElementById('replayCompactDashboard');
          if (replayAuthGate) replayAuthGate.style.display = 'flex';
          if (replayDashboard) replayDashboard.style.display = 'none';
          return;
        }
        throw new Error('HTTP ' + res.status);
      }
      const data = await res.json();
      if (data && data.success) {
        const totalMinutes = data.totalMinutesListened || 0;
        const totalSongs = data.totalSongsPlayed || 0;

        if (elements.replayMinutesCount) {
          elements.replayMinutesCount.textContent = totalMinutes.toLocaleString();
        }
        if (elements.replayTotalSongsCount) {
          elements.replayTotalSongsCount.textContent = totalSongs.toLocaleString();
        }

        if (data.topSong) {
          const topSong = data.topSong;
          if (elements.replayTopSongImg) elements.replayTopSongImg.src = topSong.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=240&auto=format&fit=crop&q=80';
          if (elements.replayTopSongTitle) elements.replayTopSongTitle.textContent = topSong.title;
          if (elements.replayTopSongArtist) elements.replayTopSongArtist.textContent = topSong.artist;
          const plays = topSong.playCount || 1;
          if (elements.replayTopSongPlays) elements.replayTopSongPlays.textContent = `${plays} ${plays === 1 ? 'play' : 'plays'}`;

          const replayTopCard = document.querySelector('.replay-top-song-card');
          if (replayTopCard && topSong.image) {
            extractDominantColor(topSong.image, topSong.id || 'replay_top').then(([r, g, b]) => {
              const topR = Math.min(255, Math.floor(r * 0.45 + 12));
              const topG = Math.min(255, Math.floor(g * 0.45 + 14));
              const topB = Math.min(255, Math.floor(b * 0.45 + 18));
              replayTopCard.style.setProperty('--top-song-bg', `linear-gradient(135deg, rgb(${topR}, ${topG}, ${topB}) 0%, #101115 100%)`);
            }).catch(() => {
              replayTopCard.style.setProperty('--top-song-bg', `linear-gradient(135deg, #1e2430 0%, #101115 100%)`);
            });
          }

          if (elements.playTopSongBtn) {
            elements.playTopSongBtn.onclick = (e) => {
              e.stopPropagation();
              playTrack(topSong);
              showToast(`Playing #1 Top Song: ${topSong.title}`, '🔥');
            };
          }
        } else {
          if (elements.replayTopSongImg) elements.replayTopSongImg.src = '/icons/replay-cover.svg';
          if (elements.replayTopSongTitle) elements.replayTopSongTitle.textContent = 'No plays yet';
          if (elements.replayTopSongArtist) elements.replayTopSongArtist.textContent = 'Listen to songs to see your #1 track';
          if (elements.replayTopSongPlays) elements.replayTopSongPlays.textContent = '0 plays';
        }
      }
    } catch (err) {
      console.warn('[Soundtrack] Error fetching stats:', err);
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

  async function shareReplay() {
    const minutes = elements.replayMinutesCount?.textContent || '0';
    const songs = elements.replayTotalSongsCount?.textContent || '0';
    const topSong = elements.replayTopSongTitle?.textContent || 'Top Track';
    const artist = elements.replayTopSongArtist?.textContent || 'Artist';
    const origin = (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost')) ? window.location.origin : 'https://musi-surf.vercel.app';
    const text = `🔥 My MusiSurf Sound Capsule: ${minutes} mins listened across ${songs} songs played! Top Song: ${topSong} by ${artist}! Ride the wave of pure music at ${origin}`;

    const capShare = window.Capacitor?.Plugins?.Share;
    if (capShare && typeof capShare.share === 'function') {
      try {
        await capShare.share({
          title: 'MusiSurf Sound Capsule',
          text: text,
          dialogTitle: 'Share your Sound Capsule'
        });
        return;
      } catch (e) {}
    }

    if (navigator.share) {
      navigator.share({ title: 'MusiSurf Sound Capsule', text: text, url: origin }).catch(() => {});
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

    // Top Bar History Back & Forward (Previous & Ahead)
    if (elements.historyBackBtn) {
      elements.historyBackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        appHistory.back();
      });
    }
    if (elements.historyForwardBtn) {
      elements.historyForwardBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        appHistory.forward();
      });
    }
    appHistory.updateButtons();

    // Top Bar Compass / Explore Categories (Shows browse categories, no recents)
    if (elements.topCompassBtn) {
      elements.topCompassBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        state.isExploreMode = true;
        try { localStorage.setItem('musisurf_explore_mode', 'true'); } catch (e) {}
        switchView('search');
        elements.globalSearchInput.value = '';
        if (elements.clearSearchBtn) elements.clearSearchBtn.style.display = 'none';
        if (elements.searchResultsWrapper) elements.searchResultsWrapper.style.display = 'none';
        if (elements.searchEmptyState) elements.searchEmptyState.style.display = 'none';
        if (elements.searchRecentSection) elements.searchRecentSection.style.display = 'none';
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

    // Sidebar Library Search & Sort Controls
    if (elements.sidebarLibSearchToggleBtn && elements.sidebarLibSearchBox) {
      elements.sidebarLibSearchToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.sidebarLibSearchBox.classList.toggle('open');
        if (elements.sidebarLibSearchBox.classList.contains('open') && elements.sidebarLibSearchInput) {
          elements.sidebarLibSearchInput.focus();
        }
      });
    }
    if (elements.sidebarLibSearchInput) {
      elements.sidebarLibSearchInput.addEventListener('input', (e) => {
        state.sidebarLibSearchQuery = e.target.value;
        renderSidebarPlaylists();
      });
    }
    if (elements.sidebarLibSortBtn) {
      elements.sidebarLibSortBtn.addEventListener('click', () => {
        const cur = localStorage.getItem('musisurf_sidebar_lib_sort') || 'recents';
        const next = cur === 'recents' ? 'alphabetical' : 'recents';
        localStorage.setItem('musisurf_sidebar_lib_sort', next);
        const label = elements.sidebarLibSortBtn.querySelector('.sort-text-label');
        if (label) label.textContent = next === 'alphabetical' ? 'A-Z' : 'Recents';
        renderSidebarPlaylists();
      });
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
    elements.globalSearchInput.addEventListener('focus', () => {
      state.isExploreMode = false;
      try { localStorage.setItem('musisurf_explore_mode', 'false'); } catch (e) {}
      if (elements.searchRecentSection) {
        elements.searchRecentSection.style.display = 'none';
      }
      const val = elements.globalSearchInput.value.trim();
      if (val) {
        handleSearchAutocomplete(val);
      } else {
        renderSearchDiscoveryDropdown();
      }
    });
    elements.globalSearchInput.addEventListener('click', () => {
      const val = elements.globalSearchInput.value.trim();
      if (!val) {
        renderSearchDiscoveryDropdown();
      }
    });
    elements.globalSearchInput.addEventListener('input', handleSearchInput);
    elements.globalSearchInput.addEventListener('keydown', handleSearchKeydown);
    elements.clearSearchBtn.addEventListener('click', () => {
      elements.globalSearchInput.value = '';
      elements.clearSearchBtn.style.display = 'none';
      elements.searchResultsWrapper.style.display = 'none';
      elements.searchEmptyState.style.display = 'none';
      if (elements.searchRecentSection) elements.searchRecentSection.style.display = 'none';
      elements.searchBrowseSection.style.display = 'block';
      renderSearchDiscoveryDropdown();
      elements.globalSearchInput.focus();
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
      }

      function getClientX(e) {
        if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
        if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
        return e.clientX || 0;
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
      if (!elements.volumeBar) return;
      const rect = elements.volumeBar.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setVolume(pct);
    }

    if (elements.volumeBtn) elements.volumeBtn.addEventListener('click', toggleMute);

    if (elements.volumeBar) {
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
    }

    if (elements.queueBtn) {
      elements.queueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !elements.queueDrawer.classList.contains('open');
        elements.queueDrawer.classList.toggle('open', willOpen);
        elements.queueBtn.classList.toggle('active', willOpen);
        if (elements.queueDrawerBackdrop) elements.queueDrawerBackdrop.classList.toggle('active', willOpen);
        if (willOpen) requestAnimationFrame(updateQueueDrawerUI);
      });
    }

    if (elements.closeQueueBtn) {
      elements.closeQueueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeQueueDrawer();
      });
    }

    if (elements.queueAutoplayToggleBtn) {
      elements.queueAutoplayToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAutoplay();
      });
    }

    if (elements.smartAutoplayToggleSwitch) {
      elements.smartAutoplayToggleSwitch.checked = state.autoplay;
      elements.smartAutoplayToggleSwitch.addEventListener('change', (e) => {
        setAutoplay(e.target.checked);
      });
    }

    if (elements.queueDrawerBackdrop) {
      elements.queueDrawerBackdrop.addEventListener('click', (e) => {
        e.stopPropagation();
        closeQueueDrawer();
      });
    }

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

    if (elements.clearQueueBtn) {
      elements.clearQueueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.userQueue = [];
        state.queue = [state.currentTrack, ...state.contextQueue.slice(state.contextIndex + 1)];
        updateQueueDrawerUI();
        showToast('Cleared queued songs', '✓');
      });
    }

    if (elements.mobOptGoToQueueBtn) {
      elements.mobOptGoToQueueBtn.addEventListener('click', () => {
        if (elements.mobTrackOptionsModal) elements.mobTrackOptionsModal.style.display = 'none';
        openQueueDrawer();
      });
    }

    // Lyrics Fullscreen Mode Controller (Web Fullscreen Mode)
    function enterLyricsFullscreen() {
      try {
        const root = document.documentElement;
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          if (root.requestFullscreen) {
            root.requestFullscreen().catch(() => {});
          } else if (root.webkitRequestFullscreen) {
            root.webkitRequestFullscreen();
          } else if (root.msRequestFullscreen) {
            root.msRequestFullscreen();
          }
        }
      } catch (e) {}

      document.body.classList.add('lyrics-fullscreen-active');
      if (elements.lyricsFullscreenBtn) {
        elements.lyricsFullscreenBtn.title = 'Exit full screen';
        elements.lyricsFullscreenBtn.setAttribute('aria-label', 'Exit full screen');
        const enterIcon = elements.lyricsFullscreenBtn.querySelector('.icon-enter-fullscreen');
        const exitIcon = elements.lyricsFullscreenBtn.querySelector('.icon-exit-fullscreen');
        if (enterIcon) enterIcon.style.display = 'none';
        if (exitIcon) exitIcon.style.display = 'block';
      }

      if (typeof syncLyricsWithTime === 'function' && typeof getCurrentPlaybackTime === 'function') {
        requestAnimationFrame(() => {
          syncLyricsWithTime(getCurrentPlaybackTime());
        });
      }
    }

    function exitLyricsFullscreen() {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
          }
        }
      } catch (e) {}

      document.body.classList.remove('lyrics-fullscreen-active');
      if (elements.lyricsFullscreenBtn) {
        elements.lyricsFullscreenBtn.title = 'Full screen';
        elements.lyricsFullscreenBtn.setAttribute('aria-label', 'Full screen');
        const enterIcon = elements.lyricsFullscreenBtn.querySelector('.icon-enter-fullscreen');
        const exitIcon = elements.lyricsFullscreenBtn.querySelector('.icon-exit-fullscreen');
        if (enterIcon) enterIcon.style.display = 'block';
        if (exitIcon) exitIcon.style.display = 'none';
      }

      if (typeof syncLyricsWithTime === 'function' && typeof getCurrentPlaybackTime === 'function') {
        requestAnimationFrame(() => {
          syncLyricsWithTime(getCurrentPlaybackTime());
        });
      }
    }

    function toggleLyricsFullscreen() {
      if (document.body.classList.contains('lyrics-fullscreen-active')) {
        exitLyricsFullscreen();
      } else {
        enterLyricsFullscreen();
      }
    }

    // Lyrics View Toggle & Close Handling (Restores Mobile Player Modal if opened from it)
    const handleCloseLyrics = () => {
      const glowEl = elements.lyricsEdgeGlow || document.getElementById('lyrics-edge-glow');
      if (glowEl) glowEl.classList.remove('is-active', 'is-playing');
      if (document.body.classList.contains('lyrics-fullscreen-active')) {
        exitLyricsFullscreen();
      }
      const returnToModal = state.openedLyricsFromMobilePlayer;
      state.openedLyricsFromMobilePlayer = false;
      const targetView = state.previousView && state.previousView !== 'lyrics' ? state.previousView : 'home';

      const isMobile = window.innerWidth <= 768;
      const lyricsEl = document.getElementById('lyricsView');

      if (isMobile && lyricsEl) {
        lyricsEl.classList.add('lyrics-closing');
        setTimeout(() => {
          lyricsEl.classList.remove('lyrics-closing');
          switchView(targetView);
          if (returnToModal && elements.mobilePlayerModal) {
            if (typeof openMobilePlayerModal === 'function') {
              openMobilePlayerModal();
            } else {
              elements.mobilePlayerModal.style.display = 'flex';
              document.body.style.overflow = 'hidden';
            }
          }
        }, 270);
      } else {
        switchView(targetView);
        if (returnToModal && elements.mobilePlayerModal) {
          elements.mobilePlayerModal.style.display = 'flex';
          document.body.style.overflow = 'hidden';
        }
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
    if (elements.lyricsFullscreenBtn) {
      elements.lyricsFullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLyricsFullscreen();
      });
    }

    // Sync Esc key & browser fullscreen change with in-app lyrics fullscreen mode
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('lyrics-fullscreen-active')) {
        exitLyricsFullscreen();
      }
    });

    const onFsChange = () => {
      const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      if (!isFs && document.body.classList.contains('lyrics-fullscreen-active')) {
        exitLyricsFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    window.addEventListener('resize', () => {
      if (state.currentView === 'lyrics') {
        updateLyricsEdgeGlowState();
      }
    });
    if (elements.lyricsSyncMinus) {
      elements.lyricsSyncMinus.addEventListener('click', (e) => {
        e.stopPropagation();
        adjustLyricsOffset(-0.5);
      });
    }
    if (elements.lyricsSyncPlus) {
      elements.lyricsSyncPlus.addEventListener('click', (e) => {
        e.stopPropagation();
        adjustLyricsOffset(0.5);
      });
    }
    if (elements.lyricsSyncReset) {
      elements.lyricsSyncReset.addEventListener('click', (e) => {
        e.stopPropagation();
        resetLyricsOffset();
      });
    }

    // Song image is explicitly not clickable per user specification
    if (elements.playerCoverWrapper) {
      elements.playerCoverWrapper.style.cursor = 'default';
    }

    // Create Playlist Modal
    elements.createPlaylistBtn.addEventListener('click', () => {
      if (!isAuthenticated()) {
        requireAuthForAction('create a playlist', () => {
          elements.createPlaylistModal.style.display = 'flex';
          elements.playlistNameInput.focus();
        });
        return;
      }
      elements.createPlaylistModal.style.display = 'flex';
      elements.playlistNameInput.focus();
    });
    elements.closePlaylistModalBtn.addEventListener('click', () => {
      elements.createPlaylistModal.style.display = 'none';
    });
    elements.cancelPlaylistBtn.addEventListener('click', () => {
      elements.createPlaylistModal.style.display = 'none';
    });

    elements.createPlaylistForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isAuthenticated()) {
        requireAuthForAction('create a playlist');
        return;
      }
      const name = elements.playlistNameInput.value.trim();
      const desc = elements.playlistDescInput.value.trim();
      if (!name) return;

      let newPlId = 'pl_' + Date.now();
      const initialTracks = pendingTrackForPlaylist ? [pendingTrackForPlaylist] : [];

      if (state.currentUser && state.currentUser.id) {
        try {
          const res = await fetch('/api/library/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, description: desc })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.playlist) {
              newPlId = data.playlist.id;
              if (pendingTrackForPlaylist) {
                fetch(`/api/library/playlists/${newPlId}/tracks`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ track: pendingTrackForPlaylist })
                }).catch(() => {});
              }
            }
          }
        } catch (err) {
          console.warn('[Neon Playlists] Create error:', err.message);
        }
      }

      const newPl = {
        id: newPlId,
        name,
        description: desc,
        tracks: initialTracks
      };

      state.customPlaylists.push(newPl);
      saveStoredPlaylists();
      renderSidebarPlaylists();
      updateLibraryUI();
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

    // Contribute Lyrics Modal Handlers
    if (elements.contributeLyricsForm) {
      elements.contributeLyricsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const track = (elements.contributeTrackInput?.value || '').trim();
        const artist = (elements.contributeArtistInput?.value || '').trim();
        const lyrics = (elements.contributeLyricsText?.value || '').trim();
        const album = state.currentTrack?.album || '';

        if (!track || !lyrics || lyrics.length < 20) {
          showToast('Please enter at least 20 characters of lyrics.', '⚠️');
          return;
        }

        const submitBtn = document.getElementById('saveContributeLyricsBtn');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving...';
        }

        try {
          const res = await fetch('/api/lyrics/contribute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track, artist, album, lyrics })
          });
          const resData = await res.json();
          if (resData.success && resData.data) {
            const cacheKey = `${track.toLowerCase().trim()}___${(artist || '').toLowerCase().trim()}`;
            if (!state.lyricsCache) state.lyricsCache = {};
            state.lyricsCache[cacheKey] = resData.data;
            setPersistentVerifiedLyrics(cacheKey, resData.data);

            if (elements.contributeLyricsModal) elements.contributeLyricsModal.style.display = 'none';
            showToast('Lyrics saved & verified successfully!', '✓');

            if (state.currentTrack && state.currentTrack.title.toLowerCase().trim() === track.toLowerCase().trim()) {
              state.currentLyricsData = resData.data;
              if (resData.data.syncedLyrics) {
                state.rawSyncedLyrics = resData.data.syncedLyrics;
                const parsed = parseLrc(resData.data.syncedLyrics, 0);
                renderLyricsLines(parsed, resData.data.language, resData.data.script, resData.data);
              } else if (resData.data.plainLyrics) {
                renderPlainLyrics(resData.data.plainLyrics, resData.data.language, resData.data.script, resData.data);
              }
            }
          } else {
            showToast(resData.message || 'Failed to save lyrics', '⚠️');
          }
        } catch (err) {
          showToast('Failed to save lyrics. Check internet connection.', '⚠️');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Lyrics';
          }
        }
      });
    }

    if (elements.closeContributeLyricsBtn) {
      elements.closeContributeLyricsBtn.addEventListener('click', () => {
        if (elements.contributeLyricsModal) elements.contributeLyricsModal.style.display = 'none';
      });
    }

    if (elements.cancelContributeLyricsBtn) {
      elements.cancelContributeLyricsBtn.addEventListener('click', () => {
        if (elements.contributeLyricsModal) elements.contributeLyricsModal.style.display = 'none';
      });
    }

    if (elements.contributeLyricsModal) {
      elements.contributeLyricsModal.addEventListener('click', (e) => {
        if (e.target === elements.contributeLyricsModal) {
          elements.contributeLyricsModal.style.display = 'none';
        }
      });
    }

    // Desktop Brand Logo Click -> Redirect to Home
    if (elements.desktopHeaderBrand) {
      elements.desktopHeaderBrand.style.cursor = 'pointer';
      elements.desktopHeaderBrand.addEventListener('click', () => {
        switchView('home');
        const scrollContainer = document.querySelector('.content-scroll');
        if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Your Soundtrack Navigation & Actions (Image 4 & 5)
    if (elements.navReplayBtn) {
      elements.navReplayBtn.addEventListener('click', () => switchView('replay'));
    }
    if (elements.libHubSoundtrackBtn) {
      elements.libHubSoundtrackBtn.addEventListener('click', () => switchView('replay'));
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
    if (elements.playerHeartBtn) {
      elements.playerHeartBtn.addEventListener('click', () => {
        if (state.currentTrack) toggleLikeSong(state.currentTrack);
      });
    }

    // Settings Sliding Background Pill Indicator
    function updateSettingsNavSlider(activeBtn) {
      const slider = document.getElementById('settingsNavSlider');
      const nav = document.querySelector('.settings-category-nav');
      if (!slider || !nav) return;
      const target = activeBtn || nav.querySelector('.settings-cat-btn.active');
      if (!target || target.offsetParent === null) {
        slider.style.opacity = '0';
        return;
      }
      const navRect = nav.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      const left = targetRect.left - navRect.left + nav.scrollLeft;
      const top = targetRect.top - navRect.top + nav.scrollTop;
      const width = targetRect.width;
      const height = targetRect.height;

      slider.style.width = `${width}px`;
      slider.style.height = `${height}px`;
      slider.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      slider.style.opacity = '1';
    }
    window.updateSettingsNavSlider = updateSettingsNavSlider;

    // Settings Modal
    const openSettingsModal = () => {
      loadSettings();
      if (elements.settingsModal) {
        elements.settingsModal.style.display = 'flex';
        // Select Account tab by default as requested
        document.querySelectorAll('.settings-cat-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.target === 'settingsAccountSection');
        });
        document.querySelectorAll('.settings-tab-view').forEach(view => {
          view.classList.toggle('active', view.id === 'settingsAccountSection');
        });
        if (typeof updateAuthUI === 'function') updateAuthUI();
        requestAnimationFrame(() => updateSettingsNavSlider());
        setTimeout(() => updateSettingsNavSlider(), 60);
        try { window.history.pushState({ modal: 'settings' }, '', window.location.pathname); } catch (e) {}
      }
    };
    window.openSettingsModal = openSettingsModal;
    const closeSettingsModal = () => {
      if (elements.settingsModal) elements.settingsModal.style.display = 'none';
    };

    if (elements.openSettingsBtn) elements.openSettingsBtn.addEventListener('click', openSettingsModal);
    if (elements.headerSettingsBtn) elements.headerSettingsBtn.addEventListener('click', openSettingsModal);
    if (elements.sidebarSettingsBtn) elements.sidebarSettingsBtn.addEventListener('click', openSettingsModal);
    if (elements.closeSettingsModalBtn) elements.closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
    if (elements.closeSettingsTopRightBtn) elements.closeSettingsTopRightBtn.addEventListener('click', closeSettingsModal);
    if (elements.libHubSettingsBtn) elements.libHubSettingsBtn.addEventListener('click', openSettingsModal);

    window.addEventListener('resize', () => {
      if (elements.settingsModal && elements.settingsModal.style.display !== 'none') {
        updateSettingsNavSlider();
      }
    });

    // Initialize History Buttons State
    appHistory.updateButtons();

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

    // Two-Pane Settings Category Navigation (Image 1) with Sliding Pill Animation
    document.querySelectorAll('.settings-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.settings-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateSettingsNavSlider(btn);
        const targetId = btn.dataset.target;
        document.querySelectorAll('.settings-tab-view').forEach(view => {
          view.classList.toggle('active', view.id === targetId);
        });
        if (targetId === 'settingsLibrarySection') {
          loadImportHistoryUI();
        }
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

    // AutoMix Slider (Gradient Track)
    const crossfadeSlider = elements.crossfadeSlider || document.getElementById('crossfadeSlider');
    const liveTimeLabel = elements.liveCrossfadeSeconds || document.getElementById('liveCrossfadeSeconds');
    const drawerCfVal = document.getElementById('drawerCrossfadeVal') || document.getElementById('drawerCrossfadeValue');
    const drawerCfSlider = document.getElementById('drawerCrossfadeSlider');

    if (crossfadeSlider) {
      crossfadeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        state.settings.autoMixDuration = val;
        state.settings.crossfade = val;
        if (liveTimeLabel) liveTimeLabel.textContent = formatAutoMixHeadline(val);
        if (elements.crossfadeValueLabel) elements.crossfadeValueLabel.textContent = formatAutoMixLabel(val);
        if (drawerCfSlider) drawerCfSlider.value = val;
        if (drawerCfVal) drawerCfVal.textContent = formatAutoMixLabel(val);
      });
      crossfadeSlider.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value) || 0;
        state.settings.autoMixDuration = val;
        state.settings.crossfade = val;
        saveSettings();
        showToast(val === 0 ? 'AutoMix turned off (Hard Cut)' : `AutoMix set to ${formatAutoMixLabel(val)}`, '🎚️');
      });
    }

    // Automix & Skip Silence Toggles
    const automixSwitch = elements.automixToggleSwitch || document.getElementById('automixToggleSwitch');
    if (automixSwitch) {
      automixSwitch.addEventListener('change', () => {
        state.settings.automix = automixSwitch.checked;
        saveSettings();
        showToast(automixSwitch.checked ? 'AutoMix enabled' : 'AutoMix disabled', '🎶');
      });
    }

    const skipSilenceSwitch = elements.skipSilenceToggleSwitch || document.getElementById('skipSilenceToggleSwitch');
    const deadSilenceSwitch = elements.deadSilenceToggleSwitch || document.getElementById('deadSilenceToggleSwitch');

    if (skipSilenceSwitch) {
      skipSilenceSwitch.addEventListener('change', () => {
        state.settings.removeDeadSilence = skipSilenceSwitch.checked;
        if (deadSilenceSwitch) deadSilenceSwitch.checked = skipSilenceSwitch.checked;
        const drawerSkip = document.getElementById('drawerSkipSilenceToggle');
        if (drawerSkip) drawerSkip.checked = skipSilenceSwitch.checked;
        saveSettings();
        showToast(skipSilenceSwitch.checked ? 'Edge Dead Silence Removal enabled (-45 dBFS)' : 'Edge Dead Silence Removal disabled', '⚡');
      });
    }

    if (deadSilenceSwitch) {
      deadSilenceSwitch.addEventListener('change', () => {
        state.settings.removeDeadSilence = deadSilenceSwitch.checked;
        if (skipSilenceSwitch) skipSilenceSwitch.checked = deadSilenceSwitch.checked;
        const drawerSkip = document.getElementById('drawerSkipSilenceToggle');
        if (drawerSkip) drawerSkip.checked = deadSilenceSwitch.checked;
        saveSettings();
        showToast(deadSilenceSwitch.checked ? 'Edge Dead Silence Removal enabled (-45 dBFS)' : 'Edge Dead Silence Removal disabled', '⚡');
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

    // Helper to map and update streaming quality bitrate URLs (Phase 4)
    function applyQualityToAudioUrl(url, quality) {
      if (!url || typeof url !== 'string') return url;
      if (!url.includes('.mp4')) return url;
      switch (quality) {
        case 'low':
          return url.replace(/_(320|160|96)\.mp4/, '_48.mp4');
        case 'medium':
          return url.replace(/_(320|96|48)\.mp4/, '_160.mp4');
        case 'lossless':
        case 'high':
        default:
          return url.replace(/_(160|96|48)\.mp4/, '_320.mp4');
      }
    }

    function applyStreamingQuality(quality) {
      state.settings.streamingQuality = quality;
      saveSettings();

      if (quality === 'lossless') {
        showToast('Streaming quality: Lossless (Source max: 320 kbps AAC)', '📶');
      } else {
        const labels = { low: 'Low (48 kbps)', medium: 'Medium (160 kbps)', high: 'High (320 kbps)' };
        showToast(`Streaming quality: ${labels[quality] || quality}`, '📶');
      }

      // Live update currently playing track stream URL seamlessly
      if (state.currentTrack && state.currentTrack.audioUrl) {
        const newUrl = applyQualityToAudioUrl(state.currentTrack.audioUrl, quality);
        state.currentTrack.audioUrl = newUrl;
        const deck = getActiveDeck();
        if (deck && !deck.paused && !isYouTubeActive()) {
          const curPos = deck.currentTime;
          deck.src = `/api/stream?url=${encodeURIComponent(newUrl)}&quality=${quality}`;
          deck.currentTime = curPos;
          deck.play().catch(() => {});
        }
      }
    }

    // Streaming Quality Pills
    document.querySelectorAll('#streamQualityPills .sound-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#streamQualityPills .sound-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyStreamingQuality(btn.dataset.quality);
      });
    });

    function applyVolumeLeveling(level) {
      state.settings.volumeLeveling = level;
      saveSettings();

      // Native Android engine loudness enhancement (Phase 5)
      try {
        if (typeof MusiSurfPlayback !== 'undefined' && MusiSurfPlayback.getEngine()) {
          MusiSurfPlayback.getEngine().setLoudness(level);
        }
      } catch (e) {}

      // Web Audio level scaling
      let mult = 1.0;
      if (level === 'quiet') mult = 0.75;
      else if (level === 'normal') mult = 0.90;
      else if (level === 'loud') mult = 1.15;

      const effective = Math.max(0, Math.min(1.0, (state.volume || 0.8) * mult));
      try {
        const dA = getDeckA();
        const dB = getDeckB();
        if (dA) dA.volume = state.isMuted ? 0 : effective;
        if (dB) dB.volume = state.isMuted ? 0 : effective;
      } catch (e) {}

      const labels = { off: 'Off', quiet: 'Quiet (-2.5 dB)', normal: 'Normal (Balanced)', loud: 'Loud (+3 dB Boost)' };
      showToast(`Volume leveling: ${labels[level] || level}`, '🔊');
    }

    // Volume Leveling Pills
    document.querySelectorAll('#volumeLevelingPills .sound-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#volumeLevelingPills .sound-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyVolumeLeveling(btn.dataset.level);
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

    // ------------------------------------------------------------------------
    // Playlist Import & Transfer Event Listeners
    // ------------------------------------------------------------------------

    // Open from Settings card or button
    if (elements.settingsImportPlaylistBtn) {
      elements.settingsImportPlaylistBtn.addEventListener('click', openImportPlaylistModal);
    }
    if (elements.triggerImportModalBtn) {
      elements.triggerImportModalBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openImportPlaylistModal();
      });
    }

    // Open from Mobile Navigation Drawer
    if (elements.drawerImportPlaylistBtn) {
      elements.drawerImportPlaylistBtn.addEventListener('click', () => {
        if (elements.mobileNavDrawer) elements.mobileNavDrawer.classList.remove('open');
        if (elements.mobileDrawerBackdrop) elements.mobileDrawerBackdrop.style.display = 'none';
        openImportPlaylistModal();
      });
    }

    // Close & Cancel buttons
    if (elements.closeImportPlaylistModalBtn) {
      elements.closeImportPlaylistModalBtn.addEventListener('click', closeImportPlaylistModal);
    }
    if (elements.cancelImportModalBtn) {
      elements.cancelImportModalBtn.addEventListener('click', closeImportPlaylistModal);
    }
    if (elements.importPlaylistModal) {
      elements.importPlaylistModal.addEventListener('click', (e) => {
        if (e.target === elements.importPlaylistModal) {
          closeImportPlaylistModal();
        }
      });
    }

    // Import Method Tabs (Spotify, YouTube Music, Playlist File)
    if (elements.importMethodSpotifyTab) {
      elements.importMethodSpotifyTab.addEventListener('click', () => switchImportTab('spotify'));
    }
    if (elements.importMethodLinkTab && elements.importMethodLinkTab !== elements.importMethodSpotifyTab) {
      elements.importMethodLinkTab.addEventListener('click', () => switchImportTab('spotify'));
    }
    if (elements.importMethodYtMusicTab) {
      elements.importMethodYtMusicTab.addEventListener('click', () => switchImportTab('ytmusic'));
    }
    if (elements.importMethodFileTab) {
      elements.importMethodFileTab.addEventListener('click', () => switchImportTab('file'));
    }

    // Spotify Live ID Detection Card & Paste Button
    function updateSpotifyLiveDetection() {
      const val = (elements.importPlaylistUrlInput?.value || '').trim();
      const info = clientExtractSpotifyPlaylistInfo(val);
      if (elements.spotifyDetectedIdPill) {
        if (info && info.id) {
          elements.spotifyDetectedIdPill.style.display = 'block';
          elements.spotifyDetectedIdPill.className = 'detected-playlist-card';
          const sharingText = info.hasSharingParams
            ? 'Present (diagnostic only, does NOT imply private)'
            : 'None';
          elements.spotifyDetectedIdPill.innerHTML = `
            <div class="detected-card-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px; display: inline-block;">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Spotify playlist detected</span>
            </div>
            <div class="detected-card-body">
              <div class="detected-row">
                <span class="row-label">Playlist ID:</span>
                <span class="row-value mono">${escapeHtml(info.id)}</span>
              </div>
              <div class="detected-row">
                <span class="row-label">Length:</span>
                <span class="row-value">${info.id.length} characters</span>
              </div>
              <div class="detected-row">
                <span class="row-label">Sharing parameters:</span>
                <span class="row-value" style="color: ${info.hasSharingParams ? '#cfcfcf' : '#888'}; font-size: 0.76rem;">${sharingText}</span>
              </div>
            </div>
          `;
        } else {
          elements.spotifyDetectedIdPill.style.display = 'none';
        }
      }
      if (elements.importValidationError) elements.importValidationError.style.display = 'none';
    }

    if (elements.importPlaylistUrlInput) {
      elements.importPlaylistUrlInput.addEventListener('input', updateSpotifyLiveDetection);
      elements.importPlaylistUrlInput.addEventListener('change', updateSpotifyLiveDetection);
    }

    if (elements.importPasteUrlBtn) {
      elements.importPasteUrlBtn.addEventListener('click', async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            const clipText = await navigator.clipboard.readText();
            if (clipText && elements.importPlaylistUrlInput) {
              elements.importPlaylistUrlInput.value = clipText.trim();
              updateSpotifyLiveDetection();
              showToast('Pasted Spotify playlist link from clipboard', '📋');
            }
          } else {
            showToast('Clipboard access not available, paste manually', 'ℹ️');
          }
        } catch (err) {
          showToast('Please paste the URL manually (Ctrl+V / Cmd+V)', 'ℹ️');
        }
      });
    }

    // YouTube Music Live ID Detection Card & Paste Button
    function updateYtMusicLiveDetection() {
      const val = (elements.importYtMusicUrlInput?.value || '').trim();
      const ytId = clientExtractYouTubePlaylistId(val);
      if (elements.ytDetectedIdPill) {
        if (ytId) {
          elements.ytDetectedIdPill.style.display = 'block';
          elements.ytDetectedIdPill.className = 'detected-playlist-card ytmusic-card';
          elements.ytDetectedIdPill.innerHTML = `
            <div class="detected-card-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px; display: inline-block;">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>YouTube Music playlist detected</span>
            </div>
            <div class="detected-card-body">
              <div class="detected-row">
                <span class="row-label">Playlist ID:</span>
                <span class="row-value mono">${escapeHtml(ytId)}</span>
              </div>
              <div class="detected-row">
                <span class="row-label">Length:</span>
                <span class="row-value">${ytId.length} characters</span>
              </div>
            </div>
          `;
        } else {
          elements.ytDetectedIdPill.style.display = 'none';
        }
      }
      if (elements.importValidationError) elements.importValidationError.style.display = 'none';
    }

    if (elements.importYtMusicUrlInput) {
      elements.importYtMusicUrlInput.addEventListener('input', updateYtMusicLiveDetection);
      elements.importYtMusicUrlInput.addEventListener('change', updateYtMusicLiveDetection);
    }

    if (elements.importPasteYtMusicUrlBtn) {
      elements.importPasteYtMusicUrlBtn.addEventListener('click', async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            const clipText = await navigator.clipboard.readText();
            if (clipText && elements.importYtMusicUrlInput) {
              elements.importYtMusicUrlInput.value = clipText.trim();
              updateYtMusicLiveDetection();
              showToast('Pasted YouTube Music playlist link from clipboard', '📋');
            }
          } else {
            showToast('Clipboard access not available, paste manually', 'ℹ️');
          }
        } catch (err) {
          showToast('Please paste the URL manually (Ctrl+V / Cmd+V)', 'ℹ️');
        }
      });
    }

    // Spotify Connect & Disconnect Buttons
    if (elements.spotifyConnectBtn) {
      elements.spotifyConnectBtn.addEventListener('click', promptSpotifyConnect);
    }
    if (elements.spotifyConnectHeaderBtn) {
      elements.spotifyConnectHeaderBtn.addEventListener('click', promptSpotifyConnect);
    }
    if (elements.spotifyDisconnectHeaderBtn) {
      elements.spotifyDisconnectHeaderBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/auth/spotify/disconnect', { method: 'POST' });
          const d = await res.json();
          if (d.success) {
            showToast('Spotify disconnected', '🔌');
            checkSpotifyAuthStatus();
          }
        } catch (e) {
          showToast('Failed to disconnect Spotify', '⚠️');
        }
      });
    }

    // Google / YouTube Music Connect & Disconnect Buttons
    if (elements.ytConnectHeaderBtn) {
      elements.ytConnectHeaderBtn.addEventListener('click', promptGoogleConnect);
    }
    if (elements.ytDisconnectHeaderBtn) {
      elements.ytDisconnectHeaderBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/auth/google/disconnect', { method: 'POST' });
          const d = await res.json();
          if (d.success) {
            showToast('Google account disconnected', '🔌');
            checkGoogleAuthStatus();
          }
        } catch (e) {
          showToast('Failed to disconnect Google account', '⚠️');
        }
      });
    }

    // Check query params for OAuth return and automatic pending import resumption
    async function checkPendingImportResume() {
      try {
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.get('oauth_cancelled') === '1') {
          showToast("Authorization was cancelled. You can connect your account whenever you're ready.", 'ℹ️');
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        if (urlParams.get('oauth_error')) {
          showToast('Connection error: ' + urlParams.get('oauth_error'), '⚠️');
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        if (urlParams.get('spotify_connected') === '1') {
          showToast('Spotify account connected successfully!', '🟢');
          checkSpotifyAuthStatus();
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        if (urlParams.get('google_connected') === '1') {
          showToast('Google account connected successfully!', '🟢');
          checkGoogleAuthStatus();
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        if (urlParams.get('import_resume') === '1') {
          window.history.replaceState({}, document.title, window.location.pathname);
          checkSpotifyAuthStatus();
          checkGoogleAuthStatus();

          // Retrieve pending import operation
          const res = await fetch('/api/import/pending');
          const data = await res.json();
          if (data && data.hasPending && data.pending) {
            const pending = data.pending;
            openImportPlaylistModal();

            if (pending.provider === 'youtube_music') {
              switchImportTab('ytmusic');
              if (elements.importYtMusicUrlInput) {
                elements.importYtMusicUrlInput.value = pending.url;
                updateYtMusicLiveDetection();
              }
            } else {
              switchImportTab('spotify');
              if (elements.importPlaylistUrlInput) {
                elements.importPlaylistUrlInput.value = pending.url;
                updateSpotifyLiveDetection();
              }
            }

            showToast('Account authorized! Automatically continuing playlist import...', '🚀');
            setTimeout(() => {
              startImportWorkflow();
            }, 300);
          }
        }
      } catch (e) {
        console.warn('[Import] Pending import resume check note:', e);
      }
    }

    checkPendingImportResume();

    // File Input & Drag-and-Drop Handling
    function handleImportFile(file) {
      if (!file) return;
      const validExtensions = ['.m3u', '.m3u8', '.pls', '.xspf', '.csv', '.json', '.txt'];
      const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
      if (!validExtensions.includes(ext)) {
        showImportError(`Unsupported file format "${ext}". Supported: M3U, M3U8, PLS, XSPF, CSV, JSON, TXT.`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showImportError('File exceeds maximum size of 5 MB.');
        return;
      }

      importWorkflowState.selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        importWorkflowState.selectedFileContent = e.target.result;
        if (elements.importSelectedFileName) elements.importSelectedFileName.textContent = file.name;
        if (elements.importSelectedFileInfo) elements.importSelectedFileInfo.style.display = 'flex';
        if (elements.importDropZone) elements.importDropZone.style.display = 'none';
        if (elements.importValidationError) elements.importValidationError.style.display = 'none';
      };
      reader.onerror = () => {
        showImportError('Failed to read file from your device.');
      };
      reader.readAsText(file);
    }

    if (elements.importPlaylistFileInput) {
      elements.importPlaylistFileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleImportFile(file);
      });
    }

    if (elements.importBrowseFileBtn) {
      elements.importBrowseFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.importPlaylistFileInput?.click();
      });
    }

    if (elements.importDropZone) {
      elements.importDropZone.addEventListener('click', () => {
        elements.importPlaylistFileInput?.click();
      });
      ['dragenter', 'dragover'].forEach(name => {
        elements.importDropZone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          elements.importDropZone.classList.add('drag-active');
        });
      });
      ['dragleave', 'drop'].forEach(name => {
        elements.importDropZone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          elements.importDropZone.classList.remove('drag-active');
        });
      });
      elements.importDropZone.addEventListener('drop', (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file) handleImportFile(file);
      });
    }

    if (elements.importClearSelectedFileBtn) {
      elements.importClearSelectedFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        importWorkflowState.selectedFile = null;
        importWorkflowState.selectedFileContent = '';
        if (elements.importPlaylistFileInput) elements.importPlaylistFileInput.value = '';
        if (elements.importSelectedFileInfo) elements.importSelectedFileInfo.style.display = 'none';
        if (elements.importDropZone) elements.importDropZone.style.display = 'block';
      });
    }

    // Start Import / Continue Button
    if (elements.startImportFetchBtn) {
      elements.startImportFetchBtn.addEventListener('click', startImportWorkflow);
    }

    // Step 3: Back & Confirm Buttons
    if (elements.backToChooseMethodBtn) {
      elements.backToChooseMethodBtn.addEventListener('click', () => {
        if (elements.importStepPreview) elements.importStepPreview.style.display = 'none';
        if (elements.importStepChoose) elements.importStepChoose.style.display = 'block';
      });
    }

    if (elements.confirmCreatePlaylistBtn) {
      elements.confirmCreatePlaylistBtn.addEventListener('click', executeConfirmImport);
    }

    // Step 4: Success View Buttons
    if (elements.closeImportSuccessBtn) {
      elements.closeImportSuccessBtn.addEventListener('click', closeImportPlaylistModal);
    }

    if (elements.openImportedPlaylistBtn) {
      elements.openImportedPlaylistBtn.addEventListener('click', () => {
        closeImportPlaylistModal();
        if (elements.settingsModal) elements.settingsModal.style.display = 'none';
        if (importWorkflowState.createdPlaylistId) {
          renderPlaylistView(importWorkflowState.createdPlaylistId);
        }
      });
    }

    // Candidate Review Modal Listeners
    if (elements.closeCandidateReviewBtn) {
      elements.closeCandidateReviewBtn.addEventListener('click', () => {
        if (elements.candidateReviewModal) elements.candidateReviewModal.style.display = 'none';
      });
    }

    if (elements.candLeaveUnmatchedBtn) {
      elements.candLeaveUnmatchedBtn.addEventListener('click', () => {
        const r = importWorkflowState.matchResults[importWorkflowState.currentReviewIndex];
        if (r) {
          r.status = 'unmatched';
          r.matchedTrack = null;
        }
        if (elements.candidateReviewModal) elements.candidateReviewModal.style.display = 'none';
        renderImportPreviewUI();
      });
    }

    if (elements.candidateReviewModal) {
      elements.candidateReviewModal.addEventListener('click', (e) => {
        if (e.target === elements.candidateReviewModal) {
          elements.candidateReviewModal.style.display = 'none';
        }
      });
    }

    // Import History Refresh Button
    if (elements.refreshImportHistoryBtn) {
      elements.refreshImportHistoryBtn.addEventListener('click', loadImportHistoryUI);
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
          if (!isAuthenticated()) {
            requireAuthForAction('add local songs', () => {
              handleLocalAudioFiles(dt.files);
            });
            return;
          }
          handleLocalAudioFiles(dt.files);
        }
      });
      elements.localDropZone.addEventListener('click', () => {
        if (!isAuthenticated()) {
          requireAuthForAction('add local songs', () => {
            elements.localAudioFileInput?.click();
          });
          return;
        }
        elements.localAudioFileInput?.click();
      });
    }

    if (elements.localAudioFileInput) {
      elements.localAudioFileInput.addEventListener('click', (e) => {
        if (!isAuthenticated()) {
          e.preventDefault();
          e.stopPropagation();
          requireAuthForAction('add local songs', () => {
            elements.localAudioFileInput?.click();
          });
        }
      });
      elements.localAudioFileInput.addEventListener('change', (e) => {
        if (!isAuthenticated()) {
          e.preventDefault();
          e.stopPropagation();
          elements.localAudioFileInput.value = '';
          requireAuthForAction('add local songs');
          return;
        }
        if (e.target.files && e.target.files.length > 0) {
          handleLocalAudioFiles(e.target.files);
          e.target.value = '';
        }
      });
    }

    // Intercept .add-local-files-btn triggers before OS file picker opens
    document.querySelectorAll('.add-local-files-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (!isAuthenticated()) {
          e.preventDefault();
          e.stopPropagation();
          requireAuthForAction('add local songs', () => {
            elements.localAudioFileInput?.click();
          });
        }
      });
    });

    if (elements.playAllLocalBtn) {
      elements.playAllLocalBtn.addEventListener('click', () => {
        if (state.localTracks.length > 0) {
          const isPlayingLocal = state.isPlaying && state.currentTrack && state.currentTrack.isLocal;
          if (isPlayingLocal) {
            togglePlayPause();
          } else {
            playTrack(state.localTracks[0], state.localTracks);
          }
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

    // Dual-Deck Audio Elements Native Event Listeners
    function attachAudioDeckListeners(deck) {
      if (!deck) return;
      deck.addEventListener('play', () => {
        if (deck === getActiveDeck()) {
          state.isPlaying = true;
          state.isTrackLoading = false;
          updatePlayPauseButton();
          logPlaybackDiagnostic('native-deck-play');
        }
      });
      deck.addEventListener('playing', () => {
        if (deck === getActiveDeck()) {
          state.isPlaying = true;
          state.isTrackLoading = false;
          state.consecutivePlaybackErrors = 0;
          updatePlayPauseButton();
          logPlaybackDiagnostic('native-deck-playing');
        }
      });
      deck.addEventListener('pause', () => {
        state._lastTrackedPlaybackTime = null;
        if (deck === getActiveDeck() && !state.isCrossfading) {
          state.isPlaying = false;
          state.isTrackLoading = false;
          updatePlayPauseButton();
          savePlaybackState();
          saveCurrentPlaylistProgress({ immediate: true });
          logPlaybackDiagnostic('native-deck-pause');
        }
      });
      deck.addEventListener('waiting', () => {
        if (deck === getActiveDeck()) {
          if (!state.isPlaying || deck.currentTime <= 0.05) {
            state.isTrackLoading = true;
          }
          logPlaybackDiagnostic('native-deck-waiting');
        }
      });
      deck.addEventListener('stalled', () => {
        if (deck === getActiveDeck()) {
          logPlaybackDiagnostic('native-deck-stalled');
        }
      });
      deck.addEventListener('canplay', () => {
        if (deck === getActiveDeck()) {
          if (state.isPlaying) state.isTrackLoading = false;
          logPlaybackDiagnostic('native-deck-canplay');
        }
      });
      deck.addEventListener('timeupdate', () => {
        if (typeof deck._fadeHandler === 'function') {
          deck._fadeHandler();
        }

        if (deck !== getActiveDeck() || isYouTubeActive()) return;
        if (state.isTrackLoading && !deck.paused && deck.currentTime > 0) {
          state.isTrackLoading = false;
          state.isPlaying = true;
          updatePlayPauseButton();
        }
        if (state.isTrackLoading) return;
        accumulatePlaybackTime(deck);
        if (state.playbackContext && state.playbackContext.type === 'playlist') {
          saveCurrentPlaylistProgress({ immediate: false });
        }
        if (state.isPlaying && !state.isDraggingProgress && state.currentTrack) {
          const cur = getCurrentPlaybackTime();
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

          // Proactive background crossfade & next-track evaluation
          checkPlaybackCrossfadeAndTransitions(cur, dur);
        }
      });
      deck.addEventListener('ended', () => {
        if (deck._playToken && deck._playToken !== activePlayToken) return;
        if (state.isTrackLoading || state.isTransitioning) return;
        if (deck === getActiveDeck()) {
          if (state.isCrossfading && state.preloadedNextTrack) {
            finalizeCrossfade(state.preloadedNextTrack, state.isMuted ? 0 : (state.volume || 0.8));
          } else if (!state.isCrossfading) {
            onTrackEnded();
          }
        }
      });
      deck.addEventListener('error', (err) => {
        // Critical safeguard: Ignore errors if player is paused or during initial app startup!
        if (!state.isPlaying) {
          return;
        }
        if (deck !== getActiveDeck()) return;
        console.warn('Audio stream error event:', err);
        const currentTrack = state.currentTrack;
        if (!currentTrack) return;

        const isYtTrack = currentTrack.source === 'youtube' || currentTrack.ytId || (currentTrack.id && currentTrack.id.startsWith('yt_'));
        if (isYtTrack) {
          const ytId = currentTrack.ytId || (currentTrack.id ? currentTrack.id.replace('yt_', '') : '');
          if (ytId && state.ytReady && state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
            if (!isContentFilterAllowed(currentTrack)) {
              showToast('Playback Blocked: MusiSurf strictly plays pure Music only.', '🚫');
              return;
            }
            try {
              state.activePlayerEngine = 'youtube';
              state.isPlaying = true;
              try {
                deck.pause();
                deck.removeAttribute('src');
                deck.load();
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
        if (currentTrack.streamUrl && deck.src !== currentTrack.streamUrl && !deck._proxyRetried) {
          deck._proxyRetried = true;
          console.log('Switching to MusiSurf stream proxy after error...');
          deck.src = currentTrack.streamUrl;
          deck.volume = state.isMuted ? 0 : state.volume;
          deck.load();
          deck.play().catch(e => {
            console.warn('Proxy retry error:', e);
            deck._proxyRetried = false;
            handlePlaybackStreamError(currentTrack);
          });
        } else {
          deck._proxyRetried = false;
          handlePlaybackStreamError(currentTrack);
        }
      });
    }

    if (elements.audio) attachAudioDeckListeners(elements.audio);
    if (elements.audioSecondary) attachAudioDeckListeners(elements.audioSecondary);

    // Save playback position on tab close or page unload
    window.addEventListener('beforeunload', () => {
      savePlaybackState();
      saveCurrentPlaylistProgress({ immediate: true });
    });
    window.addEventListener('pagehide', () => {
      savePlaybackState();
      saveCurrentPlaylistProgress({ immediate: true });
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

    // Mobile Bottom Navigation Tabs (Home, Search, Library, Downloads)
    if (elements.mobNavHome) elements.mobNavHome.addEventListener('click', () => {
      navigateToHomeTop();
    });

    // Mobile Search Button:
    // - 1st tap: switches to search section without auto-focusing the keyboard
    // - 2nd tap: focuses the search bar to bring up the keyboard
    // - Long-press / hold: immediately opens search and focuses search bar
    let searchHoldTimer = null;
    let isSearchHoldTriggered = false;
    let lastSearchTapTime = 0;

    function triggerSearchFocus() {
      state.isExploreMode = true;
      try { localStorage.setItem('musisurf_explore_mode', 'true'); } catch (err) {}
      switchView('search');
      updateMobNav('mobNavSearch');
      if (elements.searchBrowseSection) elements.searchBrowseSection.style.display = 'block';
      if (elements.searchRecentSection) elements.searchRecentSection.style.display = 'block';
      if (elements.searchRecentGrid) elements.searchRecentGrid.style.display = 'grid';
      if (elements.topCompassBtn) elements.topCompassBtn.classList.remove('active');
      setTimeout(() => {
        if (elements.globalSearchInput) {
          elements.globalSearchInput.focus();
          try { elements.globalSearchInput.select(); } catch (e) {}
        }
      }, 50);
    }

    if (elements.mobNavSearch) {
      // Touch long-press hold detection (holding directly focuses searchbar)
      elements.mobNavSearch.addEventListener('touchstart', () => {
        isSearchHoldTriggered = false;
        searchHoldTimer = setTimeout(() => {
          isSearchHoldTriggered = true;
          if (navigator.vibrate) navigator.vibrate(40);
          triggerSearchFocus();
        }, 300);
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
        }, 300);
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
          // 1st click when in another section: redirect to search section / explore section
          state.isExploreMode = true;
          try { localStorage.setItem('musisurf_explore_mode', 'true'); } catch (err) {}
          switchView('search');
          if (elements.searchBrowseSection) {
            elements.searchBrowseSection.style.display = 'block';
          }
          if (elements.searchResultsWrapper && (!elements.globalSearchInput || !elements.globalSearchInput.value.trim())) {
            elements.searchResultsWrapper.style.display = 'none';
          }
          if (elements.searchEmptyState) elements.searchEmptyState.style.display = 'none';
          updateMobNav('mobNavSearch');
        } else {
          // Already in search section, click again: redirect/focus to search bar with explore visible
          triggerSearchFocus();
        }
      });
    }

    if (elements.mobNavLibrary) elements.mobNavLibrary.addEventListener('click', () => {
      switchView('library');
      updateMobNav('mobNavLibrary');
    });

    if (elements.mobNavDownloads) elements.mobNavDownloads.addEventListener('click', () => {
      renderPlaylistView('downloaded');
      updateMobNav('mobNavDownloads');
    });

    // Mobile Top Bar Header Actions (Brand Logo, Search Icon, Profile Avatar)
    if (elements.mobileTopBrand) {
      elements.mobileTopBrand.addEventListener('click', () => {
        navigateToHomeTop();
        updateMobNav('mobNavHome');
      });
    }

    if (elements.mobTopSearchBtn) {
      elements.mobTopSearchBtn.addEventListener('click', () => {
        triggerSearchFocus();
      });
    }

    if (elements.mobTopProfileBtn) {
      elements.mobTopProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!state.currentUser || !state.currentUser.email) {
          if (typeof openAuthModal === 'function') {
            openAuthModal('signin');
          } else {
            const authM = document.getElementById('authModal');
            if (authM) authM.style.display = 'flex';
          }
        } else if (typeof openMobileDrawer === 'function') {
          openMobileDrawer();
        }
      });
    }

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
      if (!isAuthenticated()) {
        requireAuthForAction('create a playlist', () => openCreatePlaylistModal());
        return;
      }
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

    // Mobile Player Modal Smooth Sliding Open / Close Handlers
    function openMobilePlayerModal() {
      if (!elements.mobilePlayerModal) return;
      const modal = elements.mobilePlayerModal;
      modal.classList.remove('modal-closing');
      modal.classList.add('modal-opening');
      modal.style.display = 'flex';
      modal.style.transform = '';
      document.body.style.overflow = 'hidden';
      try { window.history.pushState({ modal: 'mobilePlayer' }, '', window.location.pathname); } catch (e) {}
    }
    window.openMobilePlayerModal = openMobilePlayerModal;

    function closeMobilePlayerModal(callback) {
      if (!elements.mobilePlayerModal) {
        if (typeof callback === 'function') callback();
        return;
      }
      const modal = elements.mobilePlayerModal;
      if (modal.style.display === 'none') {
        if (typeof callback === 'function') callback();
        return;
      }
      modal.classList.remove('modal-opening');
      modal.classList.add('modal-closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('modal-closing');
        modal.style.transform = '';
        document.body.style.overflow = '';
        if (typeof callback === 'function') callback();
      }, 270);
    }
    window.closeMobilePlayerModal = closeMobilePlayerModal;

    // Mobile Mini-Player Bar Click -> Opens Fullscreen Mobile Player with Slide Up Animation
    elements.playerBar.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        if (e.target.closest('#miniPlayerTrack') || e.target.closest('#playPauseBtn') || e.target.closest('#playerHeartBtn') || e.target.closest('#playerDownloadBtn')) {
          return;
        }
        if (state.currentTrack) {
          openMobilePlayerModal();
        }
      }
    });

    if (elements.closeMobilePlayerBtn) {
      elements.closeMobilePlayerBtn.addEventListener('click', () => {
        closeMobilePlayerModal();
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

    function openFullLyricsFromMobile() {
      if (!navigator.onLine) {
        showToast('Connect to internet to view lyrics', '⚡');
      }
      state.openedLyricsFromMobilePlayer = true;
      switchView('lyrics');
    }

    if (elements.mobPlayerLyricsBtn) {
      elements.mobPlayerLyricsBtn.addEventListener('click', openFullLyricsFromMobile);
    }

    const mobLyricsShowBtn = document.getElementById('mobLyricsShowBtn');
    if (mobLyricsShowBtn) {
      mobLyricsShowBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openFullLyricsFromMobile();
      });
    }

    const mobLyricsPreviewCard = document.getElementById('mobLyricsPreviewCard');
    if (mobLyricsPreviewCard) {
      mobLyricsPreviewCard.addEventListener('click', () => {
        openFullLyricsFromMobile();
      });
    }

    const mobLyricsBackBtn = document.getElementById('mobLyricsBackBtn');
    if (mobLyricsBackBtn) {
      mobLyricsBackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleCloseLyrics();
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
          if (willOpen) requestAnimationFrame(updateQueueDrawerUI);
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
        if (!target) return;
        const currentPlId = (state.currentView === 'playlist' && state.viewingPlaylistId) 
          ? state.viewingPlaylistId 
          : (state.activePlaylistId && !['liked', 'downloaded', 'local'].includes(state.activePlaylistId) ? state.activePlaylistId : null);
        let pl = currentPlId ? state.customPlaylists?.find(p => p.id === currentPlId) : null;
        if (!pl || !(pl.tracks || []).some(t => String(t.id) === String(target.id))) {
          pl = state.customPlaylists?.find(p => (p.tracks || []).some(t => String(t.id) === String(target.id)));
        }
        if (pl) {
          pl.tracks = (pl.tracks || []).filter(t => String(t.id) !== String(target.id));
          saveStoredPlaylists();
          updateAllPlaylistTickBadges(target.id);
          if (state.currentUser && state.currentUser.id && !pl.id.startsWith('pl_')) {
            fetch(`/api/library/playlists/${pl.id}/tracks/${encodeURIComponent(target.id)}`, {
              method: 'DELETE',
              credentials: 'include'
            }).catch(err => console.warn('[Neon Playlists] Remove track error:', err.message));
          }
          if (state.currentView === 'playlist' && state.viewingPlaylistId === pl.id) {
            renderPlaylistView(pl.id);
          }
          showToast(`Removed "${target.title}" from ${pl.name}`, '🗑️');
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

    // Mobile Fullscreen Player: Touch Swipe Left (Next Song) & Swipe Right (Previous Song) on Album Artwork
    const mobArtWrap = document.querySelector('.mobile-player-art-wrap') || document.getElementById('mobPlayerCover');
    if (mobArtWrap) {
      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;

      mobArtWrap.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          touchStartTime = Date.now();
        }
      }, { passive: true });

      mobArtWrap.addEventListener('touchend', (e) => {
        if (e.changedTouches && e.changedTouches.length === 1) {
          const touchEndX = e.changedTouches[0].clientX;
          const touchEndY = e.changedTouches[0].clientY;
          const deltaX = touchEndX - touchStartX;
          const deltaY = touchEndY - touchStartY;
          const deltaTime = Date.now() - touchStartTime;

          // Significant horizontal swipe (>45px, more horizontal than vertical, within 700ms)
          if (Math.abs(deltaX) >= 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3 && deltaTime < 700) {
            if (deltaX < 0) {
              // Swiped left -> next song
              mobArtWrap.classList.add('swiping-left');
              setTimeout(() => mobArtWrap.classList.remove('swiping-left'), 250);
              nextTrack();
            } else {
              // Swiped right -> previous song
              mobArtWrap.classList.add('swiping-right');
              setTimeout(() => mobArtWrap.classList.remove('swiping-right'), 250);
              prevTrack();
            }
          }
        }
      }, { passive: true });
    }

    // Mobile System Back & Popstate History Navigation (Prevents app from closing on single back)
    window.addEventListener('popstate', (e) => {
      // 1. If any modal or drawer is open, close it first
      const authModal = document.getElementById('authModal');
      if (authModal && authModal.style.display !== 'none') {
        authModal.style.display = 'none';
        return;
      }
      const mobileNavDrawer = document.getElementById('mobileNavDrawer');
      if (mobileNavDrawer && mobileNavDrawer.classList.contains('open')) {
        closeMobileDrawer();
        return;
      }
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
        closeMobilePlayerModal();
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
        // Trigger swipe down when starting near top handle or header only (prevents scroll conflict on artwork/cards)
        if (modalEl.scrollTop <= 5 && (e.target.closest('.mobile-player-header') || e.touches[0].clientY < 80)) {
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
        if (deltaY > 80) {
          closeMobilePlayerModal();
        } else {
          modalEl.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
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
      } else if ((e.key === 'ArrowRight' && (e.ctrlKey || e.shiftKey)) || (e.key.toLowerCase() === 'n' && (e.shiftKey || !e.ctrlKey))) {
        e.preventDefault();
        nextTrack();
      } else if ((e.key === 'ArrowLeft' && (e.ctrlKey || e.shiftKey)) || (e.key.toLowerCase() === 'p' && (e.shiftKey || !e.ctrlKey))) {
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
      } else if (e.key.toLowerCase() === 'f') {
        // Lyrics fullscreen mode: enabled ONLY when on lyrics window on desktop web
        if (state.currentView === 'lyrics') {
          e.preventDefault();
          toggleLyricsFullscreen();
        }
      } else if (e.key.toLowerCase() === 'q') {
        const willOpen = !elements.queueDrawer.classList.contains('open');
        elements.queueDrawer.classList.toggle('open', willOpen);
        if (elements.queueBtn) elements.queueBtn.classList.toggle('active', willOpen);
        if (elements.queueDrawerBackdrop) elements.queueDrawerBackdrop.classList.toggle('active', willOpen);
        if (willOpen) requestAnimationFrame(updateQueueDrawerUI);
      } else if (e.key === '/') {
        e.preventDefault();
        switchView('search');
        elements.globalSearchInput.focus();
      } else if (e.key === '?') {
        e.preventDefault();
        if (typeof openSettingsModal === 'function') openSettingsModal();
      } else if (e.key === 'Escape') {
        if (document.body.classList.contains('lyrics-fullscreen-active')) {
          exitLyricsFullscreen();
        }
        const authModal = document.getElementById('authModal');
        if (authModal) authModal.style.display = 'none';
        if (typeof closeMobileDrawer === 'function') closeMobileDrawer();
        elements.queueDrawer.classList.remove('open');
        if (elements.queueDrawerBackdrop) elements.queueDrawerBackdrop.classList.remove('active');
        if (elements.queueBtn) elements.queueBtn.classList.remove('active');
        elements.createPlaylistModal.style.display = 'none';
        if (elements.renamePlaylistModal) elements.renamePlaylistModal.style.display = 'none';
        if (elements.deletePlaylistConfirmModal) elements.deletePlaylistConfirmModal.style.display = 'none';
        if (elements.contributeLyricsModal) elements.contributeLyricsModal.style.display = 'none';
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

    // MediaSession Actions Registration for Lock Screen & Background Controls
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          if (!state.isPlaying) togglePlayPause();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          if (state.isPlaying) togglePlayPause();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          prevTrack();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          nextTrack();
        });
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details && details.seekTime !== undefined) {
            seekTo(details.seekTime);
          }
        });
      } catch (e) {}
    }

    // Initialize MusiSurf Auth & Mobile Left Sliding Navigation Drawer
    initAuthSystem();
    initMobileDrawerSystem();

    // Uninterrupted Background Tab & Mobile Lockscreen Playback Handler
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentPlaylistProgress({ immediate: true });
      }
      if (state.isPlaying) {
        if ('mediaSession' in navigator) {
          try { navigator.mediaSession.playbackState = 'playing'; } catch (e) {}
        }
        startBackgroundKeepAlive();
        const act = getActiveDeck();
        if (act && act.paused && !state.isTrackLoading && state.currentTrack?.hasDirectAudio) {
          act.play().catch(() => {});
        } else if (isYouTubeActive() && state.ytPlayer && typeof state.ytPlayer.playVideo === 'function') {
          const pState = typeof state.ytPlayer.getPlayerState === 'function' ? state.ytPlayer.getPlayerState() : -1;
          if (pState === YT.PlayerState.PAUSED || pState === 2 || pState === -1) {
            try { state.ytPlayer.playVideo(); } catch (e) {}
          }
        }
      }
    });
  }

  // ==========================================================================
  // MOBILE NAVIGATION & SETTINGS DRAWER
  // ==========================================================================
  function openMobileDrawer() {
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    const drawer = document.getElementById('mobileNavDrawer');
    if (backdrop) backdrop.style.display = 'block';
    if (drawer) drawer.classList.add('open');
    try {
      window.history.pushState({ drawer: 'mobileNav' }, '', window.location.pathname);
    } catch (e) {}
  }

  function closeMobileDrawer() {
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    const drawer = document.getElementById('mobileNavDrawer');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.style.display = 'none';
  }

  function exportAllPlaylistsJson() {
    const backupData = {
      app: 'MusiSurf',
      version: '8.45',
      exportDate: new Date().toISOString(),
      likedSongs: state.likedSongs || [],
      customPlaylists: state.customPlaylists || [],
      settings: state.settings || {}
    };
    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MusiSurf_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Library backup exported successfully', '✓');
  }

  function initMobileDrawerSystem() {
    const trigger = document.getElementById('mobileDrawerTrigger');
    const closeBtn = document.getElementById('closeMobileDrawerBtn');
    const backdrop = document.getElementById('mobileDrawerBackdrop');

    if (trigger) {
      trigger.addEventListener('click', openMobileDrawer);
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', closeMobileDrawer);
    }
    if (backdrop) {
      backdrop.addEventListener('click', closeMobileDrawer);
    }

    // Accordion Headers (Account, Playback, Sound & Audio Quality, Lyrics, Backup & Cloud Sync)
    document.querySelectorAll('.drawer-accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        const parent = header.closest('.drawer-accordion-item');
        if (!parent) return;
        const wasActive = parent.classList.contains('active');
        parent.classList.toggle('active', !wasActive);
      });
    });

    // Drawer AutoMix Slider (0 to 12s)
    const drawerCfSlider = document.getElementById('drawerCrossfadeSlider');
    const drawerCfVal = document.getElementById('drawerCrossfadeVal') || document.getElementById('drawerCrossfadeValue');
    if (drawerCfSlider) {
      drawerCfSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        state.settings.autoMixDuration = val;
        state.settings.crossfade = val;
        if (drawerCfVal) drawerCfVal.textContent = formatAutoMixLabel(val);
        if (elements.crossfadeSlider) elements.crossfadeSlider.value = val;
        if (elements.liveCrossfadeSeconds) elements.liveCrossfadeSeconds.textContent = formatAutoMixHeadline(val);
        if (elements.crossfadeValueLabel) elements.crossfadeValueLabel.textContent = formatAutoMixLabel(val);
        saveSettings();
      });
    }

    // Drawer Edge Dead Silence Switch
    const drawerSkipToggle = document.getElementById('drawerSkipSilenceToggle');
    if (drawerSkipToggle) {
      drawerSkipToggle.addEventListener('change', (e) => {
        const val = e.target.checked;
        state.settings.removeDeadSilence = val;
        if (elements.deadSilenceToggleSwitch) elements.deadSilenceToggleSwitch.checked = val;
        if (elements.skipSilenceToggleSwitch) elements.skipSilenceToggleSwitch.checked = val;
        saveSettings();
        showToast(val ? 'Edge Dead Silence Removal enabled (-45 dBFS)' : 'Edge Dead Silence Removal disabled', '⚡');
      });
    }

    // Drawer Audio Quality Select
    const drawerQualitySelect = document.getElementById('drawerAudioQualitySelect');
    if (drawerQualitySelect) {
      drawerQualitySelect.addEventListener('change', (e) => {
        const val = e.target.value;
        state.settings.streamingQuality = val;
        state.settings.audioQuality = val;
        saveSettings();
        showToast(`Streaming quality set to ${val.toUpperCase()}`, '🎧');
      });
    }

    // Drawer Export Playlists Button
    const drawerExportBtn = document.getElementById('drawerExportPlaylistsBtn');
    if (drawerExportBtn) {
      drawerExportBtn.addEventListener('click', () => {
        closeMobileDrawer();
        if (state.viewingPlaylistId) {
          openExportPlaylistModal();
        } else {
          exportAllPlaylistsJson();
        }
      });
    }
  }

  // ==========================================================================
  // MUSISURF AUTHENTICATION & NEON CLOUD PERSISTENCE SYSTEM
  // ==========================================================================
  async function syncLibraryFromServer() {
    if (!state.currentUser || !state.currentUser.id) return;
    try {
      // 1. Sync Liked Tracks
      const likesRes = await fetch('/api/library/likes', { credentials: 'include' });
      if (likesRes.ok) {
        const data = await likesRes.json();
        if (data.success && Array.isArray(data.tracks)) {
          state.likedSongs = data.tracks.map(t => ({
            id: t.track_id || t.id,
            title: t.title,
            artist: t.artist,
            album: t.album || '',
            image: t.thumbnail_url || '/icons/icon.svg',
            duration: t.duration_seconds || 0,
            addedAt: new Date(t.liked_at).getTime()
          }));
          saveStoredLikes();
          updateHeartIcon(state.currentTrack?.id);
          if (state.currentView === 'liked') {
            renderPlaylistView('liked');
          }
          if (elements.libHubLikedMeta) {
            elements.libHubLikedMeta.textContent = `${state.likedSongs.length} songs`;
          }
        }
      }

      // 2. Sync Playlists
      const plRes = await fetch('/api/library/playlists', { credentials: 'include' });
      if (plRes.ok) {
        const plData = await plRes.json();
        if (plData.success && Array.isArray(plData.playlists)) {
          const fullPlaylists = await Promise.all(plData.playlists.map(async (pl) => {
            try {
              const singleRes = await fetch(`/api/library/playlists/${pl.id}`, { credentials: 'include' });
              if (singleRes.ok) {
                const sData = await singleRes.json();
                if (sData.success && sData.playlist) {
                  return {
                    id: sData.playlist.id,
                    name: sData.playlist.name,
                    description: sData.playlist.description || '',
                    cover_url: sData.playlist.cover_url,
                    tracks: (sData.playlist.tracks || []).map(t => ({
                      id: t.track_id || t.id,
                      title: t.title,
                      artist: t.artist,
                      album: t.album || '',
                      image: t.thumbnail_url || '/icons/icon.svg',
                      duration: t.duration_seconds || 0,
                      addedAt: new Date(t.added_at).getTime()
                    }))
                  };
                }
              }
            } catch (err) {}
            return {
              id: pl.id,
              name: pl.name,
              description: pl.description || '',
              cover_url: pl.cover_url,
              tracks: []
            };
          }));

          state.customPlaylists = fullPlaylists;
          saveStoredPlaylists();
          renderSidebarPlaylists();
          updateLibraryUI();
          if (state.activePlaylistId && state.customPlaylists.some(p => p.id === state.activePlaylistId)) {
            renderPlaylistView(state.activePlaylistId);
          }
        }
      }
    } catch (err) {
      console.warn('[Neon Sync] Failed to sync library:', err.message);
    }
  }

  function initAuthSystem() {
    const authModal = document.getElementById('authModal');
    const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
    const authMainContainer = document.getElementById('authMainContainer');
    const authOtpContainer = document.getElementById('authOtpContainer');
    const authForm = document.getElementById('authForm');
    const authNameGroup = document.getElementById('authNameGroup');
    const authNameInput = document.getElementById('authNameInput');
    const authEmailInput = document.getElementById('authEmailInput');
    const authPasswordInput = document.getElementById('authPasswordInput');
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    const authMainTitle = document.getElementById('authMainTitle');
    const authSubTitle = document.getElementById('authSubTitle');
    const authSwitchBtn = document.getElementById('authSwitchBtn');
    const authSwitchPrompt = document.getElementById('authSwitchPrompt');
    const authForgotLink = document.getElementById('authForgotLink');
    const authGoogleBtn = document.getElementById('authGoogleBtn');
    const authTabSignIn = document.getElementById('authTabSignIn');
    const authTabSignUp = document.getElementById('authTabSignUp');
    const authAlert = document.getElementById('authAlert');

    const authOtpInput = document.getElementById('authOtpInput');
    const authOtpSubTitle = document.getElementById('authOtpSubTitle');
    const authVerifyOtpBtn = document.getElementById('authVerifyOtpBtn');
    const authResendOtpBtn = document.getElementById('authResendOtpBtn');
    const authBackToAuthBtn = document.getElementById('authBackToAuthBtn');

    const headerUserAvatarBtn = document.getElementById('headerUserAvatarBtn');
    const headerUserIconSvg = document.getElementById('headerUserIconSvg');
    const userProfileDropdown = document.getElementById('userProfileDropdown');
    const userDropdownAvatar = document.getElementById('userDropdownAvatar');
    const userDropdownName = document.getElementById('userDropdownName');
    const userDropdownEmail = document.getElementById('userDropdownEmail');
    const userDropdownSettingsBtn = document.getElementById('userDropdownSettingsBtn');
    const userDropdownSignOutBtn = document.getElementById('userDropdownSignOutBtn');

    const mobTopProfileBtn = document.getElementById('mobTopProfileBtn');
    const mobTopAvatar = document.getElementById('mobTopAvatar');

    const drawerTopSignInBtn = document.getElementById('drawerTopSignInBtn');
    const drawerUserCard = document.getElementById('drawerUserCard');
    const drawerSignInBtn = document.getElementById('drawerSignInBtn');
    const drawerSignOutBtn = document.getElementById('drawerSignOutBtn');
    const drawerUserAvatar = document.getElementById('drawerUserAvatar');
    const drawerUserName = document.getElementById('drawerUserName');
    const drawerUserStatus = document.getElementById('drawerUserStatus');
    const drawerUserEmail = document.getElementById('drawerUserEmail');

    let authMode = 'signin';
    let pendingVerificationEmail = '';

    function showAlert(message, type = 'error') {
      if (!authAlert) return;
      authAlert.className = `auth-alert ${type}`;
      authAlert.textContent = message;
      authAlert.style.display = 'flex';
    }

    function clearAlert() {
      if (!authAlert) return;
      authAlert.textContent = '';
      authAlert.style.display = 'none';
    }

    function renderAvatarElement(el, initial, customPhoto, size = 32) {
      if (!el) return;
      if (customPhoto) {
        el.innerHTML = `<img src="${customPhoto}" class="user-custom-avatar-img" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
      } else if (initial) {
        el.innerHTML = `<span class="user-initial-badge" style="font-weight:700;font-size:${Math.round(size * 0.44)}px;color:#fff;line-height:1;text-transform:uppercase;">${initial}</span>`;
      } else {
        el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:60%;height:60%;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
      }
    }

    function updateAuthUI() {
      const user = state.currentUser;
      const userDropdownHeader = document.getElementById('userDropdownHeader');
      const userDropdownSignInBtn = document.getElementById('userDropdownSignInBtn');
      const userDropdownDivider = document.getElementById('userDropdownDivider');
      const settingsChangeAvatarBtn = document.getElementById('settingsChangeAvatarBtn');
      const headerUserAvatarCircle = document.getElementById('headerUserAvatarCircle');

      if (user && user.email) {
        const initial = ((user.name || user.email || 'U')[0]).toUpperCase();
        const userKey = (user.id || user.email || 'current_user');
        let customPhoto = null;
        try {
          customPhoto = localStorage.getItem('musisurf_avatar_' + userKey);
        } catch (e) {}

        if (headerUserAvatarBtn) {
          headerUserAvatarBtn.title = `${user.name || user.email} (Signed In)`;
        }
        renderAvatarElement(headerUserAvatarCircle, initial, customPhoto, 34);

        if (userDropdownAvatar) renderAvatarElement(userDropdownAvatar, initial, customPhoto, 44);
        if (userDropdownName) userDropdownName.textContent = user.name || user.email.split('@')[0];
        if (userDropdownEmail) userDropdownEmail.textContent = user.email;

        if (userDropdownHeader) userDropdownHeader.style.setProperty('display', 'flex', 'important');
        if (userDropdownSignInBtn) userDropdownSignInBtn.style.setProperty('display', 'none', 'important');
        if (userDropdownSignOutBtn) userDropdownSignOutBtn.style.setProperty('display', 'flex', 'important');
        if (userDropdownDivider) userDropdownDivider.style.setProperty('display', 'block', 'important');

        if (mobTopAvatar) {
          renderAvatarElement(mobTopAvatar, initial, customPhoto, 34);
        }

        if (drawerUserAvatar) renderAvatarElement(drawerUserAvatar, initial, customPhoto, 48);
        if (drawerUserName) drawerUserName.textContent = user.name || user.email.split('@')[0];
        if (drawerUserStatus) drawerUserStatus.textContent = 'Signed in with Neon';
        if (drawerUserEmail) drawerUserEmail.textContent = user.email;

        if (drawerTopSignInBtn) drawerTopSignInBtn.style.display = 'none';
        if (drawerUserCard) drawerUserCard.style.display = 'flex';

        if (drawerSignInBtn) drawerSignInBtn.style.display = 'none';
        if (drawerSignOutBtn) drawerSignOutBtn.style.display = 'flex';

        // Update Settings Account Tab
        const settingsGuestBlock = document.getElementById('settingsAccountGuestBlock');
        const settingsUserBlock = document.getElementById('settingsAccountUserBlock');
        const settingsSubBlock = document.getElementById('settingsAccountSubscriptionBlock');
        const settingsAvatar = document.getElementById('settingsAccountAvatar');
        const settingsName = document.getElementById('settingsAccountName');
        const settingsEmail = document.getElementById('settingsAccountEmail');
        if (settingsGuestBlock) settingsGuestBlock.style.setProperty('display', 'none', 'important');
        if (settingsUserBlock) settingsUserBlock.style.setProperty('display', 'block', 'important');
        if (settingsSubBlock) settingsSubBlock.style.setProperty('display', 'none', 'important');
        if (settingsChangeAvatarBtn) settingsChangeAvatarBtn.style.setProperty('display', 'inline-flex', 'important');
        if (settingsAvatar) renderAvatarElement(settingsAvatar, initial, customPhoto, 48);
        if (settingsName) settingsName.textContent = user.name || user.email.split('@')[0];
        if (settingsEmail) settingsEmail.textContent = user.email;
      } else {
        if (headerUserAvatarBtn) {
          headerUserAvatarBtn.title = 'Account & Sign In';
        }
        renderAvatarElement(headerUserAvatarCircle, null, null, 34);

        if (userDropdownHeader) userDropdownHeader.style.setProperty('display', 'none', 'important');
        if (userDropdownSignInBtn) userDropdownSignInBtn.style.setProperty('display', 'flex', 'important');
        if (userDropdownSignOutBtn) userDropdownSignOutBtn.style.setProperty('display', 'none', 'important');
        if (userDropdownDivider) userDropdownDivider.style.setProperty('display', 'block', 'important');

        if (mobTopAvatar) {
          renderAvatarElement(mobTopAvatar, null, null, 34);
        }

        if (drawerUserAvatar) renderAvatarElement(drawerUserAvatar, null, null, 48);
        if (drawerUserName) drawerUserName.textContent = 'Guest Listener';
        if (drawerUserStatus) drawerUserStatus.textContent = 'Tap to sign in / sign up';
        if (drawerUserEmail) drawerUserEmail.textContent = 'Sign in to sync your library';

        if (drawerTopSignInBtn) drawerTopSignInBtn.style.display = 'none';
        if (drawerUserCard) drawerUserCard.style.display = 'flex';

        if (drawerSignInBtn) drawerSignInBtn.style.display = 'none';
        if (drawerSignOutBtn) drawerSignOutBtn.style.display = 'none';

        // Update Settings Account Tab for Guest (Hide subscription before sign-in)
        const settingsGuestBlock = document.getElementById('settingsAccountGuestBlock');
        const settingsUserBlock = document.getElementById('settingsAccountUserBlock');
        const settingsSubBlock = document.getElementById('settingsAccountSubscriptionBlock');
        if (settingsGuestBlock) settingsGuestBlock.style.setProperty('display', 'block', 'important');
        if (settingsUserBlock) settingsUserBlock.style.setProperty('display', 'none', 'important');
        if (settingsSubBlock) settingsSubBlock.style.setProperty('display', 'none', 'important');
        if (settingsChangeAvatarBtn) settingsChangeAvatarBtn.style.setProperty('display', 'none', 'important');
      }
      if (typeof updateQuickPicksUI === 'function') updateQuickPicksUI();
    }

    function openAuthModal(mode = 'signin', promptMessage = null) {
      authMode = mode;
      clearAlert();
      if (authOtpContainer) authOtpContainer.style.display = 'none';
      if (authMainContainer) authMainContainer.style.display = 'block';

      if (authTabSignIn && authTabSignUp) {
        authTabSignIn.classList.toggle('active', authMode === 'signin');
        authTabSignUp.classList.toggle('active', authMode === 'signup');
      }

      if (authMode === 'signup') {
        if (authMainTitle) authMainTitle.textContent = 'Join MusiSurf';
        if (authSubTitle) authSubTitle.textContent = 'Create your free account for high fidelity music';
        if (authNameGroup) authNameGroup.style.display = 'block';
        if (authSubmitBtn) {
          const span = authSubmitBtn.querySelector('span');
          if (span) span.textContent = 'Create Account';
        }
        if (authSwitchPrompt) authSwitchPrompt.textContent = 'Already have an account?';
        if (authSwitchBtn) authSwitchBtn.textContent = 'Sign in';
      } else {
        if (authMainTitle) authMainTitle.textContent = 'Hi Music Lover';
        if (authSubTitle) authSubTitle.textContent = 'Welcome to MusiSurf — An all-access experience';
        if (authNameGroup) authNameGroup.style.display = 'none';
        if (authSubmitBtn) {
          const span = authSubmitBtn.querySelector('span');
          if (span) span.textContent = 'Sign In';
        }
        if (authSwitchPrompt) authSwitchPrompt.textContent = "Don't have an account?";
        if (authSwitchBtn) authSwitchBtn.textContent = 'Create one';
      }

      if (promptMessage) {
        showAlert(promptMessage, 'info');
      }

      if (authModal) authModal.style.display = 'flex';
      try {
        window.history.pushState({ modal: 'auth' }, '', window.location.pathname);
      } catch (e) {}
    }
    window.openAuthModal = openAuthModal;

    function closeAuthModal() {
      if (authModal) authModal.style.display = 'none';
      pendingAuthAction = null;
      clearAlert();
    }

    async function checkActiveSession() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            state.currentUser = data.user;
            localStorage.setItem('musisurf_user', JSON.stringify(data.user));
            updateAuthUI();
            syncLibraryFromServer();
            loadAccountPlaylistProgress();
            syncUserSearchHistory();
            return;
          }
        }
      } catch (err) {
        console.warn('[Auth] Check session error:', err.message);
      }
      try {
        const local = localStorage.getItem('musisurf_user');
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed && parsed.email) {
            state.currentUser = parsed;
            updateAuthUI();
          }
        }
      } catch (e) {}
    }

    if (authGoogleBtn) {
      authGoogleBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/auth/social-url?provider=google&callbackURL=/');
          const data = await res.json();
          if (data && data.url) {
            window.location.href = data.url;
          } else {
            showAlert(data.error || 'Could not initiate Google Sign-in. Please try again.');
          }
        } catch (err) {
          showAlert('Failed to connect to Google Auth: ' + err.message);
        }
      });
    }

    if (authTabSignIn) {
      authTabSignIn.addEventListener('click', () => openAuthModal('signin'));
    }
    if (authTabSignUp) {
      authTabSignUp.addEventListener('click', () => openAuthModal('signup'));
    }

    function toggleUserProfileDropdown(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (!userProfileDropdown) return;
      userProfileDropdown.classList.toggle('is-open');
    }

    if (headerUserAvatarBtn) {
      headerUserAvatarBtn.addEventListener('click', toggleUserProfileDropdown);
    }

    if (mobTopProfileBtn) {
      mobTopProfileBtn.addEventListener('click', toggleUserProfileDropdown);
    }

    const userDropdownSignInBtn = document.getElementById('userDropdownSignInBtn');
    if (userDropdownSignInBtn) {
      userDropdownSignInBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        if (userProfileDropdown) userProfileDropdown.classList.remove('is-open');
        openAuthModal('signin');
      });
    }

    document.addEventListener('click', (e) => {
      if (userProfileDropdown && userProfileDropdown.classList.contains('is-open')) {
        const isClickInside = userProfileDropdown.contains(e.target) ||
          (headerUserAvatarBtn && headerUserAvatarBtn.contains(e.target)) ||
          (mobTopProfileBtn && mobTopProfileBtn.contains(e.target));
        if (!isClickInside) {
          userProfileDropdown.classList.remove('is-open');
        }
      }
    });

    if (userDropdownSettingsBtn) {
      userDropdownSettingsBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        if (userProfileDropdown) userProfileDropdown.classList.remove('is-open');
        if (typeof window.openSettingsModal === 'function') {
          window.openSettingsModal();
        } else if (typeof openSettingsModal === 'function') {
          openSettingsModal();
        }
      });
    }

    const settingsChangeAvatarBtn = document.getElementById('settingsChangeAvatarBtn');
    const settingsAccountAvatar = document.getElementById('settingsAccountAvatar');
    const userAvatarFileInput = document.getElementById('userAvatarFileInput');

    const triggerSettingsAvatarUpload = (e) => {
      if (e) e.stopPropagation();
      if (!state.currentUser) {
        showToast('Please sign in first to change your profile photo', '🔒');
        return;
      }
      if (userAvatarFileInput) userAvatarFileInput.click();
    };

    if (settingsChangeAvatarBtn) {
      settingsChangeAvatarBtn.addEventListener('click', triggerSettingsAvatarUpload);
    }
    if (settingsAccountAvatar) {
      settingsAccountAvatar.addEventListener('click', triggerSettingsAvatarUpload);
    }

    if (userAvatarFileInput) {
      userAvatarFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!state.currentUser) {
          showToast('Please sign in first to customize your profile picture.', '🔒');
          return;
        }
        const reader = new FileReader();
        reader.onload = function(evt) {
          const img = new Image();
          img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_DIM = 256;
            let w = img.width;
            let h = img.height;
            if (w > h) {
              if (w > MAX_DIM) {
                h = Math.round((h * MAX_DIM) / w);
                w = MAX_DIM;
              }
            } else {
              if (h > MAX_DIM) {
                w = Math.round((w * MAX_DIM) / h);
                h = MAX_DIM;
              }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            const userKey = (state.currentUser.id || state.currentUser.email || 'current_user');
            try {
              localStorage.setItem('musisurf_avatar_' + userKey, dataUrl);
            } catch (err) {
              console.warn('Failed to store avatar in localStorage', err);
            }
            updateAuthUI();
            showToast('✓ Profile picture updated!', '✓');
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    async function handleSignOut() {
      try {
        await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
      } catch (err) {}
      state.currentUser = null;
      state.playlistProgressMap = {};
      try {
        localStorage.removeItem('musisurf_user');
      } catch (e) {}
      if (userProfileDropdown) userProfileDropdown.classList.remove('is-open');
      updateAuthUI();
      showToast('Signed out successfully', '👋');
      closeMobileDrawer();
    }

    if (userDropdownSignOutBtn) {
      userDropdownSignOutBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        handleSignOut();
      });
    }
    if (drawerSignOutBtn) {
      drawerSignOutBtn.addEventListener('click', handleSignOut);
    }

    const settingsAccountSignInBtn = document.getElementById('settingsAccountSignInBtn');
    if (settingsAccountSignInBtn) {
      settingsAccountSignInBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) settingsModal.style.display = 'none';
        openAuthModal('signin');
      });
    }

    const settingsAccountSignOutBtn = document.getElementById('settingsAccountSignOutBtn');
    if (settingsAccountSignOutBtn) {
      settingsAccountSignOutBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        handleSignOut();
      });
    }

    if (drawerUserCard) {
      drawerUserCard.addEventListener('click', () => {
        if (!state.currentUser || !state.currentUser.email) {
          closeMobileDrawer();
          openAuthModal('signin');
        }
      });
    }

    if (drawerTopSignInBtn) {
      drawerTopSignInBtn.addEventListener('click', () => {
        closeMobileDrawer();
        openAuthModal('signin');
      });
    }
    if (drawerSignInBtn) {
      drawerSignInBtn.addEventListener('click', () => {
        closeMobileDrawer();
        openAuthModal('signin');
      });
    }

    if (closeAuthModalBtn) {
      closeAuthModalBtn.addEventListener('click', closeAuthModal);
    }
    if (authModal) {
      authModal.addEventListener('click', (e) => {
        if (e.target === authModal) closeAuthModal();
      });
    }

    if (authSwitchBtn) {
      authSwitchBtn.addEventListener('click', () => {
        authMode = authMode === 'signin' ? 'signup' : 'signin';
        openAuthModal(authMode);
      });
    }

    if (togglePasswordBtn && authPasswordInput) {
      togglePasswordBtn.addEventListener('click', () => {
        const isPw = authPasswordInput.getAttribute('type') === 'password';
        authPasswordInput.setAttribute('type', isPw ? 'text' : 'password');
        togglePasswordBtn.innerHTML = isPw
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      });
    }

    if (authForgotLink) {
      authForgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        const email = authEmailInput ? authEmailInput.value.trim() : '';
        if (email) {
          showToast(`Password reset instructions sent to ${email}`, '✉️');
        } else {
          showAlert('Please enter your email address first to reset password');
        }
      });
    }

    if (authForm) {
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();
        const cleanEmail = (authEmailInput ? authEmailInput.value : '').trim().toLowerCase();
        const password = authPasswordInput ? authPasswordInput.value.trim() : '';
        const rawName = authNameInput ? authNameInput.value.trim() : '';
        const cleanName = (rawName && rawName.length > 0) ? rawName : (cleanEmail.split('@')[0] || 'User');

        if (!cleanEmail) {
          showAlert('Please enter your email address');
          return;
        }

        if (authMode === 'signup') {
          if (!password || password.length < 8) {
            showAlert('Password must be at least 8 characters');
            return;
          }
        } else {
          if (!password) {
            showAlert('Please enter your password');
            return;
          }
        }

        const submitBtnText = authSubmitBtn?.querySelector('span');
        const origText = submitBtnText?.textContent || '';
        if (submitBtnText) submitBtnText.textContent = 'Please wait...';
        if (authSubmitBtn) authSubmitBtn.disabled = true;

        try {
          if (authMode === 'signup') {
            const res = await fetch('/api/auth/sign-up', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ email: cleanEmail, password, name: cleanName })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok || data.error || !data.success) {
              console.error('[AuthSignUp] Status:', res.status, 'Response:', data);
              const errMsg = data.error?.message || data.message || (typeof data.error === 'string' ? data.error : null) || res.statusText || 'Failed to create account';
              showAlert(errMsg);
              return;
            }

            if (data.requiresVerification || !data.token) {
              pendingVerificationEmail = cleanEmail;
              if (authMainContainer) authMainContainer.style.display = 'none';
              if (authOtpContainer) authOtpContainer.style.display = 'flex';
              if (authOtpSubTitle) authOtpSubTitle.textContent = `Enter the 6-digit code sent to ${cleanEmail}`;
              if (authOtpInput) {
                authOtpInput.value = '';
                setTimeout(() => authOtpInput.focus(), 100);
              }
              showAlert(data.message || 'Account created! Check your email to verify your account, then sign in.', 'success');
            } else {
              state.currentUser = data.user;
              localStorage.setItem('musisurf_user', JSON.stringify(data.user));
              updateAuthUI();
              closeAuthModal();
              showToast(`Welcome to MusiSurf, ${data.user.name || cleanEmail}!`, '✓');
              syncLibraryFromServer();
              loadAccountPlaylistProgress();
              syncUserSearchHistory();
              resumePendingAuthAction();
            }
          } else {
            const res = await fetch('/api/auth/sign-in', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ email: cleanEmail, password })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error || !data.user) {
              console.error('[AuthSignIn] Status:', res.status, 'Response:', data);
              if (data.code === 'EMAIL_NOT_VERIFIED' || data.message?.toLowerCase().includes('email not verified')) {
                pendingVerificationEmail = cleanEmail;
                if (authMainContainer) authMainContainer.style.display = 'none';
                if (authOtpContainer) authOtpContainer.style.display = 'flex';
                if (authOtpSubTitle) authOtpSubTitle.textContent = `Please verify your email. Enter the 6-digit code sent to ${cleanEmail}`;
                if (authOtpInput) {
                  authOtpInput.value = '';
                  setTimeout(() => authOtpInput.focus(), 100);
                }
                showAlert('Your email is not verified yet. Enter your code or click Resend Code.', 'warning');
                fetch('/api/auth/resend-otp', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: cleanEmail })
                }).catch(() => {});
                return;
              }
              const errMsg = data.error?.message || data.message || (typeof data.error === 'string' ? data.error : null) || 'Invalid email or password';
              showAlert(errMsg);
              return;
            }

            state.currentUser = data.user;
            localStorage.setItem('musisurf_user', JSON.stringify(data.user));
            updateAuthUI();
            closeAuthModal();
            showToast(`Welcome back, ${data.user.name || cleanEmail}!`, '✓');
            syncLibraryFromServer();
            loadAccountPlaylistProgress();
            syncUserSearchHistory();
            resumePendingAuthAction();
          }
        } catch (err) {
          console.error('[Auth] Error:', err);
          showAlert('Network error: ' + err.message);
        } finally {
          if (submitBtnText) submitBtnText.textContent = origText;
          if (authSubmitBtn) authSubmitBtn.disabled = false;
        }
      });
    }

    async function handleVerifyOtp() {
      clearAlert();
      const otp = authOtpInput ? authOtpInput.value.trim() : '';
      const email = pendingVerificationEmail || (authEmailInput ? authEmailInput.value.trim() : '');

      if (!otp || otp.length !== 6) {
        showAlert('Please enter the complete 6-digit verification code');
        return;
      }
      if (!email) {
        showAlert('Missing email address for verification');
        return;
      }

      const verifyBtnSpan = authVerifyOtpBtn?.querySelector('span');
      const origText = verifyBtnSpan?.textContent || '';
      if (verifyBtnSpan) verifyBtnSpan.textContent = 'Verifying...';
      if (authVerifyOtpBtn) authVerifyOtpBtn.disabled = true;

      try {
        const res = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, otp })
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          showAlert(data.error || 'Invalid or expired verification code');
          return;
        }

        state.currentUser = data.user;
        localStorage.setItem('musisurf_user', JSON.stringify(data.user));
        updateAuthUI();
        closeAuthModal();
        showToast(`Account verified! Welcome to MusiSurf, ${data.user.name || email}!`, '✓');
        syncLibraryFromServer();
        loadAccountPlaylistProgress();
        syncUserSearchHistory();
        resumePendingAuthAction();
      } catch (err) {
        showAlert('Network error: ' + err.message);
      } finally {
        if (verifyBtnSpan) verifyBtnSpan.textContent = origText;
        if (authVerifyOtpBtn) authVerifyOtpBtn.disabled = false;
      }
    }

    if (authVerifyOtpBtn) {
      authVerifyOtpBtn.addEventListener('click', handleVerifyOtp);
    }
    if (authOtpInput) {
      authOtpInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleVerifyOtp();
        }
      });
    }

    if (authResendOtpBtn) {
      authResendOtpBtn.addEventListener('click', async () => {
        const email = pendingVerificationEmail || (authEmailInput ? authEmailInput.value.trim() : '');
        if (!email) {
          showAlert('Missing email address to resend code');
          return;
        }
        try {
          const res = await fetch('/api/auth/resend-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showAlert('A new verification code has been sent to your email.', 'success');
          } else {
            showAlert(data.error || 'Failed to resend verification code');
          }
        } catch (err) {
          showAlert('Failed to resend code: ' + err.message);
        }
      });
    }

    if (authBackToAuthBtn) {
      authBackToAuthBtn.addEventListener('click', () => {
        if (authOtpContainer) authOtpContainer.style.display = 'none';
        if (authMainContainer) authMainContainer.style.display = 'block';
        clearAlert();
      });
    }

    updateAuthUI();
    checkActiveSession();
  }

  // ==========================================================================
  // PLAYBACK COORDINATOR (Bridge Web Browser & Native Android Media3 ExoPlayer)
  // ==========================================================================
  function initPlaybackCoordinator() {
    if (!window.MusiSurfPlayback || !window.MusiSurfPlayback.coordinator) return;
    const coord = window.MusiSurfPlayback.coordinator;

    coord.setWebEngineDelegate({
      loadTrackWeb: async (track, options) => {
        return await playTrack(track, null, true, options?.startTime || 0, false, options);
      },
      playWeb: async () => {
        const act = getActiveDeck();
        if (act && act.paused) {
          state.isPlaying = true;
          updatePlayPauseButton();
          return await act.play();
        }
      },
      pauseWeb: async () => {
        const act = getActiveDeck();
        if (act && !act.paused) {
          state.isPlaying = false;
          updatePlayPauseButton();
          act.pause();
        }
      },
      resumeWeb: async () => {
        const act = getActiveDeck();
        if (act && act.paused) {
          state.isPlaying = true;
          updatePlayPauseButton();
          return await act.play();
        }
      },
      seekWeb: async (pos) => {
        seekTo(pos);
      },
      setVolumeWeb: (vol) => {
        setVolume(vol);
      },
      setMutedWeb: (muted) => {
        state.isMuted = muted;
        setVolume(muted ? 0 : (state.volume || 0.8));
      },
      getPositionWeb: () => {
        return getCurrentPlaybackTime();
      },
      getDurationWeb: () => {
        return getTotalDuration();
      },
      stopWeb: () => {
        const act = getActiveDeck();
        if (act) {
          act.pause();
          act.currentTime = 0;
        }
      }
    });

    // Wire up events emitted from coordinator (including native Android Media3 ExoPlayer callbacks)
    coord.on('playbackStateChanged', (e) => {
      if (typeof e?.isPlaying === 'boolean' && state.isPlaying !== e.isPlaying) {
        state.isPlaying = e.isPlaying;
        updatePlayPauseButton();
      }
    });

    coord.on('trackChanged', (e) => {
      if (e?.track && (!state.currentTrack || state.currentTrack.id !== e.track.id)) {
        state.currentTrack = e.track;
        updatePlayerUI(e.track);
        updateMediaSession(e.track);
        highlightPlayingTrackInTables(e.track.id);
        loadLyricsForTrack(e.track);
        updateQueueDrawerUI();
      }
    });

    coord.on('repeatChanged', (e) => {
      if (e?.mode && state.repeatMode !== e.mode) {
        state.repeatMode = e.mode;
        updateRepeatUI();
      }
    });

    coord.on('shuffleChanged', (e) => {
      if (typeof e?.enabled === 'boolean' && state.isShuffled !== e.enabled) {
        state.isShuffled = e.enabled;
        updatePlaylistModeUI();
      }
    });

    console.log('[MusiSurf] Playback Coordinator initialized. Engine:', coord.isNativeActive ? 'Native Android (Media3)' : 'Web Browser');
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
    updatePlaylistModeUI();
    updateQueueDrawerUI();
    setupEventListeners();
    initPlaybackCoordinator();
    loadTrendingShelves();
    renderSearchRecentUI();
    restoreLastPlayedState();
    updateProgress();
    loadAccountPlaylistProgress();
    cleanRecommendationQueue();

    // Restore previous active view / playlist if user refreshed while browsing
    let savedView = null;
    try {
      const savedStr = localStorage.getItem('musisurf_current_view');
      if (savedStr) savedView = JSON.parse(savedStr);
    } catch (e) {}

    if (savedView && savedView.view === 'playlist' && savedView.playlistId) {
      renderPlaylistView(savedView.playlistId);
    } else if (savedView && ['library', 'search', 'localMusic', 'liked', 'downloaded', 'lyrics'].includes(savedView.view)) {
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
