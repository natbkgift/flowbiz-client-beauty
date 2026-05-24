const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildWeb } = require('./build-web');

const requiredPaths = [
  'apps/api/src/server.js',
  'apps/api/src/config.js',
  'apps/api/src/db.js',
  'apps/api/src/common/errors.js',
  'apps/api/src/common/http.js',
  'apps/api/src/common/routing.js',
  'apps/api/src/modules/auth/password.js',
  'apps/api/src/modules/auth/token.js',
  'apps/api/src/modules/auth/service.js',
  'apps/api/src/modules/tenancy/service.js',
  'apps/api/src/modules/users/user-entity.js',
  'apps/api/src/modules/clinics/clinic-entity.js',
  'apps/api/src/modules/leads/constants.js',
  'apps/api/src/modules/leads/validation.js',
  'apps/api/src/modules/leads/lead-entity.js',
  'apps/api/src/modules/leads/core-service.js',
  'apps/api/src/modules/leads/routes.js',
  'apps/api/src/modules/leads/service.js',
  'apps/api/src/modules/messaging/constants.js',
  'apps/api/src/modules/messaging/validation.js',
  'apps/api/src/modules/messaging/provider.js',
  'apps/api/src/modules/messaging/service.js',
  'apps/api/src/modules/automation/constants.js',
  'apps/api/src/modules/automation/flow-presets.js',
  'apps/api/src/modules/automation/validation.js',
  'apps/api/src/modules/automation/service.js',
  'apps/api/src/modules/automation-builder/validation.js',
  'apps/api/src/modules/automation-builder/service.js',
  'apps/api/src/modules/automation-builder/routes.js',
  'apps/api/src/modules/worker-engine/retry.js',
  'apps/api/src/modules/worker-engine/worker.js',
  'apps/api/src/modules/worker-engine/scheduler.js',
  'apps/api/src/modules/event-bus/event_bus.js',
  'apps/api/src/modules/event-bus/publisher.js',
  'apps/api/src/modules/event-bus/subscriber.js',
  'apps/api/src/modules/ai-engine/decision_engine.js',
  'apps/api/src/modules/ai-engine/feature_extractor.js',
  'apps/api/src/modules/ai-engine/prediction.js',
  'apps/api/src/modules/ai/engine.js',
  'apps/api/src/modules/ai/validation.js',
  'apps/api/src/modules/ai/service.js',
  'apps/api/src/modules/ai/routes.js',
  'apps/api/src/modules/analytics/validation.js',
  'apps/api/src/modules/analytics/service.js',
  'apps/api/src/modules/analytics/routes.js',
  'apps/api/src/modules/audit/service.js',
  'apps/api/src/modules/audit/routes.js',
  'apps/api/src/modules/ops/service.js',
  'apps/api/src/modules/ops/routes.js',
  'apps/api/src/modules/customers/validation.js',
  'apps/api/src/modules/customers/service.js',
  'apps/api/src/modules/customers/routes.js',
  'apps/web/src/server.js',
  'apps/web/src/index.html',
  'apps/web/src/styles.css',
  'apps/web/src/main.js',
  'apps/web/src/app.jsx',
  'database/migrations/001_init.sql',
  'database/migrations/002_multi_tenant_base.sql',
  'database/migrations/003_auth_sessions.sql',
  'database/migrations/004_lead_crm_core.sql',
  'database/migrations/005_messaging_foundation.sql',
  'database/migrations/006_automation_engine_v1.sql',
  'database/migrations/007_pre_sprint5_stability.sql',
  'database/migrations/009_customer_domain.sql',
  'database/migrations/010_ai_insights.sql',
  'database/migrations/011_analytics_audit.sql',
  'database/migrations/012_automation_builder.sql',
  'database/migrations/013_worker_engine.sql',
  'database/migrations/014_event_bus.sql',
  'database/migrations/015_ai_decision_engine.sql',
  'database/migrations/020_crm_lead_pipeline_engine.sql',
  'database/migrations/021_automation_event_driven_lifecycle_engine.sql',
  'database/seeds/001_runtime_seed.sql',
  'database/seeds/002_multi_tenant_seed.sql',
  'database/seeds/003_lead_crm_seed.sql',
  'database/seeds/004_messaging_foundation_seed.sql',
  'database/seeds/005_automation_engine_seed.sql',
  'database/seeds/008_lifecycle_flow_pack.sql',
  'database/seeds/009_customer_seed.sql',
  'database/seeds/010_ai_seed.sql',
  'database/seeds/011_analytics_seed.sql',
  'infra/docker/docker-compose.yml',
  'infra/README.md',
  'scripts/dev-up.ps1',
  'scripts/dev-down.ps1',
  'scripts/db-logs.ps1',
  'scripts/db-health.ps1',
  'scripts/db-backup.ps1',
  'scripts/build-web.js',
  '.env.example',
  'README.md',
  'tests/automation_engine.test.js',
  'tests/automation_lifecycle.test.js',
  'tests/customer_domain.test.js',
  'tests/ai_suggestion.test.js',
  'tests/analytics_audit.test.js',
  'tests/automation_builder.test.js',
  'tests/worker_engine.test.js',
  'tests/event_bus.test.js',
  'tests/ai_engine.test.js',
  'tests/admin_ui.test.js',
  'tests/crm_lead_pipeline.test.js'
];

