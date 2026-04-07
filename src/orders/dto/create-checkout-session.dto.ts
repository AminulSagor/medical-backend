import { Type } from 'class-transformer';
import { IsOptional, IsUrl, ValidateNested } from 'class-validator';
import { PublicOrderSummaryRequestDto } from './public-order-summary.dto';
import { ShippingAddressDto } from './shipping-address.dto';

export class CreateCheckoutSessionDto extends PublicOrderSummaryRequestDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  successUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  cancelUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;
}
