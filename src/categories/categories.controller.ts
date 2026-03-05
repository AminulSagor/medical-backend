import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { BulkCreateCategoryDto } from "./dto/bulk-create-category.dto";

@Controller("admin/categories")
export class CategoriesController {
    constructor(private readonly service: CategoriesService) { }

    @Get()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    list() {
        return this.service.list();
    }

    @Post()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    create(@Body() dto: CreateCategoryDto) {
        return this.service.create(dto);
    }

    @Post("bulk")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    bulkCreate(@Body() dto: BulkCreateCategoryDto) {
        return this.service.bulkCreate(dto);
    }
}
