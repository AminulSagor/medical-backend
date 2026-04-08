import { IsEnum, IsOptional, IsIn } from 'class-validator';
import { NewsletterFrequencyType } from 'src/common/enums/newsletter-constants.enum';

export class GetWorkspaceMetricsQueryDto {
  @IsOptional()
  @IsEnum(NewsletterFrequencyType)
  frequencyType?: NewsletterFrequencyType;
}
