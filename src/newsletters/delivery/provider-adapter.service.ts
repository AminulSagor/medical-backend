import { Injectable } from '@nestjs/common';

export interface SendEmailRecipient {
  email: string;
  subscriberId?: string;
}

export interface SendEmailPayload {
  subject: string;
  html: string;
  text?: string | null;
  recipients: SendEmailRecipient[];
}

export interface SendEmailResult {
  provider: string;
  providerBatchId?: string | null;
  acceptedCount: number;
  failedCount: number;
}

@Injectable()
export class ProviderAdapterService {
  async sendBatch(_payload: SendEmailPayload): Promise<SendEmailResult> {
    // Default no-op adapter; override with SES/SendGrid provider service later
    return {
      provider: 'NOOP',
      providerBatchId: null,
      acceptedCount: 0,
      failedCount: 0,
    };
  }
}
