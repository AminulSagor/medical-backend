import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListWorkshopsQueryDto {
  @IsOptional()
  @IsString()
  q?: string; // search by title

  @IsOptional()
  @IsString()
  facilityId?: string; // filter workshops that include this facilityId

  @IsOptional()
  @IsUUID()
  facultyId?: string; // filter workshops containing this faculty

  @IsOptional()
  @IsIn(['in_person', 'online'])
  deliveryMode?: 'in_person' | 'online';

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';

  @IsOptional()
  @IsIn(['true', 'false'])
  offersCmeCredits?: 'true' | 'false';

  @IsOptional()
  @IsIn(['true', 'false'])
  groupDiscountEnabled?: 'true' | 'false';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @IsOptional()
  @IsIn(['createdAt', 'title'])
  sortBy?: 'createdAt' | 'title' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
