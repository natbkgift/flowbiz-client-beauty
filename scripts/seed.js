const fs = require('node:fs/promises');
const path = require('node:path');
const { getPool, closePool } = require('../apps/api/src/db');

const seedsDir = path.resolve(__dirname, '..', 'database', 'seeds');

function shouldRetry(error) {
  return /starting up|Connection terminated unexpectedly|ECONNREFUSED|the database system is starting up/i.test(
    error.message
  );
}

async function run() {
  const files = (await fs.readdir(seedsDir)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = await fs.readFile(path.join(seedsDir, file), 'utf8');
    await getPool().query(sql);
    process.stdout.write(`Applied seed ${file}\n`);
  }
}

async function runWithRetry(attempt = 1) {
  try {
    await run();
  } catch (error) {
    if (attempt >= 10 || !shouldRetry(error)) {
      throw error;
    }

    process.stdout.write(`Seed retry ${attempt} after startup delay\n`);
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
