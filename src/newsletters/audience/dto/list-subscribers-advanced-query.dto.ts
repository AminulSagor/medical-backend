import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { NewsletterSubscriberStatus } from 'src/common/enums/newsletter-constants.enum';

export class ListSubscribersAdvancedQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsEnum(NewsletterSubscriberStatus, { each: true })
  statuses?: NewsletterSubscriberStatus[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  acquisitionSources?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  role?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minOpenRatePercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minMessagesReceived?: number;

  @IsOptional()
  @IsDateString()
  joinedFromDate?: string;

  @IsOptional()
  @IsDateString()
  joinedToDate?: string;

  @IsOptional()
  @IsIn(['joinedDate', 'engagementRate', 'received', 'opened', 'fullName'])
  sortBy?: 'joinedDate' | 'engagementRate' | 'received' | 'opened' | 'fullName';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
