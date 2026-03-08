import { IsArray, IsInt, IsUUID, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class CartItemDto {
    @IsUUID()
    productId: string;

    @IsInt()
    @Min(1)
    quantity: number;
}

export class CartRequestDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CartItemDto)
    items: CartItemDto[];
}
