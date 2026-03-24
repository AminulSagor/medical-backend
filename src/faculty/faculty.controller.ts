import { Controller, Post, Body, UseGuards, Get, Query } from "@nestjs/common";
import { FacultyService } from "./faculty.service";
import { CreateFacultyDto } from "./dto/create-faculty.dto";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { AuthGuard } from "@nestjs/passport";


@Controller("admin/faculty")
export class FacultyController {
    constructor(private readonly facultyService: FacultyService) { }

    @Post()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    createFaculty(@Body() dto: CreateFacultyDto) {
        return this.facultyService.create(dto);
    }


    @Get()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    getFacultyList(
        @Query("q") q?: string,
        @Query("page") page?: string,
        @Query("limit") limit?: string,
    ) {
        return this.facultyService.list({ q, page, limit });
    }
}
