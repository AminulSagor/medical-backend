import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from "class-validator";
import { CreateProductTagDto } from "./create-product-tag.dto";

export class BulkCreateProductTagDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => CreateProductTagDto)
    tags: CreateProductTagDto[];
}
