'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const core_1 = require('@nestjs/core');
const app_module_1 = require('../src/app.module');
const recurring_series_maintenance_service_1 = require('../src/activity/recurring-series-maintenance.service');
async function main() {
  const app = await core_1.NestFactory.createApplicationContext(
    app_module_1.AppModule,
    {
      logger: ['error', 'warn', 'log'],
    },
  );
  try {
    const maintenance = app.get(
      recurring_series_maintenance_service_1.RecurringSeriesMaintenanceService,
    );
    const summary = await maintenance.runFullMaintenance();
    console.log('\n=== Maintenance summary ===');
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error('Maintenance failed', error);
  process.exit(1);
});
//# sourceMappingURL=maintain-recurring-series.js.map
