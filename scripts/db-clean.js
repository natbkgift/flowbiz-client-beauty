const { getPool, closePool } = require('../apps/api/src/db');

async function clean() {
  const pool = getPool();
  console.log('Cleaning dynamic transaction and activity tables...');
  
  const tables = [
    'worker_jobs',
    'automation_step_executions',
    'automation_executions',
    'event_store',
    'reminders',
    'automation_tasks',
    'outbound_messages',
    'lead_activity',
    'lead_notes',
    'notes',
    'lead_interests',
    'lead_tag_links',
    'leads'
  ];

  for (const table of tables) {
    try {
      await pool.query(`truncate table ${table} cascade`);
      console.log(`- Truncated table: ${table}`);
    } catch (err) {
      console.error(`- Failed to truncate ${table}: ${err.message}`);
    }
  }
}

clean()
  .then(async () => {
    await closePool();
    console.log('Cleanup completed successfully.');
  })
  .catch(async (error) => {
    console.error('Cleanup failed:', error.message);
    await closePool();
    process.exit(1);
  });
