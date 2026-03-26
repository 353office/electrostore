const { Pool } = require('pg');

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }

  const rejectUnauthorized = String(process.env.PGSSL_REJECT_UNAUTHORIZED || '').toLowerCase() !== 'false';

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized }
  });
}

module.exports = { createPool };
