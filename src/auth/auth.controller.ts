import { Body, Controller, Post, Put } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { SendOtpDto } from "./dto/send-otp.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";


@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post("register")
    register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post("login")
    login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    @Post("send-otp")
    sendOtp(@Body() dto: SendOtpDto) {
        return this.authService.sendOtp(dto);
    }

    @Post("verify-otp")
    verifyOtp(@Body() dto: VerifyOtpDto) {
        return this.authService.verifyOtp(dto);
    }

    @Put("reset-password")
    resetPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto);
    }

}
