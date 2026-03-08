import { Controller, Get, Param, Query } from "@nestjs/common";
import { BlogService } from "./blog.service";
import { ListPublicBlogsQueryDto } from "./dto/list-public-blogs.query.dto";

@Controller("public/blogs")
export class PublicBlogController {
    constructor(private readonly blogService: BlogService) { }

    // ✅ Get latest published blogs
    @Get()
    async listPublicBlogs(@Query() query: ListPublicBlogsQueryDto) {
        return this.blogService.findAllPublic(query);
    }

    // ✅ Get single blog post details
    @Get(":id")
    async getPublicBlog(@Param("id") id: string) {
        return this.blogService.findOnePublic(id);
    }
}
