const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const test = require('node:test');

function waitForOutput(child, pattern) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for API server startup')), 10000);

    function onData(chunk) {
      const text = chunk.toString();
      if (pattern.test(text)) {
        clearTimeout(timer);
        resolve();
      }
    }

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`API server exited before startup with code ${code}`));
    });
  });
}

async function stopChild(child) {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 2000);
  });
}

test('readiness returns non-200 when database is unavailable while liveness stays healthy', async () => {
  const apiPort = 3901 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ['apps/api/src/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_PORT: String(apiPort),
      WORKER_LOOP_ENABLED: 'false',
      DATABASE_URL: 'postgresql://flowbiz:flowbiz@127.0.0.1:1/flowbiz_unavailable'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForOutput(child, /FlowBiz API listening/);

    const live = await fetch(`http://127.0.0.1:${apiPort}/live`);
    assert.equal(live.status, 200);
    assert.equal((await live.json()).check, 'liveness');

    const ready = await fetch(`http://127.0.0.1:${apiPort}/ready`);
    const readyBody = await ready.json();
    assert.equal(ready.status, 503);
    assert.equal(readyBody.check, 'readiness');
    assert.equal(readyBody.database.status, 'unavailable');

    const health = await fetch(`http://127.0.0.1:${apiPort}/health`);
    assert.equal(health.status, 503);
  } finally {
    await stopChild(child);
  }
});
