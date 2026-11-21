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

  const res = await sql`
    DELETE FROM playlists 
    WHERE id = ${playlistId} AND user_id = ${userId}
    RETURNING id
  `;
  return res.length > 0;
}

module.exports = {
  getUserLikes,
  toggleUserLike,
  getUserPlaylists,
  createUserPlaylist,
  getPlaylistById,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  deletePlaylist
};
