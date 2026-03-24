import { IsBoolean, IsOptional } from 'class-validator';
import { UpdateCadenceDto } from './update-cadence.dto';

export class ApplyCadenceRecalculationDto extends UpdateCadenceDto {
  @IsOptional()
  @IsBoolean()
  recalculateScheduledQueue?: boolean = true;
}
