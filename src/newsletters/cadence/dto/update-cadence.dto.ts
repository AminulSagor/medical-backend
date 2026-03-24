import {
  IsBoolean,
  IsEnum,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { WeekDay } from 'src/common/enums/newsletter-constants.enum';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_WITH_SECONDS_REGEX = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;

export class UpdateCadenceDto {
  @IsBoolean()
  weeklyEnabled: boolean;

  @ValidateIf((o) => o.weeklyEnabled === true)
  @Matches(DATE_ONLY_REGEX, {
    message: 'weeklyCycleStartDate must be YYYY-MM-DD',
  })
  weeklyCycleStartDate: string;

  @ValidateIf((o) => o.weeklyEnabled === true)
  @IsEnum(WeekDay)
  weeklyReleaseDay: WeekDay;

  @ValidateIf((o) => o.weeklyEnabled === true)
  @Matches(TIME_24H_WITH_SECONDS_REGEX, {
    message: 'weeklyReleaseTime must be HH:mm:ss',
  })
  weeklyReleaseTime: string;

  @IsBoolean()
  monthlyEnabled: boolean;

  @ValidateIf((o) => o.monthlyEnabled === true)
  @Matches(DATE_ONLY_REGEX, {
    message: 'monthlyCycleStartDate must be YYYY-MM-DD',
  })
  monthlyCycleStartDate: string;

  @ValidateIf((o) => o.monthlyEnabled === true)
  @Min(1)
  @Max(31)
  monthlyDayOfMonth: number;

  @ValidateIf((o) => o.monthlyEnabled === true)
  @Matches(TIME_24H_WITH_SECONDS_REGEX, {
    message: 'monthlyReleaseTime must be HH:mm:ss',
  })
  monthlyReleaseTime: string;

  @IsString()
  @MaxLength(64)
  timezone: string;
}
