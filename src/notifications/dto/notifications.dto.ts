import {
  IsBoolean,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export class NotificationFilterDto extends PaginationQueryDto {
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  // FIX: Transforms a single string into an array automatically
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  category?: string[];
  @IsOptional() @IsString() status?: 'All' | 'Unread Only' | 'Read Only';
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  priority?: string[];
  @IsOptional() @IsString() search?: string;
}

class PreferenceItemDto {
  @IsString() preferenceKey: string;
  @IsBoolean() inAppEnabled: boolean;
  @IsBoolean() emailEnabled: boolean;
  @IsOptional() @IsString() frequency?: string;
}

export class UpdatePreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreferenceItemDto)
  preferences: PreferenceItemDto[];

  @IsOptional() @IsString() emailDeliveryAddress?: string;
  @IsOptional() @IsBoolean() desktopPushEnabled?: boolean;
}
