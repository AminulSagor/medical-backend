import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class PublicSubscribeDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string; // E.g., 'FOOTER', 'POPUP', 'CHECKOUT', 'WEBINAR'
}

export class CompleteSubscriberProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clinicalRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  institution?: string;
}
