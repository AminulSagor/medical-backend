import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly ses: SESv2Client;
  private readonly from: string;
  private readonly isSesConfigured: boolean;

  constructor(private readonly config: ConfigService) {
    const region =
      this.config.get<string>('AWS_REGION') ||
      this.config.get<string>('AWS_S3_REGION');

    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    this.from = this.config.get<string>('SES_FROM_EMAIL') || '';

    this.isSesConfigured = Boolean(
      region && accessKeyId && secretAccessKey && this.from,
    );

    if (!this.isSesConfigured || !region || !accessKeyId || !secretAccessKey) {
      this.logger.warn(
        'SES is not fully configured. Please set AWS_REGION/AWS_S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and SES_FROM_EMAIL.',
      );

      this.ses = new SESv2Client({});
      return;
    }

    this.ses = new SESv2Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.logger.log('SES email service initialized');
  }

  async sendOtpEmail(
    to: string,
    otp: string,
    expiresInMinutes: number,
  ): Promise<void> {
    if (!this.isSesConfigured) {
      throw new InternalServerErrorException('SES is not configured properly');
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Your verification code</h2>
        <p>Your OTP is:</p>
        <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${otp}</div>
        <p>This code will expire in <b>${expiresInMinutes} minutes</b>.</p>
      </div>
    `;

    const textContent = `Your OTP is ${otp}. It will expire in ${expiresInMinutes} minutes.`;

    try {
      this.logger.log(`Sending OTP email via SES to ${to}...`);

      await this.ses.send(
        new SendEmailCommand({
          FromEmailAddress: this.from,
          Destination: {
            ToAddresses: [to],
          },
          Content: {
            Simple: {
              Subject: {
                Data: 'Your verification code',
              },
              Body: {
                Html: {
                  Data: htmlContent,
                },
                Text: {
                  Data: textContent,
                },
              },
            },
          },
        }),
      );

      this.logger.log(`OTP email sent successfully via SES to ${to}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown SES error';

      this.logger.error(`Failed to send OTP email via SES to ${to}`, message);

      throw new InternalServerErrorException(
        `Failed to send OTP email via SES: ${message}`,
      );
    }
  }

  async sendPaymentSuccessEmailWithInvoice(params: {
    to: string;
    customerName?: string | null;
    subject: string;
    html: string;
    text: string;
    invoiceFileName: string;
    invoiceBuffer: Buffer;
  }) {
    if (!this.isSesConfigured) {
      throw new InternalServerErrorException('SES is not configured');
    }

    await this.ses.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: {
          ToAddresses: [params.to],
        },
        Content: {
          Simple: {
            Subject: {
              Data: params.subject,
            },
            Body: {
              Html: { Data: params.html },
              Text: { Data: params.text },
            },
            Attachments: [
              {
                FileName: params.invoiceFileName,
                ContentType: 'application/pdf',
                ContentDisposition: 'ATTACHMENT',
                ContentTransferEncoding: 'BASE64',
                RawContent: params.invoiceBuffer,
              },
            ],
          },
        },
      }),
    );
  }
}
