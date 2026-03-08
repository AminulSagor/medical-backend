import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCohortsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'upcoming', 'completed', 'cancelled'])
  status?: 'all' | 'upcoming' | 'completed' | 'cancelled';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
