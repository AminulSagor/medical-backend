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
import { ExpertReview } from './entities/expert-review.entity';
import { ExpertReviewsController } from './expert-reviews.controller';
import { ExpertReviewsService } from './expert-reviews.service';

@Module({
  imports: [TypeOrmModule.forFeature([Review, Product, ExpertReview])],
  controllers: [
    PublicReviewsController,
    ReviewsController,
    AdminReviewsController,
    ExpertReviewsController,
  ],
  providers: [ReviewsService, ExpertReviewsService],
  exports: [ReviewsService, ExpertReviewsService],
})
export class ReviewsModule {}
