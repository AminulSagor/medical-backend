import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateExpertReviewDto } from './dto/create-expert-review.dto';
import { UpdateExpertReviewDto } from './dto/update-expert-review.dto';
import { ExpertReview } from './entities/expert-review.entity';

@Injectable()
export class ExpertReviewsService {
  constructor(
    @InjectRepository(ExpertReview)
    private readonly expertReviewRepository: Repository<ExpertReview>,
  ) {}

  async create(createExpertReviewDto: CreateExpertReviewDto) {
    const expertReview = this.expertReviewRepository.create({
      rating: createExpertReviewDto.rating,
      reviewMessage: createExpertReviewDto.reviewMessage,
      reviewerName: createExpertReviewDto.reviewerName,
      reviewerProfileImg: createExpertReviewDto.reviewerProfileImg ?? null,
      reviewerDesignation: createExpertReviewDto.reviewerDesignation,
    });

    const savedExpertReview =
      await this.expertReviewRepository.save(expertReview);

    return this.mapReviewResponse(savedExpertReview);
  }

  async findAllPublic(page = 1, limit = 10) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (safePage - 1) * safeLimit;

    const [expertReviews, total] =
      await this.expertReviewRepository.findAndCount({
        where: { isActive: true },
        order: { createdAt: 'DESC' },
        skip,
        take: safeLimit,
      });

    return {
      data: expertReviews.map((expertReview) =>
        this.mapReviewResponse(expertReview),
      ),
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async getByReviewId(id: string) {
    const expertReview = await this.expertReviewRepository.findOne({
      where: { id, isActive: true },
    });

    if (!expertReview) {
      throw new NotFoundException('Expert review not found');
    }

    return this.mapReviewResponse(expertReview);
  }

  private mapReviewResponse(expertReview: ExpertReview) {
    return {
      id: expertReview.id,
      rating: expertReview.rating,
      reviewMessage: expertReview.reviewMessage,
      isActive: expertReview.isActive,
      createdAt: expertReview.createdAt,
      updatedAt: expertReview.updatedAt,
      reviewByInfo: {
        name: expertReview.reviewerName,
        profileImg: expertReview.reviewerProfileImg,
        designation: expertReview.reviewerDesignation,
      },
    };
  }

  async findOne(id: string) {
    const expertReview = await this.expertReviewRepository.findOne({
      where: { id },
    });

    if (!expertReview) {
      throw new NotFoundException('Expert review not found');
    }

    return this.mapReviewResponse(expertReview);
  }

  async update(id: string, updateExpertReviewDto: UpdateExpertReviewDto) {
    const expertReview = await this.expertReviewRepository.findOne({
      where: { id },
    });

    if (!expertReview) {
      throw new NotFoundException('Expert review not found');
    }

    Object.assign(expertReview, {
      ...(updateExpertReviewDto.rating !== undefined && {
        rating: updateExpertReviewDto.rating,
      }),
      ...(updateExpertReviewDto.reviewMessage !== undefined && {
        reviewMessage: updateExpertReviewDto.reviewMessage,
      }),
      ...(updateExpertReviewDto.reviewerName !== undefined && {
        reviewerName: updateExpertReviewDto.reviewerName,
      }),
      ...(updateExpertReviewDto.reviewerProfileImg !== undefined && {
        reviewerProfileImg: updateExpertReviewDto.reviewerProfileImg,
      }),
      ...(updateExpertReviewDto.reviewerDesignation !== undefined && {
        reviewerDesignation: updateExpertReviewDto.reviewerDesignation,
      }),
    });

    const updatedExpertReview =
      await this.expertReviewRepository.save(expertReview);

    return this.mapReviewResponse(updatedExpertReview);
  }

  async remove(id: string) {
    const expertReview = await this.expertReviewRepository.findOne({
      where: { id },
    });

    if (!expertReview) {
      throw new NotFoundException('Expert review not found');
    }

    await this.expertReviewRepository.remove(expertReview);

    return {
      message: 'Expert review deleted successfully',
    };
  }

  async toggleActive(id: string, isActive: boolean) {
    const expertReview = await this.expertReviewRepository.findOne({
      where: { id },
    });

    if (!expertReview) {
      throw new NotFoundException('Expert review not found');
    }

    expertReview.isActive = isActive;

    const updatedExpertReview =
      await this.expertReviewRepository.save(expertReview);

    return this.mapReviewResponse(updatedExpertReview);
  }
}
