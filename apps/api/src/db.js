const { Pool } = require('pg');
const { loadConfig } = require('./config');

let pool;

function getPool() {
  if (!pool) {
    const config = loadConfig();

    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 20,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 5000,
      allowExitOnIdle: true
    });
  }

  return pool;
}

async function testConnection() {
  const result = await getPool().query('select current_database() as database_name');
  return result.rows[0];
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = {
  getPool,
  testConnection,
  closePool
};
