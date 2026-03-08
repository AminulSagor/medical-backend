import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  NewsletterBroadcastStatus,
  NewsletterFrequencyType,
} from 'src/common/enums/newsletter-constants.enum';

export class ListBroadcastsQueryDto extends PaginationQueryDto {
  @IsIn(['queue', 'drafts', 'history'])
  tab: 'queue' | 'drafts' | 'history';

  @IsOptional()
  @IsEnum(NewsletterFrequencyType)
  frequencyType?: NewsletterFrequencyType;

  @IsOptional()
  @IsEnum(NewsletterBroadcastStatus)
  status?: NewsletterBroadcastStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['scheduledAt', 'createdAt', 'subjectLine', 'status'])
  sortBy?: 'scheduledAt' | 'createdAt' | 'subjectLine' | 'status' =
    'scheduledAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'ASC';
}
