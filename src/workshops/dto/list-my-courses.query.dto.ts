import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListMyCoursesQueryDto {
  @IsOptional()
  @IsIn(['active', 'in_progress', 'completed', 'browse'])
  status?: 'active' | 'in_progress' | 'completed' | 'browse' = 'active';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['in_person', 'online'])
  courseType?: 'in_person' | 'online';

  @IsOptional()
  @IsIn(['startDate', 'endDate', 'completedDate', 'createdAt', 'title'])
  sortBy?: 'startDate' | 'endDate' | 'completedDate' | 'createdAt' | 'title' =
    'startDate';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
