import { Controller, Get, Param, Query } from '@nestjs/common';
import { BlogService } from './blog.service';
import { ListPublicBlogsQueryDto } from './dto/list-public-blogs.query.dto';
import { ListTrendingBlogsQueryDto } from './dto/list-trending-blogs.query.dto';

@Controller('public/blogs')
export class PublicBlogController {
  constructor(private readonly blogService: BlogService) {}

  // ✅ Get latest published blogs
  @Get()
  async listPublicBlogs(@Query() query: ListPublicBlogsQueryDto) {
    return this.blogService.findAllPublic(query);
  }

  // ✅ Get trending published blogs
  @Get('trending')
  async listTrendingPublicBlogs(@Query() query: ListTrendingBlogsQueryDto) {
    return this.blogService.findTrendingPublic(query);
  }

  // ✅ Get single blog post details
  @Get(':id')
  async getPublicBlog(@Param('id') id: string) {
    return this.blogService.findOnePublic(id);
  }
}
