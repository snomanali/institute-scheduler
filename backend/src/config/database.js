// src/config/database.js
const { Pool } = require('pg');

// Gracefully handle missing DATABASE_URL at startup
if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
  console.warn('⚠️  No database config found. Set DATABASE_URL environment variable.');
}

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    }
  : {
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME     || 'institute_scheduler',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || '',
    };

const pool = new Pool({
  ...poolConfig,
  min:  2,
  max:  10,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') console.log('✅ PostgreSQL connected');
});

// Don't crash the whole app on pool errors — log and continue
pool.on('error', (err) => {
  console.error('⚠️  PostgreSQL pool error:', err.message);
});

const query     = (text, params) => pool.query(text, params);
const getClient = ()             => pool.connect();

module.exports = { query, getClient, pool };
