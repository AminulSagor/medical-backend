import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkshopsController } from './workshops.controller';
import { PublicWorkshopsController } from './public-workshops.controller';
import { WorkshopsService } from './workshops.service';
import { Workshop } from './entities/workshop.entity';
import { WorkshopDay } from './entities/workshop-day.entity';
import { WorkshopSegment } from './entities/workshop-segment.entity';
import { WorkshopGroupDiscount } from './entities/workshop-group-discount.entity';
import { WorkshopReservation } from './entities/workshop-reservation.entity';
import { WorkshopAttendee } from './entities/workshop-attendee.entity';
import { WorkshopOrderSummary } from './entities/workshop-order-summary.entity';
import { WorkshopOrderAttendee } from './entities/workshop-order-attendee.entity';
import { WorkshopEnrollment } from './entities/workshop-enrollment.entity';
import { Facility } from '../facilities/entities/facility.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { WorkshopRefund } from './entities/workshop-refund.entity';
import { WorkshopRefundItem } from './entities/workshop-refund-item.entity';
import { PrivateWorkshopsController } from './private-workshops.controller';
import { User } from 'src/users/entities/user.entity';
import { InvoiceService } from 'src/common/services/invoice.service';
import { MailService } from 'src/common/services/mail.service';
import { PaymentTransaction } from 'src/payments/entities/payment-transaction.entity';
import { SubscribersService } from 'src/newsletters/audience/subscribers.service';
import { NewslettersModule } from 'src/newsletters/newsletters.module';

@Module({
  imports: [
    AuthModule,
    UsersModule, // ✅ provides/export UserRepository via TypeOrmModule export
    TypeOrmModule.forFeature([
      Workshop,
      WorkshopDay,
      WorkshopSegment,
      WorkshopGroupDiscount,
      WorkshopReservation,
      WorkshopAttendee,
      WorkshopOrderSummary,
      WorkshopOrderAttendee,
      WorkshopRefund,
      WorkshopRefundItem,
      WorkshopEnrollment,
      Facility,
      Faculty,
      User,
      PaymentTransaction,
    ]),
    NewslettersModule,
  ],
  controllers: [
    WorkshopsController,
    PublicWorkshopsController,
    PrivateWorkshopsController,
  ],
  providers: [WorkshopsService, InvoiceService, MailService],
})
export class WorkshopsModule {}
