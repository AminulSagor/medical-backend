import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Faculty } from "./entities/faculty.entity";
import { FacultyService } from "./faculty.service";
import { FacultyController } from "./faculty.controller";
import { User } from "../users/entities/user.entity";

@Module({
    imports: [TypeOrmModule.forFeature([Faculty, User])],
    controllers: [FacultyController],
    providers: [FacultyService],
})
export class FacultyModule { }
