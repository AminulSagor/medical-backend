import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class ConfirmWorkshopRefundDto {
  @IsUUID('4')
  reservationId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  attendeeIds: string[];

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'refundAmount must be a valid monetary amount',
  })
  refundAmount: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adjustmentNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentGateway?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  transactionId?: string;
}
