import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  profilePicture?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phoneNumber?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  role?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  institutionOrHospital?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  npiNumber?: string | null;
}
