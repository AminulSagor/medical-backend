import { Type } from "class-transformer";
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateNested,
    ArrayMinSize,
} from "class-validator";
import { IsEnum } from "class-validator";
import { FrontendBadge } from "../entities/product.entity";

export class ClinicalBenefitDto {
    @IsString()
    icon: string;

    @IsString()
    title: string;

    @IsString()
    description: string;
}

export class TechnicalSpecificationDto {
    @IsString()
    name: string;

    @IsString()
    value: string;
}

export class BulkPriceTierDto {
    @IsInt()
    @Min(1)
    minQty: number;

    @IsNumberString()
    price: string;
}

export class UpdateProductDto {
    // --- products table fields ---
    @IsOptional()
    @IsString()
    @MaxLength(200)
    name?: string;

    @IsOptional()
    @IsString()
    clinicalDescription?: string;

    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID('all', { each: true })
    categoryId?: string[];

    @IsOptional()
    @IsBoolean()
    backorder?: boolean;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @IsOptional()
    @IsNumberString()
    actualPrice?: string;

    @IsOptional()
    @IsNumberString()
    offerPrice?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BulkPriceTierDto)
    bulkPriceTiers?: BulkPriceTierDto[];

    @IsOptional()
    @IsString()
    @MaxLength(80)
    sku?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    stockQuantity?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    lowStockAlert?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    // --- product_details table fields ---
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    images?: string[];

    @IsOptional()
    @IsArray()
    @IsEnum(FrontendBadge, { each: true })
    frontendBadges?: FrontendBadge[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    frequentlyBoughtTogether?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    bundleUpsells?: string[];

    // ✅ if provided, must still have at least 1 item
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => ClinicalBenefitDto)
    clinicalBenefits?: ClinicalBenefitDto[];

    // ✅ if provided, must still have at least 1 item
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => TechnicalSpecificationDto)
    technicalSpecifications?: TechnicalSpecificationDto[];

    @IsOptional()
    @IsBoolean()
    quickUpdate?: boolean;

}
