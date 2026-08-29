/**
 * Manual maintenance trigger (same pipeline as deploy bootstrap).
 *
 * Usage:
 *   npm run maintain:recurring-series
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RecurringSeriesMaintenanceService } from '../src/activity/recurring-series-maintenance.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const maintenance = app.get(RecurringSeriesMaintenanceService);
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
