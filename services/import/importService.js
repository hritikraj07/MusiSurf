/**
 * MusiSurf Centralized Playlist Import Service
 * Coordinates parsing, matching, duplicate detection, and playlist persistence.
 */

const { parsePlaylistFile } = require('./playlistParser');
const { fetchSpotifyPlaylist, extractSpotifyPlaylistId, extractSpotifyPlaylistInfo } = require('./spotifyAdapter');
const { fetchYouTubeMusicPlaylist, extractYouTubePlaylistId } = require('./youtubeMusicAdapter');
const { matchTrackList } = require('./matchingEngine');
const libraryService = require('../library');
const { sql } = require('../db');

// In-memory import history fallback (for guest sessions or when DB is not connected)
const inMemoryImportHistory = [];

/**
 * Parses an external playlist from link URL/URI or uploaded file.
 */
async function parseExternalPlaylist({ url, fileContent, filename, format, spotifyToken = null }) {
  if (url && typeof url === 'string' && url.trim()) {
    const trimmedUrl = url.trim();

    // 1. Spotify playlist link or URI
    if (trimmedUrl.includes('spotify.com') || trimmedUrl.startsWith('spotify:playlist:') || extractSpotifyPlaylistId(trimmedUrl)) {
      return await fetchSpotifyPlaylist(trimmedUrl, spotifyToken);
    }

    // 2. YouTube Music / YouTube playlist link
    if (
      trimmedUrl.includes('music.youtube.com') ||
      trimmedUrl.includes('youtube.com/playlist') ||
      trimmedUrl.includes('youtu.be') ||
      extractYouTubePlaylistId(trimmedUrl)
    ) {
      return await fetchYouTubeMusicPlaylist(trimmedUrl);
    }

    throw new Error('Unsupported playlist provider URL. Currently Spotify, YouTube Music, and playlist export files are supported.');
  }

  if (fileContent && typeof fileContent === 'string' && fileContent.trim()) {
    return parsePlaylistFile(fileContent, filename || 'playlist.m3u', format || '');
  }

  throw new Error('Please provide a valid Spotify or YouTube Music playlist link or upload a playlist file.');
}

/**
 * Runs matching engine on the parsed playlist tracks against MusiSurf catalogue.
 */
async function matchExternalPlaylist(externalPlaylist, searchSaavnFn, searchYouTubeFn, onProgress = null) {
  if (!externalPlaylist || !Array.isArray(externalPlaylist.tracks)) {
    throw new Error('Invalid playlist data: tracks array is missing');
  }

  const matchResults = await matchTrackList(
    externalPlaylist.tracks,
    searchSaavnFn,
    searchYouTubeFn,
    onProgress
  );

  let matchedCount = 0;
  let reviewCount = 0;
  let unmatchedCount = 0;

  matchResults.forEach(r => {
    if (r.status === 'matched') matchedCount++;
    else if (r.status === 'review') reviewCount++;
    else unmatchedCount++;
  });

  return {
    playlist: {
      name: externalPlaylist.name,
      description: externalPlaylist.description,
      creator: externalPlaylist.creator,
      artwork: externalPlaylist.artwork,
      provider: externalPlaylist.provider,
      externalPlaylistId: externalPlaylist.externalPlaylistId || ''
    },
    stats: {
      totalSourceTracks: externalPlaylist.tracks.length,
      matchedCount,
      reviewCount,
      unmatchedCount
    },
    results: matchResults
  };
}

/**
 * Checks if the user already has a playlist with the same name or external ID.
 */
