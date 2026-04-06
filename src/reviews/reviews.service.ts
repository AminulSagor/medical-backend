import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review, ReviewStatus } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto, AdminUpdateReviewDto } from './dto/update-review.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { Product } from '../products/entities/product.entity';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewsRepo: Repository<Review>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  // Create a new review
  async create(userId: string, dto: CreateReviewDto): Promise<Review> {
    // Check if product exists
    const product = await this.productsRepo.findOne({
      where: { id: dto.productId, isActive: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check if user already reviewed this product
    const existingReview = await this.reviewsRepo.findOne({
      where: { productId: dto.productId, userId },
    });

    if (existingReview) {
      throw new BadRequestException('You have already reviewed this product');
    }

    const review = this.reviewsRepo.create({
      ...dto,
      userId,
      status: ReviewStatus.APPROVED, // Auto-approve for now
    });

    return this.reviewsRepo.save(review);
  }

  // Get reviews for a product (public)
  async findByProduct(productId: string, query: QueryReviewsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.reviewsRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .where('r.productId = :productId', { productId })
      .andWhere('r.status = :status', { status: ReviewStatus.APPROVED });

    const total = await qb.getCount();
    const reviews = await qb
      .orderBy('r.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    const items = reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      isVerifiedPurchase: r.isVerifiedPurchase,
      helpfulCount: r.helpfulCount,
      createdAt: r.createdAt,
      user: {
        id: r.user.id,
        name: r.user.fullLegalName,
        professionalRole: r.user.professionalRole,
      },
    }));

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get rating summary for a product
  async getProductRatingSummary(productId: string) {
    const result = await this.reviewsRepo
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'averageRating')
      .addSelect('COUNT(r.id)', 'reviewsCount')
      .where('r.productId = :productId', { productId })
      .andWhere('r.status = :status', { status: ReviewStatus.APPROVED })
      .getRawOne();

    // Get rating distribution
    const distribution = await this.reviewsRepo
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(r.id)', 'count')
      .where('r.productId = :productId', { productId })
      .andWhere('r.status = :status', { status: ReviewStatus.APPROVED })
      .groupBy('r.rating')
      .getRawMany();

    const ratingDistribution = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    distribution.forEach((d) => {
      ratingDistribution[d.rating] = parseInt(d.count, 10);
    });

    return {
      averageRating: result.averageRating
        ? parseFloat(result.averageRating).toFixed(1)
        : '0.0',
      reviewsCount: parseInt(result.reviewsCount, 10) || 0,
      ratingDistribution,
    };
  }

  // Get user's review for a product
  async findUserReview(userId: string, productId: string) {
    return this.reviewsRepo.findOne({
      where: { userId, productId },
    });
  }

  // Update user's review
  async update(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.reviewsRepo.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId !== userId) {
      throw new ForbiddenException('You can only edit your own reviews');
    }

    Object.assign(review, dto);
    return this.reviewsRepo.save(review);
  }

  // Delete user's review
  async remove(userId: string, reviewId: string) {
    const review = await this.reviewsRepo.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId !== userId) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    await this.reviewsRepo.remove(review);
    return { message: 'Review deleted successfully' };
  }

  // Mark review as helpful
  async markHelpful(reviewId: string) {
    const review = await this.reviewsRepo.findOne({
      where: { id: reviewId, status: ReviewStatus.APPROVED },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    review.helpfulCount += 1;
    return this.reviewsRepo.save(review);
  }

  // Admin: Get all reviews with filters
  async findAll(query: QueryReviewsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.reviewsRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.product', 'product');

    if (query.productId) {
      qb.andWhere('r.productId = :productId', { productId: query.productId });
    }

    if (query.status) {
      qb.andWhere('r.status = :status', { status: query.status });
    }

    const total = await qb.getCount();
    const reviews = await qb
      .orderBy('r.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    return {
      items: reviews,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Admin: Update review status
  async adminUpdate(reviewId: string, dto: AdminUpdateReviewDto) {
    const review = await this.reviewsRepo.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    Object.assign(review, dto);
    return this.reviewsRepo.save(review);
  }

  // Admin: Delete any review
  async adminRemove(reviewId: string) {
    const review = await this.reviewsRepo.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    await this.reviewsRepo.remove(review);
    return { message: 'Review deleted successfully' };
  }
}
