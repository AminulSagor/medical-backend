import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSubscriberDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  fullName?: string;
}