function checkFiles() {
  const missing = requiredPaths.filter((filePath) => !fs.existsSync(path.resolve(__dirname, '..', filePath)));

  if (missing.length > 0) {
    throw new Error(`Missing required files:\n- ${missing.join('\n- ')}`);
  }
}

function checkSyntax() {
  const jsFiles = [
    'apps/api/src/server.js',
    'apps/api/src/config.js',
    'apps/api/src/db.js',
    'apps/api/src/common/errors.js',
    'apps/api/src/common/http.js',
    'apps/api/src/common/routing.js',
    'apps/api/src/modules/auth/password.js',
    'apps/api/src/modules/auth/token.js',
    'apps/api/src/modules/auth/service.js',
    'apps/api/src/modules/tenancy/service.js',
    'apps/api/src/modules/users/user-entity.js',
    'apps/api/src/modules/clinics/clinic-entity.js',
    'apps/api/src/modules/leads/constants.js',
    'apps/api/src/modules/leads/validation.js',
    'apps/api/src/modules/leads/lead-entity.js',
    'apps/api/src/modules/leads/core-service.js',
    'apps/api/src/modules/leads/routes.js',
    'apps/api/src/modules/leads/service.js',
    'apps/api/src/modules/messaging/constants.js',
    'apps/api/src/modules/messaging/validation.js',
    'apps/api/src/modules/messaging/provider.js',
    'apps/api/src/modules/messaging/service.js',
    'apps/api/src/modules/automation/constants.js',
    'apps/api/src/modules/automation/flow-presets.js',
    'apps/api/src/modules/automation/validation.js',
    'apps/api/src/modules/automation/service.js',
    'apps/api/src/modules/automation-builder/validation.js',
    'apps/api/src/modules/automation-builder/service.js',
    'apps/api/src/modules/automation-builder/routes.js',
    'apps/api/src/modules/worker-engine/retry.js',
    'apps/api/src/modules/worker-engine/worker.js',
    'apps/api/src/modules/worker-engine/scheduler.js',
    'apps/api/src/modules/event-bus/event_bus.js',
    'apps/api/src/modules/event-bus/publisher.js',
    'apps/api/src/modules/event-bus/subscriber.js',
    'apps/api/src/modules/ai-engine/decision_engine.js',
    'apps/api/src/modules/ai-engine/feature_extractor.js',
    'apps/api/src/modules/ai-engine/prediction.js',
    'apps/api/src/modules/ai/engine.js',
    'apps/api/src/modules/ai/validation.js',
    'apps/api/src/modules/ai/service.js',
    'apps/api/src/modules/ai/routes.js',
    'apps/api/src/modules/analytics/validation.js',
    'apps/api/src/modules/analytics/service.js',
    'apps/api/src/modules/analytics/routes.js',
    'apps/api/src/modules/audit/service.js',
    'apps/api/src/modules/audit/routes.js',
    'apps/api/src/modules/ops/service.js',
    'apps/api/src/modules/ops/routes.js',
    'apps/api/src/modules/customers/validation.js',
    'apps/api/src/modules/customers/service.js',
    'apps/api/src/modules/customers/routes.js',
    'apps/web/src/server.js',
    'apps/web/src/main.js',
    'scripts/build-web.js',
    'scripts/migrate.js',
    'scripts/seed.js',
    'scripts/validate.js',
    'tests/automation_engine.test.js',
    'tests/automation_lifecycle.test.js',
    'tests/customer_domain.test.js',
    'tests/ai_suggestion.test.js',
    'tests/analytics_audit.test.js',
    'tests/automation_builder.test.js',
    'tests/worker_engine.test.js',
    'tests/event_bus.test.js',
    'tests/ai_engine.test.js',
    'tests/admin_ui.test.js',
    'tests/crm_lead_pipeline.test.js'
  ];

  for (const file of jsFiles) {
    const target = path.resolve(__dirname, '..', file);
    const result = spawnSync(process.execPath, ['--check', target], { stdio: 'inherit' });

    if (result.status !== 0) {
      throw new Error(`Syntax validation failed for ${file}`);
    }
  }
}

function checkDatabasePathPolicy() {
  const prohibitedPaths = [
    'database/.local-db',
    'database/.local-db-check',
    'database/.local-db-introspect',
    'database/.local-db-introspect-2',
    'database/.local-db-tx'
  ];

  const present = prohibitedPaths.filter((filePath) => fs.existsSync(path.resolve(__dirname, '..', filePath)));

  if (present.length > 0) {
    throw new Error(`Embedded database artifacts still exist in repo:\n- ${present.join('\n- ')}`);
  }
}

function run() {
  checkFiles();
  checkSyntax();
  buildWeb({ silent: true });
  checkDatabasePathPolicy();
  process.stdout.write('Validation baseline passed.\n');
}

try {
  run();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
