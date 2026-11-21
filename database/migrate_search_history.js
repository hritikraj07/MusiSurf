require('dotenv').config();
const { sql } = require('../services/db');

async function migrate() {
  if (!sql) {
    console.error('Database connection not available.');
    process.exit(1);
  }

  console.log('Running user_search_history migration on Neon PostgreSQL...');

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS user_search_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
        query VARCHAR(255) NOT NULL,
        searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_search_history_user_time 
      ON user_search_history(user_id, searched_at DESC);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_search_history_user_query 
      ON user_search_history(user_id, query);
    `;

    console.log('✓ user_search_history table and indexes created successfully!');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrate();
