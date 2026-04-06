import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { FulfillmentStatus } from 'src/common/enums/order.enums';

export class UpdateOrderStatusDto {
  @IsOptional()
  @IsEnum(FulfillmentStatus)
  fromStatus?: FulfillmentStatus;

  @IsEnum(FulfillmentStatus)
  toStatus: FulfillmentStatus;

  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean = false;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
