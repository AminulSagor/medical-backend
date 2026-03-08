import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class AddAttendeeDto {
    @IsString()
    @MaxLength(200)
    fullName: string;

    @IsString()
    @MaxLength(200)
    professionalRole: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    npiNumber?: string;

    @IsEmail()
    @MaxLength(200)
    email: string;
}
