import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min, Matches } from 'class-validator';
import { NewsletterFrequencyType } from 'src/common/enums/newsletter-constants.enum';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class GetAvailableCadenceSlotsQueryDto {
  @IsEnum(NewsletterFrequencyType)
  frequencyType: NewsletterFrequencyType;

  @IsOptional()
  @Matches(DATE_ONLY_REGEX)
  fromDate?: string;

  @IsOptional()
  @Matches(DATE_ONLY_REGEX)
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
