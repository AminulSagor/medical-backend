import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CreateBroadcastArticleLinkDto,
  CreateBroadcastCustomContentDto,
} from './create-broadcast.dto';
import { NewsletterAudienceMode } from 'src/common/enums/newsletter-constants.enum';

export class UpdateBroadcastDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  internalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subjectLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  preheaderText?: string;

  @IsOptional()
  @IsEnum(NewsletterAudienceMode)
  audienceMode?: NewsletterAudienceMode;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  segmentIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateBroadcastCustomContentDto)
  customContent?: CreateBroadcastCustomContentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateBroadcastArticleLinkDto)
  articleLink?: CreateBroadcastArticleLinkDto;
}
