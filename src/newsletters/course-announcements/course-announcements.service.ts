import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { NewsletterDeliveryJob } from '../delivery/entities/newsletter-delivery-job.entity';
import { NewsletterDeliveryRecipient } from '../delivery/entities/newsletter-delivery-recipient.entity';
import {
  Notification,
  NotificationPriority,
} from '../../notifications/entities/notification.entity';
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
  NewsletterDeliveryJobStatus,
  NewsletterDeliveryRecipientStatus,
  NewsletterSubscriberStatus,
} from '../../common/enums/newsletter-constants.enum';
import { AddCourseAnnouncementAttachmentDto } from './dto/add-course-announcement-attachment.dto';
import { ToggleRecipientDto } from './dto/toggle-recipient.dto';
import {
  ReservationStatus,
  WorkshopReservation,
} from 'src/workshops/entities/workshop-reservation.entity';
import { CourseAnnouncementRecipientItem } from 'src/common/types/broadcasts.types';

@Injectable()
export class CourseAnnouncementsService {
  private readonly ses!: SESv2Client;
  private readonly sesFromEmail: string | null;
  private readonly sesConfigurationSetName: string | null;
  private readonly publicBaseUrl: string | null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,

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
  ) {
    const region =
      this.configService.get<string>('AWS_REGION') ||
      this.configService.get<string>('AWS_S3_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    this.sesFromEmail =
      this.configService.get<string>('SES_FROM_EMAIL') ?? null;

    this.sesConfigurationSetName =
      this.configService.get<string>('SES_CONFIGURATION_SET_NAME')?.trim() ||
      null;

    this.publicBaseUrl =
      this.configService.get<string>('NEWSLETTER_PUBLIC_BASE_URL')?.trim() ||
      null;

    if (region && accessKeyId && secretAccessKey) {
      this.ses = new SESv2Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
  }

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
      const search = `%${query.search.trim().toLowerCase()}%`;

      qb.andWhere('LOWER(w.title) LIKE :search', { search });
    }

    // Draft must be excluded
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
    const workshopIds = workshops.map((workshop) => workshop.id);

    const reservationCounts = workshopIds.length
      ? await this.reservationsRepo
          .createQueryBuilder('r')
          .select('r.workshopId', 'workshopId')
          .addSelect('SUM(r.numberOfSeats)', 'reservedSeats')
          .where('r.workshopId IN (:...workshopIds)', { workshopIds })
          .andWhere('r.status != :cancelledStatus', {
            cancelledStatus: 'cancelled',
          })
          .groupBy('r.workshopId')
          .getRawMany<{ workshopId: string; reservedSeats: string }>()
      : [];

    const countMap = new Map(
      reservationCounts.map((row) => [
        row.workshopId,
        Number(row.reservedSeats ?? 0),
      ]),
    );

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
      .map((workshop: any) => {
        const startAt = getWorkshopStartAt(workshop.days ?? []);
        const endAt = getWorkshopEndAt(workshop.days ?? []);
        const enrolledCount = countMap.get(workshop.id) ?? 0;
        const capacity = Number(workshop.capacity ?? 0);

        let cohortStatus: 'upcoming' | 'completed' | 'cancelled';

        if (String(workshop.status).toLowerCase() === 'cancelled') {
          cohortStatus = 'cancelled';
        } else if (endAt && endAt.getTime() < now.getTime()) {
          cohortStatus = 'completed';
        } else {
          cohortStatus = 'upcoming';
        }

        const seatStatus =
          capacity > 0 && enrolledCount >= capacity ? 'FULLY_BOOKED' : 'OPEN';

        return {
          id: workshop.id,
          title: workshop.title,
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
      meta: {
        page,
        limit,
        total,
      },
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

    const allRecipients = await this.resolveCohortRecipients(meta.workshopId);

    const selectedCount =
      meta.recipientMode === CourseAnnouncementRecipientMode.ALL
        ? allRecipients.length
        : await this.getSelectedRecipientsCount(broadcastId, allRecipients);

    const preview = await this.listRecipients(broadcastId, {
      page: 1,
      limit: 6,
    });

    const dayDates = (workshop.days ?? [])
      .map((x: any) => new Date(x.date))
      .filter((d: Date) => !Number.isNaN(d.getTime()))
      .sort((a, c) => a.getTime() - c.getTime());

    const cohortDate = dayDates[0] ?? null;

    return {
      header: {
        title: 'Broadcast Announcement',
        cohort: {
          id: workshop.id,
          name: (workshop as any).title,
        },
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
        totalInCohort: allRecipients.length,
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

    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 24);

    const allRecipients = await this.resolveCohortRecipients(meta.workshopId);

    let filtered = allRecipients;

    if (query.search?.trim()) {
      const search = query.search.trim().toLowerCase();

      filtered = filtered.filter((recipient) => {
        return (
          recipient.name.toLowerCase().includes(search) ||
          recipient.email.toLowerCase().includes(search) ||
          recipient.role?.toLowerCase().includes(search) ||
          recipient.institutionOrHospital?.toLowerCase().includes(search)
        );
      });
    }

    let selectedIds = new Set<string>();

    if (meta.recipientMode === CourseAnnouncementRecipientMode.SELECTED) {
      const selectedRows = await this.courseRecipientRepo.find({
        where: { broadcastId },
        select: ['userId', 'attendeeId'] as any,
      });

      selectedIds = new Set(
        selectedRows
          .map((row: any) => row.userId ?? row.attendeeId)
          .filter(Boolean),
      );
    }

    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    const items = paginated.map((recipient) => ({
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
      role: recipient.role,
      selected:
        meta.recipientMode === CourseAnnouncementRecipientMode.ALL
          ? true
          : selectedIds.has(recipient.id),
    }));

    return {
      recipientMode: meta.recipientMode,
      items,
      meta: {
        page,
        limit,
        total,
      },
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
    if (!this.ses || !this.sesFromEmail) {
      throw new UnprocessableEntityException(
        'AWS SES is not configured for course announcements',
      );
    }

    const b = await this.broadcastRepo.findOne({
      where: {
        id: broadcastId,
        channelType: NewsletterChannelType.COURSE_ANNOUNCEMENT,
      },
      relations: ['customContent'],
    });

    if (!b) throw new NotFoundException('Announcement not found');

    if (b.status === NewsletterBroadcastStatus.SENT) {
      throw new ConflictException('Announcement already sent');
    }

    const meta = await this.courseMetaRepo.findOne({ where: { broadcastId } });

    if (!meta) throw new NotFoundException('Announcement meta not found');

    if (!b.subjectLine?.trim()) {
      throw new UnprocessableEntityException('subjectLine is required');
    }

    if (!b.customContent?.messageBodyHtml?.trim()) {
      throw new UnprocessableEntityException('messageBodyHtml is required');
    }

    const userIds = await this.resolveRecipientUserIds(
      broadcastId,
      meta.workshopId,
      meta.recipientMode,
    );

    if (!userIds.length) {
      throw new UnprocessableEntityException('No recipients selected');
    }

    const users = await this.userRepo
      .createQueryBuilder('u')
      .where('u.id IN (:...userIds)', { userIds })
      .addSelect([
        'u.medicalEmail',
        'u.fullLegalName',
        'u.professionalRole',
        'u.institutionOrHospital',
      ])
      .getMany();

    const validUsers = users.filter((user) => user.medicalEmail?.trim());

    if (!validUsers.length) {
      throw new UnprocessableEntityException(
        'No deliverable recipient email addresses were found',
      );
    }

    const [deliveryJob, subscriberMap] = await this.dataSource.transaction(
      async (manager) => {
        const job = await manager.save(
          NewsletterDeliveryJob,
          manager.create(NewsletterDeliveryJob, {
            broadcastId: b.id,
            jobStatus: NewsletterDeliveryJobStatus.PROCESSING,
            scheduledExecutionAt: new Date(),
            startedAt: new Date(),
            totalRecipients: validUsers.length,
            successCount: 0,
            failureCount: 0,
            provider: 'SES',
          }),
        );

        const emailList = validUsers.map((user) =>
          user.medicalEmail.trim().toLowerCase(),
        );

        const existingSubscribers = emailList.length
          ? await manager.find(NewsletterSubscriber, {
              where: { email: In(emailList) },
            })
          : [];

        const existingMap = new Map(
          existingSubscribers.map((subscriber) => [
            subscriber.email,
            subscriber,
          ]),
        );

        const subscribersToCreate = emailList
          .filter((email) => !existingMap.has(email))
          .map((email) => {
            const user = validUsers.find(
              (candidate) =>
                candidate.medicalEmail.trim().toLowerCase() === email,
            )!;

            return manager.create(NewsletterSubscriber, {
              email,
              fullName: user.fullLegalName,
              clinicalRole: user.professionalRole ?? null,
              institution: user.institutionOrHospital ?? null,
              status: NewsletterSubscriberStatus.ACTIVE,
              source: 'COURSE_ANNOUNCEMENT',
              createdByAdminId: adminUserId,
              updatedByAdminId: adminUserId,
            });
          });

        if (subscribersToCreate.length) {
          const createdSubscribers = await manager.save(
            NewsletterSubscriber,
            subscribersToCreate,
          );

          for (const subscriber of createdSubscribers) {
            existingMap.set(subscriber.email, subscriber);
          }
        }

        const recipients = validUsers.map((user) => {
          const email = user.medicalEmail.trim().toLowerCase();
          const subscriber = existingMap.get(email)!;

          return manager.create(NewsletterDeliveryRecipient, {
            deliveryJobId: job.id,
            broadcastId: b.id,
            subscriberId: subscriber.id,
            emailSnapshot: email,
            deliveryStatus: NewsletterDeliveryRecipientStatus.PENDING,
          });
        });

        const savedRecipients = await manager.save(
          NewsletterDeliveryRecipient,
          recipients,
        );

        const savedRecipientMap = new Map(
          savedRecipients.map((recipient) => [
            recipient.emailSnapshot,
            recipient,
          ]),
        );

        return [job, savedRecipientMap] as const;
      },
    );

    const html = this.buildCourseAnnouncementHtml(
      b.subjectLine,
      b.customContent.messageBodyHtml,
    );

    const text = this.buildCourseAnnouncementText(
      b.subjectLine,
      b.customContent.messageBodyText,
      b.customContent.messageBodyHtml,
    );

    let successCount = 0;
    let failureCount = 0;
    const failedEmails: string[] = [];

    for (const user of validUsers) {
      const email = user.medicalEmail.trim().toLowerCase();
      const deliveryRecipient = subscriberMap.get(email);

      if (!deliveryRecipient) continue;

      try {
        const recipientHtml = this.appendUnsubscribeFooter(html, email);
        const recipientText = this.appendUnsubscribeTextFooter(text, email);

        const response = await this.ses.send(
          new SendEmailCommand({
            FromEmailAddress: this.sesFromEmail,
            Destination: {
              ToAddresses: [email],
            },
            EmailTags: [
              { Name: 'broadcastId', Value: b.id },
              { Name: 'deliveryJobId', Value: deliveryJob.id },
              { Name: 'deliveryRecipientId', Value: deliveryRecipient.id },
            ],
            ConfigurationSetName: this.sesConfigurationSetName ?? undefined,
            Content: {
              Simple: {
                Subject: {
                  Data: b.subjectLine,
                  Charset: 'UTF-8',
                },
                Body: {
                  Html: {
                    Data: recipientHtml,
                    Charset: 'UTF-8',
                  },
                  Text: {
                    Data: recipientText,
                    Charset: 'UTF-8',
                  },
                },
              },
            },
          }),
        );

        deliveryRecipient.providerMessageId = response.MessageId ?? null;
        deliveryRecipient.sentAt = new Date();
        deliveryRecipient.deliveryStatus =
          NewsletterDeliveryRecipientStatus.SENT;
        deliveryRecipient.failureReason = null;

        successCount += 1;
      } catch (error) {
        deliveryRecipient.deliveryStatus =
          NewsletterDeliveryRecipientStatus.FAILED;
        deliveryRecipient.failureReason =
          error instanceof Error ? error.message : 'SES send failed';

        failedEmails.push(email);
        failureCount += 1;
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.save(
        NewsletterDeliveryRecipient,
        Array.from(subscriberMap.values()),
      );

      deliveryJob.successCount = successCount;
      deliveryJob.failureCount = failureCount;
      deliveryJob.completedAt = new Date();
      deliveryJob.errorSummary =
        failureCount > 0 ? `${failureCount} course recipient(s) failed` : null;
      deliveryJob.jobStatus =
        successCount === 0
          ? NewsletterDeliveryJobStatus.FAILED
          : failureCount > 0
            ? NewsletterDeliveryJobStatus.PARTIAL
            : NewsletterDeliveryJobStatus.COMPLETED;

      await manager.save(NewsletterDeliveryJob, deliveryJob);

      b.status =
        successCount === 0
          ? NewsletterBroadcastStatus.FAILED
          : NewsletterBroadcastStatus.SENT;
      b.sentAt = successCount > 0 ? new Date() : null;
      b.sentRecipientsCount = successCount;
      b.lastError = failedEmails.length
        ? `Failed recipients: ${failedEmails.join(', ')}`
        : null;
      b.updatedByAdminId = adminUserId;

      await manager.save(NewsletterBroadcast, b);

      if (meta.pushToStudentPanel && successCount > 0) {
        const notifications = validUsers.map((user) =>
          manager.create(Notification, {
            userId: user.id,
            title: b.subjectLine,
            message: this.buildInAppNotificationMessage(
              meta.priority,
              b.customContent?.messageBodyText,
              b.customContent?.messageBodyHtml,
            ),
            category: 'course_updates',
            type: 'COURSE_ANNOUNCEMENT',
            priority: this.mapNotificationPriority(meta.priority),
            icon: 'announcement',
            resourceType: 'Workshop',
            resourceId: meta.workshopId,
            actionRoute: `/student/courses/${meta.workshopId}`,
          }),
        );

        await manager.save(Notification, notifications);
      }
    });

    return {
      message:
        failureCount > 0
          ? 'Course announcement sent with partial failures'
          : 'Course announcement sent successfully',
      id: b.id,
      subjectLine: b.subjectLine,
      recipientsCount: validUsers.length,
      successCount,
      failureCount,
    };
  }

  private buildCourseAnnouncementHtml(
    subjectLine: string,
    messageBodyHtml: string,
  ): string {
    return `
      <!doctype html>
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <h2>${this.escapeHtml(subjectLine)}</h2>
          <div>${messageBodyHtml}</div>
        </body>
      </html>
    `;
  }

  private buildCourseAnnouncementText(
    subjectLine: string,
    messageBodyText?: string | null,
    messageBodyHtml?: string | null,
  ): string {
    if (messageBodyText?.trim()) {
      return `${subjectLine}

${messageBodyText.trim()}`;
    }

    return `${subjectLine}

${this.stripHtml(messageBodyHtml ?? '')}`.trim();
  }

  private buildInAppNotificationMessage(
    priority: CourseAnnouncementPriority,
    messageBodyText?: string | null,
    messageBodyHtml?: string | null,
  ): string {
    const content =
      messageBodyText?.trim() || this.stripHtml(messageBodyHtml ?? '');
    const trimmed =
      content.length > 180 ? `${content.slice(0, 177)}...` : content;
    return `${this.getPriorityLabel(priority)}: ${trimmed}`;
  }

  private mapNotificationPriority(
    priority: CourseAnnouncementPriority,
  ): NotificationPriority {
    switch (priority) {
      case CourseAnnouncementPriority.URGENT_ALERT:
        return NotificationPriority.CRITICAL;
      case CourseAnnouncementPriority.MATERIAL_SHARE:
        return NotificationPriority.HIGH;
      default:
        return NotificationPriority.ROUTINE;
    }
  }

  private getPriorityLabel(priority: CourseAnnouncementPriority): string {
    switch (priority) {
      case CourseAnnouncementPriority.URGENT_ALERT:
        return 'Urgent alert';
      case CourseAnnouncementPriority.MATERIAL_SHARE:
        return 'Material share';
      default:
        return 'General update';
    }
  }

  private stripHtml(value: string): string {
    return value
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#039;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
      const [enrollments, reservations] = await Promise.all([
        this.enrollmentRepo.find({
          where: {
            workshopId,
            isActive: true,
          },
          select: ['userId'],
        }),
        this.reservationsRepo.find({
          where: {
            workshopId,
            status: ReservationStatus.CONFIRMED,
          },
          select: ['userId'],
        }),
      ]);

      const userIds = [
        ...enrollments.map((row) => row.userId),
        ...reservations.map((row) => row.userId),
      ].filter((userId): userId is string => Boolean(userId));

      return [...new Set(userIds)];
    }

    const selectedRows = await this.courseRecipientRepo.find({
      where: {
        broadcastId,
      },
      select: ['userId', 'attendeeId'] as any,
    });

    const selectedUserIds = selectedRows
      .map((row: any) => row.userId ?? row.attendeeId)
      .filter((id): id is string => Boolean(id));

    return [...new Set(selectedUserIds)];
  }

  private async applyRecipients(
    manager: EntityManager,
    broadcastId: string,
    workshopId: string,
    mode: CourseAnnouncementRecipientMode,
    providedIds: string[],
  ): Promise<number> {
    await manager.delete(NewsletterCourseAnnouncementRecipient, {
      broadcastId,
    });

    const allRecipients = await this.resolveCohortRecipients(
      workshopId,
      manager,
    );
    const validRecipientMap = new Map(
      allRecipients.map((recipient) => [recipient.id, recipient]),
    );

    if (mode === CourseAnnouncementRecipientMode.ALL) {
      if (!allRecipients.length) return 0;

      const entities = allRecipients.map((recipient) =>
        manager.create(NewsletterCourseAnnouncementRecipient, {
          broadcastId,
          userId: recipient.userId,
          attendeeId: recipient.attendeeId,
        } as any),
      );

      await manager.save(NewsletterCourseAnnouncementRecipient, entities);

      return allRecipients.length;
    }

    if (mode === CourseAnnouncementRecipientMode.SELECTED) {
      if (!providedIds?.length) return 0;

      const uniqueProvidedIds = [...new Set(providedIds)];

      for (const id of uniqueProvidedIds) {
        if (!validRecipientMap.has(id)) {
          throw new BadRequestException(
            'One or more recipients are not enrolled in this cohort',
          );
        }
      }

      const entities = uniqueProvidedIds.map((id) => {
        const recipient = validRecipientMap.get(id)!;

        return manager.create(NewsletterCourseAnnouncementRecipient, {
          broadcastId,
          userId: recipient.userId,
          attendeeId: recipient.attendeeId,
        } as any);
      });

      await manager.save(NewsletterCourseAnnouncementRecipient, entities);

      return entities.length;
    }

    return 0;
  }

  private async resolveCohortRecipients(
    workshopId: string,
    manager?: EntityManager,
  ): Promise<CourseAnnouncementRecipientItem[]> {
    const enrollmentRepo = manager
      ? manager.getRepository(WorkshopEnrollment)
      : this.enrollmentRepo;

    const userRepo = manager ? manager.getRepository(User) : this.userRepo;

    const reservationRepo = manager
      ? manager.getRepository(WorkshopReservation)
      : this.reservationsRepo;

    const recipients: CourseAnnouncementRecipientItem[] = [];
    const usedEmails = new Set<string>();

    const addRecipient = (recipient: CourseAnnouncementRecipientItem) => {
      const email = recipient.email?.trim().toLowerCase();

      if (!email) return;
      if (usedEmails.has(email)) return;

      usedEmails.add(email);

      recipients.push({
        ...recipient,
        email,
      });
    };

    const enrollments = await enrollmentRepo.find({
      where: {
        workshopId,
        isActive: true,
      },
      select: ['userId'],
    });

    const userIds = [
      ...new Set(
        enrollments.map((enrollment) => enrollment.userId).filter(Boolean),
      ),
    ];

    const users = userIds.length
      ? await userRepo.find({
          where: {
            id: In(userIds),
          },
        })
      : [];

    for (const user of users) {
      addRecipient({
        id: user.id,
        userId: user.id,
        attendeeId: null,
        name: user.fullLegalName ?? 'Unknown',
        email: user.medicalEmail ?? '',
        role: user.professionalRole ?? null,
        institutionOrHospital: (user as any).institutionOrHospital ?? null,
      });
    }

    const reservations = await reservationRepo.find({
      where: {
        workshopId,
      },
      relations: ['attendees'],
    });

    for (const reservation of reservations) {
      const reservationStatus = String((reservation as any).status ?? '')
        .trim()
        .toLowerCase();

      if (reservationStatus === 'cancelled') continue;

      for (const attendee of (reservation as any).attendees ?? []) {
        const attendeeStatus = String(attendee.status ?? '')
          .trim()
          .toLowerCase();

        if (attendeeStatus === 'cancelled' || attendeeStatus === 'refunded') {
          continue;
        }

        addRecipient({
          id: attendee.id,
          userId: null,
          attendeeId: attendee.id,
          name: attendee.fullName ?? 'Unknown',
          email: attendee.email ?? '',
          role: null,
          institutionOrHospital:
            attendee.institutionOrHospital ??
            reservation.institutionOrHospital ??
            null,
        });
      }
    }

    return recipients.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async getSelectedRecipientsCount(
    broadcastId: string,
    allRecipients: CourseAnnouncementRecipientItem[],
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager
      ? manager.getRepository(NewsletterCourseAnnouncementRecipient)
      : this.courseRecipientRepo;

    const selectedRows = await repo.find({
      where: { broadcastId },
      select: ['userId', 'attendeeId'] as any,
    });

    const validIds = new Set(allRecipients.map((recipient) => recipient.id));

    return selectedRows.filter((row: any) => {
      const id = row.userId ?? row.attendeeId;
      return id && validIds.has(id);
    }).length;
  }

  private appendUnsubscribeFooter(html: string, email: string): string {
    const unsubscribeUrl = this.buildUnsubscribeUrl(email);

    if (!unsubscribeUrl) return html;

    const footer = `
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
      <p style="margin:0;">
        If you no longer want to receive these emails,
        <a href="${this.escapeHtml(unsubscribeUrl)}" target="_blank" rel="noopener">unsubscribe here</a>.
      </p>
    </div>
  `;

    if (/<\/body>/i.test(html)) {
      return html.replace(/<\/body>/i, `${footer}</body>`);
    }

    return `${html}${footer}`;
  }

  private appendUnsubscribeTextFooter(text: string, email: string): string {
    const unsubscribeUrl = this.buildUnsubscribeUrl(email);

    if (!unsubscribeUrl) return text;

    return `${text.trim()}

Unsubscribe: ${unsubscribeUrl}`.trim();
  }

  private buildUnsubscribeUrl(email: string): string | null {
    if (!this.publicBaseUrl) return null;

    const baseUrl = this.publicBaseUrl.replace(/\/+$/, '');
    const token = encodeURIComponent(email.trim().toLowerCase());

    return `${baseUrl}/public/newsletters/general/unsubscribe?token=${token}`;
  }

  async toggleRecipient(
    adminUserId: string,
    broadcastId: string,
    userId: string,
    dto: ToggleRecipientDto,
  ): Promise<Record<string, unknown>> {
    const recipientId = userId;

    const broadcast = await this.broadcastRepo.findOne({
      where: {
        id: broadcastId,
        channelType: NewsletterChannelType.COURSE_ANNOUNCEMENT,
      },
    });

    if (!broadcast) {
      throw new NotFoundException('Course announcement not found');
    }

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

    if (!meta) {
      throw new NotFoundException('Course announcement meta not found');
    }

    const allRecipients = await this.resolveCohortRecipients(meta.workshopId);
    const recipientMap = new Map(
      allRecipients.map((recipient) => [recipient.id, recipient]),
    );

    const targetRecipient = recipientMap.get(recipientId);

    if (!targetRecipient) {
      throw new BadRequestException(
        'Recipient is not an active member in this cohort',
      );
    }

    const selected = dto.selected;

    const result = await this.dataSource.transaction(async (manager) => {
      const metaLocked = await manager.findOne(NewsletterCourseAnnouncement, {
        where: { broadcastId },
      });

      if (!metaLocked) {
        throw new NotFoundException('Course announcement meta not found');
      }

      const allLockedRecipients = await this.resolveCohortRecipients(
        metaLocked.workshopId,
        manager,
      );

      const lockedRecipientMap = new Map(
        allLockedRecipients.map((recipient) => [recipient.id, recipient]),
      );

      if (
        metaLocked.recipientMode === CourseAnnouncementRecipientMode.ALL &&
        selected === false
      ) {
        const keepRecipients = allLockedRecipients.filter(
          (recipient) => recipient.id !== recipientId,
        );

        await manager.delete(NewsletterCourseAnnouncementRecipient, {
          broadcastId,
        });

        if (keepRecipients.length) {
          await manager.save(
            NewsletterCourseAnnouncementRecipient,
            keepRecipients.map((recipient) =>
              manager.create(NewsletterCourseAnnouncementRecipient, {
                broadcastId,
                userId: recipient.userId,
                attendeeId: recipient.attendeeId,
              } as any),
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
          const recipient = lockedRecipientMap.get(recipientId);

          if (!recipient) {
            throw new BadRequestException(
              'Recipient is not an active member in this cohort',
            );
          }

          const existing = await manager.findOne(
            NewsletterCourseAnnouncementRecipient,
            {
              where: recipient.userId
                ? { broadcastId, userId: recipient.userId }
                : ({ broadcastId, attendeeId: recipient.attendeeId } as any),
            },
          );

          if (!existing) {
            await manager.save(
              NewsletterCourseAnnouncementRecipient,
              manager.create(NewsletterCourseAnnouncementRecipient, {
                broadcastId,
                userId: recipient.userId,
                attendeeId: recipient.attendeeId,
              } as any),
            );
          }
        } else {
          await manager.delete(
            NewsletterCourseAnnouncementRecipient,
            targetRecipient.userId
              ? { broadcastId, userId: targetRecipient.userId }
              : ({
                  broadcastId,
                  attendeeId: targetRecipient.attendeeId,
                } as any),
          );
        }
      }

      const selectedCount =
        metaLocked.recipientMode === CourseAnnouncementRecipientMode.ALL
          ? allLockedRecipients.length
          : await this.getSelectedRecipientsCount(
              broadcastId,
              allLockedRecipients,
              manager,
            );

      const bLocked = await manager.findOne(NewsletterBroadcast, {
        where: { id: broadcastId },
      });

      if (!bLocked) {
        throw new NotFoundException('Course announcement not found');
      }

      bLocked.estimatedRecipientsCount = selectedCount;
      bLocked.updatedByAdminId = adminUserId;

      await manager.save(NewsletterBroadcast, bLocked);

      return {
        recipientMode: metaLocked.recipientMode,
        selectedCount,
      };
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
