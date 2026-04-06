import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RefundOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
