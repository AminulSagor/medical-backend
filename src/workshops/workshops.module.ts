import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkshopsController } from './workshops.controller';
import { WorkshopsService } from './workshops.service';
import { Workshop } from './entities/workshop.entity';
import { WorkshopDay } from './entities/workshop-day.entity';
import { WorkshopSegment } from './entities/workshop-segment.entity';
import { WorkshopGroupDiscount } from './entities/workshop-group-discount.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { WorkshopEnrollment } from './entities/workshop-enrollment.entity';

@Module({
  imports: [
    AuthModule,
    UsersModule, // ✅ provides/export UserRepository via TypeOrmModule export
    TypeOrmModule.forFeature([
      Workshop,
      WorkshopDay,
      WorkshopSegment,
      WorkshopGroupDiscount,
      WorkshopEnrollment,
      Facility,
      Faculty,
    ]),
  ],
  controllers: [WorkshopsController],
  providers: [WorkshopsService],
})
export class WorkshopsModule {}
