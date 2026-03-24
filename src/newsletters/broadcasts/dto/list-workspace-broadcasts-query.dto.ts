import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  NewsletterBroadcastStatus,
  NewsletterContentType,
  NewsletterFrequencyType,
} from 'src/common/enums/newsletter-constants.enum';

export class ListWorkspaceBroadcastsQueryDto {
  @IsIn(['queue', 'drafts', 'history'])
  tab: 'queue' | 'drafts' | 'history';

  @IsOptional()
  @IsEnum(NewsletterFrequencyType)
  frequencyType?: NewsletterFrequencyType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(NewsletterBroadcastStatus)
  status?: NewsletterBroadcastStatus;

  // UI filter popup: content type multi-select
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsEnum(NewsletterContentType, { each: true })
  contentTypes?: NewsletterContentType[];

  // UI filter popup: author list (article author snapshot names)
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  authorNames?: string[];

  // UI filter popup: target audience segment ids
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  segmentIds?: string[];

  // UI history advanced filter chips (last 7 / 30 days or custom)
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minRecipients?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minOpenRatePercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minClickRatePercent?: number;

  @IsOptional()
  @IsIn([
    'queueSequence',
    'scheduledDate',
    'lastModified',
    'sentDate',
    'engagement',
    'openRate',
    'clickRate',
  ])
  sortBy?:
    | 'queueSequence'
    | 'scheduledDate'
    | 'lastModified'
    | 'sentDate'
    | 'engagement'
    | 'openRate'
    | 'clickRate';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

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
}
