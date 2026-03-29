import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { BlogCategoriesService } from "./blog-categories.service";
import { CreateBlogCategoryDto } from "./dto/create-blog-category.dto";
import { UpdateBlogCategoryDto } from "./dto/update-blog-category.dto";
import { BulkCreateBlogCategoryDto } from "./dto/bulk-create-blog-category.dto";

@Controller("admin/blog-categories")
export class BlogCategoriesController {
    constructor(private readonly service: BlogCategoriesService) { }

    // List all blog categories (with optional ?q= search)
    @Get()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    list(@Query("q") q?: string) {
        return this.service.list(q);
    }

    // Get single blog category
    @Get(":id")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    findOne(@Param("id", ParseUUIDPipe) id: string) {
        return this.service.findOne(id);
    }

    // Create blog category
    @Post()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    create(@Body() dto: CreateBlogCategoryDto) {
        return this.service.create(dto);
    }

    // Bulk create blog categories
    @Post("bulk")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    bulkCreate(@Body() dto: BulkCreateBlogCategoryDto) {
        return this.service.bulkCreate(dto);
    }

    // Update blog category
    @Patch(":id")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    update(
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: UpdateBlogCategoryDto,
    ) {
        return this.service.update(id, dto);
    }

    // Delete blog category
    @Delete(":id")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    remove(@Param("id", ParseUUIDPipe) id: string) {
        return this.service.remove(id);
    }
}
