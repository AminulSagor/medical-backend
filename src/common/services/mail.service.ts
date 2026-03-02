import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer from "nodemailer";

@Injectable()
export class MailService {
    private transporter: nodemailer.Transporter | null;
    private from: string;
    private isConfigured: boolean;

    constructor(private readonly config: ConfigService) {
        const host = this.config.get<string>("SMTP_HOST");
        const port = Number(this.config.get<string>("SMTP_PORT") || 587);
        const user = this.config.get<string>("SMTP_USER");
        const pass = this.config.get<string>("SMTP_PASS");
        this.from = this.config.get<string>("SMTP_FROM") || user || "";

        // ✅ Check if SMTP is properly configured (not placeholder values)
        const smtpMissing = !host || !user || !pass || !this.from;
        const hasPlaceholders = user?.includes("your_email") || host?.includes("smtp.gmail.com");
        this.isConfigured = !smtpMissing && !hasPlaceholders;

        if (this.isConfigured) {
            this.transporter = nodemailer.createTransport({
                host,
                port,
                secure: port === 465, // true for 465, false for 587/25
                auth: { user, pass },
            });
        } else {
            this.transporter = null;
            console.warn("⚠️  SMTP not configured. Email sending will be skipped. Set real SMTP credentials in .env to enable.");
        }
    }

    async sendOtpEmail(to: string, otp: string, expiresInMinutes: number) {
        // ✅ Skip if SMTP not configured (development with bypass mode)
        if (!this.isConfigured || !this.transporter) {
            console.log(`⏭️  Email skipped - SMTP not configured. OTP for ${to}: ${otp}`);
            return;
        }

        try {
            await this.transporter.sendMail({
                from: this.from,
                to,
                subject: "Your verification code",
                text: `Your OTP is ${otp}. It will expire in ${expiresInMinutes} minutes.`,
                html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <h2>Your verification code</h2>
            <p>Your OTP is:</p>
            <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${otp}</div>
            <p>This code will expire in <b>${expiresInMinutes} minutes</b>.</p>
          </div>
        `,
            });
        } catch (err) {
            throw new InternalServerErrorException("Failed to send OTP email");
        }
    }
}
