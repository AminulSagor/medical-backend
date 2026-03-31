import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ProductTagsService } from "./product-tags.service";
import { CreateProductTagDto } from "./dto/create-product-tag.dto";
import { BulkCreateProductTagDto } from "./dto/bulk-create-product-tag.dto";

@Controller("admin/product-tags")
export class ProductTagsController {
    constructor(private readonly productTagsService: ProductTagsService) { }

    @Get()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    list(@Query("q") q?: string) {
        return this.productTagsService.list(q);
    }

    @Post()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    create(@Body() dto: CreateProductTagDto) {
        return this.productTagsService.create(dto);
    }

    @Post("bulk")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    bulkCreate(@Body() dto: BulkCreateProductTagDto) {
        return this.productTagsService.bulkCreate(dto);
    }
}
