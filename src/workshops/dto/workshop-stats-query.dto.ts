import { IsDateString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class WorkshopStatsQueryDto {
  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  startDate?: string; // Format: "2026-04-26"

  @IsOptional()
  @Type(() => Number)
  days?: number = 5; // Default: 5 days from start date
}
