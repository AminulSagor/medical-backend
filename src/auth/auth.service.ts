import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { UnauthorizedException } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { generateOtp6, normalizeEmail } from '../common/utils/email.util';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailService } from '../common/services/mail.service';
import { UserAuthIdentity } from 'src/users/entities/user-auth-identity.entity';
import { SocialProfile } from 'src/common/types/socials.types';
import {
  FacebookSocialLoginDto,
  GoogleSocialLoginDto,
} from './dto/social-login.dto';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserAuthIdentity)
    private readonly userAuthIdentityRepo: Repository<UserAuthIdentity>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  private static otpStore = new Map<
    string,
    { otp: string; expiresAt: number; lastSentAt: number }
  >();

  private static otpVerifySessionStore = new Map<
    string,
    { expiresAt: number }
  >();

  // --- start ---

  private buildAuthUser(user: User) {
    return {
      id: user.id,
      fullLegalName: user.fullLegalName,
      medicalEmail: user.medicalEmail,
      professionalRole: user.professionalRole,
    };
  }

  private async signAccessToken(user: User): Promise<string> {
    const payload = {
      sub: user.id,
      role: user.role,
      medicalEmail: user.medicalEmail,
    };

    return this.jwtService.signAsync(payload);
  }

  private splitFullLegalName(fullLegalName: string) {
    const nameTokens = fullLegalName.trim().split(/\s+/);
    return {
      firstName: nameTokens[0] ?? '',
      lastName: nameTokens.slice(1).join(' ') || undefined,
    };
  }

  private async verifyGoogleIdToken(idToken: string): Promise<SocialProfile> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');

    if (!clientId) {
      throw new BadRequestException('GOOGLE_CLIENT_ID is not configured');
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();

    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid Google token');
    }

    if (!payload.email) {
      throw new BadRequestException('Google account did not provide an email');
    }

    if (payload.email_verified === false) {
      throw new UnauthorizedException('Google email is not verified');
    }

    const fullLegalName = payload.name?.trim() || payload.email;

    const nameParts = this.splitFullLegalName(fullLegalName);

    return {
      provider: 'google',
      providerId: payload.sub,
      email: normalizeEmail(payload.email),
      fullLegalName,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      pictureUrl: payload.picture ?? null,
    };
  }

  private async verifyFacebookAccessToken(
    accessToken: string,
  ): Promise<SocialProfile> {
    const appId = this.config.get<string>('FACEBOOK_APP_ID');
    const appSecret = this.config.get<string>('FACEBOOK_APP_SECRET');

    if (!appId || !appSecret) {
      throw new BadRequestException(
        'FACEBOOK_APP_ID / FACEBOOK_APP_SECRET is not configured',
      );
    }

    const debugResponse = await axios.get<{
      data?: {
        app_id?: string;
        is_valid?: boolean;
        user_id?: string;
      };
    }>('https://graph.facebook.com/debug_token', {
      params: {
        input_token: accessToken,
        access_token: `${appId}|${appSecret}`,
      },
    });

    const debugData = debugResponse.data?.data;

    if (!debugData?.is_valid) {
      throw new UnauthorizedException('Invalid Facebook access token');
    }

    if (debugData.app_id !== appId) {
      throw new UnauthorizedException(
        'Facebook token does not belong to this app',
      );
    }

    const profileResponse = await axios.get<{
      id: string;
      name?: string;
      email?: string;
      picture?: {
        data?: {
          url?: string;
        };
      };
    }>('https://graph.facebook.com/me', {
      params: {
        fields: 'id,name,email,picture.type(large)',
        access_token: accessToken,
      },
    });

    const profile = profileResponse.data;

    if (!profile?.id) {
      throw new UnauthorizedException('Unable to read Facebook profile');
    }

    if (!profile.email) {
      throw new BadRequestException(
        'Facebook account did not provide an email',
      );
    }

    const fullLegalName = profile.name?.trim() || profile.email;
    const nameParts = this.splitFullLegalName(fullLegalName);

    return {
      provider: 'facebook',
      providerId: profile.id,
      email: normalizeEmail(profile.email),
      fullLegalName,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      pictureUrl: profile.picture?.data?.url ?? null,
    };
  }

  private async findOrCreateSocialUser(profile: SocialProfile): Promise<User> {
    let user: User | null = null;
    let authIdentity: UserAuthIdentity | null = null;

    if (profile.provider === 'google') {
      authIdentity = await this.userAuthIdentityRepo.findOne({
        where: { googleId: profile.providerId },
        relations: ['user'],
      });
    }

    if (!authIdentity && profile.provider === 'facebook') {
      authIdentity = await this.userAuthIdentityRepo.findOne({
        where: { facebookId: profile.providerId },
        relations: ['user'],
      });
    }

    if (authIdentity?.user) {
      user = authIdentity.user;
    }

    if (!user) {
      user = await this.userRepo.findOne({
        where: { medicalEmail: profile.email },
      });
    }

    if (!user) {
      const newUser = new User();
      newUser.fullLegalName = profile.fullLegalName;
      newUser.firstName = profile.firstName;
      newUser.lastName = profile.lastName;
      newUser.medicalEmail = profile.email;
      newUser.professionalRole = 'Student';
      newUser.isVerified = true;
      newUser.role = UserRole.STUDENT;
      newUser.profilePhotoUrl = profile.pictureUrl ?? null;
      (newUser as any).password = null;

      const savedUser = await this.userRepo.save(newUser);

      const newAuthIdentity = new UserAuthIdentity();
      newAuthIdentity.userId = savedUser.id;
      newAuthIdentity.authProvider = profile.provider;
      newAuthIdentity.googleId =
        profile.provider === 'google' ? profile.providerId : null;
      newAuthIdentity.facebookId =
        profile.provider === 'facebook' ? profile.providerId : null;

      await this.userAuthIdentityRepo.save(newAuthIdentity);

      return savedUser;
    }

    let ensuredUser = user;
    let shouldSaveUser = false;

    if (!ensuredUser.fullLegalName && profile.fullLegalName) {
      ensuredUser.fullLegalName = profile.fullLegalName;
      shouldSaveUser = true;
    }

    if (!ensuredUser.firstName && profile.firstName) {
      ensuredUser.firstName = profile.firstName;
      shouldSaveUser = true;
    }

    if (!ensuredUser.lastName && profile.lastName) {
      ensuredUser.lastName = profile.lastName;
      shouldSaveUser = true;
    }

    if (!ensuredUser.medicalEmail && profile.email) {
      ensuredUser.medicalEmail = profile.email;
      shouldSaveUser = true;
    }

    if (!ensuredUser.isVerified) {
      ensuredUser.isVerified = true;
      shouldSaveUser = true;
    }

    if (!ensuredUser.profilePhotoUrl && profile.pictureUrl) {
      ensuredUser.profilePhotoUrl = profile.pictureUrl;
      shouldSaveUser = true;
    }

    if (shouldSaveUser) {
      ensuredUser = await this.userRepo.save(ensuredUser);
    }

    if (!authIdentity) {
      authIdentity = await this.userAuthIdentityRepo.findOne({
        where: { userId: ensuredUser.id },
      });
    }

    if (!authIdentity) {
      const newAuthIdentity = new UserAuthIdentity();
      newAuthIdentity.userId = ensuredUser.id;
      newAuthIdentity.authProvider = profile.provider;
      newAuthIdentity.googleId =
        profile.provider === 'google' ? profile.providerId : null;
      newAuthIdentity.facebookId =
        profile.provider === 'facebook' ? profile.providerId : null;

      await this.userAuthIdentityRepo.save(newAuthIdentity);
      return ensuredUser;
    }

    let shouldSaveIdentity = false;

    if (authIdentity.authProvider !== profile.provider) {
      authIdentity.authProvider = profile.provider;
      shouldSaveIdentity = true;
    }

    if (profile.provider === 'google' && !authIdentity.googleId) {
      authIdentity.googleId = profile.providerId;
      shouldSaveIdentity = true;
    }

    if (profile.provider === 'facebook' && !authIdentity.facebookId) {
      authIdentity.facebookId = profile.providerId;
      shouldSaveIdentity = true;
    }

    if (shouldSaveIdentity) {
      await this.userAuthIdentityRepo.save(authIdentity);
    }

    return ensuredUser;
  }

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
        'Invalid flow: forgetPassword must be false for register',
      );
    }

    const medicalEmail = normalizeEmail(dto.medicalEmail);

    const exists = await this.userRepo.findOne({
      where: { medicalEmail },
    });

    if (exists) {
      throw new BadRequestException('Medical email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const fullLegalName = dto.fullLegalName.trim();
    const nameParts = this.splitFullLegalName(fullLegalName);

    const user = this.userRepo.create({
      fullLegalName,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      medicalEmail,
      professionalRole: dto.professionalRole.trim(),
      password: passwordHash,
      isVerified: false,
      role: UserRole.STUDENT,
    });

    const saved = await this.userRepo.save(user);

    const authIdentity = this.userAuthIdentityRepo.create({
      userId: saved.id,
      authProvider: 'local',
      googleId: null,
      facebookId: null,
    });

    await this.userAuthIdentityRepo.save(authIdentity);

    return {
      message: 'Account created successfully',
      user: this.buildAuthUser(saved),
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
    const email = normalizeEmail(dto.email);

    const user = await this.userRepo.findOne({
      where: { medicalEmail: email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Account is not verified');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.signAccessToken(user);

    return {
      accessToken,
      user: this.buildAuthUser(user),
    };
  }

  async loginWithGoogle(dto: GoogleSocialLoginDto): Promise<{
    accessToken: string;
    user: {
      id: string;
      fullLegalName: string;
      medicalEmail: string;
      professionalRole: string;
    };
  }> {
    const profile = await this.verifyGoogleIdToken(dto.idToken);
    const user = await this.findOrCreateSocialUser(profile);
    const accessToken = await this.signAccessToken(user);

    return {
      accessToken,
      user: this.buildAuthUser(user),
    };
  }

  async loginWithFacebook(dto: FacebookSocialLoginDto): Promise<{
    accessToken: string;
    user: {
      id: string;
      fullLegalName: string;
      medicalEmail: string;
      professionalRole: string;
    };
  }> {
    const profile = await this.verifyFacebookAccessToken(dto.accessToken);
    const user = await this.findOrCreateSocialUser(profile);
    const accessToken = await this.signAccessToken(user);

    return {
      accessToken,
      user: this.buildAuthUser(user),
    };
  }

  // --- end ---

  async sendOtp(
    dto: SendOtpDto,
  ): Promise<{ message: string; expiresInSeconds: number; debugOtp?: string }> {
    const email = normalizeEmail(dto.email);

    // ✅ optional: ensure user exists before sending OTP
    const user = await this.userRepo.findOne({
      where: { medicalEmail: email },
    });
    if (!user) {
      throw new BadRequestException('Account not found for this email');
    }

    const now = Date.now();
    const existing = AuthService.otpStore.get(email);

    // ✅ simple rate limit: block resending within 30s
    if (existing && now - existing.lastSentAt < 30_000) {
      throw new BadRequestException(
        'Please wait before requesting another OTP',
      );
    }

    const bypassEnabled = process.env.BYPASS_EMAIL_OTP === 'true';
    const otp = bypassEnabled
      ? process.env.DEFAULT_OTP_CODE || '123456'
      : generateOtp6();
    const expiresInSeconds = Number(process.env.OTP_EXPIRE_SEC || 300); // default 5 min
    const expiresAt = now + expiresInSeconds * 1000;

    AuthService.otpStore.set(email, { otp, expiresAt, lastSentAt: now });

    // ✅ send email only if bypass is disabled (production flow)
    if (!bypassEnabled) {
      console.log(`📧 Sending real OTP email to ${email}...`);
      await this.sendOtpEmail(email, otp);
    } else {
      // ✅ bypass mode: log the OTP for development
      console.log(`[BYPASS MODE] OTP for ${email}: ${otp}`);
    }

    const response: any = {
      message: bypassEnabled
        ? 'OTP bypassed - check console logs or use DEFAULT_OTP_CODE'
        : 'OTP sent successfully',
      expiresInSeconds,
    };

    // ✅ include OTP in response for development/testing when bypass is enabled
    if (bypassEnabled && process.env.NODE_ENV !== 'production') {
      response.debugOtp = otp;
    }

    return response;
  }

  private async sendOtpEmail(email: string, otp: string) {
    const expiresInSeconds = Number(process.env.OTP_EXPIRE_SEC || 300);
    const expiresInMinutes = Math.ceil(expiresInSeconds / 60);
    try {
      await this.mailService.sendOtpEmail(email, otp, expiresInMinutes);
      console.log(`✅ OTP email sent successfully to ${email}`);
    } catch (err) {
      console.error('❌ Failed to send OTP email:', err);
      throw err;
    }
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{
    message: string;
    email: string;
  }> {
    const email = normalizeEmail(dto.email);
    const bypassEnabled = process.env.BYPASS_EMAIL_OTP === 'true';
    const defaultOtpCode = process.env.DEFAULT_OTP_CODE || '123456';

    // ✅ IF BYPASS MODE: Skip store validation, just verify against default code
    if (bypassEnabled) {
      if (dto.otp !== defaultOtpCode) {
        throw new BadRequestException('Invalid OTP');
      }

      // ✅ Mark user as verified and create session
      const user = await this.userRepo.findOne({
        where: { medicalEmail: email },
      });
      if (!user) {
        throw new BadRequestException('Account not found for this email');
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
        message: 'OTP verified successfully',
        email: user.medicalEmail,
      };
    }

    // ✅ PRODUCTION MODE: Validate against stored OTP
    const record = AuthService.otpStore.get(email);
    if (!record) {
      throw new BadRequestException('OTP not found or expired');
    }

    const now = Date.now();
    if (now > record.expiresAt) {
      AuthService.otpStore.delete(email);
      throw new BadRequestException('OTP expired');
    }

    // ✅ OTP validation
    if (record.otp !== dto.otp) {
      throw new BadRequestException('Invalid OTP');
    }

    // ✅ one-time use
    AuthService.otpStore.delete(email);

    const user = await this.userRepo.findOne({
      where: { medicalEmail: email },
    });
    if (!user) {
      throw new BadRequestException('Account not found for this email');
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
      message: 'OTP verified successfully',
      email: user.medicalEmail,
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    if (dto.forgetPassword !== true) {
      throw new BadRequestException(
        'Invalid flow: forgetPassword must be true for reset password',
      );
    }

    const email = normalizeEmail(dto.email);

    const user = await this.userRepo.findOne({
      where: { medicalEmail: email },
    });

    if (!user) {
      throw new BadRequestException(
        'No account found with this email. Please register first.',
      );
    }

    const session = AuthService.otpVerifySessionStore.get(email);
    if (!session || Date.now() > session.expiresAt) {
      throw new BadRequestException('OTP verification required');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    user.password = passwordHash;

    // ✅ keep verified (otherwise login blocked)
    user.isVerified = true;

    await this.userRepo.save(user);
    AuthService.otpVerifySessionStore.delete(email);

    return {
      message: 'Password updated successfully',
    };
  }
}
