import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecurringSeriesMaintenanceService } from './recurring-series-maintenance.service';

@Injectable()
export class RecurringSeriesBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(RecurringSeriesBootstrapService.name);
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly maintenanceService: RecurringSeriesMaintenanceService,
  ) {}

  onModuleInit(): void {
    const enabled =
      this.configService.get<string>(
        'RECURRING_SERIES_BOOTSTRAP_ON_START',
        'true',
      ) !== 'false';

    if (!enabled) {
      this.logger.log(
        'Recurring series bootstrap disabled (RECURRING_SERIES_BOOTSTRAP_ON_START=false)',
      );
      return;
    }

    void this.runBootstrap();
  }

  async runBootstrap(): Promise<void> {
    if (this.running) {
      this.logger.warn('Recurring series bootstrap already in progress');
      return;
    }

    this.running = true;
    try {
      await this.maintenanceService.runFullMaintenance();
    } catch (error) {
      this.logger.error(
        'Recurring series bootstrap failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}
