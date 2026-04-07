import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { WeekDay } from 'src/common/enums/newsletter-constants.enum';

export class UpdateCadenceDto {
  @IsNotEmpty()
  @IsString()
  timezone: string;

  // --- Weekly ---
  @IsBoolean()
  weeklyEnabled: boolean;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Must be YYYY-MM-DD' })
  weeklyCycleStartDate?: string;

  @IsOptional()
  @IsEnum(WeekDay)
  weeklyReleaseDay?: WeekDay;

  @IsOptional()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, {
    message: 'Must be HH:mm or HH:mm:ss',
  })
  weeklyReleaseTime?: string;

  // --- Monthly ---
  @IsBoolean()
  monthlyEnabled: boolean;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Must be YYYY-MM-DD' })
  monthlyCycleStartDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  monthlyDayOfMonth?: number;

  @IsOptional()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, {
    message: 'Must be HH:mm or HH:mm:ss',
  })
  monthlyReleaseTime?: string;
}
