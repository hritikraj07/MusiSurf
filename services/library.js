const { sql } = require('./db');

/**
 * Normalizes track object from frontend format to database columns.
 */
function normalizeTrackInput(track) {
  const trackId = String(track.id || track.trackId || track.ytId || '');
  const title = String(track.title || 'Unknown Track').slice(0, 255);
  const artist = String(track.artist || track.singers || 'Various Artists').slice(0, 255);
  const album = track.album ? String(track.album).slice(0, 255) : null;
  const thumbnail_url = track.image || track.thumbnail || track.thumbnail_url || null;
  const duration_seconds = parseInt(track.duration || track.duration_seconds || 0, 10) || 0;

  return {
    trackId,
    title,
    artist,
    album,
    thumbnail_url,
    duration_seconds
  };
}

/**
 * Fetches all liked tracks for a user, newest first.
 */
async function getUserLikes(userId) {
  if (!sql) throw new Error('Database not configured');

  const rows = await sql`
    SELECT 
      track_id as "id",
      track_id,
      title,
      artist,
      album,
      thumbnail_url as "image",
      thumbnail_url,
      duration_seconds as "duration",
      duration_seconds,
      liked_at
    FROM liked_tracks
    WHERE user_id = ${userId}
    ORDER BY liked_at DESC
  `;
  return rows;
}

/**
 * Toggles liked status for a track.
 */
async function toggleUserLike(userId, rawTrack) {
  if (!sql) throw new Error('Database not configured');
  const track = normalizeTrackInput(rawTrack);
  if (!track.trackId) throw new Error('track_id is required');

  // Check if already liked
  const existing = await sql`
    SELECT track_id FROM liked_tracks
    WHERE user_id = ${userId} AND track_id = ${track.trackId}
    LIMIT 1
  `;

  if (existing.length > 0) {
    await sql`
      DELETE FROM liked_tracks
      WHERE user_id = ${userId} AND track_id = ${track.trackId}
    `;
    return { liked: false, trackId: track.trackId };
  } else {
    await sql`
      INSERT INTO liked_tracks (
        user_id,
        track_id,
        title,
        artist,
        album,
        thumbnail_url,
        duration_seconds,
        liked_at
      ) VALUES (
        ${userId},
        ${track.trackId},
        ${track.title},
        ${track.artist},
        ${track.album},
        ${track.thumbnail_url},
        ${track.duration_seconds},
        NOW()
      )
      ON CONFLICT (user_id, track_id) DO NOTHING
    `;
    return { liked: true, track: { id: track.trackId, ...track } };
  }
}

/**
 * Fetches playlists owned by a user, including track counts.
 */
async function getUserPlaylists(userId) {
  if (!sql) throw new Error('Database not configured');

  const rows = await sql`
    SELECT 
      p.id,
      p.user_id,
      p.name,
      p.description,
      p.cover_url,
      p.is_public,
      p.created_at,
      p.updated_at,
      COUNT(pt.id)::int as track_count
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
    WHERE p.user_id = ${userId}
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `;
  return rows;
}

/**
 * Creates a new playlist for a user.
 */
async function createUserPlaylist(userId, { name, description = '', cover_url = null, is_public = false }) {
  if (!sql) throw new Error('Database not configured');
  const playlistName = String(name || 'My Playlist').trim().slice(0, 120);

  const rows = await sql`
    INSERT INTO playlists (
      user_id,
      name,
      description,
      cover_url,
      is_public,
      created_at,
      updated_at
    ) VALUES (
      ${userId},
      ${playlistName},
      ${description},
      ${cover_url},
      ${Boolean(is_public)},
      NOW(),
      NOW()
    )
    RETURNING 
      id,
      user_id,
      name,
      description,
      cover_url,
      is_public,
      created_at,
      updated_at
  `;
  return { ...rows[0], track_count: 0, tracks: [] };
}

/**
 * Fetches a single playlist and its tracks by ID.
 */
