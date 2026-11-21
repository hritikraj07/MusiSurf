require('dotenv').config();
const { neon, Pool } = require('@neondatabase/serverless');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.warn('[DB] Warning: DATABASE_URL is not set in environment.');
}

const sql = databaseUrl ? neon(databaseUrl) : null;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;

module.exports = {
  sql,
  pool,
  databaseUrl
};
