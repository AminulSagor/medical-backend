import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { RegisterDto } from "./dto/register.dto";
import { User } from "../users/entities/user.entity";
import { UnauthorizedException } from "@nestjs/common";
import { LoginDto } from "./dto/login.dto";
import { SendOtpDto } from "./dto/send-otp.dto";
import { generateOtp6, normalizeEmail } from "../common/utils/email.util";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { MailService } from "../common/services/mail.service";


@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User) private readonly userRepo: Repository<User>,
        private readonly jwtService: JwtService,
        private readonly mailService: MailService,
    ) { }


    private static otpStore = new Map<
        string,
        { otp: string; expiresAt: number; lastSentAt: number }
    >();

    private static otpVerifySessionStore = new Map<string, { expiresAt: number }>();


    async register(dto: RegisterDto): Promise<{
        message: string;
        user: {
            id: string;
            fullLegalName: string;
            medicalEmail: string;
            professionalRole: string;
        };
    }> {
        if (dto.forgetPassword !== false) {
            throw new BadRequestException(
                "Invalid flow: forgetPassword must be false for register"
            );
        }

        const medicalEmail = normalizeEmail(dto.medicalEmail);

        const exists = await this.userRepo.findOne({ where: { medicalEmail } });
        if (exists) {
            throw new BadRequestException("Medical email already exists");
        }

        const passwordHash = await bcrypt.hash(dto.password, 10);

        const user = this.userRepo.create({
            fullLegalName: dto.fullLegalName.trim(),
            medicalEmail,
            professionalRole: dto.professionalRole.trim(),
            password: passwordHash,
            isVerified: false,
        });

        const saved = await this.userRepo.save(user);

        return {
            message: "Account created successfully",
            user: {
                id: saved.id,
                fullLegalName: saved.fullLegalName,
                medicalEmail: saved.medicalEmail,
                professionalRole: saved.professionalRole,
            },
        };
    }



    async login(dto: LoginDto): Promise<{
        accessToken: string;
        user: {
            id: string;
            fullLegalName: string;
            medicalEmail: string;
            professionalRole: string;
        };
    }> {
        const email = dto.email.toLowerCase();

        const user = await this.userRepo.findOne({
            where: { medicalEmail: email },
        });

        if (!user) {
            throw new UnauthorizedException("Invalid email or password");
        }

        if (!user.isVerified) {
            throw new UnauthorizedException("Account is not verified");
        }

        const isMatch = await bcrypt.compare(dto.password, user.password);

        if (!isMatch) {
            throw new UnauthorizedException("Invalid email or password");
        }

        const payload = {
            sub: user.id,
            role: user.role,
            medicalEmail: user.medicalEmail,
        };

        const accessToken = await this.jwtService.signAsync(payload);

        if (!isMatch) {
            throw new UnauthorizedException("Invalid email or password");
        }

        return {
            accessToken,
            user: {
                id: user.id,
                fullLegalName: user.fullLegalName,
                medicalEmail: user.medicalEmail,
                professionalRole: user.professionalRole,
            },
        };
    }



    async sendOtp(dto: SendOtpDto): Promise<{ message: string; expiresInSeconds: number; debugOtp?: string }> {
        const email = normalizeEmail(dto.email);

        // ✅ optional: ensure user exists before sending OTP
        const user = await this.userRepo.findOne({ where: { medicalEmail: email } });
        if (!user) {
            throw new BadRequestException("Account not found for this email");
        }

        const now = Date.now();
        const existing = AuthService.otpStore.get(email);

        // ✅ simple rate limit: block resending within 30s
        if (existing && now - existing.lastSentAt < 30_000) {
            throw new BadRequestException("Please wait before requesting another OTP");
        }

        const bypassEnabled = process.env.BYPASS_EMAIL_OTP === "true";
        const otp = bypassEnabled ? (process.env.DEFAULT_OTP_CODE || "123456") : generateOtp6();
        const expiresInSeconds = Number(process.env.OTP_EXPIRE_SEC || 300); // default 5 min
        const expiresAt = now + expiresInSeconds * 1000;

        AuthService.otpStore.set(email, { otp, expiresAt, lastSentAt: now });

        // ✅ send email only if bypass is disabled (production flow)
        if (!bypassEnabled) {
            await this.sendOtpEmail(email, otp);
        } else {
            // ✅ bypass mode: log the OTP for development
            console.log(`[BYPASS MODE] OTP for ${email}: ${otp}`);
        }

        const response: any = {
            message: bypassEnabled ? "OTP bypassed - check console logs or use DEFAULT_OTP_CODE" : "OTP sent successfully",
            expiresInSeconds,
        };

        // ✅ include OTP in response for development/testing when bypass is enabled
        if (bypassEnabled && process.env.NODE_ENV !== "production") {
            response.debugOtp = otp;
        }

        return response;
    }


    private async sendOtpEmail(email: string, otp: string) {
        const expiresInSeconds = Number(process.env.OTP_EXPIRE_SEC || 300);
        const expiresInMinutes = Math.ceil(expiresInSeconds / 60);
        await this.mailService.sendOtpEmail(email, otp, expiresInMinutes);
    }



    async verifyOtp(dto: VerifyOtpDto): Promise<{
        message: string;
        email: string;
    }> {
        const email = normalizeEmail(dto.email);
        const bypassEnabled = process.env.BYPASS_EMAIL_OTP === "true";
        const defaultOtpCode = process.env.DEFAULT_OTP_CODE || "123456";

        // ✅ IF BYPASS MODE: Skip store validation, just verify against default code
        if (bypassEnabled) {
            if (dto.otp !== defaultOtpCode) {
                throw new BadRequestException("Invalid OTP");
            }

            // ✅ Mark user as verified and create session
            const user = await this.userRepo.findOne({ where: { medicalEmail: email } });
            if (!user) {
                throw new BadRequestException("Account not found for this email");
            }

            if (!user.isVerified) {
                user.isVerified = true;
                await this.userRepo.save(user);
            }

            const sessionSec = Number(process.env.OTP_VERIFY_SESSION_SEC || 300);
            AuthService.otpVerifySessionStore.set(email, {
                expiresAt: Date.now() + sessionSec * 1000,
            });

            return {
                message: "OTP verified successfully",
                email: user.medicalEmail,
            };
        }

        // ✅ PRODUCTION MODE: Validate against stored OTP
        const record = AuthService.otpStore.get(email);
        if (!record) {
            throw new BadRequestException("OTP not found or expired");
        }

        const now = Date.now();
        if (now > record.expiresAt) {
            AuthService.otpStore.delete(email);
            throw new BadRequestException("OTP expired");
        }

        // ✅ OTP validation
        if (record.otp !== dto.otp) {
            throw new BadRequestException("Invalid OTP");
        }

        // ✅ one-time use
        AuthService.otpStore.delete(email);

        const user = await this.userRepo.findOne({ where: { medicalEmail: email } });
        if (!user) {
            throw new BadRequestException("Account not found for this email");
        }

        if (!user.isVerified) {
            user.isVerified = true;
            await this.userRepo.save(user);
        }

        const sessionSec = Number(process.env.OTP_VERIFY_SESSION_SEC || 300);
        AuthService.otpVerifySessionStore.set(email, {
            expiresAt: Date.now() + sessionSec * 1000,
        });

        return {
            message: "OTP verified successfully",
            email: user.medicalEmail,
        };
    }



    async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
        if (dto.forgetPassword !== true) {
            throw new BadRequestException(
                "Invalid flow: forgetPassword must be true for reset password"
            );
        }

        const email = normalizeEmail(dto.email);

        const user = await this.userRepo.findOne({
            where: { medicalEmail: email },
        });

        if (!user) {
            throw new BadRequestException(
                "No account found with this email. Please register first."
            );
        }

        const session = AuthService.otpVerifySessionStore.get(email);
        if (!session || Date.now() > session.expiresAt) {
            throw new BadRequestException("OTP verification required");
        }

        const passwordHash = await bcrypt.hash(dto.password, 10);
        user.password = passwordHash;

        // ✅ keep verified (otherwise login blocked)
        user.isVerified = true;

        await this.userRepo.save(user);
        AuthService.otpVerifySessionStore.delete(email);

        return {
            message: "Password updated successfully",
        };
    }

}
