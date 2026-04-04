import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateExpertReviewDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  reviewMessage?: string;

  @IsString()
  @IsOptional()
  reviewerName?: string;

  @IsOptional()
  @IsString()
  reviewerProfileImg?: string;

  @IsString()
  @IsOptional()
  reviewerDesignation?: string;
}
