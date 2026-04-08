import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListWorkshopEnrolleesQueryDto {
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

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['BOOKED', 'REFUND_REQUESTED', 'PARTIAL_REFUNDED', 'REFUNDED'])
  enrollmentStatus?:
    | 'BOOKED'
    | 'REFUND_REQUESTED'
    | 'PARTIAL_REFUNDED'
    | 'REFUNDED';

  @IsOptional()
  @IsIn(['single', 'group'])
  bookingType?: 'single' | 'group';
}
