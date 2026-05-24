const fs = require('node:fs/promises');
const path = require('node:path');
const { getPool, closePool } = require('../apps/api/src/db');

const migrationsDir = path.resolve(__dirname, '..', 'database', 'migrations');

function shouldRetry(error) {
  return /starting up|Connection terminated unexpectedly|ECONNREFUSED|the database system is starting up/i.test(
    error.message
  );
}

async function ensureMigrationTable() {
  await getPool().query(`
    create table if not exists schema_migrations (
      id serial primary key,
      name text not null unique,
      applied_at timestamptz not null default now()
    );
  `);
}

async function run() {
  await ensureMigrationTable();

  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const alreadyApplied = await getPool().query('select 1 from schema_migrations where name = $1', [file]);

    if (alreadyApplied.rowCount > 0) {
      process.stdout.write(`Skipping migration ${file}\n`);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');

    await getPool().query('begin');

    try {
      await getPool().query(sql);
      await getPool().query('insert into schema_migrations (name) values ($1)', [file]);
      await getPool().query('commit');
      process.stdout.write(`Applied migration ${file}\n`);
    } catch (error) {
      await getPool().query('rollback');
      throw error;
    }
  }
}

async function runWithRetry(attempt = 1) {
  try {
    await run();
  } catch (error) {
    if (attempt >= 10 || !shouldRetry(error)) {
      throw error;
    }

    process.stdout.write(`Migration retry ${attempt} after startup delay\n`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await runWithRetry(attempt + 1);
  }
}

runWithRetry()
  .then(async () => {
    await closePool();
  })
  .catch(async (error) => {
    process.stderr.write(`${error.message}\n`);
    await closePool();
    process.exit(1);
  });
