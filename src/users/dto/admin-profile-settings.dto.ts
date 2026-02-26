import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateAdminEmailDto {
    @IsEmail()
    newEmail: string;
}

export class ChangeAdminPasswordDto {
    @IsString()
    currentPassword: string;

    @MinLength(8)
    newPassword: string;
}