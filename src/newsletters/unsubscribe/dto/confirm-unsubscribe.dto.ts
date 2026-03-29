import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmUnsubscribeDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  sendConfirmationEmail?: boolean;
}
