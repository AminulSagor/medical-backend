import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCohortsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  // Support for 'tab' (from Postman)
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsIn(['all', 'upcoming', 'completed', 'cancelled'])
  tab?: 'all' | 'upcoming' | 'completed' | 'cancelled';

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
