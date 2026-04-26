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
import { ProductOrderSummary } from './entities/product-order-summary.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { CartModule } from 'src/cart/cart.module';
import { InvoiceService } from 'src/common/services/invoice.service';
import { MailService } from 'src/common/services/mail.service';
import { SubscribersService } from 'src/newsletters/audience/subscribers.service';
import { NewslettersModule } from 'src/newsletters/newsletters.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentTransaction,
      ProductOrderSummary,
      Product,
      User,
      Order,
      OrderTimeline,
      Workshop,
      WorkshopOrderSummary,
      WorkshopReservation,
    ]),
    CartModule,
    NewslettersModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, InvoiceService, MailService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
