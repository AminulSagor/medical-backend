import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlogCategoriesService } from '../blog-categories/blog-categories.service';
import { CreateBlogCategoryDto } from '../blog-categories/dto/create-blog-category.dto';
import { BulkCreateBlogCategoryDto } from '../blog-categories/dto/bulk-create-blog-category.dto';

@Controller('admin/categories')
export class CategoriesController {
  constructor(private readonly service: BlogCategoriesService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  list(@Query('q') q?: string) {
    return this.service.list(q);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateBlogCategoryDto) {
    return this.service.create(dto);
  }

  @Post('bulk')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  bulkCreate(@Body() dto: BulkCreateBlogCategoryDto) {
    return this.service.bulkCreate(dto);
  }
}
