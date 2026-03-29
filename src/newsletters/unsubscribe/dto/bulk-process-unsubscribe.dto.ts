import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class BulkProcessUnsubscribeDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  requestIds: string[];

  @IsOptional()
  @IsBoolean()
  permanentlyRemoveFromLists?: boolean;

  @IsOptional()
  @IsBoolean()
  sendConfirmationEmail?: boolean;
}
