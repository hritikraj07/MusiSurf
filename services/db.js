require('dotenv').config();
const { neon, Pool } = require('@neondatabase/serverless');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.warn('[DB] Warning: DATABASE_URL is not set in environment.');
}

let sql = null;
let pool = null;

if (databaseUrl) {
  try {
    sql = neon(databaseUrl);
    pool = new Pool({ connectionString: databaseUrl });
  } catch (err) {
    console.warn('[DB] Failed to initialize Neon connection:', err.message);
  }
}

module.exports = {
  sql,
  pool,
  databaseUrl
};
