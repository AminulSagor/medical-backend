import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';

export class SubmitRefundRequestDto {
  @IsNumber()
  @Min(0)
  refundAmount: number;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsBoolean()
  confirmedTerms: boolean;
}
