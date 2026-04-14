import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export enum CourseTab {
  ACTIVE = 'active', // "In-Progress & Upcoming"
  COMPLETED = 'completed',
  BROWSE = 'browse', // "Browse Course"
}

export enum CourseTypeFilter {
  ALL = 'all',
  IN_PERSON = 'in_person',
  ONLINE = 'online',
}

export enum CourseSort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  A_Z = 'a_z',
}

export class ListMyCoursesQueryDto {
  @IsOptional()
  @IsIn(['active', 'confirmed', 'completed', 'browse'])
  status?: 'active' | 'confirmed' | 'completed' | 'browse' =
    'active';

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

export class ListMyCoursesLoggedQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CourseTab)
  tab?: CourseTab = CourseTab.ACTIVE;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CourseTypeFilter)
  type?: CourseTypeFilter = CourseTypeFilter.ALL;

  @IsOptional()
  @IsEnum(CourseSort)
  sortBy?: CourseSort = CourseSort.NEWEST;
}
