/**
 * MusiSurf Soundtrack & Listening History Service
 * Backed by Neon PostgreSQL user_listening_history table
 */

const { pool, sql } = require('./db');

// In-memory fallback if database is offline/unreachable
const inMemoryHistory = new Map();

async function recordPlay(userId, trackData) {
  if (!userId) {
    throw new Error('AUTH_REQUIRED');
  }

  const {
    trackId,
    title,
    artist,
    album,
    thumbnailUrl,
    durationSeconds = 0,
    listenedSeconds = 0,
    isCompleted = false
  } = trackData;

  const dur = Math.max(0, parseInt(durationSeconds, 10) || 0);
  const listened = Math.max(0, parseInt(listenedSeconds, 10) || 0);

  // Play verification rule: must have listened >= 20 seconds OR >= 30% of duration (if dur > 0)
  const isQualifyingPlay = listened >= 20 || (dur > 0 && listened >= (dur * 0.3));

  if (!isQualifyingPlay) {
    return { recorded: false, reason: 'THRESHOLD_NOT_MET', listenedSeconds: listened };
  }

  const cleanTrackId = String(trackId || 'unknown_track').slice(0, 64);
  const cleanTitle = String(title || 'Unknown Title').slice(0, 255);
  const cleanArtist = String(artist || 'Unknown Artist').slice(0, 255);
  const cleanAlbum = album ? String(album).slice(0, 255) : null;
  const cleanThumbnail = thumbnailUrl ? String(thumbnailUrl) : null;

  if (pool) {
    try {
      const res = await pool.query(
        `INSERT INTO user_listening_history 
          (user_id, track_id, title, artist, album, thumbnail_url, duration_seconds, listened_seconds, is_completed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, listened_at`,
        [userId, cleanTrackId, cleanTitle, cleanArtist, cleanAlbum, cleanThumbnail, dur, listened, Boolean(isCompleted)]
      );
      return { recorded: true, id: res.rows[0]?.id, listenedAt: res.rows[0]?.listened_at };
    } catch (err) {
      console.warn('[SoundtrackService] Pool insert error, falling back:', err.message);
    }
  } else if (sql) {
    try {
      const rows = await sql`
        INSERT INTO user_listening_history 
          (user_id, track_id, title, artist, album, thumbnail_url, duration_seconds, listened_seconds, is_completed)
        VALUES (${userId}, ${cleanTrackId}, ${cleanTitle}, ${cleanArtist}, ${cleanAlbum}, ${cleanThumbnail}, ${dur}, ${listened}, ${Boolean(isCompleted)})
        RETURNING id, listened_at
      `;
      return { recorded: true, id: rows[0]?.id, listenedAt: rows[0]?.listened_at };
    } catch (err) {
      console.warn('[SoundtrackService] SQL insert error, falling back:', err.message);
    }
  }

  // In-memory fallback
  if (!inMemoryHistory.has(userId)) {
    inMemoryHistory.set(userId, []);
  }
  const entry = {
    id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    userId,
    trackId: cleanTrackId,
    title: cleanTitle,
    artist: cleanArtist,
    album: cleanAlbum,
    thumbnailUrl: cleanThumbnail,
    durationSeconds: dur,
    listenedSeconds: listened,
    isCompleted: Boolean(isCompleted),
    listenedAt: new Date().toISOString()
  };
  inMemoryHistory.get(userId).push(entry);
  return { recorded: true, id: entry.id, listenedAt: entry.listenedAt };
}

