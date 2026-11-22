require('dotenv').config();
const { sql, pool } = require('../services/db');

async function migrate() {
  if (!sql && !pool) {
    console.error('Database connection not available.');
    process.exit(1);
  }

  console.log('Running daily_trending_hindi_songs migration on Neon PostgreSQL...');

  const queryText = `
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS daily_trending_hindi_songs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date_ist VARCHAR(10) NOT NULL UNIQUE,
      canonical_id VARCHAR(128) NOT NULL,
      matched_track_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      artist VARCHAR(255) NOT NULL,
      album VARCHAR(255),
      language VARCHAR(32) NOT NULL DEFAULT 'hindi',
      thumbnail_url TEXT NOT NULL,
      platform_source VARCHAR(64) NOT NULL,
      source_label VARCHAR(64) NOT NULL,
      youtube_video_id VARCHAR(64),
      instagram_audio_id VARCHAR(64),
      trend_score DOUBLE PRECISION NOT NULL,
      trend_rank INTEGER NOT NULL DEFAULT 1,
      verified_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
      matched_track JSONB NOT NULL DEFAULT '{}'::jsonb,
      selection_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE INDEX IF NOT EXISTS idx_daily_trending_date_ist 
    ON daily_trending_hindi_songs(date_ist DESC);

    CREATE INDEX IF NOT EXISTS idx_daily_trending_canonical_id 
    ON daily_trending_hindi_songs(canonical_id);
  `;

  try {
    if (pool) {
      await pool.query(queryText);
    } else {
      await sql.query(queryText);
    }
    console.log('✓ daily_trending_hindi_songs table and indexes created successfully!');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  }
}

migrate().then(() => process.exit(0));
