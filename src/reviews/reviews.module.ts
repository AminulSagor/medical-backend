import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './entities/review.entity';
import { Product } from '../products/entities/product.entity';
import { ReviewsService } from './reviews.service';
import {
  PublicReviewsController,
  ReviewsController,
  AdminReviewsController,
} from './reviews.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Review, Product])],
  controllers: [
    PublicReviewsController,
    ReviewsController,
    AdminReviewsController,
  ],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
