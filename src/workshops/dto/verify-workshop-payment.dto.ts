import { IsString, IsUUID, MinLength } from 'class-validator';

export class VerifyWorkshopPaymentDto {
  @IsUUID()
  orderSummaryId: string;

  @IsString()
  @MinLength(1)
  sessionId: string;
}
