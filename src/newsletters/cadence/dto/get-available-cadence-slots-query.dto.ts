import { IsEnum, IsOptional, Matches } from 'class-validator';
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
}
