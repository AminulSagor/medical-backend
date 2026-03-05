import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from "class-validator";
import { CreateBlogCategoryDto } from "./create-blog-category.dto";

export class BulkCreateBlogCategoryDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => CreateBlogCategoryDto)
    categories: CreateBlogCategoryDto[];
}
