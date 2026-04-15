import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { NewsletterBroadcast } from '../broadcasts/entities/newsletter-broadcast.entity';
import { NewsletterBroadcastCustomContent } from '../broadcasts/entities/newsletter-broadcast-custom-content.entity';
import { NewsletterBroadcastAttachment } from '../broadcasts/entities/newsletter-broadcast-attachment.entity';

import { NewsletterSubscriber } from '../audience/entities/newsletter-subscriber.entity';

import {
  Workshop,
  WorkshopStatus,
} from '../../workshops/entities/workshop.entity';
import { WorkshopEnrollment } from '../../workshops/entities/workshop-enrollment.entity';
import { User } from '../../users/entities/user.entity';

import { NewsletterCourseAnnouncement } from './entities/newsletter-course-announcement.entity';
import { NewsletterCourseAnnouncementRecipient } from './entities/newsletter-course-announcement-recipient.entity';

import { ListCohortsQueryDto } from './dto/list-cohorts-query.dto';
import { CreateCourseAnnouncementDto } from './dto/create-course-announcement.dto';
import { UpdateCourseAnnouncementDto } from './dto/update-course-announcement.dto';
import { ListCourseRecipientsQueryDto } from './dto/list-recipients-query.dto';
import { SetCourseRecipientsDto } from './dto/set-recipients.dto';

import {
  NewsletterBroadcastStatus,
  NewsletterChannelType,
  NewsletterContentType,
  CourseAnnouncementPriority,
  CourseAnnouncementRecipientMode,
} from '../../common/enums/newsletter-constants.enum';
import { AddCourseAnnouncementAttachmentDto } from './dto/add-course-announcement-attachment.dto';
import { ToggleRecipientDto } from './dto/toggle-recipient.dto';
import {
  ReservationStatus,
  WorkshopReservation,
} from 'src/workshops/entities/workshop-reservation.entity';

