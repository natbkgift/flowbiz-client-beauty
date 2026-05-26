const { after } = require('node:test');
const pg = require('pg');

function printActiveHandles() {
  const handles = process._getActiveHandles() || [];
  console.error(`\n[DIAGNOSTICS] Active event loop handles: ${handles.length}`);
  handles.forEach((h, i) => {
    try {
      const info = {
        index: i,
        type: h.constructor.name,
        fd: h._handle ? h._handle.fd : undefined,
        msecs: h._idleTimeout || undefined
      };
      console.error(`  - ${JSON.stringify(info)}`);
    } catch (e) {
      console.error(`  - Error getting handle info for index ${i}`);
    }
  });
}

// Keep diagnostics opt-in so successful test runs stay readable.
if (process.env.FLOWBIZ_TEST_DIAGNOSTICS === '1') {
  const diagTimer = setInterval(printActiveHandles, 5000);
  diagTimer.unref();
}

const activePools = new Set();
const OriginalPool = pg.Pool;

// Wrap pg.Pool to track all instantiated pools
pg.Pool = class WrappedPool extends OriginalPool {
  constructor(config) {
    super(config);
    this.__flowbizClosed = false;
    activePools.add(this);
  }

  async end() {
    if (this.__flowbizClosed) {
      return undefined;
    }

    this.__flowbizClosed = true;
    activePools.delete(this);
    return super.end();
  }
};

function withTimeout(promise, ms) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      resolve();
    }, ms);
  });
  return Promise.race([
    promise.then((val) => {
      clearTimeout(timeoutId);
      return val;
    }),
    timeoutPromise
  ]);
}

function forceDestroyPool(pool) {
  try {
    const clients = pool._allClients || [];
    for (const client of clients) {
      try {
        if (client.connection && client.connection.stream) {
          client.connection.stream.destroy();
        }
      } catch (_) {}
    }
  } catch (_) {}
}

// Register a top-level hook to run after all tests in the file complete
after(async () => {
  console.error('\n[TEARDOWN] Running after hook...');
  // 1. Clean up any manually instantiated test pools that weren't closed
  for (const pool of activePools) {
    try {
      forceDestroyPool(pool);
      await withTimeout(pool.end(), 500);
    } catch (err) {
      // Ignore cleanup errors
    }
  }
  activePools.clear();

  // 2. Clean up the global db pool from the API services if it was initialized
  try {
    const dbKeys = Object.keys(require.cache).filter(k => 
      k.toLowerCase().replace(/\\/g, '/').endsWith('apps/api/src/db.js')
    );
    for (const key of dbKeys) {
      const { closePool, getPool } = require(key);
      try {
        const pool = getPool();
        if (pool) {
          forceDestroyPool(pool);
        }
      } catch (_) {}
      await withTimeout(closePool(), 500);
    }
  } catch (err) {
    // Ignore cleanup errors
  }
  console.error('[TEARDOWN] After hook completed.');
});



