require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is missing.');
  }

  console.log('[Migration] Connecting to Neon Postgres...');
  const sql = neon(databaseUrl);

  const ver = await sql`SELECT version()`;
  console.log('[Migration] Connected to:', ver[0].version);

  // Check neon_auth schema
  const authTables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'neon_auth'
  `;
  console.log('[Migration] neon_auth tables:', authTables.map(t => t.table_name));

  const sessionCols = await sql`
    SELECT column_name, data_type, udt_name 
    FROM information_schema.columns 
    WHERE table_schema = 'neon_auth' AND table_name = 'session'
  `;
  console.log('[Migration] neon_auth.session columns:', sessionCols);

  const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');

  // Split and execute statements
  const statements = schemaSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    console.log('[Migration] Executing statement: ' + stmt.slice(0, 50).replace(/\s+/g, ' ') + '...');
    await sql.query(stmt);
  }

  console.log('[Migration] Verifying created tables...');
  const createdTables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('playlists', 'playlist_tracks', 'liked_tracks')
  `;
  console.log('[Migration] Verified public tables:', createdTables.map(t => t.table_name));

  const indexes = await sql`
    SELECT indexname 
    FROM pg_indexes 
    WHERE tablename IN ('playlists', 'playlist_tracks', 'liked_tracks')
  `;
  console.log('[Migration] Verified indexes:', indexes.map(i => i.indexname));

  // Ensure trusted origins in neon_auth.project_config (without trailing slashes)
  try {
    const trustedOrigins = [
      { domain: "https://musi-surf.vercel.app" },
      { domain: "https://musi-surf.vercel.app/" },
      { domain: "http://localhost:3000" },
      { domain: "http://127.0.0.1:3000" },
      { domain: "https://musisurf.vercel.app" }
    ];
    await sql`
      UPDATE neon_auth.project_config
      SET trusted_origins = ${JSON.stringify(trustedOrigins)}::jsonb,
          updated_at = NOW()
    `;
    console.log('[Migration] Verified & synced neon_auth.project_config trusted_origins');
  } catch (authConfigErr) {
    console.warn('[Migration] Note: project_config trusted_origins sync note:', authConfigErr.message);
  }

  console.log('[Migration] Migration completed successfully!');
}

migrate().catch(err => {
  console.error('[Migration] Failed:', err);
  process.exit(1);
});