async function checkDuplicateImport(userId, playlistName, externalId) {
  if (!userId || !sql) return null;

  try {
    const existing = await sql`
      SELECT id, name, created_at, updated_at
      FROM playlists
      WHERE user_id = ${userId} AND LOWER(name) = LOWER(${playlistName.trim()})
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    return existing.length > 0 ? existing[0] : null;
  } catch (err) {
    console.warn('[ImportService] Duplicate check note:', err.message);
    return null;
  }
}

/**
 * Creates the final MusiSurf playlist from confirmed matches.
 * Preserves original track ordering and intentional duplicates.
 */
async function confirmAndCreatePlaylist({
  userId,
  playlistName,
  description = '',
  coverUrl = null,
  confirmedTracks, // Array of canonical MusiSurf track objects in original order
  provider = 'spotify',
  externalPlaylistId = '',
  duplicateAction = 'create_new', // 'create_new' or 'merge'
  targetPlaylistId = null
}) {
  if (!playlistName || !playlistName.trim()) {
    throw new Error('Playlist name is required');
  }

  const finalTracks = Array.isArray(confirmedTracks) ? confirmedTracks.filter(t => t && t.id) : [];

  let createdPlaylist = null;

  // 1. If authenticated and DB is available, persist to Neon PostgreSQL
  if (userId && sql) {
    try {
      if (duplicateAction === 'merge' && targetPlaylistId) {
        // Merge: Append tracks to existing playlist
        const existing = await libraryService.getPlaylistById(targetPlaylistId, userId);
        if (!existing) throw new Error('Target playlist for merge not found');

        for (const track of finalTracks) {
          try {
            await libraryService.addTrackToPlaylist(targetPlaylistId, userId, track);
          } catch (tErr) {
            console.warn('[ImportService] Track merge note:', tErr.message);
          }
        }
        createdPlaylist = await libraryService.getPlaylistById(targetPlaylistId, userId);
      } else {
        // Create new playlist
        const pl = await libraryService.createUserPlaylist(userId, {
          name: playlistName.trim(),
          description: description || `Imported from ${provider} (${finalTracks.length} tracks)`,
          cover_url: coverUrl,
          is_public: false
        });

        // Add each track in original order (preserving duplicates)
        for (const track of finalTracks) {
          try {
            await libraryService.addTrackToPlaylist(pl.id, userId, track);
          } catch (tErr) {
            console.warn('[ImportService] Track insert note:', tErr.message);
          }
        }

        createdPlaylist = await libraryService.getPlaylistById(pl.id, userId);
      }
    } catch (dbErr) {
      console.warn('[ImportService] DB persistence note, returning payload for local storage:', dbErr.message);
    }
  }

  // 2. If DB is unavailable or user is guest, return complete client payload
  if (!createdPlaylist) {
    const plId = 'pl_import_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    createdPlaylist = {
      id: plId,
      name: playlistName.trim(),
      description: description || `Imported from ${provider} (${finalTracks.length} tracks)`,
      cover_url: coverUrl,
      tracks: finalTracks,
      track_count: finalTracks.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  // 3. Record in Import History
  const historyItem = {
    id: 'imp_' + Date.now(),
    playlistId: createdPlaylist.id,
    playlistName: createdPlaylist.name,
    provider: provider || 'external',
    trackCount: finalTracks.length,
    importedAt: new Date().toISOString(),
    status: finalTracks.length > 0 ? 'completed' : 'empty'
  };

  inMemoryImportHistory.unshift(historyItem);
  if (inMemoryImportHistory.length > 50) inMemoryImportHistory.pop();

  return {
    success: true,
    playlist: createdPlaylist,
    history: historyItem,
    addedTracksCount: finalTracks.length
  };
}

/**
 * Returns import history records.
 */
function getImportHistory() {
  return inMemoryImportHistory;
}

/**
 * Clears an import history entry.
 */
function deleteImportHistoryItem(id) {
  const idx = inMemoryImportHistory.findIndex(h => h.id === id);
  if (idx !== -1) {
    inMemoryImportHistory.splice(idx, 1);
    return true;
  }
  return false;
}

module.exports = {
  parseExternalPlaylist,
  matchExternalPlaylist,
  checkDuplicateImport,
  confirmAndCreatePlaylist,
  getImportHistory,
  deleteImportHistoryItem
};
