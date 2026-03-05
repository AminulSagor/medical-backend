import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, QueryFailedError } from 'typeorm';
import { NewsletterAudienceSegment } from './entities/newsletter-audience-segment.entity';
import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity';
import { NewsletterSubscriberSegmentMembership } from './entities/newsletter-subscriber-segment-membership.entity';
import { MutationSuccessResponseDto } from '../../common/dto/mutation-success-response.dto';
import { ListSegmentsQueryDto } from './dto/list-segments-query.dto';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import { AddSegmentMembersDto } from './dto/add-segment-members.dto';
import { NewsletterAuditService } from '../audit/newsletter-audit.service';
import { NewsletterChannelType } from 'src/common/enums/newsletter-constants.enum';

@Injectable()
export class SegmentsService {
  constructor(
    @InjectRepository(NewsletterAudienceSegment)
    private readonly segmentRepo: Repository<NewsletterAudienceSegment>,
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
    @InjectRepository(NewsletterSubscriberSegmentMembership)
    private readonly membershipRepo: Repository<NewsletterSubscriberSegmentMembership>,
    private readonly auditService: NewsletterAuditService,
  ) {}

  async list(query: ListSegmentsQueryDto): Promise<Record<string, unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.segmentRepo
      .createQueryBuilder('seg')
      .where('seg.channelType = :channelType', {
        channelType: NewsletterChannelType.GENERAL,
      });

    if (query.search?.trim()) {
      qb.andWhere('LOWER(seg.name) LIKE :q', {
        q: `%${query.search.trim().toLowerCase()}%`,
      });
    }

    qb.orderBy('seg.isSystem', 'DESC')
      .addOrderBy('seg.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [segments, total] = await qb.getManyAndCount();

    const segmentIds = segments.map((s) => s.id);
    let memberCountsMap = new Map<string, number>();

    if (segmentIds.length) {
      const rows = await this.membershipRepo
        .createQueryBuilder('m')
        .select('m.segmentId', 'segmentId')
        .addSelect('COUNT(m.id)', 'count')
        .where('m.segmentId IN (:...segmentIds)', { segmentIds })
        .groupBy('m.segmentId')
        .getRawMany<{ segmentId: string; count: string }>();

      memberCountsMap = new Map(
        rows.map((r) => [r.segmentId, Number(r.count)]),
      );
    }

    return {
      items: segments.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        description: s.description,
        isSystem: s.isSystem,
        isActive: s.isActive,
        memberCount: memberCountsMap.get(s.id) ?? 0,
      })),
      meta: { page, limit, total },
    };
  }

  async create(
    adminUserId: string,
    dto: CreateSegmentDto,
  ): Promise<Record<string, unknown>> {
    try {
      const segment = this.segmentRepo.create({
        channelType: NewsletterChannelType.GENERAL,
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        description: dto.description?.trim() || null,
        isSystem: false,
        isActive: dto.isActive ?? true,
        createdByAdminId: adminUserId,
        updatedByAdminId: adminUserId,
      });

      const saved = await this.segmentRepo.save(segment);

      await this.auditService.log({
        entityType: 'SEGMENT',
        entityId: saved.id,
        action: 'CREATE',
        performedByAdminId: adminUserId,
      });

      return {
        message: 'Segment created successfully',
        id: saved.id,
        name: saved.name,
      };
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const code = (error as any)?.driverError?.code;
        if (code === '23505')
          throw new ConflictException('Segment name already exists');
      }
      throw error;
    }
  }

  async update(
    adminUserId: string,
    id: string,
    dto: UpdateSegmentDto,
  ): Promise<Record<string, unknown>> {
    const segment = await this.segmentRepo.findOne({
      where: { id, channelType: NewsletterChannelType.GENERAL },
    });

    if (!segment) throw new NotFoundException('Segment not found');

    if (segment.isSystem && dto.name !== undefined) {
      throw new BadRequestException('System segment name cannot be changed');
    }
    if (segment.isSystem && dto.code !== undefined) {
      throw new BadRequestException('System segment code cannot be changed');
    }

    if (dto.name !== undefined) segment.name = dto.name.trim();
    if (dto.code !== undefined) segment.code = dto.code?.trim() || null;
    if (dto.description !== undefined)
      segment.description = dto.description?.trim() || null;
    if (dto.isActive !== undefined) segment.isActive = dto.isActive;

    segment.updatedByAdminId = adminUserId;

    try {
      const saved = await this.segmentRepo.save(segment);

      await this.auditService.log({
        entityType: 'SEGMENT',
        entityId: saved.id,
        action: 'UPDATE',
        performedByAdminId: adminUserId,
      });

      return {
        message: 'Segment updated successfully',
        id: saved.id,
        name: saved.name,
      };
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const code = (error as any)?.driverError?.code;
        if (code === '23505')
          throw new ConflictException('Segment name already exists');
      }
      throw error;
    }
  }

  async addMembers(
    adminUserId: string,
    segmentId: string,
    dto: AddSegmentMembersDto,
  ): Promise<Record<string, unknown>> {
    const segment = await this.segmentRepo.findOne({
      where: { id: segmentId, channelType: NewsletterChannelType.GENERAL },
    });

    if (!segment) throw new NotFoundException('Segment not found');

    const subscriberIds = [...new Set(dto.subscriberIds)];
    const subscribers = await this.subscriberRepo.findBy({
      id: In(subscriberIds),
    });

    if (subscribers.length !== subscriberIds.length) {
      throw new NotFoundException('One or more subscribers were not found');
    }

    const existing = await this.membershipRepo.find({
      where: { segmentId, subscriberId: In(subscriberIds) },
      select: ['subscriberId'],
    });

    const existingSet = new Set(existing.map((m) => m.subscriberId));
    const toInsertIds = subscriberIds.filter((id) => !existingSet.has(id));

    if (toInsertIds.length) {
      await this.membershipRepo.save(
        toInsertIds.map((subscriberId) =>
          this.membershipRepo.create({
            segmentId,
            subscriberId,
            assignedBy: 'ADMIN',
          }),
        ),
      );
    }

    await this.auditService.log({
      entityType: 'SEGMENT',
      entityId: segment.id,
      action: 'ADD_MEMBERS',
      performedByAdminId: adminUserId,
      meta: { addedCount: toInsertIds.length },
    });

    return {
      message: 'Segment members added successfully',
      id: segment.id,
      addedCount: toInsertIds.length,
    };
  }

  async removeMember(
    adminUserId: string,
    segmentId: string,
    subscriberId: string,
  ): Promise<MutationSuccessResponseDto> {
    const membership = await this.membershipRepo.findOne({
      where: { segmentId, subscriberId },
    });

    if (!membership)
      throw new NotFoundException('Segment membership not found');

    await this.membershipRepo.delete({ id: membership.id });

    await this.auditService.log({
      entityType: 'SEGMENT',
      entityId: segmentId,
      action: 'REMOVE_MEMBER',
      performedByAdminId: adminUserId,
      meta: { subscriberId },
    });

    return {
      message: 'Segment member removed successfully',
      id: segmentId,
      identifier: subscriberId,
    };
  }
}
