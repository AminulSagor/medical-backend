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
