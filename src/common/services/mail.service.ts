import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer from "nodemailer";

@Injectable()
export class MailService {
    private transporter: nodemailer.Transporter;
    private from: string;

    constructor(private readonly config: ConfigService) {
        const host = this.config.get<string>("SMTP_HOST");
        const port = Number(this.config.get<string>("SMTP_PORT") || 587);
        const user = this.config.get<string>("SMTP_USER");
        const pass = this.config.get<string>("SMTP_PASS");
        this.from = this.config.get<string>("SMTP_FROM") || user || "";

        if (!host || !user || !pass || !this.from) {
            throw new Error(
                "SMTP config missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in .env",
            );
        }

        this.transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465, // true for 465, false for 587/25
            auth: { user, pass },
        });
    }

    async sendOtpEmail(to: string, otp: string, expiresInMinutes: number) {
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