async function getSoundtrackStats(userId) {
  if (!userId) {
    throw new Error('AUTH_REQUIRED');
  }

  if (pool) {
    try {
      // 1. Total songs played & total minutes listened
      const totalsRes = await pool.query(
        `SELECT 
          COUNT(*)::int AS total_songs,
          COALESCE(SUM(listened_seconds), 0)::bigint AS total_seconds
         FROM user_listening_history
         WHERE user_id = $1`,
        [userId]
      );

      const totalSongs = totalsRes.rows[0]?.total_songs || 0;
      const totalSeconds = parseInt(totalsRes.rows[0]?.total_seconds || 0, 10);
      const totalMinutes = Math.round(totalSeconds / 60);

      // 2. Top Song
      const topSongRes = await pool.query(
        `SELECT 
          track_id, title, artist, album, thumbnail_url, COUNT(*)::int AS play_count
         FROM user_listening_history
         WHERE user_id = $1
         GROUP BY track_id, title, artist, album, thumbnail_url
         ORDER BY play_count DESC, MAX(listened_at) DESC
         LIMIT 1`,
        [userId]
      );

      let topSong = null;
      if (topSongRes.rows.length > 0) {
        const row = topSongRes.rows[0];
        topSong = {
          id: row.track_id,
          title: row.title,
          artist: row.artist,
          album: row.album || 'MusiSurf Music',
          image: row.thumbnail_url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
          playCount: row.play_count
        };
      }

      return {
        success: true,
        totalSongsPlayed: totalSongs,
        totalMinutesListened: totalMinutes,
        soundCapsuleMinutes: totalMinutes,
        topSong
      };
    } catch (err) {
      console.warn('[SoundtrackService] Pool query error, falling back:', err.message);
    }
  } else if (sql) {
    try {
      const totalsRows = await sql`
        SELECT 
          COUNT(*)::int AS total_songs,
          COALESCE(SUM(listened_seconds), 0)::bigint AS total_seconds
        FROM user_listening_history
        WHERE user_id = ${userId}
      `;
      const totalSongs = totalsRows[0]?.total_songs || 0;
      const totalSeconds = parseInt(totalsRows[0]?.total_seconds || 0, 10);
      const totalMinutes = Math.round(totalSeconds / 60);

      const topSongRows = await sql`
        SELECT 
          track_id, title, artist, album, thumbnail_url, COUNT(*)::int AS play_count
        FROM user_listening_history
        WHERE user_id = ${userId}
        GROUP BY track_id, title, artist, album, thumbnail_url
        ORDER BY play_count DESC, MAX(listened_at) DESC
        LIMIT 1
      `;

      let topSong = null;
      if (topSongRows.length > 0) {
        const row = topSongRows[0];
        topSong = {
          id: row.track_id,
          title: row.title,
          artist: row.artist,
          album: row.album || 'MusiSurf Music',
          image: row.thumbnail_url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
          playCount: row.play_count
        };
      }

      return {
        success: true,
        totalSongsPlayed: totalSongs,
        totalMinutesListened: totalMinutes,
        soundCapsuleMinutes: totalMinutes,
        topSong
      };
    } catch (err) {
      console.warn('[SoundtrackService] SQL query error, falling back:', err.message);
    }
  }

  // In-memory fallback
  const userPlays = inMemoryHistory.get(userId) || [];
  const totalSongs = userPlays.length;
  const totalSeconds = userPlays.reduce((acc, p) => acc + (p.listenedSeconds || 0), 0);
  const totalMinutes = Math.round(totalSeconds / 60);

  // Top song
  const counts = new Map();
  for (const p of userPlays) {
    const key = p.trackId;
    if (!counts.has(key)) {
      counts.set(key, { ...p, count: 0 });
    }
    counts.get(key).count++;
  }

  let topSong = null;
  let maxCount = 0;
  for (const item of counts.values()) {
    if (item.count > maxCount) {
      maxCount = item.count;
      topSong = {
        id: item.trackId,
        title: item.title,
        artist: item.artist,
        album: item.album || 'MusiSurf Music',
        image: item.thumbnailUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
        playCount: item.count
      };
    }
  }

  return {
    success: true,
    totalSongsPlayed: totalSongs,
    totalMinutesListened: totalMinutes,
    soundCapsuleMinutes: totalMinutes,
    topSong
  };
}

module.exports = {
  recordPlay,
  getSoundtrackStats
};