async function getPlaylistById(playlistId, userId) {
  if (!sql) throw new Error('Database not configured');

  const plRows = await sql`
    SELECT 
      id,
      user_id,
      name,
      description,
      cover_url,
      is_public,
      created_at,
      updated_at
    FROM playlists
    WHERE id = ${playlistId} AND (user_id = ${userId} OR is_public = true)
    LIMIT 1
  `;

  if (plRows.length === 0) return null;
  const playlist = plRows[0];

  const tracks = await sql`
    SELECT 
      id as "item_id",
      track_id as "id",
      track_id,
      title,
      artist,
      album,
      thumbnail_url as "image",
      thumbnail_url,
      duration_seconds as "duration",
      duration_seconds,
      position,
      added_at
    FROM playlist_tracks
    WHERE playlist_id = ${playlistId}
    ORDER BY position ASC, added_at ASC
  `;

  return {
    ...playlist,
    track_count: tracks.length,
    tracks
  };
}

/**
 * Adds a track to a user's playlist.
 */
async function addTrackToPlaylist(playlistId, userId, rawTrack) {
  if (!sql) throw new Error('Database not configured');

  // Verify ownership
  const owns = await sql`
    SELECT id FROM playlists 
    WHERE id = ${playlistId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (owns.length === 0) {
    throw new Error('Playlist not found or permission denied');
  }

  const track = normalizeTrackInput(rawTrack);
  if (!track.trackId) throw new Error('track_id is required');

  // Next position
  const posRes = await sql`
    SELECT COALESCE(MAX(position), -1) + 1 as next_pos 
    FROM playlist_tracks 
    WHERE playlist_id = ${playlistId}
  `;
  const nextPos = posRes[0].next_pos;

  const rows = await sql`
    INSERT INTO playlist_tracks (
      playlist_id,
      track_id,
      title,
      artist,
      album,
      thumbnail_url,
      duration_seconds,
      position,
      added_at
    ) VALUES (
      ${playlistId},
      ${track.trackId},
      ${track.title},
      ${track.artist},
      ${track.album},
      ${track.thumbnail_url},
      ${track.duration_seconds},
      ${nextPos},
      NOW()
    )
    ON CONFLICT (playlist_id, track_id) DO UPDATE 
    SET position = EXCLUDED.position
    RETURNING 
      id as "item_id",
      track_id as "id",
      track_id,
      title,
      artist,
      album,
      thumbnail_url as "image",
      duration_seconds as "duration",
      position,
      added_at
  `;

  await sql`
    UPDATE playlists 
    SET updated_at = NOW() 
    WHERE id = ${playlistId}
  `;

  return rows[0];
}

/**
 * Removes a track from a playlist.
 */
async function removeTrackFromPlaylist(playlistId, userId, trackId) {
  if (!sql) throw new Error('Database not configured');

  // Verify ownership
  const owns = await sql`
    SELECT id FROM playlists 
    WHERE id = ${playlistId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (owns.length === 0) {
    throw new Error('Playlist not found or permission denied');
  }

  await sql`
    DELETE FROM playlist_tracks 
    WHERE playlist_id = ${playlistId} AND track_id = ${trackId}
  `;

  await sql`
    UPDATE playlists 
    SET updated_at = NOW() 
    WHERE id = ${playlistId}
  `;

  return true;
}

/**
 * Deletes a playlist.
 */
async function deletePlaylist(playlistId, userId) {
  if (!sql) throw new Error('Database not configured');

  try {
    await sql`
      DELETE FROM playlist_playback_progress
      WHERE playlist_id = ${playlistId} AND user_id = ${userId}
    `;
  } catch (e) {}

  const res = await sql`
    DELETE FROM playlists 
    WHERE id = ${playlistId} AND user_id = ${userId}
    RETURNING id
  `;
  return res.length > 0;
}

/**
 * Fetches playback progress for a specific playlist.
 */
async function getPlaylistProgress(userId, playlistId) {
  if (!sql) throw new Error('Database not configured');
  const pid = String(playlistId).slice(0, 64);
  const rows = await sql`
    SELECT 
      playlist_id as "playlistId",
      track_id as "trackId",
      track_index as "trackIndex",
      position_seconds as "positionSeconds",
      duration_seconds as "durationSeconds",
      playback_mode as "playbackMode",
      shuffle_state as "shuffleState",
      is_completed as "isCompleted",
      version,
      last_played_at as "lastPlayedAt",
      updated_at as "updatedAt"
    FROM playlist_playback_progress
    WHERE user_id = ${userId} AND playlist_id = ${pid}
    LIMIT 1
  `;
  return rows[0] || null;
}

/**
 * Fetches playback progress for all playlists of a user.
 */
async function getAllPlaylistsProgress(userId) {
  if (!sql) throw new Error('Database not configured');
  const rows = await sql`
    SELECT 
      playlist_id as "playlistId",
      track_id as "trackId",
      track_index as "trackIndex",
      position_seconds as "positionSeconds",
      duration_seconds as "durationSeconds",
      playback_mode as "playbackMode",
      shuffle_state as "shuffleState",
      is_completed as "isCompleted",
      version,
      last_played_at as "lastPlayedAt",
      updated_at as "updatedAt"
    FROM playlist_playback_progress
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;
  const map = {};
  for (const r of rows) {
    map[r.playlistId] = r;
  }
  return map;
}

/**
 * Saves playback progress for a user's playlist.
 */
async function savePlaylistProgress(userId, playlistId, data) {
  if (!sql) throw new Error('Database not configured');
  const pid = String(playlistId).slice(0, 64);
  const trackId = String(data.trackId || data.track_id || '').slice(0, 64);
  if (!trackId) {
    throw new Error('trackId is required to save playback progress');
  }

  const trackIndex = Math.max(0, parseInt(data.trackIndex ?? data.track_index ?? 0, 10) || 0);
  const positionSeconds = Math.max(0, parseFloat(data.positionSeconds ?? data.position_seconds ?? 0) || 0);
  const durationSeconds = Math.max(0, parseInt(data.durationSeconds ?? data.duration_seconds ?? 0, 10) || 0);
  const playbackMode = String(data.playbackMode ?? data.playback_mode ?? '1').slice(0, 32);
  const shuffleState = data.shuffleState ?? data.shuffle_state ?? null;
  const isCompleted = Boolean(data.isCompleted ?? data.is_completed ?? false);
  const clientVersion = parseInt(data.version || 1, 10) || 1;

  // Concurrency check
  const existing = await sql`
    SELECT version, updated_at 
    FROM playlist_playback_progress
    WHERE user_id = ${userId} AND playlist_id = ${pid}
    LIMIT 1
  `;

  if (existing.length > 0) {
    const currentVersion = existing[0].version;
    const nextVersion = Math.max(currentVersion + 1, clientVersion + 1);

    const rows = await sql`
      UPDATE playlist_playback_progress
      SET
        track_id = ${trackId},
        track_index = ${trackIndex},
        position_seconds = ${positionSeconds},
        duration_seconds = ${durationSeconds},
        playback_mode = ${playbackMode},
        shuffle_state = ${shuffleState ? JSON.stringify(shuffleState) : null},
        is_completed = ${isCompleted},
        version = ${nextVersion},
        last_played_at = NOW(),
        updated_at = NOW()
      WHERE user_id = ${userId} AND playlist_id = ${pid}
      RETURNING 
        playlist_id as "playlistId",
        track_id as "trackId",
        track_index as "trackIndex",
        position_seconds as "positionSeconds",
        duration_seconds as "durationSeconds",
        playback_mode as "playbackMode",
        shuffle_state as "shuffleState",
        is_completed as "isCompleted",
        version,
        last_played_at as "lastPlayedAt",
        updated_at as "updatedAt"
    `;
    return rows[0];
  } else {
    const rows = await sql`
      INSERT INTO playlist_playback_progress (
        user_id,
        playlist_id,
        track_id,
        track_index,
        position_seconds,
        duration_seconds,
        playback_mode,
        shuffle_state,
        is_completed,
        version,
        last_played_at,
        updated_at
      ) VALUES (
        ${userId},
        ${pid},
        ${trackId},
        ${trackIndex},
        ${positionSeconds},
        ${durationSeconds},
        ${playbackMode},
        ${shuffleState ? JSON.stringify(shuffleState) : null},
        ${isCompleted},
        1,
        NOW(),
        NOW()
      )
      RETURNING 
        playlist_id as "playlistId",
        track_id as "trackId",
        track_index as "trackIndex",
        position_seconds as "positionSeconds",
        duration_seconds as "durationSeconds",
        playback_mode as "playbackMode",
        shuffle_state as "shuffleState",
        is_completed as "isCompleted",
        version,
        last_played_at as "lastPlayedAt",
        updated_at as "updatedAt"
    `;
    return rows[0];
  }
}

module.exports = {
  getUserLikes,
  toggleUserLike,
  getUserPlaylists,
  createUserPlaylist,
  getPlaylistById,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  deletePlaylist,
  getPlaylistProgress,
  getAllPlaylistsProgress,
  savePlaylistProgress
};
