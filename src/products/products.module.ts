import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsController } from './products.controller';
import { PublicProductsController } from './public-products.controller';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { ProductDetails } from './entities/product-details.entity';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User } from '../users/entities/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Review } from '../reviews/entities/review.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductDetails, Category, User, Review]),
  ],
  controllers: [ProductsController, PublicProductsController],
  providers: [ProductsService, RolesGuard],
})
export class ProductsModule {}
