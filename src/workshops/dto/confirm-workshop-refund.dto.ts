import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class ConfirmWorkshopRefundDto {
  @IsUUID()
  reservationId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  attendeeIds: string[];

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'refundAmount must be a valid monetary amount',
  })
  refundAmount: string;

  @IsOptional()
  @IsString()
  adjustmentNote?: string;

  @IsString()
  @IsNotEmpty()
  paymentGateway: string;

  @IsString()
  @IsNotEmpty()
  transactionId: string;
}
