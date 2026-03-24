import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  NewsletterArticleSourceType,
  NewsletterAudienceMode,
  NewsletterContentType,
} from 'src/common/enums/newsletter-constants.enum';

export class CreateBroadcastCustomContentDto {
  @IsString()
  @MaxLength(200000)
  messageBodyHtml: string;

  @IsOptional()
  @IsString()
  @MaxLength(200000)
  messageBodyText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500000)
  serializedEditorState?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  personalizationTokens?: string[];
}

export class CreateBroadcastArticleLinkDto {
  @IsEnum(NewsletterArticleSourceType)
  sourceType: NewsletterArticleSourceType;

  @IsUUID()
  sourceRefId: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ctaLabel?: string;
}

export class CreateBroadcastDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  internalName?: string;

  @IsEnum(NewsletterContentType)
  contentType: NewsletterContentType;

  @IsString()
  @MaxLength(200)
  subjectLine: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  preheaderText?: string;

  @IsEnum(NewsletterAudienceMode)
  audienceMode: NewsletterAudienceMode;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  segmentIds: string[];

  @ValidateIf((o) => o.contentType === NewsletterContentType.CUSTOM_MESSAGE)
  @ValidateNested()
  @Type(() => CreateBroadcastCustomContentDto)
  customContent?: CreateBroadcastCustomContentDto;

  @ValidateIf((o) => o.contentType === NewsletterContentType.ARTICLE_LINK)
  @ValidateNested()
  @Type(() => CreateBroadcastArticleLinkDto)
  articleLink?: CreateBroadcastArticleLinkDto;
}
