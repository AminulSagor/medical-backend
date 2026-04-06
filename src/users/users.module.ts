import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./entities/user.entity";
import { Faculty } from "../faculty/entities/faculty.entity";
import { UsersController } from "./users.controller";
import { UserProfileController } from "./user-profile.controller";
import { UsersService } from "./users.service";


@Module({
  imports: [TypeOrmModule.forFeature([User, Faculty])],
  controllers: [UsersController, UserProfileController],
  providers: [UsersService],
  exports: [TypeOrmModule],
})
export class UsersModule { }
