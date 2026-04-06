import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export enum ShippingLabelFormat {
  THERMAL_4X6 = '4x6',
}

export enum ShippingLabelOrientation {
  PORTRAIT = 'portrait',
  LANDSCAPE = 'landscape',
}

export class PrintShippingLabelDto {
  @IsOptional()
  @IsEnum(ShippingLabelFormat)
  labelFormat?: ShippingLabelFormat = ShippingLabelFormat.THERMAL_4X6;

  @IsOptional()
  @IsEnum(ShippingLabelOrientation)
  orientation?: ShippingLabelOrientation = ShippingLabelOrientation.PORTRAIT;

  @IsOptional()
  @IsBoolean()
  includePackingSlip?: boolean = false;

  @IsOptional()
  @IsBoolean()
  printInstructions?: boolean = false;
}
