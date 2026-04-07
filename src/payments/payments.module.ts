import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderTimeline } from '../orders/entities/order-timeline.entity';
import { WorkshopOrderSummary } from '../workshops/entities/workshop-order-summary.entity';
import { Workshop } from '../workshops/entities/workshop.entity';
import { WorkshopReservation } from '../workshops/entities/workshop-reservation.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentTransaction,
      Product,
      User,
      Order,
      OrderTimeline,
      Workshop,
      WorkshopOrderSummary,
      WorkshopReservation,
    ]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
