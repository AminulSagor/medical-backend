import { Injectable } from '@nestjs/common';

export interface SendEmailRecipient {
  email: string;
  subscriberId?: string;
  deliveryRecipientId?: string;
  tags?: Record<string, string>;
}

export interface SendEmailPayload {
  subject: string;
  html: string;
  text?: string | null;
  recipients: SendEmailRecipient[];
  replyToAddresses?: string[];
}

export interface SendEmailRecipientResult {
  email: string;
  subscriberId?: string;
  deliveryRecipientId?: string;
  accepted: boolean;
  providerMessageId?: string | null;
  errorMessage?: string | null;
}

export interface SendEmailResult {
  provider: string;
  providerBatchId?: string | null;
  acceptedCount: number;
  failedCount: number;
  recipientResults: SendEmailRecipientResult[];
}

@Injectable()
export class ProviderAdapterService {
  async sendBatch(_payload: SendEmailPayload): Promise<SendEmailResult> {
    return {
      provider: 'NOOP',
      providerBatchId: null,
      acceptedCount: 0,
      failedCount: 0,
      recipientResults: [],
    };
  }
}
