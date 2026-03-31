import { Body, Controller, Get, Post, Patch, Param, Query, UseGuards } from "@nestjs/common";
import { ProductsService } from "./products.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthGuard } from "@nestjs/passport";
import { GetProductsQueryDto } from "./dto/get-products.query.dto";
import { UpdateProductDto } from "./dto/update-product.dto";


@Controller("admin/products")
export class ProductsController {
    constructor(private readonly productsService: ProductsService) { }

    // ✅ Only admin can add
    @Post()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    async create(@Body() dto: CreateProductDto) {
        return this.productsService.create(dto);
    }

    // ✅ Search products (for frequently bought together)
    @Get("search")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    search(@Query("q") q: string) {
        return this.productsService.searchProducts(q);
    }

    @Get()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    list(@Query() query: GetProductsQueryDto) {
        return this.productsService.findAll(query);
    }

    // ✅ Get single product by ID (for edit mode)
    @Get(":id")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    getOne(@Param("id") id: string) {
        return this.productsService.findOneAdmin(id);
    }

    @Patch(":id")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    update(@Param("id") id: string, @Body() dto: UpdateProductDto) {
        return this.productsService.update(id, dto);
    }

}
