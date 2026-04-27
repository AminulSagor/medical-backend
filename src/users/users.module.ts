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
import { PaymentSettingsController } from './payment-settings.controller';
import { PaymentSettingsService } from './payment-settings.service';
import { WorkshopReservation } from 'src/workshops/entities/workshop-reservation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Faculty,
      UserAdminNote,
      Workshop,
      WorkshopEnrollment,
      Order,
      WorkshopReservation,
    ]),
  ],
  controllers: [
    UsersController,
    UserProfileController,
    UserProfileController,
    PaymentSettingsController,
  ],
  providers: [UsersService, ProfilesService, PaymentSettingsService],
  exports: [TypeOrmModule],
})
export class UsersModule {}
