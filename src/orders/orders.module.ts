import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { PublicOrdersController } from './public-orders.controller';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderTimeline } from './entities/order-timeline.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { PrivateOrderController } from './private-order.controller';
import { PrivateOrderService } from './private-order.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OrderTimeline, Product, User]),
  ],
  controllers: [
    OrdersController,
    PublicOrdersController,
    PrivateOrderController,
  ],
  providers: [OrdersService, PrivateOrderService],
  exports: [OrdersService],
})
export class OrdersModule {}
