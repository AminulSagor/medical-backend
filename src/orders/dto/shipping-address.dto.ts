import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ShippingAddressDto {
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
