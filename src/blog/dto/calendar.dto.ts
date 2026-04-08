import { IsDateString, IsNotEmpty } from 'class-validator';

export class GetCalendarQueryDto {
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  endDate: string;
}

export class SchedulePostDto {
  @IsNotEmpty()
  @IsDateString()
  scheduledPublishDate: string; // Combined Target Date + Publish Time from UI
}
