import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
  ProviderAdapterService,
  SendEmailPayload,
  SendEmailRecipientResult,
  SendEmailResult,
} from '../provider-adapter.service';

@Injectable()
export class SesProvider extends ProviderAdapterService {
  private readonly ses: SESv2Client;
  private readonly fromEmail: string;
  private readonly configurationSetName: string | null;
  private readonly publicBaseUrl: string | null;

  constructor(private readonly configService: ConfigService) {
    super();

    const region =
      this.configService.get<string>('AWS_REGION') ||
      this.configService.get<string>('AWS_S3_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );
    const fromEmail = this.configService.get<string>('SES_FROM_EMAIL');

    if (!region || !accessKeyId || !secretAccessKey || !fromEmail) {
      throw new InternalServerErrorException(
        'AWS SES newsletter configuration is missing.',
      );
    }

    this.fromEmail = fromEmail;
    this.configurationSetName =
      this.configService.get<string>('SES_CONFIGURATION_SET_NAME')?.trim() ||
      null;

    this.publicBaseUrl =
      this.configService.get<string>('NEWSLETTER_PUBLIC_BASE_URL')?.trim() ||
      null;

    this.ses = new SESv2Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async sendBatch(payload: SendEmailPayload): Promise<SendEmailResult> {
    const recipientResults: SendEmailRecipientResult[] = [];

    for (const recipient of payload.recipients) {
      try {
        const html = this.appendUnsubscribeFooter(
          payload.html,
          recipient.email,
        );
        const text = this.appendUnsubscribeTextFooter(
          payload.text,
          recipient.email,
        );

        const command = new SendEmailCommand({
          FromEmailAddress: this.fromEmail,
          Destination: {
            ToAddresses: [recipient.email],
          },
          ReplyToAddresses: payload.replyToAddresses?.length
            ? payload.replyToAddresses
            : undefined,
          EmailTags: Object.entries(recipient.tags ?? {}).map(
            ([Name, Value]) => ({
              Name,
              Value,
            }),
          ),
          ConfigurationSetName: this.configurationSetName ?? undefined,
          Content: {
            Simple: {
              Subject: {
                Data: payload.subject,
                Charset: 'UTF-8',
              },
              Body: {
                Html: {
                  Data: html,
                  Charset: 'UTF-8',
                },
                ...(text
                  ? {
                      Text: {
                        Data: text,
                        Charset: 'UTF-8',
                      },
                    }
                  : {}),
              },
            },
          },
        });

        const response = await this.ses.send(command);

        recipientResults.push({
          email: recipient.email,
          subscriberId: recipient.subscriberId,
          deliveryRecipientId: recipient.deliveryRecipientId,
          accepted: true,
          providerMessageId: response.MessageId ?? null,
          errorMessage: null,
        });
      } catch (error) {
        recipientResults.push({
          email: recipient.email,
          subscriberId: recipient.subscriberId,
          deliveryRecipientId: recipient.deliveryRecipientId,
          accepted: false,
          providerMessageId: null,
          errorMessage:
            error instanceof Error ? error.message : 'SES send failed',
        });
      }
    }

    const acceptedCount = recipientResults.filter((row) => row.accepted).length;
    const failedCount = recipientResults.length - acceptedCount;

    return {
      provider: 'SES',
      providerBatchId: null,
      acceptedCount,
      failedCount,
      recipientResults,
    };
  }

  private appendUnsubscribeFooter(html: string, email: string): string {
    const unsubscribeUrl = this.buildUnsubscribeUrl(email);

    if (!unsubscribeUrl) return html;

    const footer = `
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
        <p style="margin:0;">
          If you no longer want to receive these emails,
          <a href="${this.escapeHtml(unsubscribeUrl)}" target="_blank" rel="noopener">unsubscribe here</a>.
        </p>
      </div>
    `;

    if (/<\/body>/i.test(html)) {
      return html.replace(/<\/body>/i, `${footer}</body>`);
    }

    return `${html}${footer}`;
  }

  private appendUnsubscribeTextFooter(
    text: string | null | undefined,
    email: string,
  ): string | null {
    const unsubscribeUrl = this.buildUnsubscribeUrl(email);

    if (!unsubscribeUrl) return text ?? null;

    const baseText = text?.trim() ?? '';

    return `${baseText}

Unsubscribe: ${unsubscribeUrl}`.trim();
  }

  private buildUnsubscribeUrl(email: string): string | null {
    if (!this.publicBaseUrl) return null;

    const baseUrl = this.publicBaseUrl.replace(/\/+$/, '');
    const token = encodeURIComponent(email.trim().toLowerCase());

    return `${baseUrl}/public/newsletters/general/unsubscribe?token=${token}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
