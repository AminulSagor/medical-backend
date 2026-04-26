import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, In, Repository } from 'typeorm';
import { Workshop } from './entities/workshop.entity';
import { WorkshopDay } from './entities/workshop-day.entity';
import { WorkshopSegment } from './entities/workshop-segment.entity';
import { WorkshopReservation } from './entities/workshop-reservation.entity';
import { WorkshopAttendee } from './entities/workshop-attendee.entity';
import { WorkshopOrderSummary } from './entities/workshop-order-summary.entity';
import { WorkshopOrderAttendee } from './entities/workshop-order-attendee.entity';
import { WorkshopEnrollment } from './entities/workshop-enrollment.entity';
import { CreateWorkshopDto } from './dto/create-workshop.dto';
import { UpdateWorkshopDto } from './dto/update-workshop.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { CheckoutOrderSummaryDto } from './dto/checkout-order-summary.dto';
import { CreateWorkshopPaymentSessionDto } from './dto/create-workshop-payment-session.dto';
import { VerifyWorkshopPaymentDto } from './dto/verify-workshop-payment.dto';
import { PublicListWorkshopsQueryDto } from './dto/public-list-workshops.query.dto';
import {
  CourseTab,
  CourseTypeFilter,
  ListMyCoursesLoggedQueryDto,
  ListMyCoursesQueryDto,
} from './dto/list-my-courses.query.dto';
import { Facility } from '../facilities/entities/facility.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { ListWorkshopsQueryDto } from './dto/list-workshops.query.dto';
import { WorkshopStatus } from './entities/workshop.entity';
import { OrderSummaryStatus } from './entities/workshop-order-summary.entity';
import { ReservationStatus } from './entities/workshop-reservation.entity';
import Stripe = require('stripe');
import {
  WorkshopRefund,
  WorkshopRefundStatus,
  WorkshopRefundType,
} from './entities/workshop-refund.entity';
import {
  WorkshopRefundItem,
  WorkshopRefundItemStatus,
} from './entities/workshop-refund-item.entity';
import { ConfirmWorkshopRefundDto } from './dto/confirm-workshop-refund.dto';
import { ListWorkshopEnrolleesQueryDto } from './dto/list-workshop-enrollees.query.dto';
import { WorkshopStatsQueryDto } from './dto/workshop-stats-query.dto';
import * as QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { CourseProgressStatus } from './entities/course-progress-status.enum';
import * as ics from 'ics';
import { EventAttributes } from 'ics';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { SubmitRefundRequestDto } from './dto/submit-refund-request.dto';
import { User } from 'src/users/entities/user.entity';
import * as path from 'path';
import { WorkshopGroupDiscount } from './entities/workshop-group-discount.entity';
import {
  PaymentDomainType,
  PaymentProvider,
  PaymentTransaction,
  PaymentTransactionStatus,
} from 'src/payments/entities/payment-transaction.entity';
import { MailService } from 'src/common/services/mail.service';
import { InvoiceService } from 'src/common/services/invoice.service';
import { SubscribersService } from 'src/newsletters/audience/subscribers.service';

