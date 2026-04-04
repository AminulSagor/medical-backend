import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateExpertReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reviewMessage: string;

  @IsString()
  @IsNotEmpty()
  reviewerName: string;

  @IsOptional()
  @IsString()
  reviewerProfileImg?: string;

  @IsString()
  @IsNotEmpty()
  reviewerDesignation: string;
}
