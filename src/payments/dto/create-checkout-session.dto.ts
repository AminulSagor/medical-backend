import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentDomainType } from '../entities/payment-transaction.entity';

export class CheckoutSessionItemDto {
  @IsUUID()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CheckoutShippingAddressDto {
  @IsString()
  @MaxLength(200)
  fullName: string;

  @IsString()
  @MaxLength(255)
  addressLine1: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsString()
  @MaxLength(100)
  city: string;

  @IsString()
  @MaxLength(100)
  state: string;

  @IsString()
  @MaxLength(30)
  zipCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}

export class CreateCheckoutSessionDto {
  @IsEnum(PaymentDomainType)
  domainType: PaymentDomainType;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutSessionItemDto)
  items?: CheckoutSessionItemDto[];

  @IsOptional()
  @IsUUID()
  orderSummaryId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutShippingAddressDto)
  shippingAddress?: CheckoutShippingAddressDto;

  @IsOptional()
  @IsUrl({ require_tld: false })
  successUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  cancelUrl?: string;
}
