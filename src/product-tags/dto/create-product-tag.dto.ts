import { IsString, MaxLength } from "class-validator";

export class CreateProductTagDto {
    @IsString()
    @MaxLength(100)
    name: string;
}
