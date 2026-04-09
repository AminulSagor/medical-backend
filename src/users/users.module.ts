import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { UsersController } from './users.controller';
import { UserProfileController } from './user-profile.controller';
import { UsersService } from './users.service';
import { UserAdminNote } from './entities/user-admin-note.entity';
import { Workshop } from 'src/workshops/entities/workshop.entity';
import { WorkshopEnrollment } from 'src/workshops/entities/workshop-enrollment.entity';
import { ProfilesService } from './profiles.service';
import { Order } from 'src/orders/entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Faculty,
      UserAdminNote,
      Workshop,
      WorkshopEnrollment,
      Order,
    ]),
  ],
  controllers: [UsersController, UserProfileController, UserProfileController],
  providers: [UsersService, ProfilesService],
  exports: [TypeOrmModule],
})
export class UsersModule {}
