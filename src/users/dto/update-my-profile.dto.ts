import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  profilePicture?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(100)
  lastName?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phoneNumber?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(150)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(150)
  role?: string;

  @IsOptional()
  @IsString()
  institutionOrHospital?: string | null;

  @IsOptional()
  @IsString()
  npiNumber?: string | null;
}

export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  currentPassword!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
