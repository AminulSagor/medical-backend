import { Injectable } from '@nestjs/common';
import {
  ProviderAdapterService,
  SendEmailPayload,
  SendEmailResult,
} from '../provider-adapter.service';

@Injectable()
export class SesProvider extends ProviderAdapterService {
  async sendBatch(payload: SendEmailPayload): Promise<SendEmailResult> {
    // TODO: Integrate AWS SES v3 SendBulkTemplatedEmail or SendEmail in batches
    return {
      provider: 'SES',
      providerBatchId: null,
      acceptedCount: payload.recipients.length,
      failedCount: 0,
    };
  }
}
