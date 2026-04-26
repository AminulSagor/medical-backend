import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from 'src/orders/entities/order-item.entity';
import { Order } from 'src/orders/entities/order.entity';
import { User } from 'src/users/entities/user.entity';
import { WorkshopEnrollment } from 'src/workshops/entities/workshop-enrollment.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { WorkshopOrderSummary } from 'src/workshops/entities/workshop-order-summary.entity';
import { Product } from 'src/products/entities/product.entity';
import { Workshop } from 'src/workshops/entities/workshop.entity';
import { WorkshopReservation } from 'src/workshops/entities/workshop-reservation.entity';
import { Category } from 'src/categories/entities/category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      WorkshopEnrollment,
      WorkshopOrderSummary,
      Product,
      Workshop,
      User,
      WorkshopReservation,
      Category,
    ]),
  ],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
