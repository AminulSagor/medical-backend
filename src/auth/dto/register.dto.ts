
import { IsEmail, IsString, MinLength, MaxLength, IsBoolean, Equals } from "class-validator";

export class RegisterDto {
  @IsString()
  @MaxLength(200)
  fullLegalName: string;

  @IsEmail()
  @MaxLength(320)
  medicalEmail: string;

  @IsString()
  @MaxLength(150)
  professionalRole: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;

  // ✅ must be false to register
  @IsBoolean()
  @Equals(false)
  forgetPassword: boolean;
}
