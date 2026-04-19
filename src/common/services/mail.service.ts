import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly ses: SESv2Client;
  private from: string;
  private isSesConfigured: boolean;
  private smtpTransporter: any;
  private isSmtpConfigured: boolean;

  constructor(private readonly config: ConfigService) {
    const region =
      this.config.get<string>('AWS_REGION') ||
      this.config.get<string>('AWS_S3_REGION');

    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    this.from = this.config.get<string>('SES_FROM_EMAIL') || this.config.get<string>('SMTP_FROM') || '';

    // ✅ Check if SES is properly configured
    const sesMissing = !region || !accessKeyId || !secretAccessKey || !this.from;
    this.isSesConfigured = !sesMissing;

    // ✅ Check if SMTP is configured
    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpPort = this.config.get<string>('SMTP_PORT');
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');
    const smtpMissing = !smtpHost || !smtpPort || !smtpUser || !smtpPass;
    this.isSmtpConfigured = !smtpMissing;

    if (this.isSesConfigured && region && accessKeyId && secretAccessKey) {
      this.ses = new SESv2Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      console.log('✅ SES email service initialized');
    } else {
      console.warn('⚠️  SES not configured - will fallback to SMTP if available');
    }

    if (this.isSmtpConfigured && smtpHost && smtpPort && smtpUser && smtpPass) {
      this.smtpTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: smtpPort === '465', // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      console.log('✅ SMTP email service initialized');
    } else {
      console.warn('⚠️  SMTP not configured - emails will be skipped');
    }
  }

  async sendOtpEmail(to: string, otp: string, expiresInMinutes: number) {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Your verification code</h2>
        <p>Your OTP is:</p>
        <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${otp}</div>
        <p>This code will expire in <b>${expiresInMinutes} minutes</b>.</p>
      </div>
    `;

    // ✅ Try SES first if configured
    if (this.isSesConfigured) {
      try {
        console.log(`📧 Attempting to send OTP via SES to ${to}...`);
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
        console.log(`✅ OTP email sent successfully via SES to ${to}`);
        return;
      } catch (sesError) {
        console.warn(`⚠️  SES failed: ${sesError.message} - falling back to SMTP`);
      }
    }

    // ✅ Fallback to SMTP if SES fails or not configured
    if (this.isSmtpConfigured) {
      try {
        console.log(`📧 Sending OTP via SMTP to ${to}...`);
        await this.smtpTransporter.sendMail({
          from: this.from,
          to: to,
          subject: 'Your verification code',
          html: htmlContent,
          text: `Your OTP is ${otp}. It will expire in ${expiresInMinutes} minutes.`,
        });
        console.log(`✅ OTP email sent successfully via SMTP to ${to}`);
        return;
      } catch (smtpError) {
        console.error(`❌ SMTP failed: ${smtpError.message}`);
        throw new InternalServerErrorException(
          `Failed to send OTP email via both SES and SMTP: ${smtpError.message}`,
        );
      }
    }

    // ✅ If neither SES nor SMTP is configured, skip email
    console.log(
      `⏭️  Email services not configured. OTP for ${to}: ${otp}`,
    );
  }
}
