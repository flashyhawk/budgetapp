const path = require('path');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '..', '..', '.env'),
});

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Please configure your PostgreSQL connection string.');
}

const sslMode = (process.env.PGSSLMODE || '').toLowerCase();
const useSSL = sslMode === 'require' || sslMode === 'prefer';

const pool = new Pool({
  connectionString,
  ssl: useSSL
    ? {
        rejectUnauthorized: sslMode === 'require',
      }
    : undefined,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};
