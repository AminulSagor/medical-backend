import { IsOptional, IsUUID, IsInt, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ReviewStatus } from '../entities/review.entity';

export class QueryReviewsDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;
}
