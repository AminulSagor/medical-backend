import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto, AdminUpdateReviewDto } from './dto/update-review.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

// Public endpoints for reviews
@Controller('public/reviews')
export class PublicReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // Get reviews for a product
  @Get('product/:productId')
  async getProductReviews(
    @Param('productId') productId: string,
    @Query() query: QueryReviewsDto,
  ) {
    return this.reviewsService.findByProduct(productId, query);
  }

  // Get rating summary for a product
  @Get('product/:productId/summary')
  async getProductRatingSummary(@Param('productId') productId: string) {
    return this.reviewsService.getProductRatingSummary(productId);
  }

  // Mark review as helpful (no auth required)
  @Post(':reviewId/helpful')
  async markHelpful(@Param('reviewId') reviewId: string) {
    return this.reviewsService.markHelpful(reviewId);
  }
}

// Authenticated user endpoints
@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // Create a review
  @Post()
  async create(@Request() req: any, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(req.user.sub, dto);
  }

  // Get user's review for a product
  @Get('my-review/:productId')
  async getMyReview(
    @Request() req: any,
    @Param('productId') productId: string,
  ) {
    return this.reviewsService.findUserReview(req.user.sub, productId);
  }

  // Update user's review
  @Patch(':reviewId')
  async update(
    @Request() req: any,
    @Param('reviewId') reviewId: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(req.user.sub, reviewId, dto);
  }

  // Delete user's review
  @Delete(':reviewId')
  async remove(@Request() req: any, @Param('reviewId') reviewId: string) {
    return this.reviewsService.remove(req.user.sub, reviewId);
  }
}

// Admin endpoints
@Controller('admin/reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // Get all reviews with filters
  @Get()
  async findAll(@Query() query: QueryReviewsDto) {
    return this.reviewsService.findAll(query);
  }

  // Update review (change status, etc.)
  @Patch(':reviewId')
  async update(
    @Param('reviewId') reviewId: string,
    @Body() dto: AdminUpdateReviewDto,
  ) {
    return this.reviewsService.adminUpdate(reviewId, dto);
  }

  // Delete any review
  @Delete(':reviewId')
  async remove(@Param('reviewId') reviewId: string) {
    return this.reviewsService.adminRemove(reviewId);
  }
}
