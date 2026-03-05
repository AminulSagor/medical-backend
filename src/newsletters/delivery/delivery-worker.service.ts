import { Injectable, Logger } from '@nestjs/common';
import { DeliveryService } from './delivery.service';

@Injectable()
export class DeliveryWorkerService {
  private readonly logger = new Logger(DeliveryWorkerService.name);

  constructor(private readonly deliveryService: DeliveryService) {}

  // Hook this to @Cron('* * * * *') later
  async runOnce(): Promise<void> {
    const processed = await this.deliveryService.processDueJobs(new Date());
    if (processed > 0) {
      this.logger.log(`Processed ${processed} newsletter delivery job(s)`);
    }
  }
}
