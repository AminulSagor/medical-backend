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
  @Max(500)
  limit?: number = 10;

  @IsOptional()
  @IsIn(['createdAt', 'title', 'date'])
  sortBy?: 'createdAt' | 'title' | 'date';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsIn(['true', 'false'])
  upcoming?: 'true' | 'false'; // filter workshops with dates in the future

  @IsOptional()
  @IsIn(['true', 'false'])
  past?: 'true' | 'false'; // filter workshops with all dates in the past

  @IsOptional()
  @IsIn(['true', 'false'])
  hasRefundRequests?: 'true' | 'false'; // filter workshops with refund records
}
