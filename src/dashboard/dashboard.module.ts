import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from 'src/orders/entities/order.entity';
import { Product } from 'src/products/entities/product.entity';
import { WorkshopEnrollment } from 'src/workshops/entities/workshop-enrollment.entity';
import { WorkshopOrderSummary } from 'src/workshops/entities/workshop-order-summary.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      Product,
      WorkshopEnrollment,
      WorkshopOrderSummary,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
