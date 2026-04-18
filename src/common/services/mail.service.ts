import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

@Injectable()
export class MailService {
  private readonly ses: SESv2Client;
  private from: string;
  private isConfigured: boolean;

  constructor(private readonly config: ConfigService) {
    const region =
      this.config.get<string>('AWS_REGION') ||
      this.config.get<string>('AWS_S3_REGION');

    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    this.from = this.config.get<string>('SES_FROM_EMAIL') || '';

    // ✅ Check if SES is properly configured
    const sesMissing = !region || !accessKeyId || !secretAccessKey || !this.from;
    this.isConfigured = !sesMissing;

    if (this.isConfigured && region && accessKeyId && secretAccessKey) {
      this.ses = new SESv2Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      console.log('✅ SES email service initialized');
    } else {
      console.warn(
        '⚠️  SES not configured. Email sending will be skipped. Set AWS credentials and SES_FROM_EMAIL in .env to enable.',
      );
    }
  }

  async sendOtpEmail(to: string, otp: string, expiresInMinutes: number) {
    // ✅ Skip if SES not configured (development with bypass mode)
    if (!this.isConfigured) {
      console.log(
        `⏭️  Email skipped - SES not configured. OTP for ${to}: ${otp}`,
      );
      return;
    }

    try {
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>Your verification code</h2>
          <p>Your OTP is:</p>
          <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${otp}</div>
          <p>This code will expire in <b>${expiresInMinutes} minutes</b>.</p>
        </div>
      `;

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
                Html: { Data: htmlContent },
                Text: {
                  Data: `Your OTP is ${otp}. It will expire in ${expiresInMinutes} minutes.`,
                },
              },
            },
          },
        }),
      );
      console.log(`✅ OTP email sent successfully to ${to}`);
    } catch (err) {
      console.error('📧 Email sending failed:', err);
      throw new InternalServerErrorException(
        `Failed to send OTP email: ${err.message}`,
      );
    }
  }
}
