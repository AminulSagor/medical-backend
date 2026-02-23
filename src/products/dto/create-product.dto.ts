import { Type } from "class-transformer";
import {
    ArrayNotEmpty,
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
} from "class-validator";
import { IsEnum } from "class-validator";
import { FrontendBadge } from "../entities/product.entity";
import { ArrayMinSize } from "class-validator";

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

export class CreateProductDto {
    @IsString()
    @MaxLength(200)
    name: string;

    @IsString()
    clinicalDescription: string;

    @IsArray()
    @ArrayMinSize(1) // ✅ must contain at least 1 benefit
    @ValidateNested({ each: true })
    @Type(() => ClinicalBenefitDto)
    clinicalBenefits: ClinicalBenefitDto[];

    @IsArray()
    @ArrayMinSize(1) // ✅ must contain at least 1 specification
    @ValidateNested({ each: true })
    @Type(() => TechnicalSpecificationDto)
    technicalSpecifications: TechnicalSpecificationDto[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    images?: string[];

    @IsUUID()
    categoryId: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    frequentlyBoughtTogether?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    bundleUpsells?: string[];

    @IsOptional()
    @IsArray()
    @IsEnum(FrontendBadge, { each: true })
    frontendBadges?: FrontendBadge[];

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

    // ✅ THIS MUST EXIST or whitelist will remove it
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BulkPriceTierDto)
    bulkPriceTiers?: BulkPriceTierDto[];

    @IsString()
    @MaxLength(80)
    sku: string;

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
}
