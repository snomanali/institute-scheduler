// src/config/database.js
// Supports both Railway DATABASE_URL and individual env vars

const { Pool } = require('pg');

// Railway provides a single DATABASE_URL — use it if present
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }  // Required for Railway PostgreSQL
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
  min:  parseInt(process.env.DB_POOL_MIN) || 2,
  max:  parseInt(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') console.log('✅ PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
  process.exit(1);
});

const query     = (text, params) => pool.query(text, params);
const getClient = ()             => pool.connect();

module.exports = { query, getClient, pool };
