import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsUUID,
  ArrayMinSize,
} from 'class-validator';

export class DistributeBlastDto {
  @IsOptional()
  @IsBoolean()
  sendAdminCopy?: boolean;
}

export class DistributeNewsletterDto {
  @IsIn(['WEEKLY', 'MONTHLY'])
  frequencyType: 'WEEKLY' | 'MONTHLY';
}

export class DistributeCohortsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  cohortIds: string[];
}