@Injectable()
export class CourseAnnouncementsService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(Workshop)
    private readonly workshopRepo: Repository<Workshop>,
    @InjectRepository(WorkshopEnrollment)
    private readonly enrollmentRepo: Repository<WorkshopEnrollment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(NewsletterBroadcast)
    private readonly broadcastRepo: Repository<NewsletterBroadcast>,
    @InjectRepository(NewsletterBroadcastCustomContent)
    private readonly customContentRepo: Repository<NewsletterBroadcastCustomContent>,
    @InjectRepository(NewsletterBroadcastAttachment)
    private readonly attachmentRepo: Repository<NewsletterBroadcastAttachment>,
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
    @InjectRepository(WorkshopReservation)
    private readonly reservationsRepo: Repository<WorkshopReservation>,
    @InjectRepository(NewsletterCourseAnnouncement)
    private readonly courseMetaRepo: Repository<NewsletterCourseAnnouncement>,
    @InjectRepository(NewsletterCourseAnnouncementRecipient)
    private readonly courseRecipientRepo: Repository<NewsletterCourseAnnouncementRecipient>,
  ) {}

  async getDashboard(): Promise<Record<string, unknown>> {
    const [activeEnrollments, pendingBroadcasts, avgSizeRow] =
      await Promise.all([
        this.enrollmentRepo.count({ where: { isActive: true } }),
        this.broadcastRepo.count({
          where: {
            channelType: NewsletterChannelType.COURSE_ANNOUNCEMENT,
            status: In([
              NewsletterBroadcastStatus.DRAFT,
              NewsletterBroadcastStatus.READY,
            ]),
          },
        }),
        this.enrollmentRepo
          .createQueryBuilder('e')
          .select('AVG(t.cnt)', 'avg')
          .from(
            (qb) =>
              qb
                .select('e.workshopId', 'workshopId')
                .addSelect('COUNT(*)', 'cnt')
                .from(WorkshopEnrollment, 'e')
                .where('e.isActive = true')
                .groupBy('e.workshopId'),
            't',
          )
          .getRawOne<{ avg: string | null }>(),
      ]);

    return {
      cards: {
        totalActiveStudents: { value: activeEnrollments },
        scheduledBroadcasts: { pending: pendingBroadcasts },
        averageCohortSize: { value: Math.round(Number(avgSizeRow?.avg ?? 0)) },
      },
    };
  }

  async listCohorts(
    query: ListCohortsQueryDto,
  ): Promise<Record<string, unknown>> {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const tab = String(query.tab ?? 'all')
      .trim()
      .toLowerCase();
    const now = new Date();

    const qb = this.workshopRepo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.days', 'd')
      .leftJoinAndSelect('d.segments', 's')
      .orderBy('w.createdAt', 'DESC')
      .addOrderBy('d.dayNumber', 'ASC')
      .addOrderBy('s.segmentNumber', 'ASC');

    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere('LOWER(w.title) LIKE :s', { s });
    }

    // draft must be excluded
    if (tab === 'cancelled') {
      qb.andWhere('w.status = :cancelledStatus', {
        cancelledStatus: 'cancelled',
      });
    } else if (tab === 'upcoming' || tab === 'completed') {
      qb.andWhere('w.status = :publishedStatus', {
        publishedStatus: 'published',
      });
    } else {
      // all = published + cancelled, avoid draft
      qb.andWhere('w.status != :draftStatus', {
        draftStatus: 'draft',
      });
    }

    if (query.category?.trim()) {
      qb.andWhere('w.deliveryMode = :deliveryMode', {
        deliveryMode: query.category.trim().toLowerCase(),
      });
    }

    const workshops = await qb.getMany();

    const workshopIds = workshops.map((w) => w.id);

    const counts = workshopIds.length
      ? await this.enrollmentRepo
          .createQueryBuilder('e')
          .select('e.workshopId', 'workshopId')
          .addSelect('COUNT(*)', 'cnt')
          .where('e.isActive = true')
          .andWhere('e.workshopId IN (:...ids)', { ids: workshopIds })
          .groupBy('e.workshopId')
          .getRawMany<{ workshopId: string; cnt: string }>()
      : [];

    const countMap = new Map(counts.map((r) => [r.workshopId, Number(r.cnt)]));

    const sortDays = (days: any[] = []) =>
      [...days].sort((a, b) => {
        if ((a.dayNumber ?? 0) !== (b.dayNumber ?? 0)) {
          return (a.dayNumber ?? 0) - (b.dayNumber ?? 0);
        }

        return String(a.date).localeCompare(String(b.date));
      });

    const buildDateTime = (
      date: string | null | undefined,
      time: string | null | undefined,
      fallbackTime: string,
    ) => {
      if (!date) return null;

      const value = new Date(`${date}T${time || fallbackTime}`);
      return Number.isNaN(value.getTime()) ? null : value;
    };

    const getWorkshopStartAt = (days: any[] = []) => {
      const orderedDays = sortDays(days);
      const firstDay = orderedDays[0];
      if (!firstDay) return null;

      const firstStartTime =
        [...(firstDay.segments ?? [])]
          .map((segment: any) => segment.startTime)
          .filter(Boolean)
          .sort()[0] ?? '00:00:00';

      return buildDateTime(firstDay.date, firstStartTime, '00:00:00');
    };

    const getWorkshopEndAt = (days: any[] = []) => {
      const orderedDays = sortDays(days);
      const lastDay = orderedDays[orderedDays.length - 1];
      if (!lastDay) return null;

      const sortedEndTimes = [...(lastDay.segments ?? [])]
        .map((segment: any) => segment.endTime)
        .filter(Boolean)
        .sort();

      const lastEndTime =
        sortedEndTimes[sortedEndTimes.length - 1] ?? '23:59:59';

      return buildDateTime(lastDay.date, lastEndTime, '23:59:59');
    };

    const rows = workshops
      .map((w: any) => {
        const startAt = getWorkshopStartAt(w.days ?? []);
        const endAt = getWorkshopEndAt(w.days ?? []);
        const enrolledCount = countMap.get(w.id) ?? 0;
        const capacity = Number(w.capacity ?? 0);

        let cohortStatus: 'upcoming' | 'completed' | 'cancelled';

        if (String(w.status).toLowerCase() === 'cancelled') {
          cohortStatus = 'cancelled';
        } else if (endAt && endAt.getTime() < now.getTime()) {
          // all sessions finished
          cohortStatus = 'completed';
        } else {
          // published and not finished yet = upcoming
          // this also keeps ongoing workshops inside upcoming
          cohortStatus = 'upcoming';
        }

        const seatStatus =
          capacity > 0 && enrolledCount >= capacity ? 'FULLY_BOOKED' : 'OPEN';

        return {
          id: w.id,
          title: w.title,
          startDate: startAt,
          status: cohortStatus,
          seatStatus,
          enrolledCount,
          capacity,
        };
      })
      .filter((row) => {
        if (tab === 'all') return true;
        return row.status === tab;
      });

    const total = rows.length;
    const startIndex = (page - 1) * limit;
    const items = rows.slice(startIndex, startIndex + limit);

    return {
      items,
      meta: { page, limit, total },
    };
  }

  async upsertDraft(
    adminUserId: string,
    workshopId: string,
  ): Promise<Record<string, unknown>> {
    const workshop = await this.workshopRepo.findOne({
      where: { id: workshopId },
      relations: ['days'],
    });
    if (!workshop) throw new NotFoundException('Cohort not found');

    const existing = await this.courseMetaRepo.findOne({
      where: { workshopId },
      relations: ['broadcast'],
    });

    if (
      existing?.broadcast &&
      [
        NewsletterBroadcastStatus.DRAFT,
        NewsletterBroadcastStatus.READY,
      ].includes(existing.broadcast.status)
    ) {
      return {
        message: 'Draft already exists',
        id: existing.broadcastId,
        subjectLine: existing.broadcast.subjectLine,
      };
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const b = manager.create(NewsletterBroadcast, {
        channelType: NewsletterChannelType.COURSE_ANNOUNCEMENT,
        contentType: NewsletterContentType.CUSTOM_MESSAGE,
        status: NewsletterBroadcastStatus.DRAFT,
        subjectLine: 'Course Announcement',
        preheaderText: null,
        internalName: null,
        estimatedRecipientsCount: 0,
        sentRecipientsCount: 0,
        openedRecipientsCount: 0,
        openRatePercent: '0',
        createdByAdminId: adminUserId,
        updatedByAdminId: adminUserId,
      });

      const savedBroadcast = await manager.save(NewsletterBroadcast, b);

      await manager.save(
        NewsletterBroadcastCustomContent,
        manager.create(NewsletterBroadcastCustomContent, {
          broadcastId: savedBroadcast.id,
          messageBodyHtml: '<p></p>',
          messageBodyText: null,
        }),
      );

      await manager.save(
        NewsletterCourseAnnouncement,
        manager.create(NewsletterCourseAnnouncement, {
          broadcastId: savedBroadcast.id,
          workshopId,
          priority: CourseAnnouncementPriority.GENERAL_UPDATE,
          recipientMode: CourseAnnouncementRecipientMode.ALL,
          pushToStudentPanel: false,
        }),
      );

      return savedBroadcast;
    });

    return {
      message: 'Draft created successfully',
      id: created.id,
      subjectLine: created.subjectLine,
    };
  }

  async getDetail(broadcastId: string): Promise<Record<string, unknown>> {
    const b = await this.broadcastRepo.findOne({
      where: {
        id: broadcastId,
        channelType: NewsletterChannelType.COURSE_ANNOUNCEMENT,
      },
      relations: ['customContent', 'attachments'],
    });
    if (!b) throw new NotFoundException('Announcement not found');

    const meta = await this.courseMetaRepo.findOne({ where: { broadcastId } });
    if (!meta) throw new NotFoundException('Announcement meta not found');

    const workshop = await this.workshopRepo.findOne({
      where: { id: meta.workshopId },
      relations: ['days'],
    });
    if (!workshop) throw new NotFoundException('Cohort not found');

    // ✅ FIXED: Calculate Total Cohort Recipients from BOTH tables
    const [enrollments, reservations] = await Promise.all([
      this.enrollmentRepo.find({
        where: { workshopId: meta.workshopId, isActive: true },
        select: ['userId'],
      }),
      this.reservationsRepo.find({
        where: {
          workshopId: meta.workshopId,
          status: ReservationStatus.CONFIRMED,
        },
        select: ['userId'],
      }),
    ]);

    const totalCohortRecipients = new Set([
      ...enrollments.map((e) => e.userId),
      ...reservations.map((r) => r.userId),
    ]).size;

    const selectedCount =
      meta.recipientMode === CourseAnnouncementRecipientMode.ALL
        ? totalCohortRecipients
        : await this.courseRecipientRepo.count({ where: { broadcastId } });

    const preview = await this.listRecipients(broadcastId, {
      page: 1,
      limit: 6,
    });

    const dayDates = (workshop.days ?? [])
      .map((x: any) => new Date(x.date))
      .filter((d: Date) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    const cohortDate = dayDates[0] ?? null;

    return {
      header: {
        title: 'Broadcast Announcement',
        cohort: { id: workshop.id, name: (workshop as any).title },
        scheduledDate: cohortDate,
        systemReady: this.isSystemReady(b, meta, selectedCount),
      },
      form: {
        priority: meta.priority,
        subjectLine: b.subjectLine,
        messageBodyHtml: b.customContent?.messageBodyHtml ?? '',
        messageBodyText: b.customContent?.messageBodyText ?? null,
        pushToStudentPanel: meta.pushToStudentPanel,
      },
      recipients: {
        recipientMode: meta.recipientMode,
        totalInCohort: totalCohortRecipients,
        selectedCount,
        preview: (preview.items as any[]).slice(0, 6),
      },
      attachments: (b.attachments ?? [])
        .sort((a, c) => a.sortOrder - c.sortOrder)
        .map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          fileSizeBytes: Number(a.fileSizeBytes),
          fileKey: a.fileKey,
        })),
      status: b.status,
      actionsAllowed: {
        send:
          b.status === NewsletterBroadcastStatus.DRAFT ||
          b.status === NewsletterBroadcastStatus.READY,
        edit: b.status !== NewsletterBroadcastStatus.SENT,
      },
    };
  }

  async updateDraft(
    adminUserId: string,
    broadcastId: string,
    dto: UpdateCourseAnnouncementDto,
  ): Promise<Record<string, unknown>> {
    const b = await this.broadcastRepo.findOne({
      where: {
        id: broadcastId,
        channelType: NewsletterChannelType.COURSE_ANNOUNCEMENT,
      },
      relations: ['customContent'],
    });
    if (!b) throw new NotFoundException('Announcement not found');
    if (b.status === NewsletterBroadcastStatus.SENT) {
      throw new UnprocessableEntityException(
        'Sent announcements cannot be edited',
      );
    }

    const meta = await this.courseMetaRepo.findOne({ where: { broadcastId } });
    if (!meta) throw new NotFoundException('Announcement meta not found');

    const saved = await this.dataSource.transaction(async (manager) => {
      if (dto.subjectLine !== undefined) b.subjectLine = dto.subjectLine.trim();
      if (dto.messageBodyHtml !== undefined) {
        if (!dto.messageBodyHtml.trim())
          throw new BadRequestException('messageBodyHtml cannot be empty');
        const cc =
          b.customContent ??
          manager.create(NewsletterBroadcastCustomContent, {
            broadcastId: b.id,
          });
        cc.messageBodyHtml = dto.messageBodyHtml.trim();
        cc.messageBodyText = dto.messageBodyText?.trim() || null;
        await manager.save(NewsletterBroadcastCustomContent, cc);
      }

      if (dto.priority !== undefined) meta.priority = dto.priority;
      if (dto.pushToStudentPanel !== undefined)
        meta.pushToStudentPanel = dto.pushToStudentPanel;

      if (dto.recipientMode !== undefined)
        meta.recipientMode = dto.recipientMode;
      await manager.save(NewsletterCourseAnnouncement, meta);

      if (dto.recipientMode !== undefined || dto.recipientIds !== undefined) {
        const mode = dto.recipientMode ?? meta.recipientMode;
        const ids = dto.recipientIds ?? [];
        const count = await this.applyRecipients(
          manager,
          b.id,
          meta.workshopId,
          mode,
          ids,
        );
        b.estimatedRecipientsCount = count;
      }

      b.updatedByAdminId = adminUserId;
      await manager.save(NewsletterBroadcast, b);

      return b;
    });

    return {
      message: 'Announcement updated successfully',
      id: saved.id,
      subjectLine: saved.subjectLine,
    };
  }

  async listRecipients(
    broadcastId: string,
    query: ListCourseRecipientsQueryDto,
  ): Promise<Record<string, unknown>> {
    const meta = await this.courseMetaRepo.findOne({ where: { broadcastId } });
    if (!meta) throw new NotFoundException('Announcement meta not found');

    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    // 1. Fetch User IDs from BOTH Enrollments and Reservations concurrently
    const [enrollments, reservations] = await Promise.all([
      this.enrollmentRepo.find({
        where: { workshopId: meta.workshopId, isActive: true },
        select: ['userId'],
      }),
      this.reservationsRepo.find({
        where: {
          workshopId: meta.workshopId,
          status: ReservationStatus.CONFIRMED,
        },
        select: ['userId'],
      }),
    ]);

    // 2. Merge and Remove Duplicate User IDs using a Set
    const uniqueUserIds = [
      ...new Set([
        ...enrollments.map((e) => e.userId),
        ...reservations.map((r) => r.userId),
      ]),
    ];

    // Early return if nobody is enrolled/reserved yet
    if (uniqueUserIds.length === 0) {
      return {
        recipientMode: meta.recipientMode,
        items: [],
        meta: { page, limit, total: 0 },
      };
    }

    // 3. Query the User table directly for those unique IDs
    const userQb = this.userRepo
      .createQueryBuilder('u')
      .whereInIds(uniqueUserIds);

    // Apply Search Filter
    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      userQb.andWhere(
        '(LOWER(u.fullLegalName) LIKE :s OR LOWER(u.medicalEmail) LIKE :s)',
        { s },
      );
    }

    // Pagination and Selection
    userQb
      .select([
        'u.id as id',
        'u.fullLegalName as name',
        'u.medicalEmail as email',
        'u.professionalRole as role',
      ])
      .orderBy('u.fullLegalName', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit);

    // Execute query and count
    const [raw, total] = await Promise.all([
      userQb.getRawMany<{
        id: string;
        name: string;
        email: string;
        role: string;
      }>(),
      userQb
        .clone()
        .offset(undefined as any)
        .limit(undefined as any)
        .getCount(),
    ]);

    // 4. Handle "Selected" vs "All" mode
    let selectedSet = new Set<string>();
    if (meta.recipientMode === CourseAnnouncementRecipientMode.SELECTED) {
      const rows = await this.courseRecipientRepo.find({
        where: { broadcastId },
        select: ['userId'],
      });
      selectedSet = new Set(rows.map((r) => r.userId));
    }

    // Map final output
    const items = raw.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      selected:
        meta.recipientMode === CourseAnnouncementRecipientMode.ALL
          ? true
          : selectedSet.has(r.id),
    }));

    return {
      recipientMode: meta.recipientMode,
      items,
      meta: { page, limit, total },
    };
  }

  async setRecipients(
    adminUserId: string,
    broadcastId: string,
    dto: SetCourseRecipientsDto,
  ): Promise<Record<string, unknown>> {
    const meta = await this.courseMetaRepo.findOne({ where: { broadcastId } });
    if (!meta) throw new NotFoundException('Announcement meta not found');

    const b = await this.broadcastRepo.findOne({
      where: {
        id: broadcastId,
        channelType: NewsletterChannelType.COURSE_ANNOUNCEMENT,
      },
    });
    if (!b) throw new NotFoundException('Announcement not found');
    if (b.status === NewsletterBroadcastStatus.SENT)
      throw new UnprocessableEntityException(
        'Sent announcements cannot be edited',
      );

    const count = await this.dataSource.transaction(async (manager) => {
      meta.recipientMode = dto.recipientMode;
      await manager.save(NewsletterCourseAnnouncement, meta);

      const recipientsCount = await this.applyRecipients(
        manager,
        broadcastId,
        meta.workshopId,
        dto.recipientMode,
        dto.recipientIds ?? [],
      );

      b.estimatedRecipientsCount = recipientsCount;
      b.updatedByAdminId = adminUserId;
      await manager.save(NewsletterBroadcast, b);

      return recipientsCount;
    });

    return {
      message: 'Recipients updated successfully',
      id: broadcastId,
      selectedCount: count,
    };
  }

  async send(
    adminUserId: string,
    broadcastId: string,
  ): Promise<Record<string, unknown>> {
    const b = await this.broadcastRepo.findOne({
      where: {
        id: broadcastId,
        channelType: NewsletterChannelType.COURSE_ANNOUNCEMENT,
      },
      relations: ['customContent'],
    });
    if (!b) throw new NotFoundException('Announcement not found');
    if (b.status === NewsletterBroadcastStatus.SENT)
      throw new ConflictException('Announcement already sent');

    const meta = await this.courseMetaRepo.findOne({ where: { broadcastId } });
    if (!meta) throw new NotFoundException('Announcement meta not found');

    if (!b.subjectLine?.trim())
      throw new UnprocessableEntityException('subjectLine is required');
    if (!b.customContent?.messageBodyHtml?.trim())
      throw new UnprocessableEntityException('messageBodyHtml is required');

    const userIds = await this.resolveRecipientUserIds(
      broadcastId,
      meta.workshopId,
      meta.recipientMode,
    );
    if (!userIds.length)
      throw new UnprocessableEntityException('No recipients selected');

    // For MVP: mark SENT + store counts. (Delivery job/provider can be wired later)
    b.status = NewsletterBroadcastStatus.SENT;
    b.sentAt = new Date();
    b.sentRecipientsCount = userIds.length;
    b.updatedByAdminId = adminUserId;

    await this.broadcastRepo.save(b);

    return {
      message: 'Course announcement sent successfully',
      id: b.id,
      subjectLine: b.subjectLine,
      recipientsCount: userIds.length,
    };
  }

  async listTransmissions(query: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<Record<string, unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.broadcastRepo
      .createQueryBuilder('b')
      .where('b.channelType = :ct', {
        ct: NewsletterChannelType.COURSE_ANNOUNCEMENT,
      })
      .andWhere('b.status = :st', { st: NewsletterBroadcastStatus.SENT });

    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere('LOWER(b.subjectLine) LIKE :s', { s });
    }

    qb.orderBy('b.sentAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((b) => ({
        id: b.id,
        subjectLine: b.subjectLine,
        sentAt: b.sentAt,
        recipients: b.sentRecipientsCount ?? 0,
        openRatePercent: Number(b.openRatePercent || 0),
      })),
      meta: { page, limit, total },
    };
  }

  private isSystemReady(
    b: NewsletterBroadcast,
    meta: NewsletterCourseAnnouncement,
    selectedCount: number,
  ): boolean {
    if (!b.subjectLine?.trim()) return false;
    if (!b.customContent?.messageBodyHtml?.trim()) return false;
    if (!meta.priority) return false;
    if (selectedCount < 1) return false;
    return true;
  }

  private async resolveRecipientUserIds(
    broadcastId: string,
    workshopId: string,
    mode: CourseAnnouncementRecipientMode,
  ): Promise<string[]> {
    if (mode === CourseAnnouncementRecipientMode.ALL) {
      const rows = await this.enrollmentRepo.find({
        where: { workshopId, isActive: true },
        select: ['userId'],
      });
      return rows.map((r) => r.userId);
    }

    const selected = await this.courseRecipientRepo.find({
      where: { broadcastId },
      select: ['userId'],
    });
    return selected.map((r) => r.userId);
  }

  private async applyRecipients(
    manager: EntityManager,
    broadcastId: string,
    workshopId: string,
    mode: CourseAnnouncementRecipientMode,
    providedIds: string[],
  ): Promise<number> {
    // 1. Clear existing recipients for this broadcast (FIXED ENTITY NAME)
    await manager.delete(NewsletterCourseAnnouncementRecipient, {
      broadcastId,
    });

    // 2. Fetch all valid User IDs from BOTH Enrollments and Reservations
    const [enrollments, reservations] = await Promise.all([
      manager.find(WorkshopEnrollment, {
        where: { workshopId, isActive: true },
        select: ['userId'],
      }),
      manager.find(WorkshopReservation, {
        where: { workshopId, status: ReservationStatus.CONFIRMED },
        select: ['userId'],
      }),
    ]);

    // Create a Set of all valid, unique user IDs for this workshop
    const validUserIds = new Set([
      ...enrollments.map((e) => e.userId),
      ...reservations.map((r) => r.userId),
    ]);

    // 3. Handle "ALL" mode
    if (mode === CourseAnnouncementRecipientMode.ALL) {
      if (validUserIds.size === 0) return 0;

      // Insert all valid users into the recipients table (FIXED ENTITY NAME)
      const entities = Array.from(validUserIds).map((userId) =>
        manager.create(NewsletterCourseAnnouncementRecipient, {
          broadcastId,
          userId,
        }),
      );
      await manager.save(NewsletterCourseAnnouncementRecipient, entities);
      return validUserIds.size;
    }

    // 4. Handle "SELECTED" mode
    if (mode === CourseAnnouncementRecipientMode.SELECTED) {
      if (!providedIds || providedIds.length === 0) {
        return 0;
      }

      // Verify that EVERY provided ID actually belongs to the workshop
      for (const id of providedIds) {
        if (!validUserIds.has(id)) {
          throw new BadRequestException(
            'One or more recipients are not enrolled in this cohort',
          );
        }
      }

      // If all are valid, insert them (FIXED ENTITY NAME)
      const entities = providedIds.map((userId) =>
        manager.create(NewsletterCourseAnnouncementRecipient, {
          broadcastId,
          userId,
        }),
      );
      await manager.save(NewsletterCourseAnnouncementRecipient, entities);
      return providedIds.length;
    }

    return 0;
  }

  async toggleRecipient(
    adminUserId: string,
    broadcastId: string,
    userId: string,
    dto: ToggleRecipientDto,
  ): Promise<Record<string, unknown>> {
    const broadcast = await this.broadcastRepo.findOne({
      where: {
        id: broadcastId,
        channelType: NewsletterChannelType.COURSE_ANNOUNCEMENT,
      },
    });
    if (!broadcast)
      throw new NotFoundException('Course announcement not found');

    if (
      ![
        NewsletterBroadcastStatus.DRAFT,
        NewsletterBroadcastStatus.READY,
      ].includes(broadcast.status)
    ) {
      throw new UnprocessableEntityException(
        'Recipients can only be changed for draft/ready announcements',
      );
    }

    const meta = await this.courseMetaRepo.findOne({ where: { broadcastId } });
    if (!meta)
      throw new NotFoundException('Course announcement meta not found');

    const enrolled = await this.enrollmentRepo.findOne({
      where: { workshopId: meta.workshopId, userId, isActive: true },
      select: ['userId'],
    });
    if (!enrolled) {
      throw new BadRequestException(
        'Recipient is not an active student in this cohort',
      );
    }

    const selected = dto.selected;

    const result = await this.dataSource.transaction(async (manager) => {
      const metaLocked = await manager.findOne(NewsletterCourseAnnouncement, {
        where: { broadcastId },
      });
      if (!metaLocked)
        throw new NotFoundException('Course announcement meta not found');

      // If currently ALL and user unchecks one -> convert to SELECTED and store all except this user
      if (
        metaLocked.recipientMode === CourseAnnouncementRecipientMode.ALL &&
        selected === false
      ) {
        const allActive = await manager.find(WorkshopEnrollment, {
          where: { workshopId: metaLocked.workshopId, isActive: true },
          select: ['userId'],
        });

        const keepIds = allActive
          .map((r) => r.userId)
          .filter((id) => id !== userId);

        await manager.delete(NewsletterCourseAnnouncementRecipient, {
          broadcastId,
        });

        if (keepIds.length) {
          await manager.save(
            NewsletterCourseAnnouncementRecipient,
            keepIds.map((id) =>
              manager.create(NewsletterCourseAnnouncementRecipient, {
                broadcastId,
                userId: id,
              }),
            ),
          );
        }

        metaLocked.recipientMode = CourseAnnouncementRecipientMode.SELECTED;
        await manager.save(NewsletterCourseAnnouncement, metaLocked);
      }

      if (
        metaLocked.recipientMode === CourseAnnouncementRecipientMode.SELECTED
      ) {
        if (selected) {
          const exists = await manager.findOne(
            NewsletterCourseAnnouncementRecipient,
            {
              where: { broadcastId, userId },
            },
          );
          if (!exists) {
            await manager.save(
              NewsletterCourseAnnouncementRecipient,
              manager.create(NewsletterCourseAnnouncementRecipient, {
                broadcastId,
                userId,
              }),
            );
          }
        } else {
          await manager.delete(NewsletterCourseAnnouncementRecipient, {
            broadcastId,
            userId,
          });
        }
      }

      // recompute selectedCount
      let selectedCount = 0;
      if (metaLocked.recipientMode === CourseAnnouncementRecipientMode.ALL) {
        selectedCount = await manager.count(WorkshopEnrollment, {
          where: { workshopId: metaLocked.workshopId, isActive: true },
        });
      } else {
        selectedCount = await manager.count(
          NewsletterCourseAnnouncementRecipient,
          {
            where: { broadcastId },
          },
        );
      }

      const bLocked = await manager.findOne(NewsletterBroadcast, {
        where: { id: broadcastId },
      });
      if (!bLocked)
        throw new NotFoundException('Course announcement not found');

      bLocked.estimatedRecipientsCount = selectedCount;
      bLocked.updatedByAdminId = adminUserId;
      await manager.save(NewsletterBroadcast, bLocked);

      return { recipientMode: metaLocked.recipientMode, selectedCount };
    });

    return {
      message: 'Recipient selection updated successfully',
      id: broadcastId,
      recipientMode: result.recipientMode,
      selectedCount: result.selectedCount,
    };
  }

  async addAttachment(
    adminUserId: string,
    broadcastId: string,
    dto: AddCourseAnnouncementAttachmentDto,
  ): Promise<Record<string, unknown>> {
    const broadcast = await this.broadcastRepo.findOne({
      where: {
        id: broadcastId,
        channelType: NewsletterChannelType.COURSE_ANNOUNCEMENT,
      },
    });
    if (!broadcast)
      throw new NotFoundException('Course announcement not found');

    if (
      ![
        NewsletterBroadcastStatus.DRAFT,
        NewsletterBroadcastStatus.READY,
      ].includes(broadcast.status)
    ) {
      throw new UnprocessableEntityException(
        'Attachments can only be changed for draft/ready announcements',
      );
    }

    const duplicate = await this.attachmentRepo.findOne({
      where: { broadcastId, fileKey: dto.fileKey.trim() },
    });
    if (duplicate) throw new ConflictException('Attachment already added');

    const sortOrder =
      dto.sortOrder ??
      (await this.attachmentRepo.count({ where: { broadcastId } })) + 1;

    const entity: NewsletterBroadcastAttachment = this.attachmentRepo.create({
      broadcastId,
      fileKey: dto.fileKey.trim(),
      fileName: dto.fileName.trim(),
      mimeType: dto.mimeType.trim(),
      fileSizeBytes: String(dto.fileSizeBytes),
      sortOrder,
      uploadedByAdminId: adminUserId,
    });

    const saved: NewsletterBroadcastAttachment =
      await this.attachmentRepo.save(entity);

    return {
      message: 'Attachment added successfully',
      id: saved.id,
      fileName: saved.fileName,
    };
  }

  async removeAttachment(
    _adminUserId: string,
    broadcastId: string,
    attachmentId: string,
  ): Promise<Record<string, unknown>> {
    const broadcast = await this.broadcastRepo.findOne({
      where: {
        id: broadcastId,
        channelType: NewsletterChannelType.COURSE_ANNOUNCEMENT,
      },
    });
    if (!broadcast)
      throw new NotFoundException('Course announcement not found');

    if (
      ![
        NewsletterBroadcastStatus.DRAFT,
        NewsletterBroadcastStatus.READY,
      ].includes(broadcast.status)
    ) {
      throw new UnprocessableEntityException(
        'Attachments can only be changed for draft/ready announcements',
      );
    }

    const attachment = await this.attachmentRepo.findOne({
      where: { id: attachmentId, broadcastId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');

    await this.attachmentRepo.delete({ id: attachmentId });

    return {
      message: 'Attachment removed successfully',
      id: attachmentId,
      fileName: attachment.fileName,
    };
  }
}
