import { IsEmail, IsString, MinLength, IsBoolean, Equals } from "class-validator";

export class ResetPasswordDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    password: string;

    // ✅ must be true to reset
    @IsBoolean()
    @Equals(true)
    forgetPassword: boolean;
}
