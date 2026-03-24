import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelBroadcastDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
