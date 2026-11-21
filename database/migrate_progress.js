require('dotenv').config();
const { sql } = require('../services/db');

async function migrate() {
  if (!sql) {
    console.error('Database connection not available.');
    process.exit(1);
  }

  console.log('Running playlist playback progress migration on Neon PostgreSQL...');

  try {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS playlist_playback_progress (
        user_id UUID NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
        playlist_id VARCHAR(64) NOT NULL,
        track_id VARCHAR(64) NOT NULL,
        track_index INTEGER NOT NULL DEFAULT 0,
        position_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        playback_mode VARCHAR(32) NOT NULL DEFAULT '1',
        shuffle_state JSONB DEFAULT NULL,
        is_completed BOOLEAN NOT NULL DEFAULT FALSE,
        version INTEGER NOT NULL DEFAULT 1,
        last_played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, playlist_id)
      );
    `);

    await sql.query(`
      CREATE INDEX IF NOT EXISTS idx_playlist_progress_user 
      ON playlist_playback_progress(user_id);
    `);

    await sql.query(`
      CREATE INDEX IF NOT EXISTS idx_playlist_progress_user_updated 
      ON playlist_playback_progress(user_id, updated_at DESC);
    `);

    console.log('✓ playlist_playback_progress table and indexes created successfully!');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrate();