function parse12hToTime(v: string): string {
  // expects: "08:00 AM"
  const raw = String(v ?? '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m)
    throw new BadRequestException(
      `Invalid time format: ${raw}. Use "08:00 AM"`,
    );

  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();

  if (hh < 1 || hh > 12) throw new BadRequestException(`Invalid hour: ${raw}`);
  if (mm < 0 || mm > 59)
    throw new BadRequestException(`Invalid minute: ${raw}`);

  if (ap === 'AM') {
    if (hh === 12) hh = 0;
  } else {
    if (hh !== 12) hh += 12;
  }

  const HH = String(hh).padStart(2, '0');
  const MM = String(mm).padStart(2, '0');
  return `${HH}:${MM}:00`;
}

@Injectable()
export class WorkshopsService {
  private readonly logger = new Logger(WorkshopsService.name);
  private readonly ses: SESv2Client;
  constructor(
    @InjectRepository(Workshop) private workshopsRepo: Repository<Workshop>,
    @InjectRepository(WorkshopDay) private daysRepo: Repository<WorkshopDay>,
    @InjectRepository(WorkshopSegment)
    private segmentsRepo: Repository<WorkshopSegment>,
    @InjectRepository(WorkshopReservation)
    private reservationsRepo: Repository<WorkshopReservation>,
    @InjectRepository(WorkshopAttendee)
    private attendeesRepo: Repository<WorkshopAttendee>,
    @InjectRepository(WorkshopOrderSummary)
    private orderSummariesRepo: Repository<WorkshopOrderSummary>,
    @InjectRepository(WorkshopOrderAttendee)
    private orderAttendeesRepo: Repository<WorkshopOrderAttendee>,
    @InjectRepository(WorkshopRefund)
    private refundsRepo: Repository<WorkshopRefund>,
    @InjectRepository(WorkshopRefundItem)
    private refundItemsRepo: Repository<WorkshopRefundItem>,
    @InjectRepository(WorkshopEnrollment)
    private enrollmentsRepo: Repository<WorkshopEnrollment>,
    @InjectRepository(Facility) private facilitiesRepo: Repository<Facility>,
    @InjectRepository(Faculty) private facultyRepo: Repository<Faculty>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(WorkshopGroupDiscount)
    private groupDiscountsRepo: Repository<WorkshopGroupDiscount>,
    @InjectRepository(PaymentTransaction)
    private readonly paymentsRepo: Repository<PaymentTransaction>,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly invoiceService: InvoiceService,
    private readonly subscribersService: SubscribersService,
  ) {
    // Initialize SES Client
    const region =
      this.configService.get<string>('AWS_REGION') ||
      this.configService.get<string>('AWS_S3_REGION');

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    if (region && accessKeyId && secretAccessKey) {
      this.ses = new SESv2Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      this.logger.warn(
        'AWS SES configuration is missing. Emails will not be sent.',
      );
    }
  }

  private toMoney(value: string | number): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private toMoneyString(value: number): string {
    return value.toFixed(2);
  }

  private getWorkshopDateRange(workshop: Workshop): {
    startDate: Date | null;
    endDate: Date | null;
  } {
    const dayDates = (workshop.days ?? [])
      .map((day) => new Date(`${day.date}T00:00:00`))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => +a - +b);

    if (dayDates.length === 0) {
      return { startDate: null, endDate: null };
    }

    const startDate = dayDates[0];
    const endDate = new Date(dayDates[dayDates.length - 1]);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }

  private getWorkshopTotalMinutes(workshop: Workshop): number {
    let totalMinutes = 0;

    for (const day of workshop.days ?? []) {
      for (const segment of day.segments ?? []) {
        const [startHour, startMinute] = segment.startTime
          .split(':')
          .map((v) => Number(v));
        const [endHour, endMinute] = segment.endTime
          .split(':')
          .map((v) => Number(v));

        if (
          Number.isFinite(startHour) &&
          Number.isFinite(startMinute) &&
          Number.isFinite(endHour) &&
          Number.isFinite(endMinute)
        ) {
          const start = startHour * 60 + startMinute;
          const end = endHour * 60 + endMinute;
          if (end > start) {
            totalMinutes += end - start;
          }
        }
      }
    }

    return totalMinutes;
  }

  private getCourseStatusForStudent(
    workshop: Workshop,
    now: Date,
  ): 'active' | 'completed' {
    const { startDate, endDate } = this.getWorkshopDateRange(workshop);

    if (!startDate || !endDate) {
      return 'active';
    }

    if (endDate < now) {
      return 'completed';
    }

    // In-progress is now treated as active (confirmed) until completed

    return 'active';
  }

  private toDateOnly(value: Date): Date {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private getDayLifecycleStatus(
    dayDate: Date,
    now: Date,
  ): 'completed' | 'current' | 'upcoming' {
    const day = this.toDateOnly(dayDate).getTime();
    const today = this.toDateOnly(now).getTime();

    if (day < today) {
      return 'completed';
    }

    if (day === today) {
      return 'current';
    }

    return 'upcoming';
  }

  private getWorkshopTotalDays(workshop: Workshop): number {
    return (workshop.days ?? []).filter((day) => {
      const dayDate = new Date(`${day.date}T00:00:00`);
      return !Number.isNaN(dayDate.getTime());
    }).length;
  }

  private getCompletedWorkshopDays(workshop: Workshop, now: Date): number {
    return (workshop.days ?? []).filter((day) => {
      const dayDate = new Date(`${day.date}T00:00:00`);
      return (
        !Number.isNaN(dayDate.getTime()) &&
        this.getDayLifecycleStatus(dayDate, now) === 'completed'
      );
    }).length;
  }

  private getInitialProgressStatus(
    status?: CourseProgressStatus | null,
  ): CourseProgressStatus {
    // Removed IN_PROGRESS; treat as NOT_STARTED until completed

    if (status === CourseProgressStatus.COMPLETED) {
      return CourseProgressStatus.COMPLETED;
    }

    return CourseProgressStatus.NOT_STARTED;
  }

  private toExternalCourseStatus(
    status: CourseProgressStatus,
  ): 'confirmed' | 'completed' {
    return status === CourseProgressStatus.COMPLETED
      ? 'completed'
      : 'confirmed';
  }

  private toExternalCourseStatusLabel(status: CourseProgressStatus): string {
    return status === CourseProgressStatus.COMPLETED
      ? 'Completed'
      : 'Registration Confirmed';
  }

  private resolveTrackedCourseProgress(
    workshop: Workshop,
    tracking?: {
      courseProgressStatus?: CourseProgressStatus | null;
      courseStartedAt?: Date | null;
    } | null,
    now: Date = new Date(),
  ) {
    const totalDays = this.getWorkshopTotalDays(workshop);
    const completedDays = this.getCompletedWorkshopDays(workshop, now);
    const { startDate } = this.getWorkshopDateRange(workshop);
    const today = this.toDateOnly(now);
    const hasCalendarStarted = startDate
      ? this.toDateOnly(startDate) <= today
      : false;
    const initialStatus = this.getInitialProgressStatus(
      tracking?.courseProgressStatus,
    );
    const hasStarted =
      Boolean(tracking?.courseStartedAt) ||
      hasCalendarStarted ||
      initialStatus === CourseProgressStatus.COMPLETED;

    if (!hasStarted && initialStatus === CourseProgressStatus.NOT_STARTED) {
      return {
        status: CourseProgressStatus.NOT_STARTED,
        statusLabel: 'Registration Confirmed',
        totalDays,
        completedDays: 0,
        remainingDays: totalDays,
      };
    }

    const isCompleted = totalDays > 0 && completedDays >= totalDays;

    if (isCompleted || initialStatus === CourseProgressStatus.COMPLETED) {
      return {
        status: CourseProgressStatus.COMPLETED,
        statusLabel: 'Completed',
        totalDays,
        completedDays: totalDays,
        remainingDays: 0,
      };
    }

    return {
      status: CourseProgressStatus.NOT_STARTED, // treat as confirmed until completed
      statusLabel: 'Registration Confirmed',
      totalDays,
      completedDays,
      remainingDays: Math.max(totalDays - completedDays, 0),
    };
  }

  private getCourseDayStatuses(
    workshop: Workshop,
    _progressStatus: CourseProgressStatus,
    now: Date,
  ): Array<{
    dayNumber: number;
    date: string;
    status: 'current' | 'completed' | 'upcoming';
  }> {
    return [...(workshop.days ?? [])]
      .filter((day) => {
        const dayDate = new Date(`${day.date}T00:00:00`);
        return !Number.isNaN(dayDate.getTime());
      })
      .sort((a, b) => {
        const byDate =
          new Date(`${a.date}T00:00:00`).getTime() -
          new Date(`${b.date}T00:00:00`).getTime();
        if (byDate !== 0) {
          return byDate;
        }
        return a.dayNumber - b.dayNumber;
      })
      .map((day) => {
        const dayDate = new Date(`${day.date}T00:00:00`);
        return {
          dayNumber: day.dayNumber,
          date: day.date,
          status: this.getDayLifecycleStatus(dayDate, now),
        };
      });
  }

  private async syncCourseProgressTracking(
    workshop: Workshop,
    source: 'enrollment' | 'reservation',
    tracking: WorkshopEnrollment | WorkshopReservation,
    now: Date,
  ) {
    const progress = this.resolveTrackedCourseProgress(workshop, tracking, now);

    const updatePayload: Partial<WorkshopEnrollment & WorkshopReservation> = {};

    if (tracking.courseProgressStatus !== progress.status) {
      updatePayload.courseProgressStatus = progress.status;
    }

    if (
      progress.status !== CourseProgressStatus.NOT_STARTED &&
      !tracking.courseStartedAt
    ) {
      const { startDate } = this.getWorkshopDateRange(workshop);
      updatePayload.courseStartedAt = startDate ?? now;
    }

    if (
      progress.status === CourseProgressStatus.COMPLETED &&
      !tracking.courseCompletedAt
    ) {
      updatePayload.courseCompletedAt = now;
    }

    if (
      progress.status === CourseProgressStatus.COMPLETED &&
      workshop.offersCmeCredits &&
      !tracking.cmeCreditsAwarded
    ) {
      updatePayload.cmeCreditsAwarded = true;
      updatePayload.cmeCreditsAwardedAt = now;
    }

    if (Object.keys(updatePayload).length > 0) {
      if (source === 'enrollment') {
        await this.enrollmentsRepo.update(tracking.id, updatePayload);
      } else {
        await this.reservationsRepo.update(tracking.id, updatePayload);
      }

      Object.assign(tracking, updatePayload);
    }

    return this.resolveTrackedCourseProgress(workshop, tracking, now);
  }

  private async markCourseAsStarted(
    userId: string,
    courseId: string,
  ): Promise<{ source: 'enrollment' | 'reservation'; startedAt: Date }> {
    const [enrollment, reservation] = await Promise.all([
      this.enrollmentsRepo.findOne({
        where: { userId, workshopId: courseId, isActive: true },
        order: { createdAt: 'DESC' },
      }),
      this.reservationsRepo.findOne({
        where: {
          userId,
          workshopId: courseId,
          status: ReservationStatus.CONFIRMED,
        },
        order: { createdAt: 'DESC' },
      }),
    ]);

    if (!enrollment && !reservation) {
      throw new NotFoundException('Course not found.');
    }

    const now = new Date();

    if (enrollment) {
      if (!enrollment.courseStartedAt) {
        enrollment.courseStartedAt = now;
      }
      if (
        enrollment.courseProgressStatus === CourseProgressStatus.NOT_STARTED
      ) {
        enrollment.courseProgressStatus = CourseProgressStatus.NOT_STARTED; // treat as confirmed until completed
      }
      await this.enrollmentsRepo.save(enrollment);
      return { source: 'enrollment', startedAt: enrollment.courseStartedAt };
    }

    if (!reservation) {
      throw new NotFoundException('Course not found.');
    }

    if (!reservation.courseStartedAt) {
      reservation.courseStartedAt = now;
    }
    if (reservation.courseProgressStatus === CourseProgressStatus.NOT_STARTED) {
      reservation.courseProgressStatus = CourseProgressStatus.NOT_STARTED; // treat as confirmed until completed
    }
    await this.reservationsRepo.save(reservation);
    return { source: 'reservation', startedAt: reservation.courseStartedAt };
  }

  private async buildStudentWorkshopMeta(userId: string) {
    const enrollments = await this.enrollmentsRepo.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
    });

    const reservations = await this.reservationsRepo.find({
      where: { userId, status: ReservationStatus.CONFIRMED },
      order: { createdAt: 'DESC' },
    });

    const enrollmentByWorkshop = new Map<string, WorkshopEnrollment>();
    for (const enrollment of enrollments) {
      if (!enrollmentByWorkshop.has(enrollment.workshopId)) {
        enrollmentByWorkshop.set(enrollment.workshopId, enrollment);
      }
    }

    const latestReservationByWorkshop = new Map<string, WorkshopReservation>();
    for (const reservation of reservations) {
      if (!latestReservationByWorkshop.has(reservation.workshopId)) {
        latestReservationByWorkshop.set(reservation.workshopId, reservation);
      }
    }

    const workshopMeta = new Map<
      string,
      {
        enrolledAt: Date;
        source: 'enrollment' | 'reservation';
      }
    >();

    for (const enrollment of enrollmentByWorkshop.values()) {
      workshopMeta.set(enrollment.workshopId, {
        enrolledAt: enrollment.createdAt,
        source: 'enrollment',
      });
    }

    for (const reservation of latestReservationByWorkshop.values()) {
      const existing = workshopMeta.get(reservation.workshopId);
      if (!existing || reservation.createdAt > existing.enrolledAt) {
        workshopMeta.set(reservation.workshopId, {
          enrolledAt: reservation.createdAt,
          source: 'reservation',
        });
      }
    }

    const enrolledWorkshopIds = [...workshopMeta.entries()]
      .sort((a, b) => +b[1].enrolledAt - +a[1].enrolledAt)
      .map(([workshopId]) => workshopId);

    return {
      enrolledWorkshopIds,
      workshopMeta,
      enrollmentByWorkshop,
      latestReservationByWorkshop,
    };
  }

  private getEnrollmentRefundStatus(
    originalGroupSize: number,
    refundedCount: number,
    refundRequestStatus: boolean,
  ): 'BOOKED' | 'REFUND_REQUESTED' | 'PARTIAL_REFUNDED' | 'REFUNDED' {
    if (originalGroupSize <= 1) {
      if (refundedCount > 0) {
        return 'REFUNDED';
      }

      if (refundRequestStatus) {
        return 'REFUND_REQUESTED';
      }

      return 'BOOKED';
    }

    if (refundedCount >= originalGroupSize && originalGroupSize > 0) {
      return 'REFUNDED';
    }

    if (refundedCount > 0) {
      return 'PARTIAL_REFUNDED';
    }

    if (refundRequestStatus) {
      return 'REFUND_REQUESTED';
    }

    return 'BOOKED';
  }

  private async syncReservationRefundRequestStatus(
    reservationId: string,
  ): Promise<boolean> {
    const pendingCount = await this.refundsRepo.count({
      where: {
        reservationId,
        status: WorkshopRefundStatus.PENDING,
      },
    });

    await this.reservationsRepo.update(reservationId, {
      refundRequestStatus: pendingCount > 0,
    });

    return pendingCount > 0;
  }

  async create(dto: CreateWorkshopDto) {
    // --- validations ---
    // For drafts, only validate provided fields
    if (dto.title !== undefined) {
      const title = dto.title?.trim();
      if (!title)
        throw new BadRequestException('Workshop title cannot be empty');
    }

    // Validate pricing only if provided
    if (dto.standardBaseRate !== undefined) {
      const baseRate = Number(dto.standardBaseRate);
      if (!Number.isFinite(baseRate) || baseRate <= 0) {
        throw new BadRequestException(
          'standardBaseRate must be greater than 0',
        );
      }
    }

    // Validate capacity/alertAt relationship only if both are provided
    if (dto.capacity !== undefined && dto.alertAt !== undefined) {
      if (dto.alertAt > dto.capacity) {
        throw new BadRequestException(
          'alertAt cannot be greater than capacity',
        );
      }
    }

    // Handle facilityIds based on delivery mode (only if deliveryMode is provided)
    let facilityIds = dto.facilityIds || [];

    if (dto.deliveryMode === 'online') {
      // For online workshops, default to ["online"] if not provided
      if (facilityIds.length === 0) {
        facilityIds = ['online'];
      }
    } else if (dto.deliveryMode === 'in_person') {
      // For in-person workshops, validate all facilities exist
      if (facilityIds.length === 0) {
        throw new BadRequestException(
          'At least one facilityId is required for in-person workshops',
        );
      }

      for (const fid of facilityIds) {
        const facility = await this.facilitiesRepo.findOne({
          where: { id: fid },
        });
        if (!facility) {
          throw new BadRequestException(`Invalid facilityId: ${fid}`);
        }
      }
    }
    // If deliveryMode is not provided (draft), skip facility validation

    // group discount validation
    const groupDiscounts = dto.groupDiscounts ?? [];

    if (dto.groupDiscountEnabled === true) {
      if (groupDiscounts.length === 0) {
        throw new BadRequestException(
          'groupDiscounts required when groupDiscountEnabled = true',
        );
      }

      for (const g of groupDiscounts) {
        const rate = Number(g.groupRatePerPerson ?? '0');
        if (!Number.isFinite(rate) || rate <= 0) {
          throw new BadRequestException(
            'groupRatePerPerson must be greater than 0',
          );
        }
        // Only validate against baseRate if both are provided
        if (
          dto.standardBaseRate !== undefined &&
          rate >= Number(dto.standardBaseRate)
        ) {
          throw new BadRequestException(
            'groupRatePerPerson must be less than standardBaseRate',
          );
        }
      }
    } else {
      if (groupDiscounts.length > 0) {
        throw new BadRequestException(
          'groupDiscounts must be empty when groupDiscountEnabled = false',
        );
      }
    }

    // days/segments validation + time parsing (only if days are provided)
    if (dto.days !== undefined && dto.days.length === 0) {
      throw new BadRequestException(
        'At least one day is required when days are provided',
      );
    }

    // Skip days validation if not provided (for drafts)
    let normalizedDays;
    if (dto.days?.length) {
      normalizedDays = dto.days.map((d) => {
        if (!d.segments?.length) {
          throw new BadRequestException(
            `Day ${d.dayNumber} must have at least one segment`,
          );
        }

        const segments = d.segments.map((s) => {
          const start = parse12hToTime(s.startTime);
          const end = parse12hToTime(s.endTime);
          if (start >= end) {
            throw new BadRequestException(
              `Invalid segment time (day ${d.dayNumber}, segment ${s.segmentNumber}): startTime must be before endTime`,
            );
          }

          return {
            segmentNumber: s.segmentNumber,
            courseTopic: s.courseTopic?.trim(),
            topicDetails: s.topicDetails?.trim() || undefined,
            startTime: start,
            endTime: end,
          };
        });

        // Optional: ensure segmentNumber unique per day
        const nums = new Set<number>();
        for (const s of segments) {
          if (!s.courseTopic)
            throw new BadRequestException('courseTopic is required');
          if (nums.has(s.segmentNumber)) {
            throw new BadRequestException(
              `Duplicate segmentNumber ${s.segmentNumber} in day ${d.dayNumber}`,
            );
          }
          nums.add(s.segmentNumber);
        }

        return {
          date: d.date,
          dayNumber: d.dayNumber,
          segments,
        };
      });
    }

    // faculty assignment (existing only)
    let facultyEntities: Faculty[] = [];
    if (dto.facultyIds?.length) {
      facultyEntities = await this.facultyRepo.find({
        where: { id: In(dto.facultyIds) },
      });
      if (facultyEntities.length !== dto.facultyIds.length) {
        throw new BadRequestException('One or more facultyIds are invalid');
      }
    }

    const payload: DeepPartial<Workshop> = {
      deliveryMode: dto.deliveryMode,
      status: dto.status ?? WorkshopStatus.DRAFT,
      title: dto.title?.trim(),
      shortBlurb: dto.shortBlurb?.trim() || undefined,
      coverImageUrl: dto.coverImageUrl?.trim() || undefined,
      learningObjectives: dto.learningObjectives ?? undefined,
      offersCmeCredits: dto.offersCmeCredits,
      cmeCreditsCount: dto.offersCmeCredits ? (dto.cmeCreditsCount ?? 0) : 0,

      facilityIds: facilityIds,

      // Online workshop fields
      webinarPlatform: dto.webinarPlatform?.trim() || undefined,
      meetingLink: dto.meetingLink?.trim() || undefined,
      meetingPassword: dto.meetingPassword?.trim() || undefined,
      autoRecordSession: dto.autoRecordSession ?? false,

      capacity: dto.capacity,
      alertAt: dto.alertAt,

      standardBaseRate: dto.standardBaseRate,
      groupDiscountEnabled: dto.groupDiscountEnabled,

      days: normalizedDays as any,
      groupDiscounts: groupDiscounts.map((g) => ({
        minimumAttendees: g.minimumAttendees,
        groupRatePerPerson: g.groupRatePerPerson,
      })) as any,

      faculty: facultyEntities,
      registrationDeadline: dto.registrationDeadline
        ? new Date(dto.registrationDeadline)
        : undefined,
    };

    const workshop = this.workshopsRepo.create(payload);
    return await this.workshopsRepo.save(workshop);
  }

  async update(id: string, dto: UpdateWorkshopDto) {
    const workshop = await this.workshopsRepo.findOne({
      where: { id },
    });

    if (!workshop) {
      throw new NotFoundException(`Workshop with ID ${id} not found`);
    }

    if (dto.title !== undefined) {
      const title = dto.title?.trim();
      if (!title) {
        throw new BadRequestException('Workshop title cannot be empty');
      }
    }

    if (dto.standardBaseRate !== undefined) {
      const baseRate = Number(dto.standardBaseRate ?? '0');
      if (!Number.isFinite(baseRate) || baseRate <= 0) {
        throw new BadRequestException(
          'standardBaseRate must be greater than 0',
        );
      }
    }

    const newCapacity = dto.capacity ?? workshop.capacity;
    const newAlertAt = dto.alertAt ?? workshop.alertAt;

    if (newAlertAt > newCapacity) {
      throw new BadRequestException('alertAt cannot be greater than capacity');
    }

    let facilityIds: string[] | undefined;

    if (dto.facilityIds !== undefined) {
      facilityIds = dto.facilityIds;
      const deliveryMode = dto.deliveryMode ?? workshop.deliveryMode;

      if (deliveryMode === 'online') {
        if (facilityIds.length === 0) {
          facilityIds = ['online'];
        }
      } else {
        if (facilityIds.length === 0) {
          throw new BadRequestException(
            'At least one facilityId is required for in-person workshops',
          );
        }

        for (const fid of facilityIds) {
          const facility = await this.facilitiesRepo.findOne({
            where: { id: fid },
          });

          if (!facility) {
            throw new BadRequestException(`Invalid facilityId: ${fid}`);
          }
        }
      }
    }

    let existingGroupDiscounts: WorkshopGroupDiscount[] = [];
    if (
      dto.groupDiscountEnabled !== undefined ||
      dto.groupDiscounts !== undefined
    ) {
      existingGroupDiscounts = await this.groupDiscountsRepo.find({
        where: { workshopId: id },
      });

      const groupDiscountEnabled =
        dto.groupDiscountEnabled ?? workshop.groupDiscountEnabled;
      const groupDiscounts = dto.groupDiscounts ?? existingGroupDiscounts;
      const baseRate = dto.standardBaseRate
        ? Number(dto.standardBaseRate)
        : Number(workshop.standardBaseRate);

      if (groupDiscountEnabled === true) {
        if (groupDiscounts.length === 0) {
          throw new BadRequestException(
            'groupDiscounts required when groupDiscountEnabled = true',
          );
        }

        for (const g of groupDiscounts) {
          const rate = Number(g.groupRatePerPerson ?? '0');
          if (!Number.isFinite(rate) || rate <= 0) {
            throw new BadRequestException(
              'groupRatePerPerson must be greater than 0',
            );
          }

          if (rate >= baseRate) {
            throw new BadRequestException(
              'groupRatePerPerson must be less than standardBaseRate',
            );
          }
        }
      } else {
        if (groupDiscounts.length > 0) {
          throw new BadRequestException(
            'groupDiscounts must be empty when groupDiscountEnabled = false',
          );
        }
      }
    }

    let normalizedDays:
      | {
          date: string;
          dayNumber: number;
          segments: {
            segmentNumber: number;
            courseTopic: string;
            topicDetails?: string;
            startTime: string;
            endTime: string;
          }[];
        }[]
      | undefined;

    if (dto.days !== undefined) {
      if (!dto.days.length) {
        throw new BadRequestException('At least one day is required');
      }

      normalizedDays = dto.days.map((d) => {
        if (!d.segments?.length) {
          throw new BadRequestException(
            `Day ${d.dayNumber} must have at least one segment`,
          );
        }

        const segments = d.segments.map((s) => {
          const start = parse12hToTime(s.startTime);
          const end = parse12hToTime(s.endTime);

          if (start >= end) {
            throw new BadRequestException(
              `Invalid segment time (day ${d.dayNumber}, segment ${s.segmentNumber}): startTime must be before endTime`,
            );
          }

          return {
            segmentNumber: s.segmentNumber,
            courseTopic: s.courseTopic?.trim(),
            topicDetails: s.topicDetails?.trim() || undefined,
            startTime: start,
            endTime: end,
          };
        });

        const nums = new Set<number>();
        for (const s of segments) {
          if (!s.courseTopic) {
            throw new BadRequestException('courseTopic is required');
          }

          if (nums.has(s.segmentNumber)) {
            throw new BadRequestException(
              `Duplicate segmentNumber ${s.segmentNumber} in day ${d.dayNumber}`,
            );
          }

          nums.add(s.segmentNumber);
        }

        return {
          date: d.date,
          dayNumber: d.dayNumber,
          segments,
        };
      });
    }

    let facultyEntities: Faculty[] | undefined;
    if (dto.facultyIds !== undefined) {
      if (dto.facultyIds.length > 0) {
        facultyEntities = await this.facultyRepo.find({
          where: { id: In(dto.facultyIds) },
        });

        if (facultyEntities.length !== dto.facultyIds.length) {
          throw new BadRequestException('One or more facultyIds are invalid');
        }
      } else {
        facultyEntities = [];
      }
    }

    if (dto.deliveryMode !== undefined) {
      workshop.deliveryMode = dto.deliveryMode;
    }
    if (dto.status !== undefined) {
      workshop.status = dto.status;
    }
    if (dto.title !== undefined) {
      workshop.title = dto.title.trim();
    }
    if (dto.shortBlurb !== undefined) {
      workshop.shortBlurb = dto.shortBlurb?.trim() || undefined;
    }
    if (dto.coverImageUrl !== undefined) {
      workshop.coverImageUrl = dto.coverImageUrl?.trim() || undefined;
    }
    if (dto.learningObjectives !== undefined) {
      workshop.learningObjectives = dto.learningObjectives ?? undefined;
    }
    if (dto.offersCmeCredits !== undefined) {
      workshop.offersCmeCredits = dto.offersCmeCredits;
    }
    if (dto.cmeCreditsCount !== undefined) {
      workshop.cmeCreditsCount = dto.cmeCreditsCount;
    }
    if (facilityIds !== undefined) {
      workshop.facilityIds = facilityIds;
    }
    if (dto.webinarPlatform !== undefined) {
      workshop.webinarPlatform = dto.webinarPlatform?.trim() || undefined;
    }
    if (dto.meetingLink !== undefined) {
      workshop.meetingLink = dto.meetingLink?.trim() || undefined;
    }
    if (dto.meetingPassword !== undefined) {
      workshop.meetingPassword = dto.meetingPassword?.trim() || undefined;
    }
    if (dto.autoRecordSession !== undefined) {
      workshop.autoRecordSession = dto.autoRecordSession;
    }
    if (dto.capacity !== undefined) {
      workshop.capacity = dto.capacity;
    }
    if (dto.alertAt !== undefined) {
      workshop.alertAt = dto.alertAt;
    }
    if (dto.standardBaseRate !== undefined) {
      workshop.standardBaseRate = dto.standardBaseRate;
    }
    if (dto.groupDiscountEnabled !== undefined) {
      workshop.groupDiscountEnabled = dto.groupDiscountEnabled;
    }
    if (dto.registrationDeadline !== undefined) {
      workshop.registrationDeadline = new Date(dto.registrationDeadline);
    }

    await this.workshopsRepo.save(workshop);

    if (normalizedDays !== undefined) {
      await this.daysRepo.delete({ workshopId: id });

      for (const dayData of normalizedDays) {
        const day = await this.daysRepo.save(
          this.daysRepo.create({
            workshopId: id,
            date: dayData.date,
            dayNumber: dayData.dayNumber,
          }),
        );

        const segments = dayData.segments.map((s) =>
          this.segmentsRepo.create({
            dayId: day.id,
            segmentNumber: s.segmentNumber,
            courseTopic: s.courseTopic,
            topicDetails: s.topicDetails,
            startTime: s.startTime,
            endTime: s.endTime,
          }),
        );

        await this.segmentsRepo.save(segments);
      }
    }

    if (
      dto.groupDiscounts !== undefined ||
      dto.groupDiscountEnabled === false
    ) {
      await this.groupDiscountsRepo.delete({ workshopId: id });

      if (
        (dto.groupDiscountEnabled ?? workshop.groupDiscountEnabled) === true
      ) {
        const discountsToCreate = (dto.groupDiscounts ?? []).map((g) =>
          this.groupDiscountsRepo.create({
            workshopId: id,
            minimumAttendees: g.minimumAttendees,
            groupRatePerPerson: g.groupRatePerPerson,
          }),
        );

        if (discountsToCreate.length > 0) {
          await this.groupDiscountsRepo.save(discountsToCreate);
        }
      }
    }

    if (facultyEntities !== undefined) {
      const currentFaculty = await this.workshopsRepo
        .createQueryBuilder()
        .relation(Workshop, 'faculty')
        .of(id)
        .loadMany<Faculty>();

      const currentFacultyIds = currentFaculty.map((f) => f.id);
      const nextFacultyIds = facultyEntities.map((f) => f.id);

      const facultyIdsToRemove = currentFacultyIds.filter(
        (facultyId) => !nextFacultyIds.includes(facultyId),
      );

      const facultyIdsToAdd = nextFacultyIds.filter(
        (facultyId) => !currentFacultyIds.includes(facultyId),
      );

      if (facultyIdsToRemove.length > 0) {
        await this.workshopsRepo
          .createQueryBuilder()
          .relation(Workshop, 'faculty')
          .of(id)
          .remove(facultyIdsToRemove);
      }

      if (facultyIdsToAdd.length > 0) {
        await this.workshopsRepo
          .createQueryBuilder()
          .relation(Workshop, 'faculty')
          .of(id)
          .add(facultyIdsToAdd);
      }
    }

    return await this.workshopsRepo.findOne({
      where: { id },
      relations: ['days', 'days.segments', 'groupDiscounts', 'faculty'],
      order: {
        days: { dayNumber: 'ASC', segments: { segmentNumber: 'ASC' } },
      },
    });
  }

  async remove(id: string) {
    // Check if workshop exists
    const workshop = await this.workshopsRepo.findOne({ where: { id } });
    if (!workshop) {
      throw new NotFoundException('Workshop not found');
    }

    // Check if workshop has any active reservations or enrollments
    const activeReservation = await this.reservationsRepo.findOne({
      where: { workshopId: id },
    });

    const activeEnrollment = await this.enrollmentsRepo.findOne({
      where: { workshopId: id },
    });

    if (activeReservation || activeEnrollment) {
      throw new BadRequestException(
        'Cannot delete workshop with active reservations or enrollments',
      );
    }

    // Delete the workshop (cascade will handle related entities)
    await this.workshopsRepo.delete(id);

    return {
      message: 'Workshop deleted successfully',
      data: {
        workshopId: id,
        title: workshop.title,
      },
    };
  }

  async list(query: ListWorkshopsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.workshopsRepo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.faculty', 'faculty')
      .leftJoinAndSelect('w.days', 'days')
      .leftJoinAndSelect('days.segments', 'segments')
      .leftJoinAndSelect('w.groupDiscounts', 'groupDiscounts');

    if (query.q?.trim()) {
      qb.andWhere('LOWER(w.title) LIKE :q', {
        q: `%${query.q.toLowerCase().trim()}%`,
      });
    }

    if (query.facilityId) {
      qb.andWhere('w.facilityIds LIKE :facilityId', {
        facilityId: `%${query.facilityId}%`,
      });
    }

    if (query.deliveryMode) {
      qb.andWhere('w.deliveryMode = :deliveryMode', {
        deliveryMode: query.deliveryMode,
      });
    }

    if (query.status) {
      qb.andWhere('w.status = :status', { status: query.status });
    }

    if (query.offersCmeCredits) {
      const wantsCme = query.offersCmeCredits === 'true';
      if (wantsCme) {
        qb.andWhere('w.cmeCreditsCount > 0');
      } else {
        qb.andWhere('w.cmeCreditsCount = 0');
      }
    }

    if (query.groupDiscountEnabled) {
      qb.andWhere('w.groupDiscountEnabled = :groupDiscountEnabled', {
        groupDiscountEnabled: query.groupDiscountEnabled === 'true',
      });
    }

    if (query.facultyId) {
      qb.andWhere(
        `EXISTS (
        SELECT 1 FROM workshop_faculty wf
        WHERE wf."workshopId" = w.id AND wf."facultyId" = :facultyId
      )`,
        { facultyId: query.facultyId },
      );
    }

    if (query.upcoming === 'true') {
      qb.andWhere(
        'w.id IN (SELECT DISTINCT wd."workshopId" FROM workshop_days wd WHERE wd.date >= CURRENT_DATE)',
      );
    }

    if (query.past === 'true') {
      qb.andWhere(
        'w.id NOT IN (SELECT DISTINCT wd."workshopId" FROM workshop_days wd WHERE wd.date >= CURRENT_DATE)',
      );
    }

    // FIX: hasRefundRequests=true should mean pending refund requests only
    if (query.hasRefundRequests === 'true') {
      qb.andWhere(
        `EXISTS (
        SELECT 1
        FROM workshop_refunds wr
        WHERE wr."workshopId" = w.id
          AND wr.status = :pendingRefundStatus
      )`,
        { pendingRefundStatus: 'PENDING' },
      );
    }

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = (query.sortOrder ?? 'desc').toUpperCase() as
      | 'ASC'
      | 'DESC';

    qb.orderBy(`w.${sortBy}`, sortOrder);

    qb.skip(skip).take(limit);

    const [workshops, total] = await qb.getManyAndCount();

    const workshopIds = workshops.map((w) => w.id);

    const reservationCounts =
      workshopIds.length > 0
        ? await this.reservationsRepo
            .createQueryBuilder('r')
            .select('r.workshopId', 'workshopId')
            .addSelect('SUM(r.numberOfSeats)', 'reservedSeats')
            .where('r.workshopId IN (:...workshopIds)', { workshopIds })
            .andWhere('r.status != :cancelledStatus', {
              cancelledStatus: 'cancelled',
            })
            .groupBy('r.workshopId')
            .getRawMany()
        : [];

    const reservationMap = new Map(
      reservationCounts.map((r) => [
        r.workshopId,
        parseInt(r.reservedSeats, 10),
      ]),
    );

    const refundStats =
      workshopIds.length > 0
        ? await this.refundsRepo
            .createQueryBuilder('ref')
            .select('ref.workshopId', 'workshopId')
            .addSelect('ref.status', 'status')
            .addSelect('ref.refundType', 'refundType')
            .addSelect('COUNT(ref.id)', 'count')
            .where('ref.workshopId IN (:...workshopIds)', { workshopIds })
            .groupBy('ref.workshopId')
            .addGroupBy('ref.status')
            .addGroupBy('ref.refundType')
            .getRawMany()
        : [];

    const refundStatsMap = new Map<
      string,
      { refundRequested: number; partialRefund: number; refunded: number }
    >();

    for (const row of refundStats) {
      const existing = refundStatsMap.get(row.workshopId) || {
        refundRequested: 0,
        partialRefund: 0,
        refunded: 0,
      };

      const count = parseInt(row.count, 10);

      if (row.status === 'PENDING') {
        existing.refundRequested += count;
      } else if (row.status === 'PROCESSED' && row.refundType === 'PARTIAL') {
        existing.partialRefund += count;
      } else if (row.status === 'PROCESSED' && row.refundType === 'FULL') {
        existing.refunded += count;
      }

      refundStatsMap.set(row.workshopId, existing);
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const allFacilityIds = [
      ...new Set(
        workshops.flatMap((w) =>
          (w.facilityIds ?? []).filter((id) => uuidRegex.test(id)),
        ),
      ),
    ];

    const allFacilities =
      allFacilityIds.length > 0
        ? await this.facilitiesRepo.find({ where: { id: In(allFacilityIds) } })
        : [];

    const facilityMap = new Map(allFacilities.map((f) => [f.id, f]));

    const data = workshops.map((w) => {
      const reservedSeats = reservationMap.get(w.id) || 0;
      const refundInfo = refundStatsMap.get(w.id) || {
        refundRequested: 0,
        partialRefund: 0,
        refunded: 0,
      };

      return {
        ...w,
        faculty: (w.faculty ?? []).map((f) => ({
          id: f.id,
          firstName: f.firstName,
          lastName: f.lastName,
          fullName: `${f.firstName} ${f.lastName}`,
          primaryClinicalRole: f.primaryClinicalRole,
          medicalDesignation: f.medicalDesignation,
          institutionOrHospital: f.institutionOrHospital,
          assignedRole: f.assignedRole,
          imageUrl: f.imageUrl,
          npiNumber: f.npiNumber,
          phoneNumber: f.phoneNumber,
          email: f.email,
        })),
        facilityIds: w.facilityIds,
        facilities: (w.facilityIds ?? [])
          .filter((id) => uuidRegex.test(id))
          .map((id) => facilityMap.get(id))
          .filter(Boolean),
        overview: {
          totalEnrolled: reservedSeats,
          refundRequested: refundInfo.refundRequested,
          partialRefund: refundInfo.partialRefund,
          refunded: refundInfo.refunded,
        },
      };
    });

    return {
      message: 'Workshops fetched successfully',
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
      data,
    };
  }

  async listPublic(query: PublicListWorkshopsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.workshopsRepo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.days', 'days')
      .leftJoinAndSelect('days.segments', 'segments')
      .leftJoinAndSelect('w.groupDiscounts', 'groupDiscounts')
      .leftJoinAndSelect('w.faculty', 'faculty');

    // Only show published workshops
    qb.andWhere('w.status = :status', { status: 'published' });

    // ── Workshop type / delivery mode filter ────────────────────────────────
    if (query.deliveryMode) {
      qb.andWhere('w.deliveryMode = :deliveryMode', {
        deliveryMode: query.deliveryMode,
      });
    }

    // ── CME credits range filter ────────────────────────────────────────────
    if (query.minCmeCredits !== undefined) {
      qb.andWhere('w.cmeCreditsCount >= :minCmeCredits', {
        minCmeCredits: query.minCmeCredits,
      });
    }
    if (query.maxCmeCredits !== undefined) {
      qb.andWhere('w.cmeCreditsCount <= :maxCmeCredits', {
        maxCmeCredits: query.maxCmeCredits,
      });
    }

    // ── General title / blurb search ────────────────────────────────────────
    if (query.q?.trim()) {
      const searchTerm = `%${query.q.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(w.title) LIKE :searchTerm OR LOWER(w.shortBlurb) LIKE :searchTerm)',
        { searchTerm },
      );
    }

    // ── Topic filter (match against segment courseTopic) ────────────────────
    if (query.topic?.trim()) {
      const topicTerm = `%${query.topic.trim().toLowerCase()}%`;
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM workshop_days wd
          JOIN workshop_segments ws ON ws."dayId" = wd.id
          WHERE wd."workshopId" = w.id
            AND LOWER(ws."courseTopic") LIKE :topicTerm
        )`,
        { topicTerm },
      );
    }

    // ── Date range filters ─────────────────────────────────────────────────
    if (query.dateFrom) {
      qb.andWhere(
        `(
          SELECT MIN(wd.date) FROM workshop_days wd WHERE wd."workshopId" = w.id
        ) >= :dateFrom`,
        { dateFrom: query.dateFrom },
      );
    }

    if (query.dateTo) {
      qb.andWhere(
        `(
          SELECT MIN(wd.date) FROM workshop_days wd WHERE wd."workshopId" = w.id
        ) <= :dateTo`,
        { dateTo: query.dateTo },
      );
    }

    // ── Upcoming filter ────────────────────────────────────────────────────
    if (query.upcoming === 'true') {
      const todayStr = new Date().toISOString().slice(0, 10);
      qb.andWhere(
        `(
          SELECT MIN(wd.date) FROM workshop_days wd WHERE wd."workshopId" = w.id
        ) >= :todayStr`,
        { todayStr },
      );
    }

    // ── Sorting ─────────────────────────────────────────────────────────────
    const sortBy = query.sortBy ?? 'date';
    const sortOrder = (query.sortOrder ?? 'asc').toUpperCase() as
      | 'ASC'
      | 'DESC';

    if (sortBy === 'date') {
      qb.orderBy('days.date', sortOrder);
    } else if (sortBy === 'price') {
      qb.orderBy('w.standardBaseRate', sortOrder);
    } else if (sortBy === 'title') {
      qb.orderBy('w.title', sortOrder);
    }

    // ── Fetch ALL matching workshops (without pagination yet) ──────────────────
    const [workshops, total] = await qb.getManyAndCount();

    // ── Reservation counts (for available seats) ─────────────────────────────
    const workshopIds = workshops.map((w) => w.id);
    const reservationCounts =
      workshopIds.length > 0
        ? await this.reservationsRepo
            .createQueryBuilder('r')
            .select('r.workshopId', 'workshopId')
            .addSelect('SUM(r.numberOfSeats)', 'reservedSeats')
            .where('r.workshopId IN (:...workshopIds)', { workshopIds })
            .andWhere('r.status != :cancelledStatus', {
              cancelledStatus: 'cancelled',
            })
            .groupBy('r.workshopId')
            .getRawMany()
        : [];

    const reservationMap = new Map(
      reservationCounts.map((r) => [
        r.workshopId,
        parseInt(r.reservedSeats, 10),
      ]),
    );

    const todayStr = new Date().toISOString().slice(0, 10);

    // ── Resolve full facility details for all workshops in one batch query ────
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const allFacilityIds = [
      ...new Set(
        workshops.flatMap((w) =>
          (w.facilityIds ?? []).filter((id) => uuidRegex.test(id)),
        ),
      ),
    ];
    const allFacilities =
      allFacilityIds.length > 0
        ? await this.facilitiesRepo.find({
            where: { id: In(allFacilityIds) },
          })
        : [];
    const facilityMap = new Map(allFacilities.map((f) => [f.id, f]));

    // ── Transform workshops ──────────────────────────────────────────────────
    const transformedData = workshops.map((workshop) => {
      const reservedSeats = reservationMap.get(workshop.id) || 0;
      const availableSeats = workshop.capacity - reservedSeats;

      // Calculate total hours
      let totalMinutes = 0;
      workshop.days?.forEach((day) => {
        day.segments?.forEach((segment) => {
          const start = segment.startTime.split(':');
          const end = segment.endTime.split(':');
          const startMinutes = parseInt(start[0]) * 60 + parseInt(start[1]);
          const endMinutes = parseInt(end[0]) * 60 + parseInt(end[1]);
          totalMinutes += endMinutes - startMinutes;
        });
      });
      const totalHours = (totalMinutes / 60).toFixed(1);

      const totalModules =
        workshop.days?.reduce(
          (sum, day) => sum + (day.segments?.length || 0),
          0,
        ) || 0;

      // Sort days ascending to get the earliest start date
      const sortedDays = [...(workshop.days ?? [])].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      const workshopDate = sortedDays[0]?.date || null;

      // Group discount offer price
      const offerPrice =
        workshop.groupDiscountEnabled && workshop.groupDiscounts?.length > 0
          ? workshop.groupDiscounts.sort(
              (a, b) => a.minimumAttendees - b.minimumAttendees,
            )[0].groupRatePerPerson
          : null;

      // Collect unique topics across all segments
      const topics = [
        ...new Set(
          workshop.days?.flatMap(
            (day) => day.segments?.map((s) => s.courseTopic) ?? [],
          ) ?? [],
        ),
      ];

      const isUpcoming = workshopDate ? workshopDate >= todayStr : false;

      // Resolve full facility objects
      const facilities = (workshop.facilityIds ?? [])
        .filter((id) => uuidRegex.test(id))
        .map((id) => facilityMap.get(id))
        .filter(Boolean);

      return {
        id: workshop.id,
        date: workshopDate,
        title: workshop.title,
        description: workshop.shortBlurb,
        deliveryMode: workshop.deliveryMode,
        registrationDeadline: workshop.registrationDeadline ?? null,
        workshopPhoto: workshop.coverImageUrl,
        totalHours: `${totalHours} hours`,
        cmeCredits: workshop.offersCmeCredits,
        cmeCreditsCount: Number(workshop.cmeCreditsCount ?? 0),
        availableSeats,
        totalCapacity: workshop.capacity,
        isFullyBooked: availableSeats <= 0,
        isUpcoming,
        price: workshop.standardBaseRate,
        offerPrice,
        totalModules,
        topics,
        learningObjectives: workshop.learningObjectives,
        groupDiscountEnabled: workshop.groupDiscountEnabled,
        // ✅ Full facility objects
        facilityIds: workshop.facilityIds,
        facilities,
        // ✅ Full faculty objects
        faculty: workshop.faculty?.map((f) => ({
          id: f.id,
          firstName: f.firstName,
          lastName: f.lastName,
          fullName: `${f.firstName} ${f.lastName}`,
          primaryClinicalRole: f.primaryClinicalRole,
          medicalDesignation: f.medicalDesignation,
          institutionOrHospital: f.institutionOrHospital,
          assignedRole: f.assignedRole,
          imageUrl: f.imageUrl,
          npiNumber: f.npiNumber,
        })),
        webinarPlatform: workshop.webinarPlatform,
      };
    });

    // ── Seat availability post-filter ─────────────────────────────────────────
    // ✅ FIXED: Apply filter BEFORE pagination
    let filteredData = transformedData;
    if (query.hasAvailableSeats === 'true') {
      const now = new Date();

      filteredData = transformedData.filter((w) => {
        const hasSeats = w.availableSeats > 0;
        const isUpcomingWorkshop = !!w.date && w.date >= todayStr;
        const hasValidRegistrationDeadline =
          !w.registrationDeadline || new Date(w.registrationDeadline) >= now;

        return hasSeats && isUpcomingWorkshop && hasValidRegistrationDeadline;
      });
    } else if (query.hasAvailableSeats === 'false') {
      filteredData = transformedData.filter((w) => w.availableSeats <= 0);
    }

    // ── Apply pagination to filtered data ────────────────────────────────────
    const filteredTotal = filteredData.length;
    const paginatedData = filteredData.slice(skip, skip + limit);

    return {
      message: 'Public workshops fetched successfully',
      meta: {
        page,
        limit,
        total: filteredTotal,
        totalPages: Math.max(Math.ceil(filteredTotal / limit), 1),
      },
      data: paginatedData,
    };
  }

  private async getWorkshopFacilities(facilityIds: string[] = []) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validFacilityIds = facilityIds.filter((fid) => uuidRegex.test(fid));

    return validFacilityIds.length > 0
      ? await this.facilitiesRepo.find({ where: { id: In(validFacilityIds) } })
      : [];
  }

  async getWorkshopById(id: string) {
    const workshop = await this.workshopsRepo.findOne({
      where: { id },
      relations: ['days', 'days.segments', 'groupDiscounts', 'faculty'],
      order: {
        days: { dayNumber: 'ASC', segments: { segmentNumber: 'ASC' } },
      },
    });

    if (!workshop) {
      throw new NotFoundException(`Workshop with ID ${id} not found`);
    }

    const facilities = await this.getWorkshopFacilities(workshop.facilityIds);

    const revenueResult = await this.reservationsRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.totalPrice), 0)', 'revenue')
      .where('r.workshopId = :workshopId', { workshopId: id })
      .andWhere('r.status = :confirmedStatus', {
        confirmedStatus: ReservationStatus.CONFIRMED,
      })
      .getRawOne();

    const revenueGenerated = Number(revenueResult?.revenue || 0);

    return {
      message: 'Workshop details fetched successfully',
      data: {
        ...workshop,
        facilities,
        revenueGenerated,
      },
    };
  }

  async getPublicWorkshopById(id: string) {
    try {
      // Find workshop with all relations
      const workshop = await this.workshopsRepo.findOne({
        where: { id, status: WorkshopStatus.PUBLISHED },
        relations: ['days', 'days.segments', 'groupDiscounts', 'faculty'],
        order: {
          days: { dayNumber: 'ASC', segments: { segmentNumber: 'ASC' } },
        },
      });

      if (!workshop) {
        throw new NotFoundException('Workshop not found or not available');
      }

      // Get reserved seats count
      const reservedSeatsResult = await this.reservationsRepo
        .createQueryBuilder('r')
        .select('SUM(r.numberOfSeats)', 'total')
        .where('r.workshopId = :workshopId', { workshopId: id })
        .andWhere('r.status != :cancelledStatus', {
          cancelledStatus: 'cancelled',
        })
        .getRawOne();

      const reservedSeats = parseInt(reservedSeatsResult?.total || '0', 10);
      const availableSeats = workshop.capacity - reservedSeats;

      // Calculate total hours and duration for each day
      let totalMinutes = 0;
      const daysWithDetails =
        workshop.days?.map((day) => {
          let dayMinutes = 0;
          const segmentsWithDetails =
            day.segments?.map((segment) => {
              const start = segment.startTime.split(':');
              const end = segment.endTime.split(':');
              const startMinutes = parseInt(start[0]) * 60 + parseInt(start[1]);
              const endMinutes = parseInt(end[0]) * 60 + parseInt(end[1]);
              const duration = endMinutes - startMinutes;
              dayMinutes += duration;

              return {
                segmentNumber: segment.segmentNumber,
                courseTopic: segment.courseTopic,
                topicDetails: segment.topicDetails,
                startTime: segment.startTime,
                endTime: segment.endTime,
                durationMinutes: duration,
                durationHours: (duration / 60).toFixed(1),
              };
            }) || [];

          totalMinutes += dayMinutes;

          return {
            dayNumber: day.dayNumber,
            date: day.date,
            totalDayHours: (dayMinutes / 60).toFixed(1),
            segments: segmentsWithDetails,
          };
        }) || [];

      const totalHours = (totalMinutes / 60).toFixed(1);
      const totalModules =
        workshop.days?.reduce(
          (sum, day) => sum + (day.segments?.length || 0),
          0,
        ) || 0;

      // Get workshop dates
      const workshopStartDate = workshop.days?.[0]?.date || null;
      const workshopEndDate =
        workshop.days?.[workshop.days.length - 1]?.date || null;

      // Calculate offer price (group discount for minimum attendees)
      const sortedDiscounts =
        workshop.groupDiscounts?.sort(
          (a, b) => a.minimumAttendees - b.minimumAttendees,
        ) || [];
      const offerPrice =
        workshop.groupDiscountEnabled && sortedDiscounts.length > 0
          ? sortedDiscounts[0].groupRatePerPerson
          : null;

      // ✅ FIX: Fetch full facility details dynamically with UUID validation
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validFacilityIds =
        workshop.facilityIds?.filter((id) => uuidRegex.test(id)) || [];

      const facilities =
        validFacilityIds.length > 0
          ? await this.facilitiesRepo.find({
              where: { id: In(validFacilityIds) },
            })
          : [];

      return {
        message: 'Workshop details fetched successfully',
        data: {
          id: workshop.id,
          title: workshop.title,
          description: workshop.shortBlurb,
          learningObjectives: workshop.learningObjectives,
          deliveryMode: workshop.deliveryMode,
          status: workshop.status,

          // Dates
          startDate: workshopStartDate,
          endDate: workshopEndDate,
          numberOfDays: workshop.days?.length || 0,
          registrationDeadline: workshop.registrationDeadline ?? null,

          // Location / Online details
          facility: facilities.length > 0 ? facilities[0].name : 'Venue TBA', // kept for backwards compatibility if frontend uses this
          facilities, // ✅ Full facility objects returned here
          facilityIds: workshop.facilityIds,
          webinarPlatform: workshop.webinarPlatform,
          meetingLink: workshop.meetingLink,
          autoRecordSession: workshop.autoRecordSession,

          // Visual
          workshopPhoto: workshop.coverImageUrl,

          // Time
          totalHours: `${totalHours} hours`,
          totalMinutes,

          // CME
          offersCmeCredits: workshop.offersCmeCredits,
          cmeCreditsCount: workshop.cmeCreditsCount,

          // Capacity
          totalCapacity: workshop.capacity,
          reservedSeats,
          availableSeats,
          alertAt: workshop.alertAt,

          // Pricing
          standardPrice: workshop.standardBaseRate,
          offerPrice: offerPrice,
          groupDiscountEnabled: workshop.groupDiscountEnabled,
          groupDiscounts: sortedDiscounts.map((d) => ({
            minimumAttendees: d.minimumAttendees,
            pricePerPerson: d.groupRatePerPerson,
            savingsPerPerson: (
              Number(workshop.standardBaseRate) - Number(d.groupRatePerPerson)
            ).toFixed(2),
          })),

          // Content
          totalModules,
          days: daysWithDetails,

          // Faculty
          faculty: workshop.faculty?.map((f) => ({
            id: f.id,
            name: `${f.firstName} ${f.lastName}`,
            title: f.primaryClinicalRole,
            bio: f.medicalDesignation,
            profileImageUrl: f.imageUrl,
            specialties: f.institutionOrHospital,
          })),

          // Timestamps
          createdAt: workshop.createdAt,
          updatedAt: workshop.updatedAt,
        },
      };
    } catch (error) {
      console.error('Error fetching workshop:', error);

      // If it's already a NestJS exception, re-throw it
      if (error instanceof NotFoundException) {
        throw error;
      }

      // If it's a known error, provide a meaningful message
      if (error instanceof Error) {
        throw new BadRequestException({
          statusCode: 400,
          message: error.message || 'Failed to fetch workshop details',
          error: 'Bad Request',
        });
      }

      // Generic error handler
      throw new BadRequestException({
        statusCode: 400,
        message:
          'An error occurred while fetching workshop details. Please try again later.',
        error: 'Bad Request',
      });
    }
  }

  async getMyEnrolledWorkshops(userId: string) {
    const enrollments = await this.enrollmentsRepo.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
    });

    const reservations = await this.reservationsRepo.find({
      where: { userId, status: ReservationStatus.CONFIRMED },
      order: { createdAt: 'DESC' },
    });

    if (enrollments.length === 0 && reservations.length === 0) {
      return {
        message: 'Enrolled workshops fetched successfully',
        data: [],
      };
    }

    const enrollmentByWorkshop = new Map<string, WorkshopEnrollment>();
    for (const enrollment of enrollments) {
      if (!enrollmentByWorkshop.has(enrollment.workshopId)) {
        enrollmentByWorkshop.set(enrollment.workshopId, enrollment);
      }
    }

    const latestReservationByWorkshop = new Map<string, WorkshopReservation>();
    for (const reservation of reservations) {
      if (!latestReservationByWorkshop.has(reservation.workshopId)) {
        latestReservationByWorkshop.set(reservation.workshopId, reservation);
      }
    }

    const workshopMeta = new Map<
      string,
      {
        enrolledAt: Date;
        source: 'enrollment' | 'reservation';
      }
    >();

    for (const enrollment of enrollmentByWorkshop.values()) {
      workshopMeta.set(enrollment.workshopId, {
        enrolledAt: enrollment.createdAt,
        source: 'enrollment',
      });
    }

    for (const reservation of latestReservationByWorkshop.values()) {
      const existing = workshopMeta.get(reservation.workshopId);
      if (!existing || reservation.createdAt > existing.enrolledAt) {
        workshopMeta.set(reservation.workshopId, {
          enrolledAt: reservation.createdAt,
          source: 'reservation',
        });
      }
    }

    const workshopIds = [...workshopMeta.entries()]
      .sort((a, b) => +b[1].enrolledAt - +a[1].enrolledAt)
      .map(([workshopId]) => workshopId);

    const workshops = await this.workshopsRepo.find({
      where: workshopIds.map((id) => ({ id })),
      relations: ['days'],
    });

    const workshopById = new Map(
      workshops.map((workshop) => [workshop.id, workshop]),
    );

    const data = workshopIds
      .map((workshopId) => {
        const meta = workshopMeta.get(workshopId);
        const reservation = latestReservationByWorkshop.get(workshopId);
        const workshop = workshopById.get(workshopId);

        if (!meta || !workshop) {
          return null;
        }

        const dayDates = (workshop.days ?? [])
          .map((day) => new Date(day.date))
          .filter((date) => !Number.isNaN(date.getTime()))
          .sort((a, b) => +a - +b);

        const startDate = dayDates.length > 0 ? dayDates[0] : null;
        const endDate =
          dayDates.length > 0 ? dayDates[dayDates.length - 1] : null;

        return {
          workshopId: workshop.id,
          title: workshop.title,
          deliveryMode: workshop.deliveryMode,
          workshopPhoto: workshop.coverImageUrl ?? null,
          isEnrolled: true,
          enrollmentSource: meta.source,
          enrolledAt: meta.enrolledAt,
          reservation: reservation
            ? {
                reservationId: reservation.id,
                status: reservation.status,
                numberOfSeats: reservation.numberOfSeats,
                pricePerSeat: reservation.pricePerSeat,
                totalPrice: reservation.totalPrice,
              }
            : null,
          startDate,
          endDate,
          registrationDeadline: workshop.registrationDeadline ?? null,
        };
      })
      .filter(Boolean);

    return {
      message: 'Enrolled workshops fetched successfully',
      data,
    };
  }

  async getMyCourseSummary(userId: string) {
    const {
      enrolledWorkshopIds,
      workshopMeta,
      enrollmentByWorkshop,
      latestReservationByWorkshop,
    } = await this.buildStudentWorkshopMeta(userId);

    if (enrolledWorkshopIds.length === 0) {
      return {
        message: 'My course summary fetched successfully',
        data: {
          totalCmeCredits: 0,
          totalInProgressCourses: 0,
          nextLiveSession: null,
        },
      };
    }

    const workshops = await this.workshopsRepo.find({
      where: enrolledWorkshopIds.map((id) => ({ id })),
      relations: ['days', 'days.segments'],
    });

    const now = new Date();

    let totalCmeCredits = 0;
    let totalInProgressCourses = 0;
    let nextLiveSession: {
      workshopId: string;
      title: string;
      date: string;
      time: string;
      dateTime: string;
    } | null = null;

    for (const workshop of workshops) {
      const meta = workshopMeta.get(workshop.id);
      if (!meta) {
        continue;
      }

      const tracking =
        meta.source === 'enrollment'
          ? enrollmentByWorkshop.get(workshop.id)
          : latestReservationByWorkshop.get(workshop.id);

      const progress = tracking
        ? await this.syncCourseProgressTracking(
            workshop,
            meta.source,
            tracking,
            now,
          )
        : this.resolveTrackedCourseProgress(workshop, null, now);

      const totalMinutes = this.getWorkshopTotalMinutes(workshop);

      // Removed IN_PROGRESS check; only count completed

      if (
        progress.status === CourseProgressStatus.COMPLETED &&
        workshop.offersCmeCredits
      ) {
        totalCmeCredits += totalMinutes / 60;
      }

      if (progress.status !== CourseProgressStatus.COMPLETED) {
        for (const day of workshop.days ?? []) {
          for (const segment of day.segments ?? []) {
            const sessionDateTime = new Date(
              `${day.date}T${segment.startTime}`,
            );
            if (
              Number.isNaN(sessionDateTime.getTime()) ||
              sessionDateTime <= now
            ) {
              continue;
            }

            if (
              !nextLiveSession ||
              sessionDateTime < new Date(nextLiveSession.dateTime)
            ) {
              nextLiveSession = {
                workshopId: workshop.id,
                title: workshop.title,
                date: day.date,
                time: segment.startTime,
                dateTime: sessionDateTime.toISOString(),
              };
            }
          }
        }
      }
    }

    return {
      message: 'My course summary fetched successfully',
      data: {
        totalCmeCredits: Number(totalCmeCredits.toFixed(1)),
        totalInProgressCourses,
        nextLiveSession,
      },
    };
  }

  async getMyCourses(userId: string, query: ListMyCoursesQueryDto) {
    const {
      enrolledWorkshopIds,
      workshopMeta,
      enrollmentByWorkshop,
      latestReservationByWorkshop,
    } = await this.buildStudentWorkshopMeta(userId);

    const targetStatus = query.status ?? 'active';
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const now = new Date();

    let workshops: Workshop[] = [];

    if (targetStatus === 'browse') {
      workshops = await this.workshopsRepo.find({
        where: { status: WorkshopStatus.PUBLISHED },
        relations: ['days', 'days.segments'],
      });

      const enrolledSet = new Set(enrolledWorkshopIds);
      // Ensure browse ONLY shows workshops not enrolled by the user
      workshops = workshops.filter((workshop) => !enrolledSet.has(workshop.id));
    } else {
      if (enrolledWorkshopIds.length === 0) {
        return {
          message: 'My courses fetched successfully',
          data: [],
          meta: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        };
      }

      workshops = await this.workshopsRepo.find({
        where: enrolledWorkshopIds.map((id) => ({ id })),
        relations: ['days', 'days.segments'],
      });
    }

    let items = await Promise.all(
      workshops.map(async (workshop) => {
        const { startDate, endDate } = this.getWorkshopDateRange(workshop);
        const totalMinutes = this.getWorkshopTotalMinutes(workshop);
        const totalHours = Number((totalMinutes / 60).toFixed(1));
        const reservation = latestReservationByWorkshop.get(workshop.id);
        const enrolledAt = workshopMeta.get(workshop.id)?.enrolledAt ?? null;

        // ✅ FIX: Filter out 'online' or invalid UUIDs to prevent Postgres crash
        const validFacilityIds = (workshop.facilityIds || []).filter(
          (id) => id && id.toLowerCase() !== 'online' && id.length === 36, // basic UUID length check
        );

        const facilities =
          validFacilityIds.length > 0
            ? await this.facilitiesRepo.find({
                where: { id: In(validFacilityIds) },
              })
            : [];

        if (targetStatus === 'browse') {
          const browseDayStatuses = this.getCourseDayStatuses(
            workshop,
            CourseProgressStatus.NOT_STARTED,
            now,
          );

          return {
            workshopId: workshop.id,
            title: workshop.title,
            shortBlurb: workshop.shortBlurb ?? null,
            standardBaseRate: workshop.standardBaseRate,
            courseType: workshop.deliveryMode,
            workshopPhoto: workshop.coverImageUrl ?? null,
            status: 'browse',
            statusLabel: 'Browse',
            isEnrolled: false,
            enrolledAt,
            startDate,
            endDate,
            registrationDeadline: workshop.registrationDeadline ?? null,
            completedOn: null,
            totalHours,
            cmeCredits: workshop.offersCmeCredits ? totalHours : 0,
            earnedCmeCredits: 0,
            offersCmeCredits: workshop.offersCmeCredits,
            totalDays: this.getWorkshopTotalDays(workshop),
            completedDays: 0,
            remainingDays: this.getWorkshopTotalDays(workshop),
            days: {
              summary: {
                totalDays: this.getWorkshopTotalDays(workshop),
                completedDays: 0,
                remainingDays: this.getWorkshopTotalDays(workshop),
              },
              data: browseDayStatuses,
            },
            reservation: null,
            facilities,
            createdAt: workshop.createdAt,
          };
        }

        const meta = workshopMeta.get(workshop.id);
        const tracking = meta
          ? meta.source === 'enrollment'
            ? enrollmentByWorkshop.get(workshop.id)
            : latestReservationByWorkshop.get(workshop.id)
          : null;

        const progress =
          meta && tracking
            ? await this.syncCourseProgressTracking(
                workshop,
                meta.source,
                tracking,
                now,
              )
            : this.resolveTrackedCourseProgress(workshop, null, now);

        const externalStatus = this.toExternalCourseStatus(progress.status);
        const externalStatusLabel = this.toExternalCourseStatusLabel(
          progress.status,
        );

        const completedOn =
          progress.status === CourseProgressStatus.COMPLETED
            ? (tracking?.courseCompletedAt ?? endDate)
            : null;

        const dayStatuses = this.getCourseDayStatuses(
          workshop,
          progress.status,
          now,
        );

        return {
          workshopId: workshop.id,
          title: workshop.title,
          shortBlurb: workshop.shortBlurb ?? null,
          standardBaseRate: workshop.standardBaseRate,
          courseType: workshop.deliveryMode,
          workshopPhoto: workshop.coverImageUrl ?? null,
          status: externalStatus,
          statusLabel: externalStatusLabel,
          isEnrolled: true,
          enrolledAt,
          startDate,
          endDate,
          registrationDeadline: workshop.registrationDeadline ?? null,
          completedOn,
          totalHours,
          cmeCredits: workshop.offersCmeCredits ? totalHours : 0,
          earnedCmeCredits:
            progress.status === CourseProgressStatus.COMPLETED &&
            workshop.offersCmeCredits
              ? totalHours
              : 0,
          offersCmeCredits: workshop.offersCmeCredits,
          totalDays: progress.totalDays,
          completedDays: progress.completedDays,
          remainingDays: progress.remainingDays,
          days: {
            summary: {
              totalDays: progress.totalDays,
              completedDays: progress.completedDays,
              remainingDays: progress.remainingDays,
            },
            data: dayStatuses,
          },
          reservation: reservation
            ? {
                reservationId: reservation.id,
                status: reservation.status,
                numberOfSeats: reservation.numberOfSeats,
                pricePerSeat: reservation.pricePerSeat,
                totalPrice: reservation.totalPrice,
              }
            : null,
          facilities,
          createdAt: workshop.createdAt,
          _rawStatus: progress.status,
        };
      }),
    );

    if (targetStatus === 'active' || targetStatus === 'confirmed') {
      items = items.filter(
        (item) =>
          item.status === 'browse' ||
          item._rawStatus !== CourseProgressStatus.COMPLETED,
      );
    } else if (targetStatus === 'completed') {
      items = items.filter(
        (item) => item._rawStatus === CourseProgressStatus.COMPLETED,
      );
    }

    if (query.courseType) {
      items = items.filter((item) => item.courseType === query.courseType);
    }

    if (query.search?.trim()) {
      const search = query.search.trim().toLowerCase();
      items = items.filter((item) => item.title.toLowerCase().includes(search));
    }

    const sortBy = query.sortBy ?? 'startDate';
    const sortDirection = query.sortOrder === 'desc' ? -1 : 1;

    items.sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title) * sortDirection;
      }

      const toTime = (value: Date | null) => (value ? +new Date(value) : 0);

      if (sortBy === 'endDate') {
        return (toTime(a.endDate) - toTime(b.endDate)) * sortDirection;
      }

      if (sortBy === 'completedDate') {
        return (toTime(a.completedOn) - toTime(b.completedOn)) * sortDirection;
      }

      if (sortBy === 'createdAt') {
        return (
          (+new Date(a.createdAt) - +new Date(b.createdAt)) * sortDirection
        );
      }

      return (toTime(a.startDate) - toTime(b.startDate)) * sortDirection;
    });

    const total = items.length;
    const pagedItems = items
      .slice(skip, skip + limit)
      .map(({ _rawStatus, ...item }) => item);

    return {
      message: 'My courses fetched successfully',
      data: pagedItems,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── 6. GET FEATURED COURSE API ──
  async getFeaturedCourse() {
    // Find the single latest published workshop
    const workshop = await this.workshopsRepo.findOne({
      where: { status: WorkshopStatus.PUBLISHED },
      order: { createdAt: 'DESC' }, // Last created
      relations: ['days', 'days.segments'],
    });

    if (!workshop) {
      return {
        message: 'No featured course available.',
        data: null,
      };
    }

    // Calculate dates
    const { startDate, endDate } = this.getWorkshopDateRange(workshop);

    let dateRangeStr = 'TBA';
    if (startDate && endDate) {
      const firstMonth = startDate.toLocaleDateString('en-US', {
        month: 'short',
      });
      const lastMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
      dateRangeStr =
        firstMonth === lastMonth
          ? `${firstMonth} ${startDate.getDate()} - ${endDate.getDate()}`
          : `${firstMonth} ${startDate.getDate()} - ${lastMonth} ${endDate.getDate()}`;
    }

    // Safely fetch facility to show location name
    const validFacilityIds = (workshop.facilityIds || []).filter(
      (id) => id && id.toLowerCase() !== 'online' && id.length === 36,
    );

    let locationName =
      workshop.deliveryMode === 'online' ? 'Online Course' : 'Venue TBA';

    if (validFacilityIds.length > 0) {
      const facilities = await this.facilitiesRepo.find({
        where: { id: In(validFacilityIds) },
        take: 1,
      });
      if (facilities.length > 0) {
        locationName = facilities[0].name;
      }
    }

    // Calculate total hours
    const totalMinutes = this.getWorkshopTotalMinutes(workshop);
    const totalHours = Number((totalMinutes / 60).toFixed(1));

    return {
      message: 'Featured course fetched successfully',
      data: {
        id: workshop.id,
        title: workshop.title,
        shortBlurb: workshop.shortBlurb,
        courseType: workshop.deliveryMode,
        coverImageUrl: workshop.coverImageUrl,
        dateRange: dateRangeStr,
        location: locationName,
        cmeCredits: workshop.offersCmeCredits ? totalHours : 0,
        offersCmeCredits: workshop.offersCmeCredits,
        isFeatured: true,
      },
    };
  }

  async createOrderSummary(userId: string, dto: CheckoutOrderSummaryDto) {
    const workshop = await this.workshopsRepo.findOne({
      where: { id: dto.workshopId, status: WorkshopStatus.PUBLISHED },
      relations: ['groupDiscounts'],
    });

    if (!workshop) {
      throw new NotFoundException(
        'Workshop not found or not available for booking',
      );
    }

    if (workshop.registrationDeadline) {
      const now = new Date();
      const deadline = new Date(workshop.registrationDeadline);

      if (now > deadline) {
        throw new BadRequestException(
          'Registration for this workshop has closed. You cannot purchase this course anymore.',
        );
      }
    }

    if (!dto.attendees || dto.attendees.length === 0) {
      throw new BadRequestException('At least one attendee is required');
    }

    const normalizedEmails = dto.attendees.map((attendee) =>
      attendee.email.trim().toLowerCase(),
    );

    const duplicateEmailsInPayload = normalizedEmails.filter(
      (email, index) => normalizedEmails.indexOf(email) !== index,
    );

    if (duplicateEmailsInPayload.length > 0) {
      const uniqueDuplicates = [...new Set(duplicateEmailsInPayload)];
      throw new BadRequestException(
        `Duplicate attendee email(s) in request: ${uniqueDuplicates.join(', ')}`,
      );
    }

    // Check if any provided attendee email is already actively enrolled
    // in the same workshop through a confirmed reservation and not fully refunded.
    const alreadyEnrolledRows = await this.attendeesRepo
      .createQueryBuilder('att')
      .innerJoin(
        WorkshopReservation,
        'res',
        'res.id = att.reservationId AND res.workshopId = :workshopId AND res.status = :confirmedStatus',
        {
          workshopId: dto.workshopId,
          confirmedStatus: ReservationStatus.CONFIRMED,
        },
      )
      .leftJoin(
        WorkshopRefundItem,
        'ri',
        'ri.attendeeId = att.id AND ri.status = :refundedItemStatus',
        {
          refundedItemStatus: WorkshopRefundItemStatus.REFUNDED,
        },
      )
      .leftJoin(
        WorkshopRefund,
        'rf',
        'rf.id = ri.refundId AND rf.status = :processedRefundStatus',
        {
          processedRefundStatus: WorkshopRefundStatus.PROCESSED,
        },
      )
      .where('LOWER(att.email) IN (:...emails)', { emails: normalizedEmails })
      .andWhere('rf.id IS NULL')
      .select([
        'att.email AS email',
        'att.fullName AS "fullName"',
        'res.id AS "reservationId"',
      ])
      .getRawMany();

    if (alreadyEnrolledRows.length > 0) {
      const enrolledEmails = [
        ...new Set(
          alreadyEnrolledRows.map((row) => String(row.email).toLowerCase()),
        ),
      ];

      throw new BadRequestException(
        `These attendee email(s) are already enrolled in this workshop: ${enrolledEmails.join(', ')}. You can continue enrollment for other attendees only.`,
      );
    }

    const reservedSeatsResult = await this.reservationsRepo
      .createQueryBuilder('r')
      .select('SUM(r.numberOfSeats)', 'total')
      .where('r.workshopId = :workshopId', { workshopId: dto.workshopId })
      .andWhere('r.status != :cancelledStatus', {
        cancelledStatus: ReservationStatus.CANCELLED,
      })
      .getRawOne();

    const reservedSeats = parseInt(reservedSeatsResult?.total || '0', 10);
    const availableSeats = workshop.capacity - reservedSeats;
    const numberOfSeats = dto.attendees.length;

    if (availableSeats < numberOfSeats) {
      throw new BadRequestException(
        `Only ${availableSeats} seats available. You are trying to book ${numberOfSeats} seats.`,
      );
    }

    const standardPricePerSeat = Number(workshop.standardBaseRate);
    let appliedPricePerSeat = standardPricePerSeat;
    let discountApplied = false;
    let discountInfo: any = null;

    if (workshop.groupDiscountEnabled && workshop.groupDiscounts?.length > 0) {
      const applicableDiscounts = workshop.groupDiscounts
        .filter((d) => numberOfSeats >= d.minimumAttendees)
        .sort(
          (a, b) => Number(a.groupRatePerPerson) - Number(b.groupRatePerPerson),
        );

      if (applicableDiscounts.length > 0) {
        const bestDiscount = applicableDiscounts[0];
        appliedPricePerSeat = Number(bestDiscount.groupRatePerPerson);
        discountApplied = true;
        discountInfo = {
          minimumAttendees: bestDiscount.minimumAttendees,
          discountedPrice: appliedPricePerSeat.toFixed(2),
          savingsPerSeat: (standardPricePerSeat - appliedPricePerSeat).toFixed(
            2,
          ),
          totalSavings: (
            (standardPricePerSeat - appliedPricePerSeat) *
            numberOfSeats
          ).toFixed(2),
        };
      }
    }

    const subtotal = appliedPricePerSeat * numberOfSeats;
    const totalPrice = subtotal;

    const existingPendingSummary = await this.orderSummariesRepo.findOne({
      where: {
        workshopId: dto.workshopId,
        userId,
        status: OrderSummaryStatus.PENDING,
      },
      relations: ['attendees'],
      order: { updatedAt: 'DESC' },
    });

    let saved: WorkshopOrderSummary;
    let upsertAction: 'created' | 'updated' = 'created';

    if (existingPendingSummary) {
      upsertAction = 'updated';

      if (existingPendingSummary.attendees?.length) {
        await this.orderAttendeesRepo.delete({
          orderSummaryId: existingPendingSummary.id,
        });
      }

      existingPendingSummary.numberOfSeats = numberOfSeats;
      existingPendingSummary.pricePerSeat = appliedPricePerSeat.toString();
      existingPendingSummary.totalPrice = totalPrice.toString();
      existingPendingSummary.discountApplied = discountApplied;
      existingPendingSummary.discountInfo = discountInfo
        ? JSON.stringify(discountInfo)
        : undefined;
      existingPendingSummary.status = OrderSummaryStatus.PENDING;
      existingPendingSummary.attendees = dto.attendees.map((attendee) => ({
        fullName: attendee.fullName,
        professionalRole: attendee.professionalRole,
        npiNumber: attendee.npiNumber,
        email: attendee.email.trim().toLowerCase(),
      })) as any;

      saved = await this.orderSummariesRepo.save(existingPendingSummary);
    } else {
      const orderSummary = this.orderSummariesRepo.create({
        workshopId: dto.workshopId,
        userId,
        numberOfSeats,
        pricePerSeat: appliedPricePerSeat.toString(),
        totalPrice: totalPrice.toString(),
        discountApplied,
        discountInfo: discountInfo ? JSON.stringify(discountInfo) : null,
        status: OrderSummaryStatus.PENDING,
        attendees: dto.attendees.map((attendee) => ({
          fullName: attendee.fullName,
          professionalRole: attendee.professionalRole,
          npiNumber: attendee.npiNumber,
          email: attendee.email.trim().toLowerCase(),
        })),
      } as DeepPartial<WorkshopOrderSummary>);

      saved = await this.orderSummariesRepo.save(
        orderSummary as WorkshopOrderSummary,
      );
    }

    return {
      message:
        upsertAction === 'updated'
          ? 'Order summary updated successfully'
          : 'Order summary created successfully',
      data: {
        orderSummaryId: saved.id,
        workshop: {
          id: workshop.id,
          title: workshop.title,
          registrationDeadline: workshop.registrationDeadline ?? null,
          deliveryMode: workshop.deliveryMode,
          coverImageUrl: workshop.coverImageUrl,
        },
        attendees: saved.attendees.map((attendee, index) => ({
          id: attendee.id,
          index: index + 1,
          fullName: attendee.fullName,
          professionalRole: attendee.professionalRole,
          npiNumber: attendee.npiNumber,
          email: attendee.email,
        })),
        numberOfAttendees: numberOfSeats,
        availableSeats,
        pricing: {
          standardPricePerSeat: standardPricePerSeat.toFixed(2),
          appliedPricePerSeat: appliedPricePerSeat.toFixed(2),
          discountApplied,
          discountInfo,
          subtotal: subtotal.toFixed(2),
          tax: '0.00',
          totalPrice: totalPrice.toFixed(2),
        },
        createdAt: saved.createdAt,
      },
    };
  }

  async getOrderSummary(userId: string, orderSummaryId: string) {
    const orderSummary = await this.orderSummariesRepo.findOne({
      where: { id: orderSummaryId, userId },
      relations: ['attendees', 'workshop'],
    });

    if (!orderSummary) {
      throw new NotFoundException('Order summary not found');
    }

    const discountInfo = orderSummary.discountInfo
      ? JSON.parse(orderSummary.discountInfo)
      : null;

    return {
      message: 'Order summary fetched successfully',
      data: {
        orderSummaryId: orderSummary.id,
        workshop: {
          id: orderSummary.workshop.id,
          title: orderSummary.workshop.title,
          registrationDeadline:
            orderSummary.workshop.registrationDeadline ?? null,
          deliveryMode: orderSummary.workshop.deliveryMode,
          coverImageUrl: orderSummary.workshop.coverImageUrl,
        },
        attendees: orderSummary.attendees.map((attendee, index) => ({
          id: attendee.id,
          index: index + 1,
          fullName: attendee.fullName,
          professionalRole: attendee.professionalRole,
          npiNumber: attendee.npiNumber,
          email: attendee.email,
        })),
        numberOfAttendees: orderSummary.numberOfSeats,
        pricing: {
          pricePerSeat: orderSummary.pricePerSeat,
          discountApplied: orderSummary.discountApplied,
          discountInfo,
          totalPrice: orderSummary.totalPrice,
        },
        status: orderSummary.status,
        createdAt: orderSummary.createdAt,
        updatedAt: orderSummary.updatedAt,
      },
    };
  }

  async createPaymentSession(
    userId: string,
    dto: CreateWorkshopPaymentSessionDto,
  ) {
    const orderSummary = await this.orderSummariesRepo.findOne({
      where: { id: dto.orderSummaryId, userId },
      relations: ['workshop', 'attendees'],
    });

    if (!orderSummary) {
      throw new NotFoundException('Order summary not found');
    }

    if (orderSummary.status === OrderSummaryStatus.EXPIRED) {
      throw new BadRequestException(
        'Order summary already used for reservation',
      );
    }

    if (orderSummary.status === OrderSummaryStatus.COMPLETED) {
      return {
        message: 'Workshop payment already verified for this order summary',
        data: {
          orderSummaryId: orderSummary.id,
          status: orderSummary.status,
          paymentStatus: 'paid',
        },
      };
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new BadRequestException('STRIPE_SECRET_KEY is not configured');
    }

    const successUrl =
      dto.successUrl ||
      process.env.WORKSHOP_STRIPE_CHECKOUT_SUCCESS_URL ||
      process.env.STRIPE_CHECKOUT_SUCCESS_URL;
    const cancelUrl =
      dto.cancelUrl ||
      process.env.WORKSHOP_STRIPE_CHECKOUT_CANCEL_URL ||
      process.env.STRIPE_CHECKOUT_CANCEL_URL;

    if (!successUrl || !cancelUrl) {
      throw new BadRequestException(
        'successUrl and cancelUrl are required (request body or env)',
      );
    }

    const workshop = orderSummary.workshop;
    if (!workshop || workshop.status !== WorkshopStatus.PUBLISHED) {
      throw new NotFoundException(
        'Workshop not found or not available for booking',
      );
    }

    // Prevent payments after registration deadline
    if (workshop.registrationDeadline) {
      const now = new Date();
      const deadline = new Date(workshop.registrationDeadline);
      if (now > deadline) {
        throw new BadRequestException(
          'Registration for this workshop has closed. You cannot complete payment.',
        );
      }
    }

    const reservedSeatsResult = await this.reservationsRepo
      .createQueryBuilder('r')
      .select('SUM(r.numberOfSeats)', 'total')
      .where('r.workshopId = :workshopId', { workshopId: workshop.id })
      .andWhere('r.status != :cancelledStatus', {
        cancelledStatus: ReservationStatus.CANCELLED,
      })
      .getRawOne();

    const reservedSeats = parseInt(reservedSeatsResult?.total || '0', 10);
    const availableSeats = workshop.capacity - reservedSeats;

    if (availableSeats < orderSummary.numberOfSeats) {
      throw new BadRequestException(
        `Only ${availableSeats} seats available. You are trying to book ${orderSummary.numberOfSeats} seats.`,
      );
    }

    const unitAmount = Math.round(Number(orderSummary.pricePerSeat) * 100);
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      throw new BadRequestException('Invalid order summary amount');
    }

    const stripe = Stripe(stripeSecretKey);

    // Use first attendee's email for Stripe checkout pre-fill
    const customerEmail = orderSummary.attendees?.[0]?.email || undefined;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail,
      line_items: [
        {
          quantity: orderSummary.numberOfSeats,
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            product_data: {
              name: `Workshop: ${workshop.title}`,
              metadata: {
                workshopId: workshop.id,
                orderSummaryId: orderSummary.id,
              },
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        flowType: 'workshop',
        userId,
        workshopId: workshop.id,
        orderSummaryId: orderSummary.id,
        attendees: String(orderSummary.numberOfSeats),
      },
    });

    return {
      message: 'Workshop checkout session created successfully',
      data: {
        sessionId: session.id,
        checkoutUrl: session.url,
        orderSummaryId: orderSummary.id,
        workshop: {
          id: workshop.id,
          title: workshop.title,
          registrationDeadline: workshop.registrationDeadline ?? null,
        },
        numberOfAttendees: orderSummary.numberOfSeats,
        totalPrice: orderSummary.totalPrice,
        status: orderSummary.status,
      },
    };
  }

  // async verifyPayment(userId: string, dto: VerifyWorkshopPaymentDto) {
  //   const orderSummary = await this.orderSummariesRepo.findOne({
  //     where: { id: dto.orderSummaryId, userId },
  //     relations: ['workshop', 'attendees'],
  //   });

  //   if (!orderSummary) {
  //     throw new NotFoundException('Order summary not found');
  //   }

  //   if (orderSummary.status === OrderSummaryStatus.EXPIRED) {
  //     throw new BadRequestException(
  //       'Order summary already used for reservation',
  //     );
  //   }

  //   if (orderSummary.status === OrderSummaryStatus.COMPLETED) {
  //     return {
  //       message: 'Workshop payment already verified',
  //       data: {
  //         orderSummaryId: orderSummary.id,
  //         status: orderSummary.status,
  //         paymentStatus: 'paid',
  //       },
  //     };
  //   }

  //   const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  //   if (!stripeSecretKey) {
  //     throw new BadRequestException('STRIPE_SECRET_KEY is not configured');
  //   }

  //   const stripe = Stripe(stripeSecretKey);
  //   const session = await stripe.checkout.sessions.retrieve(dto.sessionId);

  //   if (!session) {
  //     throw new BadRequestException('Invalid Stripe checkout session');
  //   }

  //   if (session.metadata?.orderSummaryId !== orderSummary.id) {
  //     throw new BadRequestException(
  //       'Checkout session does not match order summary',
  //     );
  //   }

  //   if (session.metadata?.userId !== userId) {
  //     throw new BadRequestException('Checkout session does not belong to user');
  //   }

  //   if (session.payment_status !== 'paid') {
  //     throw new BadRequestException(
  //       `Payment not completed. Current payment_status: ${session.payment_status}`,
  //     );
  //   }

  //   orderSummary.status = OrderSummaryStatus.COMPLETED;
  //   const saved = await this.orderSummariesRepo.save(orderSummary);

  //   return {
  //     message: 'Workshop payment verified successfully',
  //     data: {
  //       orderSummaryId: saved.id,
  //       workshop: {
  //         id: saved.workshop.id,
  //         title: saved.workshop.title,
  //         registrationDeadline: saved.workshop.registrationDeadline ?? null,
  //       },
  //       numberOfAttendees: saved.numberOfSeats,
  //       totalPrice: saved.totalPrice,
  //       status: saved.status,
  //       paymentStatus: session.payment_status,
  //     },
  //   };
  // }

  private async sendWorkshopInvoiceEmail(params: {
    summaryId: string;
    payment: PaymentTransaction;
    user: User;
  }) {
    const orderSummary = await this.orderSummariesRepo.findOne({
      where: { id: params.summaryId, userId: params.user.id } as any,
      relations: ['workshop', 'attendees'],
    });

    if (!orderSummary) {
      throw new NotFoundException(
        'Workshop order summary not found for invoice email',
      );
    }

    const to =
      params.user.medicalEmail?.trim() ||
      (params.user as any).email?.trim() ||
      null;

    console.log('Workshop email target:', to);

    if (!to) {
      console.warn(
        `Workshop invoice email skipped: no recipient email for user ${params.user.id}`,
      );
      return;
    }

    await this.subscribersService.ensureSubscribedFromTrustedSource({
      email: to,
      source: 'WEBINAR',
      fullName: params.user.fullLegalName || null,
      clinicalRole: (params.user as any).clinicalRole || null,
      phone: params.user.phoneNumber || null,
      institution: (params.user as any).institution || null,
    });

    const invoiceBuffer =
      await this.invoiceService.generateWorkshopInvoiceBuffer({
        orderSummary,
        payment: params.payment,
        user: params.user,
      });

    const workshopTitle =
      (orderSummary as any).workshop?.title || 'Workshop Enrollment';
    const totalPrice = Number((orderSummary as any).totalPrice || 0);

    const subject = `Payment received - ${workshopTitle}`;
    const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Workshop Payment Successful</h2>
      <p>Hello ${params.user.fullLegalName || 'Customer'},</p>
      <p>Your workshop payment was received successfully.</p>
      <p><b>Workshop:</b> ${workshopTitle}</p>
      <p><b>Paid Amount:</b> $${totalPrice.toFixed(2)}</p>
      <p>Your invoice is attached as a PDF for your records.</p>
      <p>Thank you.</p>
    </div>
  `;

    const text = [
      'Workshop Payment Successful',
      '',
      `Hello ${params.user.fullLegalName || 'Customer'},`,
      `Workshop: ${workshopTitle}`,
      `Paid Amount: $${totalPrice.toFixed(2)}`,
      'Your invoice is attached as a PDF.',
      'Thank you.',
    ].join('\n');

    await this.mailService.sendPaymentSuccessEmailWithInvoice({
      to,
      customerName: params.user.fullLegalName,
      subject,
      html,
      text,
      invoiceFileName: `invoice-workshop-${orderSummary.id.slice(0, 8)}.pdf`,
      invoiceBuffer,
    });

    console.log(
      `Workshop invoice email sent successfully to ${to} for summary ${orderSummary.id}`,
    );
  }

  async verifyPayment(userId: string, dto: VerifyWorkshopPaymentDto) {
    const orderSummary = await this.orderSummariesRepo.findOne({
      where: { id: dto.orderSummaryId, userId },
      relations: ['workshop', 'attendees'],
    });

    if (!orderSummary) {
      throw new NotFoundException('Order summary not found');
    }

    if (orderSummary.status === OrderSummaryStatus.EXPIRED) {
      throw new BadRequestException(
        'Order summary already used for reservation',
      );
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new BadRequestException('STRIPE_SECRET_KEY is not configured');
    }

    const stripe = Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(dto.sessionId);

    if (!session) {
      throw new BadRequestException('Invalid Stripe checkout session');
    }

    if (
      session.metadata?.orderSummaryId &&
      session.metadata.orderSummaryId !== orderSummary.id
    ) {
      throw new BadRequestException(
        'Checkout session does not match order summary',
      );
    }

    if (session.metadata?.userId && session.metadata.userId !== userId) {
      throw new BadRequestException('Checkout session does not belong to user');
    }

    if (session.payment_status !== 'paid') {
      throw new BadRequestException(
        `Payment not completed. Current payment_status: ${session.payment_status}`,
      );
    }

    const user = await this.userRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let payment: PaymentTransaction | null = null;

    if (session.metadata?.paymentId) {
      payment = await this.paymentsRepo.findOne({
        where: {
          id: session.metadata.paymentId,
          userId,
          domainType: PaymentDomainType.WORKSHOP,
        },
      });
    }

    if (!payment) {
      payment = await this.paymentsRepo.findOne({
        where: {
          userId,
          domainType: PaymentDomainType.WORKSHOP,
          providerSessionId: session.id,
        },
        order: { createdAt: 'DESC' },
      });
    }

    if (!payment && typeof session.payment_intent === 'string') {
      payment = await this.paymentsRepo.findOne({
        where: {
          userId,
          domainType: PaymentDomainType.WORKSHOP,
          providerPaymentIntentId: session.payment_intent,
        },
        order: { createdAt: 'DESC' },
      });
    }

    if (!payment) {
      payment = await this.paymentsRepo.findOne({
        where: {
          userId,
          domainType: PaymentDomainType.WORKSHOP,
          domainRefId: orderSummary.id,
        },
        order: { createdAt: 'DESC' },
      });
    }

    if (!payment) {
      payment = this.paymentsRepo.create({
        userId,
        domainType: PaymentDomainType.WORKSHOP,
        domainRefId: orderSummary.id,
        provider: PaymentProvider.STRIPE,
        amount: String(orderSummary.totalPrice),
        currency: 'usd',
        status: PaymentTransactionStatus.PAID,
        providerSessionId: session.id,
        providerPaymentIntentId:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : undefined,
        paidAt: new Date(),
        finalizedRefId: orderSummary.id,
        idempotencyKey: `${userId}:workshop:${orderSummary.id}:verified`,
        metadata: {
          orderSummaryId: orderSummary.id,
          workshopId: orderSummary.workshop?.id ?? null,
          workshopTitle: orderSummary.workshop?.title ?? null,
          numberOfAttendees: orderSummary.numberOfSeats,
          totalPrice: orderSummary.totalPrice,
          verifiedFrom: 'workshops.verifyPayment',
        },
      });
    } else {
      payment.providerSessionId = session.id;
      payment.providerPaymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : payment.providerPaymentIntentId;
      payment.status = PaymentTransactionStatus.PAID;
      payment.paidAt = payment.paidAt ?? new Date();
      payment.finalizedRefId = orderSummary.id;
      payment.metadata = {
        ...(payment.metadata ?? {}),
        orderSummaryId: orderSummary.id,
        workshopId: orderSummary.workshop?.id ?? null,
        workshopTitle: orderSummary.workshop?.title ?? null,
        numberOfAttendees: orderSummary.numberOfSeats,
        totalPrice: orderSummary.totalPrice,
        verifiedFrom: 'workshops.verifyPayment',
      };
    }

    const savedPayment = await this.paymentsRepo.save(payment);

    if (orderSummary.status !== OrderSummaryStatus.COMPLETED) {
      orderSummary.status = OrderSummaryStatus.COMPLETED;
      await this.orderSummariesRepo.save(orderSummary);
    }

    const alreadySent = Boolean(
      savedPayment.metadata?.workshopInvoiceEmailSentAt,
    );

    if (!alreadySent) {
      try {
        await this.sendWorkshopInvoiceEmail({
          summaryId: orderSummary.id,
          payment: savedPayment,
          user,
        });

        savedPayment.metadata = {
          ...(savedPayment.metadata ?? {}),
          orderSummaryId: orderSummary.id,
          workshopInvoiceEmailSentAt: new Date().toISOString(),
        };

        await this.paymentsRepo.save(savedPayment);
      } catch (emailError) {
        console.error(
          `Failed to send workshop invoice email for summary ${orderSummary.id}:`,
          emailError,
        );
      }
    }

    return {
      message: 'Workshop payment verified successfully',
      data: {
        orderSummaryId: orderSummary.id,
        workshop: {
          id: orderSummary.workshop.id,
          title: orderSummary.workshop.title,
          registrationDeadline:
            orderSummary.workshop.registrationDeadline ?? null,
        },
        numberOfAttendees: orderSummary.numberOfSeats,
        totalPrice: orderSummary.totalPrice,
        status: orderSummary.status,
        paymentStatus: session.payment_status,
      },
    };
  }

  async createReservation(userId: string, dto: CreateReservationDto) {
    // Validate attendeeIds
    if (!dto.attendeeIds || dto.attendeeIds.length === 0) {
      throw new BadRequestException('At least one attendee ID is required');
    }

    // Find attendees from order summaries (must belong to the user)
    const attendees = await this.orderAttendeesRepo
      .createQueryBuilder('att')
      .leftJoinAndSelect('att.orderSummary', 'os')
      .where('att.id IN (:...attendeeIds)', { attendeeIds: dto.attendeeIds })
      .andWhere('os.userId = :userId', { userId })
      .andWhere('os.workshopId = :workshopId', { workshopId: dto.workshopId })
      .andWhere('os.status = :status', { status: OrderSummaryStatus.COMPLETED })
      .getMany();

    if (attendees.length !== dto.attendeeIds.length) {
      throw new BadRequestException(
        'Invalid attendee IDs, payment not verified, or attendees do not belong to your paid order summary',
      );
    }

    // Find workshop
    const workshop = await this.workshopsRepo.findOne({
      where: { id: dto.workshopId, status: WorkshopStatus.PUBLISHED },
      relations: ['groupDiscounts'],
    });

    if (!workshop) {
      throw new NotFoundException(
        'Workshop not found or not available for booking',
      );
    }

    const numberOfSeatsBeingAdded = attendees.length;

    // ✅ NEW: Check if user already has an active reservation for this workshop
    const existingReservation = await this.reservationsRepo.findOne({
      where: {
        workshopId: dto.workshopId,
        userId,
        status: ReservationStatus.CONFIRMED,
      },
      relations: ['attendees'],
    });

    // If existing reservation found, MERGE the attendees instead of creating new
    if (existingReservation) {
      // Get current reserved seats count (excluding this user's existing reservation for accurate calculation)
      const reservedSeatsResult = await this.reservationsRepo
        .createQueryBuilder('r')
        .select('SUM(r.numberOfSeats)', 'total')
        .where('r.workshopId = :workshopId', { workshopId: dto.workshopId })
        .andWhere('r.status != :cancelledStatus', {
          cancelledStatus: 'cancelled',
        })
        .andWhere('r.id != :reservationId', {
          reservationId: existingReservation.id,
        })
        .getRawOne();

      const otherReservedSeats = parseInt(
        reservedSeatsResult?.total || '0',
        10,
      );
      const totalCapacity = workshop.capacity;
      const availableSeatsForMerge = totalCapacity - otherReservedSeats;

      // Check if we have enough seats to add new attendees
      if (availableSeatsForMerge < numberOfSeatsBeingAdded) {
        throw new BadRequestException(
          `Only ${availableSeatsForMerge} seats available. You are trying to add ${numberOfSeatsBeingAdded} more attendees.`,
        );
      }

      // ✅ MERGE: Add new attendees to existing reservation
      const newAttendees = attendees.map((att) =>
        this.attendeesRepo.create({
          fullName: att.fullName,
          professionalRole: att.professionalRole,
          npiNumber: att.npiNumber,
          email: att.email,
        }),
      );

      existingReservation.attendees = [
        ...existingReservation.attendees,
        ...newAttendees,
      ];

      // Update seat count and price
      const updatedNumberOfSeats =
        existingReservation.numberOfSeats + numberOfSeatsBeingAdded;

      // Recalculate price with group discount if applicable
      let pricePerSeat = Number(workshop.standardBaseRate);

      if (
        workshop.groupDiscountEnabled &&
        workshop.groupDiscounts?.length > 0
      ) {
        const applicableDiscounts = workshop.groupDiscounts
          .filter((d) => updatedNumberOfSeats >= d.minimumAttendees)
          .sort(
            (a, b) =>
              Number(a.groupRatePerPerson) - Number(b.groupRatePerPerson),
          );

        if (applicableDiscounts.length > 0) {
          pricePerSeat = Number(applicableDiscounts[0].groupRatePerPerson);
        }
      }

      const totalPrice = pricePerSeat * updatedNumberOfSeats;

      // Update the existing reservation
      existingReservation.numberOfSeats = updatedNumberOfSeats;
      existingReservation.pricePerSeat = pricePerSeat.toString();
      existingReservation.totalPrice = totalPrice.toString();

      const updated = await this.reservationsRepo.save(existingReservation);

      // Mark order summary as consumed
      await this.orderSummariesRepo.update(
        { id: attendees[0].orderSummary.id },
        { status: OrderSummaryStatus.EXPIRED },
      );

      return {
        message:
          'New attendees added to existing workshop booking successfully (merged)',
        data: {
          reservationId: updated.id,
          workshopId: updated.workshopId,
          numberOfSeats: updated.numberOfSeats,
          pricePerSeat: updated.pricePerSeat,
          totalPrice: updated.totalPrice,
          status: updated.status,
          attendeesCount: updated.attendees.length,
          attendees: updated.attendees,
          action: 'merged_with_existing',
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      };
    }

    // Original logic: No existing reservation, create new one
    // Check available seats
    const reservedSeatsResult = await this.reservationsRepo
      .createQueryBuilder('r')
      .select('SUM(r.numberOfSeats)', 'total')
      .where('r.workshopId = :workshopId', { workshopId: dto.workshopId })
      .andWhere('r.status != :cancelledStatus', {
        cancelledStatus: 'cancelled',
      })
      .getRawOne();

    const reservedSeats = parseInt(reservedSeatsResult?.total || '0', 10);
    const availableSeats = workshop.capacity - reservedSeats;

    if (availableSeats < numberOfSeatsBeingAdded) {
      throw new BadRequestException(
        `Only ${availableSeats} seats available. You are trying to book ${numberOfSeatsBeingAdded} seats.`,
      );
    }

    // Calculate price (check if group discount applies)
    let pricePerSeat = Number(workshop.standardBaseRate);

    if (workshop.groupDiscountEnabled && workshop.groupDiscounts?.length > 0) {
      const applicableDiscounts = workshop.groupDiscounts
        .filter((d) => numberOfSeatsBeingAdded >= d.minimumAttendees)
        .sort(
          (a, b) => Number(a.groupRatePerPerson) - Number(b.groupRatePerPerson),
        );

      if (applicableDiscounts.length > 0) {
        pricePerSeat = Number(applicableDiscounts[0].groupRatePerPerson);
      }
    }

    const totalPrice = pricePerSeat * numberOfSeatsBeingAdded;

    // Create reservation with attendees mapped from order summary
    const reservation = this.reservationsRepo.create({
      workshopId: dto.workshopId,
      userId,
      numberOfSeats: numberOfSeatsBeingAdded,
      pricePerSeat: pricePerSeat.toString(),
      totalPrice: totalPrice.toString(),
      status: ReservationStatus.CONFIRMED,
      attendees: attendees.map((att) => ({
        fullName: att.fullName,
        professionalRole: att.professionalRole,
        npiNumber: att.npiNumber,
        email: att.email,
      })),
    } as DeepPartial<WorkshopReservation>);

    const saved = await this.reservationsRepo.save(
      reservation as WorkshopReservation,
    );

    // Mark order summary as consumed so the same paid summary cannot create duplicate reservations.
    await this.orderSummariesRepo.update(
      { id: attendees[0].orderSummary.id },
      { status: OrderSummaryStatus.EXPIRED },
    );

    return {
      message: 'Workshop booked successfully',
      data: {
        reservationId: saved.id,
        workshopId: saved.workshopId,
        numberOfSeats: saved.numberOfSeats,
        pricePerSeat: saved.pricePerSeat,
        totalPrice: saved.totalPrice,
        status: saved.status,
        attendees: saved.attendees,
        action: 'new_reservation_created',
        availableSeatsRemaining: availableSeats - numberOfSeatsBeingAdded,
        createdAt: saved.createdAt,
      },
    };
  }

  async getWorkshopEnrollees(
    workshopId: string,
    query: ListWorkshopEnrolleesQueryDto,
  ) {
    const workshop = await this.workshopsRepo.findOne({
      where: { id: workshopId },
      select: ['id', 'title', 'registrationDeadline'],
    });

    if (!workshop) {
      throw new NotFoundException(`Workshop with ID ${workshopId} not found`);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const reservations = await this.reservationsRepo.find({
      where: { workshopId },
      relations: ['attendees'],
      order: { createdAt: 'DESC' },
    });

    const pendingRefunds = await this.refundsRepo.find({
      where: {
        workshopId,
        status: WorkshopRefundStatus.PENDING,
      },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });

    const processedRefundItems = await this.refundItemsRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.refund', 'refund')
      .where('refund.workshopId = :workshopId', { workshopId })
      .andWhere('refund.status = :processedStatus', {
        processedStatus: WorkshopRefundStatus.PROCESSED,
      })
      .getMany();

    const pendingRefundByReservation = new Map<string, WorkshopRefund>();
    const pendingRequestedIds = new Set<string>();

    for (const refund of pendingRefunds) {
      if (!pendingRefundByReservation.has(refund.reservationId)) {
        pendingRefundByReservation.set(refund.reservationId, refund);
      }

      for (const item of refund.items ?? []) {
        pendingRequestedIds.add(item.attendeeId);
      }
    }

    const processedRefundMap = new Map<string, number>();

    for (const item of processedRefundItems) {
      const current = processedRefundMap.get(item.attendeeId) ?? 0;
      processedRefundMap.set(
        item.attendeeId,
        current + this.toMoney(item.refundAmount),
      );
    }

    const transformed = reservations.map((reservation) => {
      const originalGroupSize =
        reservation.attendees?.length ?? reservation.numberOfSeats ?? 1;

      const bookingType =
        reservation.bookingType ??
        ((originalGroupSize > 1 ? 'group' : 'single') as 'group' | 'single');

      const allMembers = (reservation.attendees ?? []).map((attendee) => {
        const refundedAmount = processedRefundMap.get(attendee.id);
        const isRefunded = refundedAmount !== undefined;
        const isRequested = pendingRequestedIds.has(attendee.id);

        let status: 'CONFIRMED' | 'REQUESTED' | 'REFUNDED' = 'CONFIRMED';
        if (isRefunded) {
          status = 'REFUNDED';
        } else if (isRequested) {
          status = 'REQUESTED';
        }

        return {
          attendeeId: attendee.id,
          fullName: attendee.fullName,
          email: attendee.email,
          institutionOrHospital: reservation.institutionOrHospital ?? null,
          status,
          refundedAmount: isRefunded
            ? this.toMoneyString(refundedAmount)
            : null,
        };
      });

      const refundedMembers = allMembers.filter(
        (member) => member.status === 'REFUNDED',
      );
      const requestedMembers = allMembers.filter(
        (member) => member.status === 'REQUESTED',
      );
      const activeMembers = allMembers.filter(
        (member) => member.status !== 'REFUNDED',
      );

      const refundRequestStatus =
        reservation.refundRequestStatus ||
        pendingRefundByReservation.has(reservation.id) ||
        requestedMembers.length > 0;

      const status = this.getEnrollmentRefundStatus(
        originalGroupSize,
        refundedMembers.length,
        refundRequestStatus,
      );

      return {
        reservationId: reservation.id,
        refundRequestId:
          pendingRefundByReservation.get(reservation.id)?.requestId ?? null,
        bookingType,
        groupSize: originalGroupSize,
        activeMemberCount: activeMembers.length,
        requestedMemberCount: requestedMembers.length,
        refundedMemberCount: refundedMembers.length,
        refundRequestStatus,
        showRefundActionButton: refundRequestStatus,
        studentInfo: {
          fullName:
            reservation.bookerFullName ??
            reservation.attendees?.[0]?.fullName ??
            'Unknown',
          email:
            reservation.bookerEmail ??
            reservation.attendees?.[0]?.email ??
            null,
          phoneNumber: reservation.bookerPhoneNumber ?? null,
        },
        institutionOrHospital: reservation.institutionOrHospital ?? null,
        registeredAt: reservation.createdAt,
        paymentAmount: reservation.totalPrice,
        status,
        paymentGateway: reservation.paymentGateway ?? null,
        transactionId: reservation.paymentTransactionId ?? null,
        members: allMembers,
        requestedMembers,
        refundedMembers,
      };
    });

    let filtered = transformed;

    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();

      filtered = filtered.filter((item) => {
        const matchesTop =
          item.studentInfo.fullName?.toLowerCase().includes(q) ||
          item.studentInfo.email?.toLowerCase().includes(q) ||
          item.institutionOrHospital?.toLowerCase().includes(q);

        const matchesMember = item.members.some(
          (member) =>
            member.fullName.toLowerCase().includes(q) ||
            member.email.toLowerCase().includes(q),
        );

        return Boolean(matchesTop || matchesMember);
      });
    }

    if (query.bookingType) {
      filtered = filtered.filter(
        (item) => item.bookingType === query.bookingType,
      );
    }

    if (query.enrollmentStatus) {
      filtered = filtered.filter(
        (item) => item.status === query.enrollmentStatus,
      );
    } else {
      filtered = filtered.filter((item) => item.status !== 'REFUNDED');
    }

    const totalEnrolled = transformed.reduce(
      (sum, item) => sum + item.activeMemberCount,
      0,
    );

    const refundRequested = transformed.filter(
      (item) => item.refundRequestStatus,
    ).length;

    const partialRefund = transformed.filter(
      (item) => item.status === 'PARTIAL_REFUNDED',
    ).length;

    const refunded = transformed.filter(
      (item) => item.status === 'REFUNDED',
    ).length;

    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + limit);

    return {
      message: 'Workshop enrollees fetched successfully',
      data: {
        workshop: {
          id: workshop.id,
          title: workshop.title,
          registrationDeadline: workshop.registrationDeadline ?? null,
        },
        overview: {
          totalEnrolled,
          refundRequested,
          partialRefund,
          refunded,
        },
        items: paginated,
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    };
  }

  async getRefundPreview(workshopId: string, reservationId: string) {
    const workshop = await this.workshopsRepo.findOne({
      where: { id: workshopId },
      select: ['id', 'title'],
    });

    if (!workshop) {
      throw new NotFoundException(`Workshop with ID ${workshopId} not found`);
    }

    const reservation = await this.reservationsRepo.findOne({
      where: { id: reservationId, workshopId },
      relations: ['attendees'],
    });

    if (!reservation) {
      throw new NotFoundException(
        `Reservation with ID ${reservationId} not found for this workshop`,
      );
    }

    const processedRefundItems = await this.refundItemsRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.refund', 'refund')
      .where('refund.reservationId = :reservationId', { reservationId })
      .andWhere('refund.status = :processedStatus', {
        processedStatus: WorkshopRefundStatus.PROCESSED,
      })
      .getMany();

    const pendingRefund = await this.refundsRepo.findOne({
      where: {
        workshopId,
        reservationId,
        status: WorkshopRefundStatus.PENDING,
      },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });

    const processedRefundMap = new Map<string, { refundedAmount: string }>();

    for (const item of processedRefundItems) {
      processedRefundMap.set(item.attendeeId, {
        refundedAmount: item.refundAmount,
      });
    }

    const pendingRequestedIds = new Set(
      (pendingRefund?.items ?? []).map((item) => item.attendeeId),
    );

    const originalGroupSize =
      reservation.attendees?.length ?? reservation.numberOfSeats ?? 1;
    const bookingType =
      reservation.bookingType ??
      ((originalGroupSize > 1 ? 'group' : 'single') as 'group' | 'single');

    const perSeatAmount = this.toMoney(reservation.pricePerSeat);

    const members = (reservation.attendees ?? []).map((attendee) => {
      const processed = processedRefundMap.get(attendee.id);
      const isRefunded = Boolean(processed);
      const isRequested = pendingRequestedIds.has(attendee.id);

      let status: 'CONFIRMED' | 'REQUESTED' | 'REFUNDED' = 'CONFIRMED';
      if (isRefunded) {
        status = 'REFUNDED';
      } else if (isRequested) {
        status = 'REQUESTED';
      }

      return {
        attendeeId: attendee.id,
        fullName: attendee.fullName,
        email: attendee.email,
        refundAmount: this.toMoneyString(perSeatAmount),
        status,
        isSelectable: !isRefunded,
        isRequested,
      };
    });

    const requestedMembers =
      pendingRequestedIds.size > 0
        ? members.filter((member) => member.isRequested)
        : [];

    const defaultSelectedMembers =
      requestedMembers.length > 0
        ? requestedMembers
        : members.filter(
            (member) => member.isSelectable && !member.isRequested,
          );

    const calculatedRefundAmount = defaultSelectedMembers.reduce(
      (sum, member) => sum + this.toMoney(member.refundAmount),
      0,
    );

    return {
      message: 'Refund preview fetched successfully',
      data: {
        reservationId: reservation.id,
        workshopId,
        requestId: pendingRefund?.requestId ?? null,
        bookingOwner: {
          fullName:
            reservation.bookerFullName ??
            reservation.attendees?.[0]?.fullName ??
            'Unknown',
        },
        bookingType,
        groupSize: originalGroupSize,
        activeGroupSize: members.filter(
          (member) => member.status !== 'REFUNDED',
        ).length,
        totalPaid: reservation.totalPrice,
        paymentGateway: reservation.paymentGateway ?? null,
        transactionId: reservation.paymentTransactionId ?? null,
        refundRequestStatus:
          reservation.refundRequestStatus || Boolean(pendingRefund),
        requestedMembers,
        members,
        summary: {
          selectedCount: defaultSelectedMembers.length,
          calculatedRefundAmount: this.toMoneyString(calculatedRefundAmount),
        },
      },
    };
  }

  async confirmRefund(
    workshopId: string,
    adminId: string,
    dto: ConfirmWorkshopRefundDto,
  ) {
    return await this.refundsRepo.manager.transaction(async (manager) => {
      const workshopsRepo = manager.getRepository(Workshop);
      const reservationsRepo = manager.getRepository(WorkshopReservation);
      const attendeesRepo = manager.getRepository(WorkshopAttendee);
      const refundsRepo = manager.getRepository(WorkshopRefund);
      const refundItemsRepo = manager.getRepository(WorkshopRefundItem);

      const workshop = await workshopsRepo.findOne({
        where: { id: workshopId },
        select: ['id', 'title'],
      });

      if (!workshop) {
        throw new NotFoundException(`Workshop with ID ${workshopId} not found`);
      }

      const reservation = await reservationsRepo.findOne({
        where: { id: dto.reservationId, workshopId },
        relations: ['attendees'],
      });

      if (!reservation) {
        throw new NotFoundException(
          `Reservation with ID ${dto.reservationId} not found for this workshop`,
        );
      }

      const normalizedAttendeeIds = [...new Set(dto.attendeeIds)];

      const attendees = await attendeesRepo.find({
        where: {
          reservationId: dto.reservationId,
          id: In(normalizedAttendeeIds),
        },
      });

      if (attendees.length !== normalizedAttendeeIds.length) {
        throw new BadRequestException(
          'One or more attendeeIds are invalid for this reservation',
        );
      }

      const totalRefundAmount = this.toMoney(dto.refundAmount);
      if (totalRefundAmount <= 0) {
        throw new BadRequestException('refundAmount must be greater than 0');
      }

      const processedRefundItems = await refundItemsRepo
        .createQueryBuilder('item')
        .leftJoin('item.refund', 'refund')
        .where('refund.reservationId = :reservationId', {
          reservationId: dto.reservationId,
        })
        .andWhere('refund.status = :processedStatus', {
          processedStatus: WorkshopRefundStatus.PROCESSED,
        })
        .getMany();

      const alreadyRefundedIds = new Set(
        processedRefundItems.map((item) => item.attendeeId),
      );

      const invalidSelectedIds = normalizedAttendeeIds.filter((id) =>
        alreadyRefundedIds.has(id),
      );

      if (invalidSelectedIds.length > 0) {
        throw new BadRequestException(
          'One or more selected attendees are already refunded',
        );
      }

      const originalGroupSize =
        reservation.attendees?.length ?? reservation.numberOfSeats ?? 1;

      const bookingType =
        reservation.bookingType ??
        ((originalGroupSize > 1 ? 'group' : 'single') as 'group' | 'single');

      const pendingRefund = await refundsRepo.findOne({
        where: {
          workshopId,
          reservationId: dto.reservationId,
          status: WorkshopRefundStatus.PENDING,
        },
        relations: ['items'],
        order: { createdAt: 'DESC' },
      });

      let pendingRequestedIds: string[] = [];
      const pendingRequestedAmountMap = new Map<string, string>();

      if (pendingRefund) {
        if (pendingRefund.items?.length) {
          pendingRequestedIds = pendingRefund.items.map(
            (item) => item.attendeeId,
          );

          for (const item of pendingRefund.items) {
            pendingRequestedAmountMap.set(item.attendeeId, item.refundAmount);
          }
        } else {
          const inferredPendingIds = (reservation.attendees ?? [])
            .map((attendee) => attendee.id)
            .filter((attendeeId) => !alreadyRefundedIds.has(attendeeId));

          pendingRequestedIds = inferredPendingIds;

          for (const attendeeId of inferredPendingIds) {
            pendingRequestedAmountMap.set(
              attendeeId,
              this.toMoneyString(this.toMoney(reservation.pricePerSeat)),
            );
          }
        }

        const invalidNotRequested = normalizedAttendeeIds.filter(
          (id) => !pendingRequestedIds.includes(id),
        );

        if (invalidNotRequested.length > 0) {
          throw new BadRequestException(
            'Admin can only process attendee(s) that were actually requested for refund.',
          );
        }
      }

      const processedAt = new Date();
      const perAttendeeProcessedAmount =
        totalRefundAmount / normalizedAttendeeIds.length;

      let processedRefundId: string;
      let responseRequestId: string | null = pendingRefund?.requestId ?? null;

      if (pendingRefund) {
        const remainingPendingRequestedIds = pendingRequestedIds.filter(
          (id) => !normalizedAttendeeIds.includes(id),
        );

        if (remainingPendingRequestedIds.length === 0) {
          await refundsRepo.update(pendingRefund.id, {
            processedByAdminId: adminId,
            refundAmount: dto.refundAmount.toString(),
            adjustmentNote: dto.adjustmentNote,
            paymentGateway: dto.paymentGateway,
            transactionId: dto.transactionId,
            status: WorkshopRefundStatus.PROCESSED,
            processedAt,
          });

          await refundItemsRepo.delete({ refundId: pendingRefund.id });

          const processedItems = normalizedAttendeeIds.map((attendeeId) =>
            refundItemsRepo.create({
              refundId: pendingRefund.id,
              attendeeId,
              refundAmount: this.toMoneyString(perAttendeeProcessedAmount),
              status: WorkshopRefundItemStatus.REFUNDED,
            }),
          );

          await refundItemsRepo.save(processedItems);
          processedRefundId = pendingRefund.id;
        } else {
          const processedRefund = await refundsRepo.save(
            refundsRepo.create({
              workshopId,
              reservationId: dto.reservationId,
              userId: pendingRefund.userId,
              processedByAdminId: adminId,
              refundAmount: dto.refundAmount.toString(),
              reason: pendingRefund.reason,
              adjustmentNote: dto.adjustmentNote,
              paymentGateway: dto.paymentGateway,
              transactionId: dto.transactionId,
              status: WorkshopRefundStatus.PROCESSED,
              processedAt,
            }),
          );

          processedRefundId = processedRefund.id;

          const processedItems = normalizedAttendeeIds.map((attendeeId) =>
            refundItemsRepo.create({
              refundId: processedRefund.id,
              attendeeId,
              refundAmount: this.toMoneyString(perAttendeeProcessedAmount),
              status: WorkshopRefundItemStatus.REFUNDED,
            }),
          );

          await refundItemsRepo.save(processedItems);

          await refundItemsRepo.delete({ refundId: pendingRefund.id });

          const remainingPendingItems = remainingPendingRequestedIds.map(
            (attendeeId) =>
              refundItemsRepo.create({
                refundId: pendingRefund.id,
                attendeeId,
                refundAmount:
                  pendingRequestedAmountMap.get(attendeeId) ??
                  this.toMoneyString(this.toMoney(reservation.pricePerSeat)),
                status: WorkshopRefundItemStatus.PENDING,
              }),
          );

          await refundItemsRepo.save(remainingPendingItems);

          const remainingPendingAmount = remainingPendingItems.reduce(
            (sum, item) => sum + this.toMoney(item.refundAmount),
            0,
          );

          await refundsRepo.update(pendingRefund.id, {
            refundAmount: this.toMoneyString(remainingPendingAmount),
            status: WorkshopRefundStatus.PENDING,
          });
        }
      } else {
        const processedRefund = await refundsRepo.save(
          refundsRepo.create({
            workshopId,
            reservationId: dto.reservationId,
            processedByAdminId: adminId,
            refundAmount: dto.refundAmount.toString(),
            adjustmentNote: dto.adjustmentNote,
            paymentGateway: dto.paymentGateway,
            transactionId: dto.transactionId,
            status: WorkshopRefundStatus.PROCESSED,
            processedAt,
          }),
        );

        processedRefundId = processedRefund.id;
        responseRequestId = processedRefund.requestId ?? null;

        const processedItems = normalizedAttendeeIds.map((attendeeId) =>
          refundItemsRepo.create({
            refundId: processedRefund.id,
            attendeeId,
            refundAmount: this.toMoneyString(perAttendeeProcessedAmount),
            status: WorkshopRefundItemStatus.REFUNDED,
          }),
        );

        await refundItemsRepo.save(processedItems);
      }

      const allRefundedIds = new Set([
        ...Array.from(alreadyRefundedIds),
        ...normalizedAttendeeIds,
      ]);

      const refundedCount = allRefundedIds.size;
      const remainingActiveMembers = (reservation.attendees ?? []).filter(
        (attendee) => !allRefundedIds.has(attendee.id),
      );

      const pendingCount = await refundsRepo.count({
        where: {
          reservationId: dto.reservationId,
          status: WorkshopRefundStatus.PENDING,
        },
      });

      const hasPendingRequest = pendingCount > 0;

      await reservationsRepo.update(reservation.id, {
        numberOfSeats: remainingActiveMembers.length,
        status:
          remainingActiveMembers.length === 0
            ? ReservationStatus.CANCELLED
            : ReservationStatus.CONFIRMED,
        bookingType,
        refundRequestStatus: hasPendingRequest,
      } as any);

      const overallStatus = this.getEnrollmentRefundStatus(
        originalGroupSize,
        refundedCount,
        hasPendingRequest,
      );

      const finalRefundType =
        overallStatus === 'REFUNDED'
          ? WorkshopRefundType.FULL
          : WorkshopRefundType.PARTIAL;

      await refundsRepo.update(processedRefundId, {
        refundType: finalRefundType,
      });

      const finalProcessedRefund = await refundsRepo.findOne({
        where: { id: processedRefundId },
        select: ['id', 'requestId', 'processedAt', 'refundType'],
      });

      return {
        message: 'Refund status updated successfully',
        data: {
          refundId: finalProcessedRefund?.id ?? processedRefundId,
          requestId: responseRequestId,
          workshopId,
          reservationId: reservation.id,
          bookingType,
          bookingOwnerName:
            reservation.bookerFullName ??
            reservation.attendees?.[0]?.fullName ??
            'Unknown',
          originalGroupSize,
          processedMemberCount: normalizedAttendeeIds.length,
          remainingEnrolledCount: remainingActiveMembers.length,
          refundedAmount: dto.refundAmount,
          refundType: finalProcessedRefund?.refundType ?? finalRefundType,
          enrollmentStatus: overallStatus,
          refundRequestStatus: hasPendingRequest,
          reservationLifecycleStatus:
            remainingActiveMembers.length === 0
              ? ReservationStatus.CANCELLED
              : ReservationStatus.CONFIRMED,
          paymentGateway: dto.paymentGateway,
          transactionId: dto.transactionId,
          emailNotificationSent: false,
          processedAt: finalProcessedRefund?.processedAt ?? processedAt,
        },
      };
    });
  }

  // ── 1. SUMMARY METRICS API (Dashboard Cards) ──
  async getMyCoursesSummary(userId: string) {
    const {
      enrolledWorkshopIds,
      workshopMeta,
      enrollmentByWorkshop,
      latestReservationByWorkshop,
    } = await this.buildStudentWorkshopMeta(userId);

    let completedCount = 0;
    let totalCmeCredits = 0;
    let nextSessionDatetime: Date | null = null;
    const now = new Date();

    if (enrolledWorkshopIds.length > 0) {
      // Fetch workshops with days and segments
      const workshops = await this.workshopsRepo.find({
        where: { id: In(enrolledWorkshopIds) },
        relations: ['days', 'days.segments'],
      });

      for (const w of workshops) {
        const meta = workshopMeta.get(w.id);
        if (!meta) {
          continue;
        }

        const tracking =
          meta.source === 'enrollment'
            ? enrollmentByWorkshop.get(w.id)
            : latestReservationByWorkshop.get(w.id);

        const progress = tracking
          ? await this.syncCourseProgressTracking(w, meta.source, tracking, now)
          : this.resolveTrackedCourseProgress(w, null, now);

        if (progress.status === CourseProgressStatus.COMPLETED) {
          completedCount++; // ✅ Increment completed courses

          if (w.offersCmeCredits) {
            // Calculate accurate CME credits based on total segment duration
            const totalMinutes = this.getWorkshopTotalMinutes(w);
            totalCmeCredits += totalMinutes / 60;
          }
        } else {
          const sortedDays = [...(w.days || [])].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );

          // If not completed, find the absolute next upcoming class session
          for (const day of sortedDays) {
            const dayDate = new Date(day.date);
            if (dayDate >= new Date(now.toDateString())) {
              for (const seg of day.segments || []) {
                const segDateTime = new Date(`${day.date}T${seg.startTime}`);
                if (segDateTime > now) {
                  if (
                    !nextSessionDatetime ||
                    segDateTime < nextSessionDatetime
                  ) {
                    nextSessionDatetime = segDateTime;
                  }
                }
              }
            }
          }
        }
      }
    }

    return {
      message: 'Dashboard metrics fetched successfully',
      data: {
        // UI: "CME CREDITS"
        cmeCredits: Number(totalCmeCredits).toFixed(1),

        // UI: "COURSES COMPLETED"
        coursesCompleted: completedCount,

        // UI: "NEXT CLASS" -> formatted to "Mar 12"
        nextClass: nextSessionDatetime
          ? nextSessionDatetime.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            }) // e.g., "Mar 12"
          : 'N/A', // If no upcoming classes
      },
    };
  }

  // ── 2. LIST MY COURSES (BROWSE / ACTIVE / COMPLETED) ──
  async getMyCoursesLogged(userId: string, query: any) {
    const limit = Number(query.limit) || 10;
    const skip = ((Number(query.page) || 1) - 1) * limit;
    const currentTab = query.tab || 'active';

    // 1. Get ALL workshop IDs the user is part of (Safely)
    const [enrollments, reservations] = await Promise.all([
      this.enrollmentsRepo.find({ where: { userId, isActive: true } }),
      this.reservationsRepo.find({
        // ✅ FIXED: Use strict enum
        where: { userId, status: ReservationStatus.CONFIRMED },
      }),
    ]);

    const userWorkshopIds = [
      ...new Set([
        ...enrollments.map((e) => e.workshopId).filter(Boolean),
        ...reservations.map((r) => r.workshopId).filter(Boolean),
      ]),
    ];

    // ==========================================
    // BROWSE TAB LOGIC
    // ==========================================
    if (currentTab === 'browse') {
      const qbBrowse = this.workshopsRepo
        .createQueryBuilder('w')
        .where('w.status = :status', { status: 'published' });

      if (userWorkshopIds.length > 0) {
        // Exclude correctly using IN
        qbBrowse.andWhere('w.id NOT IN (:...userWorkshopIds)', {
          userWorkshopIds,
        });
      }

      const [items, total] = await qbBrowse
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      return {
        items: items.map((w) => ({
          id: w.id,
          tag: w.deliveryMode === 'online' ? 'ONLINE' : 'IN-PERSON',
          coverImageUrl: w.coverImageUrl || null,
          title: w.title,
          description: w.shortBlurb,
          price: w.standardBaseRate,
          cmeCredits: w.offersCmeCredits ? 12 : null,
          actions: {
            primary: { label: 'View Details', route: `/courses/${w.id}` },
          },
        })),
        meta: {
          total,
          page: Number(query.page) || 1,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    // ==========================================
    // ACTIVE & COMPLETED TAB LOGIC
    // ==========================================
    if (userWorkshopIds.length === 0) {
      return {
        items: [],
        meta: { total: 0, page: Number(query.page) || 1, limit, totalPages: 0 },
      };
    }

    // Safely query workshops using In operator
    const workshops = await this.workshopsRepo.find({
      where: { id: In(userWorkshopIds) },
      relations: ['days', 'days.segments'],
    });

    const now = new Date();
    const resMap = new Map(reservations.map((r) => [r.workshopId, r]));
    const enrMap = new Map(enrollments.map((e) => [e.workshopId, e]));

    const mappedCourses = await Promise.all(
      workshops.map(async (w) => {
        const sortedDays = (w.days || []).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
        const firstDate = sortedDays.length
          ? new Date(sortedDays[0].date)
          : null;
        const lastDate = sortedDays.length
          ? new Date(sortedDays[sortedDays.length - 1].date)
          : null;

        // Get Pricing/Group Size from Reservation (if exists)
        const res = resMap.get(w.id);
        const enr = enrMap.get(w.id);
        const tracking = enr ?? res;
        const trackingSource: 'enrollment' | 'reservation' = enr
          ? 'enrollment'
          : 'reservation';
        const progress = tracking
          ? await this.syncCourseProgressTracking(
              w,
              trackingSource,
              tracking,
              now,
            )
          : this.resolveTrackedCourseProgress(w, null, now);
        const isCompleted = progress.status === CourseProgressStatus.COMPLETED;
        const progressPercent =
          progress.totalDays > 0
            ? Math.round((progress.completedDays / progress.totalDays) * 100)
            : 0;
        const groupSize = res?.numberOfSeats || 1;
        const paidAmount = res?.totalPrice || w.standardBaseRate;

        return {
          enrollmentId: enr?.id || res?.id,
          courseId: w.id,
          isCompleted,
          courseStatus: this.toExternalCourseStatus(progress.status),
          courseStatusLabel: this.toExternalCourseStatusLabel(progress.status),
          coverImageUrl: w.coverImageUrl,
          tag:
            w.deliveryMode === 'online'
              ? 'ONLINE SELF-PACED COURSE'
              : 'IN-PERSON WORKSHOP',
          title: w.title,
          startDate: firstDate
            ? firstDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'TBA',
          completedDate: isCompleted
            ? (tracking?.courseCompletedAt ?? lastDate)?.toLocaleDateString(
                'en-US',
                {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                },
              )
            : null,
          location:
            w.deliveryMode === 'online'
              ? w.webinarPlatform || 'Zoom'
              : 'Sim Lab B',
          groupSizeText: groupSize > 1 ? `${groupSize} people` : '1 person',
          bookingFee: `$${paidAmount}`,
          progress: `${progressPercent}% Complete`,
          cmeCreditsBadge: w.offersCmeCredits ? '12.0 CME CREDITS' : null,
          nextSessionBanner:
            w.deliveryMode === 'online' && !isCompleted && firstDate
              ? `Live Online Session Included: A Q&A workshop is scheduled for ${firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
              : null,
          actions: {
            primary: isCompleted
              ? {
                  label: 'View Course Details',
                  route: `/dashboard/courses/${w.id}/completed`,
                }
              : w.deliveryMode === 'online'
                ? { label: 'Join Live Session', route: w.meetingLink }
                : {
                    label: 'View Syllabus',
                    route: `/courses/${w.id}/syllabus`,
                  },
            secondary: isCompleted
              ? null
              : { label: 'Add to Calendar', route: `/api/calendar/${w.id}` },
          },
        };
      }),
    );

    const filtered = mappedCourses.filter((c) =>
      currentTab === 'completed' ? c.isCompleted : !c.isCompleted,
    );

    return {
      items: filtered.slice(skip, skip + limit),
      meta: {
        total: filtered.length,
        page: Number(query.page) || 1,
        limit,
        totalPages: Math.max(Math.ceil(filtered.length / limit), 1), // ✅ Prevent 0 totalPages
      },
    };
  }

  // Helper function to format SQL time ('10:30:00') to ('10:30 AM')
  private formatTime(timeStr: string): string {
    if (!timeStr) return '';
    const [hourStr, minuteStr] = timeStr.split(':');
    let hour = parseInt(hourStr, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${minuteStr} ${ampm}`;
  }

  // ── 3. PUBLIC TICKET (QR VERIFICATION) ──
  async getPublicTicketDetails(ticketId: string) {
    let userId: string;
    let workshopId: string;
    let bookingRef = ticketId;

    const enrollment = await this.enrollmentsRepo.findOne({
      where: { id: ticketId },
      relations: ['user'],
    });

    let reservation = await this.reservationsRepo.findOne({
      where: { id: ticketId },
      relations: ['attendees'],
    });

    if (enrollment) {
      userId = enrollment.userId;
      workshopId = enrollment.workshopId;
      if (!reservation) {
        reservation = await this.reservationsRepo.findOne({
          where: { userId, workshopId },
          relations: ['attendees'],
        });
      }
    } else if (reservation) {
      userId = reservation.userId;
      workshopId = reservation.workshopId;
    } else {
      throw new NotFoundException('Ticket not found.');
    }

    const w = await this.workshopsRepo.findOne({
      where: { id: workshopId },
      relations: ['days', 'days.segments'],
    });

    if (!w) throw new NotFoundException('Workshop details not found.');

    const facilities =
      w.facilityIds?.length > 0
        ? await this.facilitiesRepo.find({ where: { id: In(w.facilityIds) } })
        : [];

    const user = enrollment?.user;

    const dbAttendees = reservation?.attendees || [];

    let primaryAttendeeName = user?.fullLegalName || 'Verified Attendee';
    let primaryAttendeeRole = user?.professionalRole || 'Medical Professional';

    // ✅ FIX: Explicitly set type to any[] to fix the 'never' type error
    let otherAttendees: any[] = [];

    if (dbAttendees.length > 0) {
      primaryAttendeeName = dbAttendees[0].fullName;
      primaryAttendeeRole =
        dbAttendees[0].professionalRole || 'Medical Professional';
      otherAttendees = dbAttendees.slice(1);
    }

    const sortedDays = (w.days || []).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    let dateRangeStr = 'TBA';
    let progressBadge = 'Not Started';
    const now = new Date();

    if (sortedDays.length > 0) {
      const firstDay = new Date(sortedDays[0].date);
      const lastDay = new Date(sortedDays[sortedDays.length - 1].date);

      const firstMonth = firstDay.toLocaleDateString('en-US', {
        month: 'short',
      });
      const lastMonth = lastDay.toLocaleDateString('en-US', { month: 'short' });

      dateRangeStr =
        firstMonth === lastMonth
          ? `${firstMonth} ${firstDay.getDate()} - ${lastDay.getDate()}`
          : `${firstMonth} ${firstDay.getDate()} - ${lastMonth} ${lastDay.getDate()}`;

      const completedDays = sortedDays.filter(
        (d) => new Date(d.date) < new Date(now.toDateString()),
      ).length;
      if (completedDays === sortedDays.length)
        progressBadge = 'Course Completed';
      else if (completedDays > 0)
        progressBadge = `Day ${completedDays} Complete`;
    }

    const formattedRef = `#${bookingRef.split('-')[0].substring(0, 4).toUpperCase()}-AC`;

    return {
      message: 'Ticket details fetched successfully',
      data: {
        attendee: {
          name: primaryAttendeeName,
          department: primaryAttendeeRole,
          roleInfo: user?.npiNumber
            ? `ID: #${user.npiNumber}`
            : 'Primary Registrant',
          isVerified: true,
          avatarUrl: null,
        },
        groupAttendees: otherAttendees.map((a, index) => ({
          id: a.id,
          name: `Attendee ${index + 2}: ${a.fullName}`,
          role: `Role: ${a.professionalRole || 'Medical Professional'}`,
          status: 'PENDING CHECK-IN',
        })),
        course: {
          title: w.title,
          dateRange: dateRangeStr,
          progressBadge: progressBadge,
        },
        bookingInfo: {
          groupSize: reservation
            ? `${reservation.numberOfSeats} People`
            : '1 Person',
          paymentStatus:
            reservation?.status === 'confirmed'
              ? `Paid in Full ($${reservation.totalPrice})`
              : 'Pending',
          bookingRef: formattedRef,
          waitlistStatus: 'N/A (Primary Enrollment)',
        },
        venueLogistics: {
          currentLocation:
            facilities.length > 0 ? facilities[0].name : 'Venue TBA',
          facilities,
          assignedEquipment: [],
        },
      },
    };
  }

  // ── 3.1 GENERATE QR CODE ──
  async getTicketQrCode(ticketId: string) {
    // Verify ticket exists first
    await this.getPublicTicketDetails(ticketId);

    // The URL the QR code will point to
    const frontendUrl =
      process.env.FRONTEND_URL || 'https://medical-frontend-eta.vercel.app';

    const verificationUrl = `${frontendUrl}/dashboard/user/ticket/${ticketId}`;

    try {
      // Generate QR Code as Base64 Data URL
      const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      return {
        message: 'QR Code generated successfully',
        data: { qrCodeUrl: qrCodeDataUrl },
      };
    } catch (err) {
      throw new Error('Failed to generate QR Code');
    }
  }

  // ── 3.2 GENERATE PDF TICKET ──
  async generateTicketPdf(ticketId: string, res: Response) {
    const ticketData = await this.getPublicTicketDetails(ticketId);
    const data = ticketData.data;

    const frontendUrl =
      process.env.FRONTEND_URL || 'https://medical-frontend-eta.vercel.app';

    const verificationUrl = `${frontendUrl}/dashboard/user/ticket/${ticketId}`;
    const qrBuffer = await QRCode.toBuffer(verificationUrl, {
      width: 200,
      margin: 1,
    });

    const doc = new PDFDocument({
      size: [288, 432],
      margin: 0,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Ticket-${data.bookingInfo.bookingRef}.pdf`,
    );

    doc.pipe(res);

    const headerBg = '#F4F6F8';
    const eventColor = '#0F4C75';
    const detailsColor = '#F9A826';
    const textDark = '#222';

    // File path for your logo
    // Note: If PDFKit fails on the SVG, convert your logo to a PNG and update this extension.
    const logoPath = path.join(
      process.cwd(),
      'src',
      'common',
      'assets',
      'Texas_Airway.png',
    );

    // Page Background
    doc.rect(0, 0, 288, 432).fill(headerBg);

    // ==========================================
    // LOGO
    // ==========================================
    const logoY = 20;

    try {
      // Center the image: (PageWidth / 2) - (ImageWidth / 2)
      // 288 / 2 = 144. If image width is 120, x = 144 - 60 = 84
      doc.image(logoPath, 84, logoY, { width: 120 });
    } catch (err) {
      // Fallback text if image loading fails
      doc
        .fillColor(eventColor)
        .font('Helvetica-Bold')
        .fontSize(14)
        .text('Texas Airway', 0, logoY + 10, { align: 'center', width: 288 });
      doc
        .fillColor('#666666')
        .font('Helvetica')
        .fontSize(8)
        .text('INSTITUTE', 0, logoY + 25, {
          align: 'center',
          width: 288,
          characterSpacing: 2,
        });
    }

    // ==========================================
    // QR CODE
    // ==========================================
    // Pushed down slightly to accommodate the logo
    doc.image(qrBuffer, 94, 70, {
      fit: [100, 100],
    });

    // ==========================================
    // EVENT SECTION
    // ==========================================
    // Pushed down slightly to give the QR code breathing room
    const eventY = 175;

    doc.rect(0, eventY, 288, 100).fill(eventColor);

    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(data.course.title, 0, eventY + 20, {
        align: 'center',
        width: 288,
      });

    doc.fontSize(8).font('Helvetica').text('WORKSHOP / TRAINING PROGRAM', {
      align: 'center',
      width: 288,
    });

    doc.moveDown(0.3);

    doc.fontSize(9).text(data.course.dateRange, {
      align: 'center',
      width: 288,
    });

    // ==========================================
    // DETAILS SECTION
    // ==========================================
    const detailsY = eventY + 100;

    // Extend the details box a bit lower to reach the bottom of the ticket nicely
    doc.rect(0, detailsY, 288, 157).fill(detailsColor);
    doc.fillColor(textDark);

    doc
      .moveTo(20, detailsY + 10)
      .lineTo(268, detailsY + 10)
      .dash(3, { space: 3 })
      .strokeColor('#888')
      .stroke()
      .undash();

    const startY = detailsY + 20;

    // LEFT COLUMN
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('Ticket ID:', 20, startY)
      .font('Helvetica')
      .text(data.bookingInfo.bookingRef);

    doc
      .font('Helvetica-Bold')
      .text('Date:', 20, startY + 25)
      .font('Helvetica')
      .text(data.course.dateRange);

    doc
      .font('Helvetica-Bold')
      .text('Venue:', 20, startY + 50)
      .font('Helvetica')
      .text(data.venueLogistics.currentLocation, {
        width: 100,
      });

    // RIGHT COLUMN - Group Attendees
    doc.font('Helvetica-Bold').text('Attendees:', 150, startY);

    doc.font('Helvetica');
    let attendeeY = startY + 10;

    // Print Primary Booker
    doc.text(`1. ${data.attendee.name}`, 150, attendeeY, {
      width: 120,
      lineBreak: false,
    });
    attendeeY += 10;

    // Print Group Attendees
    data.groupAttendees.forEach((att, idx) => {
      if (attendeeY < startY + 45) {
        // Prevent overflowing into seats section
        doc.text(
          `${idx + 2}. ${att.name.replace(`Attendee ${idx + 2}: `, '')}`,
          150,
          attendeeY,
          { width: 120, lineBreak: false },
        );
        attendeeY += 10;
      }
    });

    if (data.groupAttendees.length > 3) {
      doc.text('...', 150, attendeeY);
    }

    doc
      .font('Helvetica-Bold')
      .text('Seats:', 150, startY + 50)
      .font('Helvetica')
      .text(data.bookingInfo.groupSize);

    // NOTE
    doc
      .fontSize(7)
      .fillColor('#333')
      .text(
        `Note: This ticket is valid for ${data.bookingInfo.groupSize}.`,
        20,
        detailsY + 110,
        { align: 'center', width: 248 },
      );

    doc
      .fontSize(6)
      .fillColor('#555')
      .text('Need help? support@texasairway.com', 20, detailsY + 125, {
        align: 'center',
        width: 248,
      });

    doc.end();
  }

  // ── 4. COURSE DETAILS (IN-DEPTH) ──
  async getMyCourseDetails(userId: string, courseId: string) {
    const [e, reservation] = await Promise.all([
      this.enrollmentsRepo.findOne({ where: { userId, workshopId: courseId } }),
      this.reservationsRepo.findOne({
        where: { userId, workshopId: courseId, status: 'confirmed' as any },
      }),
    ]);

    if (!e && !reservation)
      throw new NotFoundException('Course details not found.');

    const w = await this.workshopsRepo.findOne({
      where: { id: courseId },
      relations: ['days', 'days.segments', 'faculty', 'groupDiscounts'],
    });

    if (!w) throw new NotFoundException('Workshop not found.');

    // Fetch full facility details dynamically
    const facilities =
      w.facilityIds?.length > 0
        ? await this.facilitiesRepo.find({ where: { id: In(w.facilityIds) } })
        : [];

    const order = await this.orderSummariesRepo.findOne({
      where: { userId, workshopId: courseId, status: 'completed' as any },
    });

    const now = new Date();
    const tracking = e ?? reservation;
    const trackingSource: 'enrollment' | 'reservation' = e
      ? 'enrollment'
      : 'reservation';
    const progress = tracking
      ? await this.syncCourseProgressTracking(w, trackingSource, tracking, now)
      : this.resolveTrackedCourseProgress(w, null, now);
    const isCompleted = progress.status === CourseProgressStatus.COMPLETED;
    const hasStarted = progress.status !== CourseProgressStatus.NOT_STARTED;
    const sortedDays = (w.days || []).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    let dateRangeStr = 'TBA';
    let timeRangeStr = 'TBA';

    if (sortedDays.length > 0) {
      const firstDay = new Date(sortedDays[0].date);
      const lastDay = new Date(sortedDays[sortedDays.length - 1].date);
      const firstMonth = firstDay
        .toLocaleDateString('en-US', { month: 'short' })
        .toUpperCase();
      const lastMonth = lastDay
        .toLocaleDateString('en-US', { month: 'short' })
        .toUpperCase();

      dateRangeStr =
        firstMonth === lastMonth
          ? `${firstMonth} ${firstDay.getDate()} - ${lastDay.getDate()}`
          : `${firstMonth} ${firstDay.getDate()} - ${lastMonth} ${lastDay.getDate()}`;

      let startTimes = [] as any;
      let endTimes = [] as any;
      sortedDays.forEach((d) => {
        d.segments?.forEach((s) => {
          startTimes.push(s.startTime);
          endTimes.push(s.endTime);
        });
      });

      if (startTimes.length > 0 && endTimes.length > 0) {
        startTimes.sort();
        endTimes.sort();
        timeRangeStr = `${this.formatTime(startTimes[0])} - ${this.formatTime(endTimes[endTimes.length - 1])}`;
      }
    }

    const schedule = sortedDays.map((day, dIdx) => {
      const dayLifecycle = this.getDayLifecycleStatus(
        new Date(`${day.date}T00:00:00`),
        now,
      );

      return {
        title: `DAY ${dIdx + 1}`,
        date: new Date(day.date)
          .toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })
          .toUpperCase(),
        status:
          dayLifecycle === 'completed'
            ? 'COMPLETED'
            : dayLifecycle === 'current'
              ? 'CURRENT'
              : 'UPCOMING',
        sessions: (day.segments || [])
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((seg) => {
            const endDt = new Date(`${day.date}T${seg.endTime}`);
            const startDt = new Date(`${day.date}T${seg.startTime}`);
            const segmentCompleted = hasStarted && endDt < now;
            const segmentCurrent = hasStarted && startDt <= now && endDt >= now;
            let statusText = segmentCompleted
              ? '(COMPLETED)'
              : segmentCurrent
                ? '(CURRENT)'
                : '';

            return {
              id: seg.id,
              timeLabel: `${this.formatTime(seg.startTime)} - ${this.formatTime(seg.endTime)}`,
              title: `${seg.courseTopic} ${statusText}`.trim(),
              description: seg.topicDetails,
              isCompleted: segmentCompleted,
              isCurrent: segmentCurrent,
              joinLink:
                w.deliveryMode === 'online' && !segmentCompleted
                  ? w.meetingLink
                  : null,
            };
          }),
      };
    });

    const isOnline = w.deliveryMode === 'online';
    const cme = w.offersCmeCredits ? '12.0 CME CREDITS' : null;

    const ticketId = reservation?.id || e?.id;
    const bookRef = ticketId
      ? `#${ticketId.split('-')[0].toUpperCase()}-AC`
      : '#TBA';

    return {
      courseId: w.id,
      workshop: {
        id: w.id,
        title: w.title,
        shortBlurb: w.shortBlurb ?? null,
        registrationDeadline: w.registrationDeadline ?? null,
        deliveryMode: w.deliveryMode,
        status: w.status,
        coverImageUrl: w.coverImageUrl ?? null,
        learningObjectives: w.learningObjectives ?? null,
        offersCmeCredits: w.offersCmeCredits,
        facilityIds: w.facilityIds ?? [],
        facilities, // Added full facility details
        webinarPlatform: w.webinarPlatform ?? null,
        meetingLink: w.meetingLink ?? null,
        meetingPassword: w.meetingPassword ?? null,
        autoRecordSession: w.autoRecordSession,
        capacity: w.capacity,
        alertAt: w.alertAt,
        standardBaseRate: w.standardBaseRate,
        groupDiscountEnabled: w.groupDiscountEnabled,
        groupDiscounts: (w.groupDiscounts ?? []).map((d) => ({
          id: d.id,
          minimumAttendees: d.minimumAttendees,
          groupRatePerPerson: d.groupRatePerPerson,
        })),
        faculty: (w.faculty ?? []).map((f) => ({
          id: f.id,
          firstName: f.firstName,
          lastName: f.lastName,
          primaryClinicalRole: f.primaryClinicalRole,
          medicalDesignation: f.medicalDesignation,
          institutionOrHospital: f.institutionOrHospital,
          npiNumber: f.npiNumber,
          assignedRole: f.assignedRole,
          imageUrl: f.imageUrl,
        })),
        days: (w.days ?? []).map((day) => ({
          id: day.id,
          date: day.date,
          dayNumber: day.dayNumber,
          segments: (day.segments ?? []).map((seg) => ({
            id: seg.id,
            segmentNumber: seg.segmentNumber,
            courseTopic: seg.courseTopic,
            topicDetails: seg.topicDetails,
            startTime: seg.startTime,
            endTime: seg.endTime,
          })),
        })),
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      },
      heroImage: w.coverImageUrl,
      breadcrumb: ['My Courses', w.title],
      banner: {
        badgePrimary: isCompleted
          ? 'Course Completed'
          : progress.status === CourseProgressStatus.NOT_STARTED
            ? isOnline
              ? 'ONLINE REGISTRATION CONFIRMED'
              : 'Registration Confirmed'
            : isOnline
              ? 'ONLINE REGISTRATION CONFIRMED'
              : 'Registration Confirmed',
        badgeSecondary: cme,
        title: w.title,
        description: isCompleted
          ? 'You have successfully completed this intensive simulation training.'
          : progress.status === CourseProgressStatus.NOT_STARTED
            ? 'Your registration is confirmed. Course progress will auto-update by schedule date.'
            : w.shortBlurb,
        dateBox: {
          dateRange: dateRangeStr,
          // ✅ FIX: Use the actual facility name instead of the raw UUID
          locationOrPlatform: isOnline
            ? w.webinarPlatform || 'Zoom'
            : facilities.length > 0
              ? facilities[0].name
              : 'Location TBA',
          time: timeRangeStr,
        },
      },
      bookingDetails: {
        status: `Booked for: ${reservation?.numberOfSeats || 1} Attendee(s)`,
        totalPayment: `$${order?.totalPrice || w.standardBaseRate}`,
        paymentBadge: isCompleted ? 'FINALIZED' : 'PAID',
        refundNote: isCompleted
          ? 'Transaction closed. Refund period expired.'
          : 'Refunds available up to 48h before start.',
      },
      progress: {
        status: this.toExternalCourseStatus(progress.status),
        statusLabel: this.toExternalCourseStatusLabel(progress.status),
        totalDays: progress.totalDays,
        completedDays: progress.completedDays,
        remainingDays: progress.remainingDays,
        startedAt: tracking?.courseStartedAt ?? null,
        completedAt: tracking?.courseCompletedAt ?? null,
      },
      scheduleHeader: {
        title: 'COURSE SCHEDULE',
        badge: isCompleted ? 'ALL SESSIONS COMPLETED' : 'UPCOMING SESSIONS',
      },
      schedule,
      sidebar: {
        certificateBox:
          isCompleted && ticketId
            ? {
                title: 'Course Certified',
                message:
                  "Congratulations! You've successfully mastered the curriculum.",
                certId: `CERT-${bookRef}`,
                downloadUrl: `/api/certs/${ticketId}`,
              }
            : null,
        onlineDetails:
          !isCompleted && isOnline && ticketId
            ? {
                technicalRequirements: [],
                registrationReference: bookRef,
                prepMaterials: [],
              }
            : null,
        inPersonDetails:
          !isCompleted && !isOnline && ticketId
            ? {
                ticketId: ticketId,
                qrNote: `Note: This ticket is valid for ${reservation?.numberOfSeats || 1} persons only.`,
                qrDataUrl: `/api/workshops/public/tickets/${ticketId}/qr`,
                downloadPdfUrl: `/api/workshops/public/tickets/${ticketId}/download`,
                ticketReference: bookRef,
              }
            : null,
      },
    };
  }

  async startMyCourse(userId: string, courseId: string) {
    const workshop = await this.workshopsRepo.findOne({
      where: { id: courseId },
      relations: ['days'],
    });

    if (!workshop) {
      throw new NotFoundException('Workshop not found.');
    }

    const started = await this.markCourseAsStarted(userId, courseId);
    const now = new Date();

    const tracking =
      started.source === 'enrollment'
        ? await this.enrollmentsRepo.findOne({
            where: {
              userId,
              workshopId: courseId,
              isActive: true,
            },
            order: { createdAt: 'DESC' },
          })
        : await this.reservationsRepo.findOne({
            where: {
              userId,
              workshopId: courseId,
              status: ReservationStatus.CONFIRMED,
            },
            order: { createdAt: 'DESC' },
          });

    if (!tracking) {
      throw new NotFoundException('Course not found.');
    }

    const progress = await this.syncCourseProgressTracking(
      workshop,
      started.source,
      tracking,
      now,
    );
    const dayStatuses = this.getCourseDayStatuses(
      workshop,
      progress.status,
      now,
    );

    return {
      message: 'Course started successfully',
      data: {
        courseId,
        source: started.source,
        status: this.toExternalCourseStatus(progress.status),
        statusLabel: this.toExternalCourseStatusLabel(progress.status),
        startedAt: tracking.courseStartedAt ?? started.startedAt,
        completedAt: tracking.courseCompletedAt ?? null,
        totalDays: progress.totalDays,
        completedDays: progress.completedDays,
        remainingDays: progress.remainingDays,
        days: {
          summary: {
            totalDays: progress.totalDays,
            completedDays: progress.completedDays,
            remainingDays: progress.remainingDays,
          },
          data: dayStatuses,
        },
      },
    };
  }

  // ── 3. REFUND ELIGIBILITY & ESTIMATION API ──
  async getRefundEstimation(userId: string, courseId: string) {
    const reservation = await this.reservationsRepo.findOne({
      where: {
        userId,
        workshopId: courseId,
        status: ReservationStatus.CONFIRMED,
      },
      relations: ['attendees'],
    });

    if (!reservation) {
      throw new NotFoundException('Course enrollment not found.');
    }

    const workshop = await this.workshopsRepo.findOne({
      where: { id: courseId },
      relations: ['days'],
    });

    if (!workshop) {
      throw new NotFoundException('Workshop not found.');
    }

    if (!workshop.days || workshop.days.length === 0) {
      throw new BadRequestException('Course schedule is not defined yet.');
    }

    const sortedDays = [...workshop.days].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const firstDayStr = sortedDays[0].date;
    const courseStartDate = new Date(`${firstDayStr}T09:00:00`);
    const currentDate = new Date();

    const timeDiffMs = courseStartDate.getTime() - currentDate.getTime();
    const hoursBeforeStart = timeDiffMs / (1000 * 3600);

    let isEligible = true;
    let refundFee = 50.0;

    if (hoursBeforeStart < 48) {
      isEligible = false;
      refundFee = 0;
    }

    let windowRemainingStr = 'Expired';
    if (isEligible) {
      const deadlineTimeMs = courseStartDate.getTime() - 48 * 60 * 60 * 1000;
      const msRemaining = deadlineTimeMs - currentDate.getTime();

      const d = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
      const h = Math.floor((msRemaining / (1000 * 60 * 60)) % 24);

      if (d > 0) {
        windowRemainingStr = `${d}d ${h}h remaining`;
      } else {
        windowRemainingStr = `${h}h remaining`;
      }
    }

    const processedRefundItems = await this.refundItemsRepo
      .createQueryBuilder('item')
      .leftJoin('item.refund', 'refund')
      .where('refund.reservationId = :reservationId', {
        reservationId: reservation.id,
      })
      .andWhere('refund.status = :processedStatus', {
        processedStatus: WorkshopRefundStatus.PROCESSED,
      })
      .getMany();

    const pendingRefund = await this.refundsRepo.findOne({
      where: {
        workshopId: courseId,
        reservationId: reservation.id,
        userId,
        status: WorkshopRefundStatus.PENDING,
      },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });

    const processedRefundedIds = new Set(
      processedRefundItems.map((item) => item.attendeeId),
    );

    const pendingRequestedIds = new Set(
      (pendingRefund?.items ?? []).map((item) => item.attendeeId),
    );

    const originalGroupSize =
      reservation.attendees?.length ?? reservation.numberOfSeats ?? 1;
    const perSeatAmount = this.toMoney(reservation.pricePerSeat);
    const amountPaid = this.toMoney(reservation.totalPrice);

    const members = (reservation.attendees ?? []).map((attendee) => {
      const isRefunded = processedRefundedIds.has(attendee.id);
      const isRequested = pendingRequestedIds.has(attendee.id);

      let requestStatus: 'NONE' | 'REQUESTED' | 'REFUNDED' = 'NONE';
      if (isRefunded) {
        requestStatus = 'REFUNDED';
      } else if (isRequested) {
        requestStatus = 'REQUESTED';
      }

      return {
        attendeeId: attendee.id,
        fullName: attendee.fullName,
        email: attendee.email,
        baseRefundAmount: this.toMoneyString(perSeatAmount),
        requestStatus,
        isSelectable: !isRefunded && !isRequested,
        isSelectedByDefault: !isRefunded && !isRequested,
      };
    });

    const defaultSelectedMembers =
      pendingRequestedIds.size > 0
        ? members.filter((member) => pendingRequestedIds.has(member.attendeeId))
        : members.filter((member) => member.isSelectedByDefault);

    const grossRefundTotal = defaultSelectedMembers.reduce(
      (sum, member) => sum + this.toMoney(member.baseRefundAmount),
      0,
    );

    const estimatedRefundAmount = isEligible
      ? Math.max(0, grossRefundTotal - refundFee)
      : 0;

    const dateRangeStr = this.getWorkshopDateRangeString(sortedDays);
    const hasPendingRequest =
      reservation.refundRequestStatus || Boolean(pendingRefund);

    return {
      isEligible,
      refundRequestStatus: hasPendingRequest,
      pendingRequestId: pendingRefund?.requestId ?? null,
      courseDetails: {
        title: workshop.title,
        dateRange: dateRangeStr,
        bookedFor: `${originalGroupSize} Attendee${originalGroupSize > 1 ? 's' : ''}`,
        refundWindowRemaining: windowRemainingStr,
      },
      financials: {
        amountPaid: amountPaid.toFixed(2),
        processingFee: refundFee.toFixed(2),
        estimatedRefund: estimatedRefundAmount.toFixed(2),
        currency: 'USD',
        perSeatRefundBase: this.toMoneyString(perSeatAmount),
      },
      members,
      selection: {
        defaultSelectedAttendeeIds: defaultSelectedMembers.map(
          (member) => member.attendeeId,
        ),
        maxSelectableCount: members.filter((member) => member.isSelectable)
          .length,
      },
      uiMessages: {
        title: 'Request Refund',
        policyWarning: isEligible
          ? 'Refund Policy: Full refunds are available up to 48 hours before the event. Requests made within 48 hours are subject to a $50 processing fee.'
          : 'Refund Window Expired: Our policy allows for refunds up to 48 hours before the event. As this workshop starts in less than 48 hours, an automated refund cannot be processed.',
      },
    };
  }

  // Helper method if you don't already have one
  private getWorkshopDateRangeString(sortedDays: any[]) {
    if (!sortedDays || sortedDays.length === 0) return 'TBA';
    const firstDay = new Date(sortedDays[0].date);
    const lastDay = new Date(sortedDays[sortedDays.length - 1].date);
    const firstMonth = firstDay.toLocaleDateString('en-US', { month: 'short' });
    const lastMonth = lastDay.toLocaleDateString('en-US', { month: 'short' });
    return firstMonth === lastMonth
      ? `${firstMonth} ${firstDay.getDate()} - ${lastDay.getDate()}`
      : `${firstMonth} ${firstDay.getDate()} - ${lastMonth} ${lastDay.getDate()}`;
  }

  private async generateNextRefundRequestId(): Promise<string> {
    const raw = await this.refundsRepo
      .createQueryBuilder('refund')
      .select(
        `MAX(CAST(regexp_replace(refund."requestId", '\\D', '', 'g') AS INTEGER))`,
        'maxNumber',
      )
      .where('refund."requestId" IS NOT NULL')
      .getRawOne();

    const nextNumber = Number(raw?.maxNumber ?? 0) + 1;

    return `#REF-REQ-${String(nextNumber).padStart(3, '0')}`;
  }

  private isDuplicateRequestIdError(error: unknown): boolean {
    const dbError = (error as any)?.driverError;

    return (
      dbError?.code === '23505' &&
      String(dbError?.detail ?? '').includes('(requestId)')
    );
  }

  async submitRefundRequest(
    userId: string,
    courseId: string,
    dto: SubmitRefundRequestDto,
  ) {
    const estimation = await this.getRefundEstimation(userId, courseId);

    if (!estimation.isEligible) {
      throw new BadRequestException(
        "We're sorry, but the refund period for this course has expired.",
      );
    }

    if (estimation.refundRequestStatus) {
      throw new BadRequestException(
        `A refund request is already pending for this course. Request ID: ${estimation.pendingRequestId ?? 'N/A'}`,
      );
    }

    if (!dto.confirmedTerms) {
      throw new BadRequestException(
        'You must confirm that you understand this action cannot be undone.',
      );
    }

    const reservation = await this.reservationsRepo.findOne({
      where: {
        userId,
        workshopId: courseId,
        status: ReservationStatus.CONFIRMED,
      },
      relations: ['attendees'],
    });

    if (!reservation) {
      throw new NotFoundException(
        'No confirmed reservation found for this course.',
      );
    }

    const workshop = await this.workshopsRepo.findOne({
      where: { id: courseId },
    });

    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!workshop || !user) {
      throw new NotFoundException('User or Workshop not found.');
    }

    const normalizedAttendeeIds = [...new Set(dto.attendeeIds)];

    if (normalizedAttendeeIds.length === 0) {
      throw new BadRequestException(
        'At least one attendee must be selected for refund request.',
      );
    }

    const processedRefundItems = await this.refundItemsRepo
      .createQueryBuilder('item')
      .leftJoin('item.refund', 'refund')
      .where('refund.reservationId = :reservationId', {
        reservationId: reservation.id,
      })
      .andWhere('refund.status = :processedStatus', {
        processedStatus: WorkshopRefundStatus.PROCESSED,
      })
      .getMany();

    const alreadyRefundedIds = new Set(
      processedRefundItems.map((item) => item.attendeeId),
    );

    const selectedAttendees = (reservation.attendees ?? []).filter(
      (attendee) =>
        normalizedAttendeeIds.includes(attendee.id) &&
        !alreadyRefundedIds.has(attendee.id),
    );

    if (selectedAttendees.length !== normalizedAttendeeIds.length) {
      throw new BadRequestException(
        'One or more selected attendees are invalid or already refunded.',
      );
    }

    const perSeatAmount = this.toMoney(reservation.pricePerSeat);
    const grossRequestedAmount = perSeatAmount * selectedAttendees.length;
    const processingFee = this.toMoney(estimation.financials.processingFee);
    const expectedRefundAmount = Math.max(
      0,
      grossRequestedAmount - processingFee,
    );

    if (
      dto.refundAmount !== undefined &&
      Math.abs(dto.refundAmount - expectedRefundAmount) > 0.01
    ) {
      throw new BadRequestException(
        `Refund amount mismatch. Expected ${expectedRefundAmount.toFixed(2)} for the selected attendee(s).`,
      );
    }

    let savedRefund: WorkshopRefund | null = null;
    let requestId = '';

    const activeNonRefundedAttendeeCount = (reservation.attendees ?? []).filter(
      (attendee) => !alreadyRefundedIds.has(attendee.id),
    ).length;

    const refundType =
      selectedAttendees.length === activeNonRefundedAttendeeCount
        ? WorkshopRefundType.FULL
        : WorkshopRefundType.PARTIAL;

    for (let attempt = 0; attempt < 3; attempt++) {
      requestId = await this.generateNextRefundRequestId();

      const refund = this.refundsRepo.create({
        requestId,
        workshopId: courseId,
        reservationId: reservation.id,
        userId,
        refundType,
        refundAmount: this.toMoneyString(expectedRefundAmount),
        reason: dto.reason,
        status: WorkshopRefundStatus.PENDING,
      });

      try {
        savedRefund = await this.refundsRepo.save(refund);

        const pendingItems = selectedAttendees.map((attendee) =>
          this.refundItemsRepo.create({
            refundId: savedRefund!.id,
            attendeeId: attendee.id,
            refundAmount: this.toMoneyString(perSeatAmount),
            status: WorkshopRefundItemStatus.PENDING,
          }),
        );

        await this.refundItemsRepo.save(pendingItems);
        break;
      } catch (error) {
        if (savedRefund?.id) {
          await this.refundsRepo.delete(savedRefund.id);
        }

        if (this.isDuplicateRequestIdError(error) && attempt < 2) {
          savedRefund = null;
          continue;
        }

        throw error;
      }
    }

    if (!savedRefund) {
      throw new BadRequestException(
        'Could not create refund request. Please try again.',
      );
    }

    await this.syncReservationRefundRequestStatus(reservation.id);

    const userFullName = user.fullLegalName || 'Student';
    const userEmail = user.medicalEmail || '';
    const courseTitle = workshop.title;

    const fromEmail = this.configService.get<string>('SES_FROM_EMAIL');
    const adminEmail = this.configService.get<string>(
      'SES_CONTACT_RECEIVER_EMAIL',
    );

    if (this.ses && fromEmail && adminEmail) {
      const escapeHtml = (unsafe: string) => {
        return unsafe
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      };

      const safeReason = escapeHtml(dto.reason);
      const safeAmount = `$${expectedRefundAmount.toFixed(2)}`;

      const adminHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #1d4ed8; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">New Refund Request</h2>
        <p>A new refund request has been submitted by a student. Please review the details below:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr><td style="padding: 8px; font-weight: bold; width: 150px; border-bottom: 1px solid #eee;">Request ID:</td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #d97706; font-weight: bold; font-size: 14px;">${escapeHtml(requestId)}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; width: 150px; border-bottom: 1px solid #eee;">Student Name:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(userFullName)}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Email:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(userEmail)}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Course:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(courseTitle)}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Requested Members:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${selectedAttendees.length}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Requested Refund Amount:</td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #d97706; font-weight: bold;">${safeAmount}</td></tr>
        </table>

        <div style="margin-top: 20px; background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <p style="margin-top: 0; font-weight: bold; color: #475569;">Reason for Refund:</p>
          <p style="margin-bottom: 0; color: #1e293b; white-space: pre-line;">${safeReason}</p>
        </div>
      </div>
    `;

      const userHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #0ea5e9;">Refund Request Received</h2>
        <p>Hello ${escapeHtml(userFullName)},</p>
        <p>We have successfully received your refund request for the course <strong>${escapeHtml(courseTitle)}</strong>.</p>

        <div style="margin: 20px 0; background-color: #f0f9ff; padding: 15px; border-radius: 6px; border: 2px solid #0ea5e9;">
          <p style="margin: 0; font-size: 14px;"><strong>Your Request ID:</strong></p>
          <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: bold; color: #0ea5e9;">${escapeHtml(requestId)}</p>
        </div>
        
        <div style="margin: 20px 0; background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <p style="margin: 0 0 10px 0;"><strong>Requested Members:</strong> ${selectedAttendees.length}</p>
          <p style="margin: 0 0 10px 0;"><strong>Expected Refund:</strong> ${safeAmount}</p>
          <p style="margin: 0;"><strong>Reason:</strong> ${safeReason}</p>
        </div>

        <p>Our team will review your request and process it within <strong>3-5 business days</strong>.</p>
      </div>
    `;

      try {
        await this.ses.send(
          new SendEmailCommand({
            FromEmailAddress: fromEmail,
            ReplyToAddresses: [userEmail],
            Destination: { ToAddresses: [adminEmail] },
            Content: {
              Simple: {
                Subject: {
                  Data: `[Refund Request ${requestId}] ${courseTitle} - ${userFullName}`,
                },
                Body: { Html: { Data: adminHtml } },
              },
            },
          }),
        );

        await this.ses.send(
          new SendEmailCommand({
            FromEmailAddress: fromEmail,
            Destination: { ToAddresses: [userEmail] },
            Content: {
              Simple: {
                Subject: {
                  Data: `Refund Request Confirmation ${requestId} - ${courseTitle}`,
                },
                Body: { Html: { Data: userHtml } },
              },
            },
          }),
        );
      } catch (error) {
        this.logger.error(
          'Failed to send refund emails via SES',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return {
      success: true,
      title: 'Refund Request Submitted',
      message:
        'Your refund request has been successfully submitted. Our team will review it and process it within 3-5 business days. You will receive an email confirmation shortly.',
      requestId,
      expectedRefund: `$${expectedRefundAmount.toFixed(2)}`,
      requestedMemberCount: selectedAttendees.length,
      reasonRecorded: dto.reason,
    };
  }

  async generateIcsFile(courseId: string): Promise<string> {
    const workshop = await this.workshopsRepo.findOne({
      where: { id: courseId },
      relations: ['days', 'days.segments'],
    });

    if (!workshop || !workshop.days || workshop.days.length === 0) {
      throw new NotFoundException('Course schedule not found.');
    }

    const sortedDays = [...workshop.days].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const firstDay = sortedDays[0];
    const lastDay = sortedDays[sortedDays.length - 1];

    // Convert string 'YYYY-MM-DD' to number array [YYYY, MM, DD, HH, mm] required by 'ics'
    const startYear = parseInt(firstDay.date.split('-')[0]);
    const startMonth = parseInt(firstDay.date.split('-')[1]);
    const startDay = parseInt(firstDay.date.split('-')[2]);

    const endYear = parseInt(lastDay.date.split('-')[0]);
    const endMonth = parseInt(lastDay.date.split('-')[1]);
    const endDay = parseInt(lastDay.date.split('-')[2]);

    const event: EventAttributes = {
      start: [startYear, startMonth, startDay, 9, 0], // Assuming 9:00 AM start
      end: [endYear, endMonth, endDay, 17, 0], // Assuming 5:00 PM end
      title: workshop.title,
      description: workshop.shortBlurb || 'Course session',
      location:
        workshop.deliveryMode === 'online'
          ? workshop.meetingLink || 'Online/Zoom'
          : 'Dallas Training Center',
      url:
        process.env.FRONTEND_URL || 'https://medical-frontend-eta.vercel.app',
      status: 'CONFIRMED',
      busyStatus: 'BUSY',
    };

    return new Promise((resolve, reject) => {
      ics.createEvent(event, (error, value) => {
        if (error) {
          reject(new Error('Failed to generate calendar file'));
        }
        resolve(value);
      });
    });
  }

  // ── 5. ADD TO CALENDAR LINKS API ──
  async getCalendarLinks(userId: string, courseId: string) {
    const [e, reservation] = await Promise.all([
      this.enrollmentsRepo.findOne({ where: { userId, workshopId: courseId } }),
      this.reservationsRepo.findOne({
        where: { userId, workshopId: courseId, status: 'confirmed' as any },
      }),
    ]);

    if (!e && !reservation) throw new NotFoundException('Course not found.');

    const workshop = await this.workshopsRepo.findOne({
      where: { id: courseId },
      relations: ['days', 'days.segments'],
    });

    if (!workshop || !workshop.days || workshop.days.length === 0) {
      throw new BadRequestException('No schedule available.');
    }

    const sortedDays = [...workshop.days].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const firstDay = sortedDays[0];
    const lastDay = sortedDays[sortedDays.length - 1];

    const title = encodeURIComponent(workshop.title);
    const details = encodeURIComponent(workshop.shortBlurb || 'Course session');
    const location = encodeURIComponent(
      workshop.deliveryMode === 'online'
        ? workshop.meetingLink || 'Zoom'
        : 'Dallas Training Center',
    );

    const startDateStr = firstDay.date.replace(/-/g, '');
    const endDateStr = lastDay.date.replace(/-/g, '');

    return {
      title: 'Add to Calendar',
      description:
        'Choose your preferred calendar to add this course schedule.',
      links: {
        google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDateStr}T090000Z/${endDateStr}T170000Z&details=${details}&location=${location}`,
        outlook: `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${title}&startdt=${firstDay.date}T09:00:00&enddt=${lastDay.date}T17:00:00&body=${details}&location=${location}`,
        yahoo: `https://calendar.yahoo.com/?v=60&view=d&type=20&title=${title}&st=${startDateStr}T090000Z&et=${endDateStr}T170000Z&desc=${details}&in_loc=${location}`,
        appleOrIcs: `/workshops/private/my-courses/${courseId}/calendar/download-ics`,
      },
    };
  }

  // ── 6. MEETING JOINING DETAILS API ──
  async getMeetingDetails(userId: string, courseId: string) {
    const [e, reservation] = await Promise.all([
      this.enrollmentsRepo.findOne({ where: { userId, workshopId: courseId } }),
      this.reservationsRepo.findOne({
        where: { userId, workshopId: courseId, status: 'confirmed' as any },
      }),
    ]);

    if (!e && !reservation) throw new NotFoundException('Course not found.');

    const workshop = await this.workshopsRepo.findOne({
      where: { id: courseId },
    });

    if (!workshop) throw new NotFoundException('Workshop not found.');
    if (workshop.deliveryMode !== 'online')
      throw new BadRequestException('This is not an online course.');

    const started = await this.markCourseAsStarted(userId, courseId);

    return {
      title: 'Join Live Session',
      description: `You are about to join the live session for ${workshop.title}.`,
      courseStatus: CourseProgressStatus.NOT_STARTED, // treat as confirmed until completed
      courseStatusLabel: 'Registration Confirmed',
      startedAt: started.startedAt,
      meetingDetails: {
        platform: workshop.webinarPlatform || 'Zoom',
        meetingLink: workshop.meetingLink || 'Link will be provided soon',
        meetingId: 'Will be provided via email/link',
        passcode: workshop.meetingPassword || 'N/A',
      },
      actions: {
        cancel: 'Cancel',
        join: 'Join Now',
      },
    };
  }

  // ── 7. GENERATE CERTIFICATE PDF ──
  async generateCertificatePdf(ticketId: string, res: Response) {
    const ticketData = await this.getPublicTicketDetails(ticketId);
    const data = ticketData.data;

    const courseTitle = data.course.title;

    const attendeesToCertify = [data.attendee.name];
    if (data.groupAttendees && data.groupAttendees.length > 0) {
      data.groupAttendees.forEach((a) => {
        const cleanName = a.name.includes(': ')
          ? a.name.split(': ')[1]
          : a.name;
        attendeesToCertify.push(cleanName);
      });
    }

    const doc = new PDFDocument({
      autoFirstPage: false,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Certificate-${data.bookingInfo.bookingRef}.pdf`,
    );

    doc.pipe(res);

    const primaryColor = '#0F4C75';
    const secondaryColor = '#F9A826';
    const textColor = '#333333';

    // File paths for your assets
    const logoPath = path.join(
      process.cwd(),
      'src',
      'common',
      'assets',
      'Texas_Airway.png',
    );
    const signaturePath = path.join(
      process.cwd(),
      'src',
      'common',
      'assets',
      'Dr_Sarah_Jenkins.png',
    );

    for (const attendeeName of attendeesToCertify) {
      doc.addPage({
        size: 'LETTER',
        layout: 'landscape',
        margin: 50,
      });

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      // BACKGROUND
      doc.rect(0, 0, pageWidth, pageHeight).fill('#FCFDFD');
      doc
        .lineWidth(10)
        .strokeColor(primaryColor)
        .rect(20, 20, pageWidth - 40, pageHeight - 40)
        .stroke();
      doc
        .lineWidth(2)
        .strokeColor(secondaryColor)
        .rect(28, 28, pageWidth - 56, pageHeight - 56)
        .stroke();

      // Corners
      doc.polygon([20, 20], [100, 20], [20, 100]).fill(primaryColor);
      doc
        .polygon(
          [pageWidth - 20, pageHeight - 20],
          [pageWidth - 100, pageHeight - 20],
          [pageWidth - 20, pageHeight - 100],
        )
        .fill(primaryColor);
      doc
        .polygon([20, 100], [100, 20], [120, 20], [20, 120])
        .fill(secondaryColor);
      doc
        .polygon(
          [pageWidth - 20, pageHeight - 100],
          [pageWidth - 100, pageHeight - 20],
          [pageWidth - 120, pageHeight - 20],
          [pageWidth - 20, pageHeight - 120],
        )
        .fill(secondaryColor);

      // ==========================================
      // LOGO / HEADER
      // ==========================================
      const logoY = 60;

      try {
        // Center the image: (PageWidth / 2) - (ImageWidth / 2)
        doc.image(logoPath, pageWidth / 2 - 75, logoY, { width: 150 });
      } catch (err) {
        // Fallback text if image loading fails
        doc
          .fillColor(primaryColor)
          .font('Helvetica-Bold')
          .fontSize(20)
          .text('Texas Airway', 0, logoY + 20, {
            align: 'center',
            width: pageWidth,
          });
        doc
          .fillColor('#666666')
          .font('Helvetica')
          .fontSize(10)
          .text('INSTITUTE', 0, logoY + 45, {
            align: 'center',
            width: pageWidth,
            characterSpacing: 4,
          });
      }

      // ==========================================
      // CENTERED TEXT BLOCK
      // ==========================================
      // TITLE
      doc
        .fillColor(textColor)
        .font('Helvetica-Bold')
        .fontSize(36)
        .text('CERTIFICATE', 0, 160, {
          align: 'center',
          width: pageWidth,
          characterSpacing: 2,
        });
      doc.font('Helvetica').fontSize(18).text('OF COMPLETION', 0, 200, {
        align: 'center',
        width: pageWidth,
        characterSpacing: 1,
      });

      doc
        .moveTo(pageWidth / 2 - 50, 230)
        .lineTo(pageWidth / 2 + 50, 230)
        .lineWidth(2)
        .strokeColor(secondaryColor)
        .stroke();

      // RECIPIENT
      doc
        .fillColor('#555555')
        .font('Times-Italic')
        .fontSize(16)
        .text('This is to certify that', 0, 260, {
          align: 'center',
          width: pageWidth,
        });
      doc
        .fillColor(primaryColor)
        .font('Times-BoldItalic')
        .fontSize(42)
        .text(attendeeName, 0, 290, { align: 'center', width: pageWidth });

      // COURSE INFO
      doc
        .fillColor('#555555')
        .font('Times-Italic')
        .fontSize(16)
        .text(
          'has successfully completed the intensive training course on',
          0,
          360,
          { align: 'center', width: pageWidth },
        );
      doc
        .fillColor(textColor)
        .font('Helvetica-Bold')
        .fontSize(22)
        .text(courseTitle, 0, 395, { align: 'center', width: pageWidth });

      // ==========================================
      // FOOTER
      // ==========================================
      // ✅ FIX: Lifted footer from 120 to 140 to prevent bottom boundary overflow
      const footerY = pageHeight - 140;

      // Left Side: Removed Date Issued
      doc
        .fillColor('#777777')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('Certificate ID:', 80, footerY + 20)
        .font('Helvetica')
        .text(data.bookingInfo.bookingRef, 80, footerY + 35);

      // Right Side: Signature
      const signatureX = pageWidth - 250;

      try {
        // Place signature image above the line
        doc.image(signaturePath, signatureX + 10, footerY - 20, { width: 150 });
      } catch (err) {
        // Ignore if signature image doesn't exist
      }

      doc
        .moveTo(signatureX, footerY + 35)
        .lineTo(signatureX + 170, footerY + 35)
        .lineWidth(1)
        .strokeColor(textColor)
        .stroke();

      doc
        .fillColor(textColor)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text('Dr. Sarah Jenkins', signatureX, footerY + 45, {
          width: 170,
          align: 'center',
        });
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#666666')
        .text('Program Director', signatureX, footerY + 60, {
          width: 170,
          align: 'center',
        });
    }

    doc.end();
  }

  async getWorkshopStats() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const nextWorkshopRaw = await this.workshopsRepo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.days', 'wd')
      .where('w.status = :status', { status: WorkshopStatus.PUBLISHED })
      .andWhere('wd.date >= :today', { today: todayStr })
      .orderBy('wd.date', 'ASC')
      .getOne();

    let nextWorkshopDaysRemaining: number | null = null;
    let nextWorkshopDate: string | null = null;

    if (
      nextWorkshopRaw &&
      nextWorkshopRaw.days &&
      nextWorkshopRaw.days.length > 0
    ) {
      const sortedDays = [...nextWorkshopRaw.days].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      const nextDateStr = sortedDays[0].date;
      const nextDate = new Date(`${nextDateStr}T00:00:00`);
      const todayDate = new Date(`${todayStr}T00:00:00`);

      const timeDiff = nextDate.getTime() - todayDate.getTime();
      nextWorkshopDaysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

      nextWorkshopDate = nextDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }

    const activeWorkshops = await this.workshopsRepo.find({
      where: { status: WorkshopStatus.PUBLISHED },
      select: ['id', 'capacity'],
    });

    const totalCapacity = activeWorkshops.reduce(
      (sum, workshop) => sum + (workshop.capacity || 0),
      0,
    );

    let totalFilledSeats = 0;

    if (activeWorkshops.length > 0) {
      const activeWorkshopIds = activeWorkshops.map((workshop) => workshop.id);

      const filledSeatsRaw = await this.reservationsRepo
        .createQueryBuilder('r')
        .select('SUM(r.numberOfSeats)', 'total')
        .where('r.workshopId IN (:...ids)', { ids: activeWorkshopIds })
        .andWhere('r.status IN (:...statuses)', {
          statuses: ['confirmed', 'pending'],
        })
        .getRawOne();

      totalFilledSeats = parseInt(filledSeatsRaw?.total || '0', 10);
    }

    const openSeats = Math.max(0, totalCapacity - totalFilledSeats);

    const pendingRefunds = await this.refundsRepo.count({
      where: {
        status: WorkshopRefundStatus.PENDING,
      },
    });

    return {
      message: 'Dashboard stats fetched successfully',
      data: {
        nextWorkshop: {
          daysRemaining: nextWorkshopDaysRemaining,
          targetDate: nextWorkshopDate,
          label:
            nextWorkshopDaysRemaining === null
              ? 'No upcoming workshops'
              : nextWorkshopDaysRemaining === 0
                ? 'Starts Today'
                : `In ${nextWorkshopDaysRemaining} Day${nextWorkshopDaysRemaining > 1 ? 's' : ''}`,
        },
        activeSeats: {
          open: openSeats,
          filled: totalFilledSeats,
          totalCapacity,
        },
        refundRequests: {
          pendingReview: pendingRefunds,
        },
      },
    };
  }
}
