import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeliveryService } from './delivery.service';

@Injectable()
export class DeliveryWorkerService {
  private readonly logger = new Logger(DeliveryWorkerService.name);

  constructor(private readonly deliveryService: DeliveryService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {
    await this.runOnce();
  }

  async runOnce(): Promise<void> {
    const processed = await this.deliveryService.processDueJobs(new Date());
    if (processed > 0) {
      this.logger.log(`Processed ${processed} newsletter delivery job(s)`);
    }
  }
}
