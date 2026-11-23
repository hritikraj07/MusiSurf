require('dotenv').config();
const { sql, pool } = require('../services/db');

async function migrate() {
  if (!sql && !pool) {
    console.warn('[Migration] Database connection not available. Skipping listening history table migration (mock/offline mode).');
    process.exit(0);
  }

  console.log('Running user_listening_history migration on Neon PostgreSQL...');

  const queryText = `
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS user_listening_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
      track_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      artist VARCHAR(255) NOT NULL,
      album VARCHAR(255),
      thumbnail_url TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      listened_seconds INTEGER NOT NULL DEFAULT 0,
      is_completed BOOLEAN NOT NULL DEFAULT FALSE,
      listened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_listening_history_user_id 
    ON user_listening_history(user_id);

    CREATE INDEX IF NOT EXISTS idx_listening_history_user_time 
    ON user_listening_history(user_id, listened_at DESC);

    CREATE INDEX IF NOT EXISTS idx_listening_history_user_track 
    ON user_listening_history(user_id, track_id);
  `;

  try {
    if (pool) {
      await pool.query(queryText);
    } else {
      await sql.query(queryText);
    }
    console.log('✓ user_listening_history table and indexes created successfully!');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  }
}

migrate().then(() => process.exit(0));
