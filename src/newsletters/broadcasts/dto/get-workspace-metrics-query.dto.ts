import { IsEnum, IsOptional, IsIn } from 'class-validator';
import { NewsletterFrequencyType } from 'src/common/enums/newsletter-constants.enum';

export class GetWorkspaceMetricsQueryDto {
  @IsIn(['queue', 'drafts', 'history'])
  tab: 'queue' | 'drafts' | 'history';

  @IsOptional()
  @IsEnum(NewsletterFrequencyType)
  frequencyType?: NewsletterFrequencyType;
}
