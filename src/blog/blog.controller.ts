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
import { BlogService } from "./blog.service";
import { CreateBlogPostDto } from "./dto/create-blog-post.dto";
import { UpdateBlogPostDto } from "./dto/update-blog-post.dto";
import { ListBlogPostsQueryDto } from "./dto/list-blog-posts.query.dto";

@Controller("admin/blog")
export class BlogController {
    constructor(private readonly blogService: BlogService) { }

    // ── Create Post ──
    @Post()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    create(@Body() dto: CreateBlogPostDto) {
        return this.blogService.create(dto);
    }

    // ── List Posts ──
    @Get()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    list(@Query() query: ListBlogPostsQueryDto) {
        return this.blogService.findAll(query);
    }

    // ── Get Single Post ──
    @Get(":id")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    findOne(@Param("id", ParseUUIDPipe) id: string) {
        return this.blogService.findOne(id);
    }

    // ── Update Post ──
    @Patch(":id")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    update(
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: UpdateBlogPostDto,
    ) {
        return this.blogService.update(id, dto);
    }

    // ── Delete Post ──
    @Delete(":id")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    remove(@Param("id", ParseUUIDPipe) id: string) {
        return this.blogService.remove(id);
    }
}
