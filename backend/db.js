const { Pool } = require('pg');

function shouldUseSsl(connectionString) {
  const value = String(connectionString || '').toLowerCase();
  return !(value.includes('localhost') || value.includes('127.0.0.1'));
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const rejectUnauthorized = String(process.env.PGSSL_REJECT_UNAUTHORIZED || 'false').toLowerCase() !== 'false';

  return new Pool({
    connectionString,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized } : false,
    max: Number(process.env.PG_POOL_MAX || 10),
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 10000),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000)
  });
}

module.exports = { createPool };
