import { IsInt, Min, Max, IsString, IsOptional, MaxLength, IsEnum } from 'class-validator';
import { ReviewStatus } from '../entities/review.entity';

export class UpdateReviewDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class AdminUpdateReviewDto extends UpdateReviewDto {
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;
}
