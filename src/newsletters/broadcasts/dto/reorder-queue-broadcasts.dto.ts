import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NewsletterFrequencyType } from 'src/common/enums/newsletter-constants.enum';

export class ReorderQueueBroadcastItemDto {
  @IsUUID('4')
  broadcastId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequenceIndex: number;
}

export class ReorderQueueBroadcastsDto {
  @IsEnum(NewsletterFrequencyType)
  frequencyType: NewsletterFrequencyType;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReorderQueueBroadcastItemDto)
  items: ReorderQueueBroadcastItemDto[];
}
