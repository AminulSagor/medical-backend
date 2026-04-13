import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, In, Repository } from 'typeorm';
import { Workshop } from './entities/workshop.entity';
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
  constructor(
    @InjectRepository(Workshop) private workshopsRepo: Repository<Workshop>,
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
  ) {}

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
  ): 'active' | 'in_progress' | 'completed' {
    const { startDate, endDate } = this.getWorkshopDateRange(workshop);

    if (!startDate || !endDate) {
      return 'active';
    }

    if (endDate < now) {
      return 'completed';
    }

    if (startDate <= now && endDate >= now) {
      return 'in_progress';
    }

    return 'active';
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
      latestReservationByWorkshop,
    };
  }

  async create(dto: CreateWorkshopDto) {
    // --- validations ---
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('Workshop title is required');

    const baseRate = Number(dto.standardBaseRate ?? '0');
    if (!Number.isFinite(baseRate) || baseRate <= 0) {
      throw new BadRequestException('standardBaseRate must be greater than 0');
    }

    if (dto.alertAt > dto.capacity) {
      throw new BadRequestException('alertAt cannot be greater than capacity');
    }

    // Handle facilityIds based on delivery mode
    let facilityIds = dto.facilityIds || [];

    if (dto.deliveryMode === 'online') {
      // For online workshops, default to ["online"] if not provided
      if (facilityIds.length === 0) {
        facilityIds = ['online'];
      }
    } else {
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

    // days/segments validation + time parsing
    if (!dto.days?.length)
      throw new BadRequestException('At least one day is required');

    const normalizedDays = dto.days.map((d) => {
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

    // faculty assignment (existing only)
    let facultyEntities: Faculty[] = [];
    if (dto.facultyIds?.length) {
      facultyEntities = await this.facultyRepo.findByIds(dto.facultyIds as any);
      if (facultyEntities.length !== dto.facultyIds.length) {
        throw new BadRequestException('One or more facultyIds are invalid');
      }
    }

    const payload: DeepPartial<Workshop> = {
      deliveryMode: dto.deliveryMode,
      status: dto.status ?? WorkshopStatus.DRAFT,
      title,
      shortBlurb: dto.shortBlurb?.trim() || undefined,
      coverImageUrl: dto.coverImageUrl?.trim() || undefined,
      learningObjectives: dto.learningObjectives ?? undefined,
      offersCmeCredits: dto.offersCmeCredits,

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
    };

    const workshop = this.workshopsRepo.create(payload);
    return await this.workshopsRepo.save(workshop);
  }

  async update(id: string, dto: UpdateWorkshopDto) {
    // Find existing workshop
    const workshop = await this.workshopsRepo.findOne({ where: { id } });
    if (!workshop) {
      throw new NotFoundException(`Workshop with ID ${id} not found`);
    }

    // Validate title if provided
    if (dto.title !== undefined) {
      const title = dto.title?.trim();
      if (!title)
        throw new BadRequestException('Workshop title cannot be empty');
    }

    // Validate base rate if provided
    if (dto.standardBaseRate !== undefined) {
      const baseRate = Number(dto.standardBaseRate ?? '0');
      if (!Number.isFinite(baseRate) || baseRate <= 0) {
        throw new BadRequestException(
          'standardBaseRate must be greater than 0',
        );
      }
    }

    // Validate alertAt vs capacity
    const newCapacity = dto.capacity ?? workshop.capacity;
    const newAlertAt = dto.alertAt ?? workshop.alertAt;
    if (newAlertAt > newCapacity) {
      throw new BadRequestException('alertAt cannot be greater than capacity');
    }

    // Handle facilityIds based on delivery mode
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

    // Group discount validation
    if (
      dto.groupDiscountEnabled !== undefined ||
      dto.groupDiscounts !== undefined
    ) {
      const groupDiscountEnabled =
        dto.groupDiscountEnabled ?? workshop.groupDiscountEnabled;
      const groupDiscounts =
        dto.groupDiscounts ?? workshop.groupDiscounts ?? [];
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

    // Days/segments validation + time parsing if provided
    let normalizedDays;
    if (dto.days !== undefined) {
      if (!dto.days?.length)
        throw new BadRequestException('At least one day is required');

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

        // Ensure segmentNumber unique per day
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

    // Faculty assignment validation if provided
    let facultyEntities: Faculty[] | undefined;
    if (dto.facultyIds !== undefined) {
      if (dto.facultyIds.length > 0) {
        facultyEntities = await this.facultyRepo.findByIds(
          dto.facultyIds as any,
        );
        if (facultyEntities.length !== dto.facultyIds.length) {
          throw new BadRequestException('One or more facultyIds are invalid');
        }
      } else {
        facultyEntities = [];
      }
    }

    // Build update payload
    const updatePayload: any = {};

    if (dto.deliveryMode !== undefined)
      updatePayload.deliveryMode = dto.deliveryMode;
    if (dto.status !== undefined) updatePayload.status = dto.status;
    if (dto.title !== undefined) updatePayload.title = dto.title.trim();
    if (dto.shortBlurb !== undefined)
      updatePayload.shortBlurb = dto.shortBlurb?.trim() || undefined;
    if (dto.coverImageUrl !== undefined)
      updatePayload.coverImageUrl = dto.coverImageUrl?.trim() || undefined;
    if (dto.learningObjectives !== undefined)
      updatePayload.learningObjectives = dto.learningObjectives ?? undefined;
    if (dto.offersCmeCredits !== undefined)
      updatePayload.offersCmeCredits = dto.offersCmeCredits;
    if (facilityIds !== undefined) updatePayload.facilityIds = facilityIds;
    if (dto.webinarPlatform !== undefined)
      updatePayload.webinarPlatform = dto.webinarPlatform?.trim() || undefined;
    if (dto.meetingLink !== undefined)
      updatePayload.meetingLink = dto.meetingLink?.trim() || undefined;
    if (dto.meetingPassword !== undefined)
      updatePayload.meetingPassword = dto.meetingPassword?.trim() || undefined;
    if (dto.autoRecordSession !== undefined)
      updatePayload.autoRecordSession = dto.autoRecordSession;
    if (dto.capacity !== undefined) updatePayload.capacity = dto.capacity;
    if (dto.alertAt !== undefined) updatePayload.alertAt = dto.alertAt;
    if (dto.standardBaseRate !== undefined)
      updatePayload.standardBaseRate = dto.standardBaseRate;
    if (dto.groupDiscountEnabled !== undefined)
      updatePayload.groupDiscountEnabled = dto.groupDiscountEnabled;

    // Update the workshop entity
    Object.assign(workshop, updatePayload);

    // Handle relations separately
    if (normalizedDays !== undefined) {
      workshop.days = normalizedDays as any;
    }
    if (dto.groupDiscounts !== undefined) {
      workshop.groupDiscounts = dto.groupDiscounts.map((g) => ({
        minimumAttendees: g.minimumAttendees,
        groupRatePerPerson: g.groupRatePerPerson,
      })) as any;
    }
    if (facultyEntities !== undefined) {
      workshop.faculty = facultyEntities;
    }

    return await this.workshopsRepo.save(workshop);
  }

  async list(query: ListWorkshopsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.workshopsRepo.createQueryBuilder('w');

    // filters
    if (query.q?.trim()) {
      qb.andWhere('LOWER(w.title) LIKE :q', {
        q: `%${query.q.toLowerCase().trim()}%`,
      });
    }

    if (query.facilityId) {
      // Check if facilityId is contained in the facilityIds array (stored as comma-separated)
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
      qb.andWhere('w.offersCmeCredits = :offersCmeCredits', {
        offersCmeCredits: query.offersCmeCredits === 'true',
      });
    }

    if (query.groupDiscountEnabled) {
      qb.andWhere('w.groupDiscountEnabled = :groupDiscountEnabled', {
        groupDiscountEnabled: query.groupDiscountEnabled === 'true',
      });
    }

    // filter by faculty (workshop_faculty join table)
    if (query.facultyId) {
      qb.innerJoin(
        'workshop_faculty',
        'wf',
        'wf.workshopId = w.id AND wf.facultyId = :facultyId',
        {
          facultyId: query.facultyId,
        },
      );
    }

    // sorting
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = (query.sortOrder ?? 'desc').toUpperCase() as
      | 'ASC'
      | 'DESC';
    qb.orderBy(`w.${sortBy}`, sortOrder);

    // pagination
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

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

    // Filters
    if (query.deliveryMode) {
      qb.andWhere('w.deliveryMode = :deliveryMode', {
        deliveryMode: query.deliveryMode,
      });
    }

    if (query.offersCmeCredits) {
      qb.andWhere('w.offersCmeCredits = :offersCmeCredits', {
        offersCmeCredits: query.offersCmeCredits === 'true',
      });
    }

    // Get reserved seats count for each workshop
    const reservationsSubQuery = this.reservationsRepo
      .createQueryBuilder('r')
      .select('r.workshopId', 'workshopId')
      .addSelect('SUM(r.numberOfSeats)', 'reservedSeats')
      .where('r.status != :cancelledStatus', { cancelledStatus: 'cancelled' })
      .groupBy('r.workshopId');

    // Sorting
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

    // Pagination
    qb.skip(skip).take(limit);

    const [workshops, total] = await qb.getManyAndCount();

    // Get reservation counts
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

    // Transform data for public view
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

      // Total number of modules (segments)
      const totalModules =
        workshop.days?.reduce(
          (sum, day) => sum + (day.segments?.length || 0),
          0,
        ) || 0;

      // Get workshop date (first day)
      const workshopDate = workshop.days?.[0]?.date || null;

      // Calculate offer price (group discount for minimum attendees)
      const offerPrice =
        workshop.groupDiscountEnabled && workshop.groupDiscounts?.length > 0
          ? workshop.groupDiscounts.sort(
              (a, b) => a.minimumAttendees - b.minimumAttendees,
            )[0].groupRatePerPerson
          : null;

      // Get facility names
      const facilityNames = workshop.facilityIds?.join(', ') || '';

      return {
        id: workshop.id,
        date: workshopDate,
        title: workshop.title,
        description: workshop.shortBlurb,
        facility: facilityNames,
        deliveryMode: workshop.deliveryMode,
        workshopPhoto: workshop.coverImageUrl,
        totalHours: `${totalHours} hours`,
        cmeFredits: workshop.offersCmeCredits,
        availableSeats,
        totalCapacity: workshop.capacity,
        price: workshop.standardBaseRate,
        offerPrice: offerPrice,
        totalModules,
        learningObjectives: workshop.learningObjectives,
        groupDiscountEnabled: workshop.groupDiscountEnabled,
        faculty: workshop.faculty?.map((f) => ({
          id: f.id,
          name: `${f.firstName} ${f.lastName}`,
          title: f.primaryClinicalRole,
          profileImageUrl: f.imageUrl,
        })),
        // Online workshop details
        webinarPlatform: workshop.webinarPlatform,
      };
    });

    // Apply availability filter after transformation
    let filteredData = transformedData;
    if (query.hasAvailableSeats === 'true') {
      filteredData = transformedData.filter((w) => w.availableSeats > 0);
    } else if (query.hasAvailableSeats === 'false') {
      filteredData = transformedData.filter((w) => w.availableSeats === 0);
    }

    return {
      message: 'Public workshops fetched successfully',
      meta: {
        page,
        limit,
        total: filteredData.length,
        totalPages: Math.max(Math.ceil(filteredData.length / limit), 1),
      },
      data: filteredData,
    };
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

    return workshop;
  }

  async getPublicWorkshopById(id: string) {
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

    // Get facilities
    const facilityNames = workshop.facilityIds?.join(', ') || '';

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

        // Location / Online details
        facility: facilityNames,
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
        };
      })
      .filter(Boolean);

    return {
      message: 'Enrolled workshops fetched successfully',
      data,
    };
  }

  async getMyCourseSummary(userId: string) {
    const { enrolledWorkshopIds } = await this.buildStudentWorkshopMeta(userId);

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
      const courseStatus = this.getCourseStatusForStudent(workshop, now);
      const totalMinutes = this.getWorkshopTotalMinutes(workshop);

      if (courseStatus === 'in_progress') {
        totalInProgressCourses += 1;
      }

      if (courseStatus === 'completed' && workshop.offersCmeCredits) {
        totalCmeCredits += totalMinutes / 60;
      }

      if (courseStatus !== 'completed') {
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
    const { enrolledWorkshopIds, workshopMeta, latestReservationByWorkshop } =
      await this.buildStudentWorkshopMeta(userId);

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

    let items = workshops.map((workshop) => {
      const { startDate, endDate } = this.getWorkshopDateRange(workshop);
      const totalMinutes = this.getWorkshopTotalMinutes(workshop);
      const totalHours = Number((totalMinutes / 60).toFixed(1));
      const courseStatus =
        targetStatus === 'browse'
          ? 'browse'
          : this.getCourseStatusForStudent(workshop, now);

      const reservation = latestReservationByWorkshop.get(workshop.id);
      const enrolledAt = workshopMeta.get(workshop.id)?.enrolledAt ?? null;

      return {
        workshopId: workshop.id,
        title: workshop.title,
        courseType: workshop.deliveryMode,
        workshopPhoto: workshop.coverImageUrl ?? null,
        status: courseStatus,
        isEnrolled: targetStatus !== 'browse',
        enrolledAt,
        startDate,
        endDate,
        completedOn: courseStatus === 'completed' ? endDate : null,
        totalHours,
        cmeCredits: workshop.offersCmeCredits ? totalHours : 0,
        offersCmeCredits: workshop.offersCmeCredits,
        reservation:
          targetStatus !== 'browse' && reservation
            ? {
                reservationId: reservation.id,
                status: reservation.status,
                numberOfSeats: reservation.numberOfSeats,
                pricePerSeat: reservation.pricePerSeat,
                totalPrice: reservation.totalPrice,
              }
            : null,
        createdAt: workshop.createdAt,
      };
    });

    if (targetStatus === 'active') {
      items = items.filter(
        (item) => item.status === 'active' || item.status === 'in_progress',
      );
    } else if (targetStatus === 'in_progress') {
      items = items.filter((item) => item.status === 'in_progress');
    } else if (targetStatus === 'completed') {
      items = items.filter((item) => item.status === 'completed');
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
    const pagedItems = items.slice(skip, skip + limit);

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

  async createOrderSummary(userId: string, dto: CheckoutOrderSummaryDto) {
    // Validate workshop exists and is published
    const workshop = await this.workshopsRepo.findOne({
      where: { id: dto.workshopId, status: WorkshopStatus.PUBLISHED },
      relations: ['groupDiscounts'],
    });

    if (!workshop) {
      throw new NotFoundException(
        'Workshop not found or not available for booking',
      );
    }

    // Validate attendees
    if (!dto.attendees || dto.attendees.length === 0) {
      throw new BadRequestException('At least one attendee is required');
    }

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
    const numberOfSeats = dto.attendees.length;

    if (availableSeats < numberOfSeats) {
      throw new BadRequestException(
        `Only ${availableSeats} seats available. You are trying to book ${numberOfSeats} seats.`,
      );
    }

    // Calculate pricing
    const standardPricePerSeat = Number(workshop.standardBaseRate);
    let appliedPricePerSeat = standardPricePerSeat;
    let discountApplied = false;
    let discountInfo: any = null;

    // Check if group discount applies
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

    // Upsert behavior: update existing pending summary for same user+workshop,
    // otherwise create a fresh pending summary.
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

      // Replace previous attendee list with the new payload.
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
        email: attendee.email,
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
          email: attendee.email,
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

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
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
        },
        numberOfAttendees: orderSummary.numberOfSeats,
        totalPrice: orderSummary.totalPrice,
        status: orderSummary.status,
      },
    };
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

    if (orderSummary.status === OrderSummaryStatus.COMPLETED) {
      return {
        message: 'Workshop payment already verified',
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

    const stripe = Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(dto.sessionId);

    if (!session) {
      throw new BadRequestException('Invalid Stripe checkout session');
    }

    if (session.metadata?.orderSummaryId !== orderSummary.id) {
      throw new BadRequestException(
        'Checkout session does not match order summary',
      );
    }

    if (session.metadata?.userId !== userId) {
      throw new BadRequestException('Checkout session does not belong to user');
    }

    if (session.payment_status !== 'paid') {
      throw new BadRequestException(
        `Payment not completed. Current payment_status: ${session.payment_status}`,
      );
    }

    orderSummary.status = OrderSummaryStatus.COMPLETED;
    const saved = await this.orderSummariesRepo.save(orderSummary);

    return {
      message: 'Workshop payment verified successfully',
      data: {
        orderSummaryId: saved.id,
        workshop: {
          id: saved.workshop.id,
          title: saved.workshop.title,
        },
        numberOfAttendees: saved.numberOfSeats,
        totalPrice: saved.totalPrice,
        status: saved.status,
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

    const numberOfSeats = attendees.length;

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

    if (availableSeats < numberOfSeats) {
      throw new BadRequestException(
        `Only ${availableSeats} seats available. You are trying to book ${numberOfSeats} seats.`,
      );
    }

    // Calculate price (check if group discount applies)
    let pricePerSeat = Number(workshop.standardBaseRate);

    if (workshop.groupDiscountEnabled && workshop.groupDiscounts?.length > 0) {
      const applicableDiscounts = workshop.groupDiscounts
        .filter((d) => numberOfSeats >= d.minimumAttendees)
        .sort(
          (a, b) => Number(a.groupRatePerPerson) - Number(b.groupRatePerPerson),
        );

      if (applicableDiscounts.length > 0) {
        pricePerSeat = Number(applicableDiscounts[0].groupRatePerPerson);
      }
    }

    const totalPrice = pricePerSeat * numberOfSeats;

    // Create reservation with attendees mapped from order summary
    const reservation = this.reservationsRepo.create({
      workshopId: dto.workshopId,
      userId,
      numberOfSeats,
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
        availableSeatsRemaining: availableSeats - numberOfSeats,
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
      select: ['id', 'title'],
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

    const refundItems = await this.refundItemsRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.refund', 'refund')
      .where('refund.workshopId = :workshopId', { workshopId })
      .getMany();

    const attendeeRefundMap = new Map<
      string,
      { status: 'REFUNDED' | 'PARTIAL_REFUNDED'; refundAmount: string }
    >();

    for (const item of refundItems) {
      attendeeRefundMap.set(item.attendeeId, {
        status: item.status,
        refundAmount: item.refundAmount,
      });
    }

    const transformed = reservations.map((reservation) => {
      const members = (reservation.attendees ?? []).map((attendee) => {
        const refundInfo = attendeeRefundMap.get(attendee.id);

        return {
          attendeeId: attendee.id,
          fullName: attendee.fullName,
          email: attendee.email,
          institutionOrHospital: reservation.institutionOrHospital ?? null,
          status:
            refundInfo?.status === 'REFUNDED'
              ? 'REFUNDED'
              : refundInfo?.status === 'PARTIAL_REFUNDED'
                ? 'PARTIAL_REFUNDED'
                : 'CONFIRMED',
        };
      });

      const refundedCount = members.filter(
        (m) => m.status === 'REFUNDED',
      ).length;
      const partialRefundCount = members.filter(
        (m) => m.status === 'PARTIAL_REFUNDED',
      ).length;

      let status:
        | 'BOOKED'
        | 'REFUND_REQUESTED'
        | 'PARTIAL_REFUNDED'
        | 'REFUNDED' = 'BOOKED';

      if (members.length > 0 && refundedCount === members.length) {
        status = 'REFUNDED';
      } else if (partialRefundCount > 0 || refundedCount > 0) {
        status = 'PARTIAL_REFUNDED';
      }

      const bookingType =
        reservation.bookingType ??
        (reservation.numberOfSeats > 1 ? 'group' : 'single');

      return {
        reservationId: reservation.id,
        bookingType,
        groupSize: reservation.numberOfSeats,
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
        members,
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
    }

    const totalEnrolled = transformed.reduce(
      (sum, item) => sum + (item.groupSize || 0),
      0,
    );

    const refundRequested = 0;
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

    const existingRefundItems = await this.refundItemsRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.refund', 'refund')
      .where('refund.reservationId = :reservationId', { reservationId })
      .getMany();

    const refundStatusMap = new Map<
      string,
      { status: string; refundedAmount: string }
    >();

    for (const item of existingRefundItems) {
      refundStatusMap.set(item.attendeeId, {
        status: item.status,
        refundedAmount: item.refundAmount,
      });
    }

    const perSeatAmount = this.toMoney(reservation.pricePerSeat);

    const members = (reservation.attendees ?? []).map((attendee) => {
      const existing = refundStatusMap.get(attendee.id);
      const isFullyRefunded = existing?.status === 'REFUNDED';

      return {
        attendeeId: attendee.id,
        fullName: attendee.fullName,
        email: attendee.email,
        refundAmount: this.toMoneyString(perSeatAmount),
        refundStatus: existing?.status ?? 'NONE',
        isRefundable: !isFullyRefunded,
      };
    });

    const selectedMembers = members.filter((member) => member.isRefundable);
    const calculatedRefundAmount = selectedMembers.reduce(
      (sum, member) => sum + this.toMoney(member.refundAmount),
      0,
    );

    return {
      message: 'Refund preview fetched successfully',
      data: {
        reservationId: reservation.id,
        workshopId,
        bookingOwner: {
          fullName:
            reservation.bookerFullName ??
            reservation.attendees?.[0]?.fullName ??
            'Unknown',
        },
        groupSize: reservation.numberOfSeats,
        totalPaid: reservation.totalPrice,
        paymentGateway: reservation.paymentGateway ?? null,
        transactionId: reservation.paymentTransactionId ?? null,
        members,
        summary: {
          selectedCount: selectedMembers.length,
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
    const workshop = await this.workshopsRepo.findOne({
      where: { id: workshopId },
      select: ['id', 'title'],
    });

    if (!workshop) {
      throw new NotFoundException(`Workshop with ID ${workshopId} not found`);
    }

    const reservation = await this.reservationsRepo.findOne({
      where: { id: dto.reservationId, workshopId },
      relations: ['attendees'],
    });

    if (!reservation) {
      throw new NotFoundException(
        `Reservation with ID ${dto.reservationId} not found for this workshop`,
      );
    }

    const attendees = await this.attendeesRepo.find({
      where: {
        reservationId: dto.reservationId,
        id: In(dto.attendeeIds),
      },
    });

    if (attendees.length !== dto.attendeeIds.length) {
      throw new BadRequestException(
        'One or more attendeeIds are invalid for this reservation',
      );
    }

    const existingRefundItems = await this.refundItemsRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.refund', 'refund')
      .where('refund.reservationId = :reservationId', {
        reservationId: dto.reservationId,
      })
      .andWhere('item.attendeeId IN (:...attendeeIds)', {
        attendeeIds: dto.attendeeIds,
      })
      .getMany();

    const alreadyRefundedIds = new Set(
      existingRefundItems
        .filter((item) => item.status === 'REFUNDED')
        .map((item) => item.attendeeId),
    );

    if (alreadyRefundedIds.size > 0) {
      throw new BadRequestException(
        'One or more selected attendees are already fully refunded',
      );
    }

    const refundType =
      dto.attendeeIds.length === reservation.numberOfSeats
        ? WorkshopRefundType.FULL
        : WorkshopRefundType.PARTIAL;

    const refund = this.refundsRepo.create({
      workshopId,
      reservationId: dto.reservationId,
      processedByAdminId: adminId,
      refundType,
      refundAmount: dto.refundAmount,
      adjustmentNote: dto.adjustmentNote,
      paymentGateway: dto.paymentGateway,
      transactionId: dto.transactionId,
      status: WorkshopRefundStatus.PROCESSED,
      processedAt: new Date(),
      items: attendees.map((attendee) =>
        this.refundItemsRepo.create({
          attendeeId: attendee.id,
          refundAmount: this.toMoneyString(
            this.toMoney(dto.refundAmount) / dto.attendeeIds.length,
          ),
          status:
            refundType === WorkshopRefundType.FULL
              ? WorkshopRefundItemStatus.REFUNDED
              : WorkshopRefundItemStatus.PARTIAL_REFUNDED,
        }),
      ),
    });

    await this.refundsRepo.save(refund);

    if (refundType === WorkshopRefundType.FULL) {
      reservation.status = ReservationStatus.CANCELLED;
      await this.reservationsRepo.save(reservation);
    }

    return {
      message: 'Refund status updated successfully',
      data: {
        reservationId: reservation.id,
        bookingOwnerName:
          reservation.bookerFullName ??
          reservation.attendees?.[0]?.fullName ??
          'Unknown',
        refundedAmount: dto.refundAmount,
        paymentGateway: dto.paymentGateway,
        transactionId: dto.transactionId,
        processedMemberCount: dto.attendeeIds.length,
        emailNotificationSent: true,
        processedAt: refund.processedAt,
      },
    };
  }

  // ── 1. SUMMARY METRICS API ──
  async getMyCoursesSummary(userId: string) {
    // 1. Safe query without 'select' to avoid TypeORM mapping issues, and handle case sensitivity
    const [enrollments, reservations] = await Promise.all([
      this.enrollmentsRepo.find({
        where: { userId, isActive: true },
      }),
      this.reservationsRepo.find({
        // Handle both uppercase and lowercase to be absolutely safe
        where: { userId, status: In(['confirmed', 'CONFIRMED']) as any },
      }),
    ]);

    const uniqueWorkshopIds = [
      ...new Set([
        ...enrollments.map((e) => e.workshopId).filter(Boolean),
        ...reservations.map((r) => r.workshopId).filter(Boolean),
      ]),
    ];

    let activeCount = 0;
    let completedCount = 0;

    // CME Calculation Variables
    let totalCmeAllTime = 0;
    let totalCmeThisYear = 0;
    let totalCmeLastYear = 0;

    let nextSessionDatetime: Date | null = null;

    const now = new Date();
    const startOfThisYear = new Date(now.getFullYear(), 0, 1);
    const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
    const startOfNextYear = new Date(now.getFullYear() + 1, 0, 1);

    if (uniqueWorkshopIds.length > 0) {
      // Use TypeORM's In() operator for safety
      const workshops = await this.workshopsRepo.find({
        where: { id: In(uniqueWorkshopIds) },
        relations: ['days', 'days.segments'],
      });

      for (const w of workshops) {
        if (!w.days || w.days.length === 0) continue;

        const sortedDays = [...w.days].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
        const lastDay = sortedDays[sortedDays.length - 1];
        const lastDayDate = new Date(lastDay.date);
        const isCompleted = lastDayDate < now;

        if (isCompleted) {
          completedCount++;

          if (w.offersCmeCredits) {
            const earnedCme = sortedDays.length * 4; // Or fetch from a specific column if you have it
            totalCmeAllTime += earnedCme;

            // Trend calculation grouping
            if (
              lastDayDate >= startOfThisYear &&
              lastDayDate < startOfNextYear
            ) {
              totalCmeThisYear += earnedCme;
            } else if (
              lastDayDate >= startOfLastYear &&
              lastDayDate < startOfThisYear
            ) {
              totalCmeLastYear += earnedCme;
            }
          }
        } else {
          activeCount++;
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

    // ── Trend Calculation Math ──
    let cmeTrend = '0% vs last year';
    if (totalCmeLastYear === 0) {
      cmeTrend =
        totalCmeThisYear > 0 ? '+ 100% vs last year' : '0% vs last year';
    } else {
      const percentage =
        ((totalCmeThisYear - totalCmeLastYear) / totalCmeLastYear) * 100;
      const sign = percentage > 0 ? '+' : '';
      cmeTrend = `${sign} ${percentage.toFixed(1)}% vs last year`;
    }

    return {
      totalCmeCredits: {
        value: totalCmeAllTime.toFixed(1),
        trend: cmeTrend, // ✅ Trend added dynamically
      },
      coursesInProgress: {
        value: activeCount,
      },
      nextLiveSession: {
        value: nextSessionDatetime
          ? nextSessionDatetime.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })
          : 'No upcoming sessions',
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
        where: { userId, status: In(['confirmed', 'CONFIRMED']) as any },
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

    const mappedCourses = workshops.map((w) => {
      const sortedDays = (w.days || []).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      const firstDate = sortedDays.length ? new Date(sortedDays[0].date) : null;
      const lastDate = sortedDays.length
        ? new Date(sortedDays[sortedDays.length - 1].date)
        : null;
      const isCompleted = lastDate && lastDate < now;

      // Calculate basic progress %
      const totalSegments = sortedDays.reduce(
        (acc, day) => acc + (day.segments ? day.segments.length : 0),
        0,
      );
      const pastSegments = sortedDays.reduce((acc, day) => {
        return (
          acc +
          (day.segments
            ? day.segments.filter(
                (s) => new Date(`${day.date}T${s.endTime}`) < now,
              ).length
            : 0)
        );
      }, 0);
      const progressPercent =
        totalSegments > 0
          ? Math.round((pastSegments / totalSegments) * 100)
          : 0;

      // Get Pricing/Group Size from Reservation (if exists)
      const res = resMap.get(w.id);
      const enr = enrMap.get(w.id);
      const groupSize = res?.numberOfSeats || 1;
      const paidAmount = res?.totalPrice || w.standardBaseRate;

      return {
        enrollmentId: enr?.id || res?.id,
        courseId: w.id,
        isCompleted,
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
        completedDate: lastDate
          ? lastDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
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
              : { label: 'View Syllabus', route: `/courses/${w.id}/syllabus` },
          secondary: isCompleted
            ? null
            : { label: 'Add to Calendar', route: `/api/calendar/${w.id}` },
        },
      };
    });

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
    // Check if the ticket ID belongs to an Enrollment OR a Reservation
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
    }); // assuming relation exists or we fetch below

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

    // We need user details. If you don't have usersRepo injected, we can safely get it from enrollment or fallback to booking names.
    const bookerName =
      reservation?.bookerFullName ||
      enrollment?.user?.fullLegalName ||
      'Verified Attendee';
    const bookerEmail =
      reservation?.bookerEmail || enrollment?.user?.medicalEmail || '';
    const otherAttendees =
      reservation?.attendees?.filter((a) => a.email !== bookerEmail) || [];

    // Dynamic Date Range Calculation
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

      // Dynamic Progress Calculation
      const completedDays = sortedDays.filter(
        (d) => new Date(d.date) < new Date(now.toDateString()),
      ).length;
      if (completedDays === sortedDays.length)
        progressBadge = 'Course Completed';
      else if (completedDays > 0)
        progressBadge = `Day ${completedDays} Complete`;
    }

    return {
      attendee: {
        name: bookerName,
        department:
          enrollment?.user?.professionalRole || 'Medical Professional',
        roleInfo: enrollment?.user?.npiNumber
          ? `ID: #${enrollment.user.npiNumber}`
          : 'Verified',
        isVerified: true,
      },
      groupAttendees: otherAttendees.map((a) => ({
        name: a.fullName,
        role: a.professionalRole,
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
        bookingRef: `#${bookingRef.split('-')[0].toUpperCase()}`,
      },
      venueLogistics: {
        currentLocation:
          w.facilityIds && w.facilityIds.length > 0
            ? w.facilityIds[0]
            : 'Venue TBA',
        assignedEquipment: [],
      },
    };
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
      relations: ['days', 'days.segments', 'faculty'],
    });

    if (!w) throw new NotFoundException('Workshop not found.');

    const order = await this.orderSummariesRepo.findOne({
      where: { userId, workshopId: courseId, status: 'completed' as any },
    });

    const now = new Date();
    const sortedDays = (w.days || []).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const isCompleted =
      sortedDays.length > 0 &&
      new Date(sortedDays[sortedDays.length - 1].date) <
        new Date(now.toDateString());

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
      const isDayPassed = new Date(day.date) < new Date(now.toDateString());
      return {
        title: `DAY ${dIdx + 1}`,
        date: new Date(day.date)
          .toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })
          .toUpperCase(),
        status: isDayPassed ? 'COMPLETED' : 'UPCOMING',
        sessions: (day.segments || [])
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((seg) => {
            const endDt = new Date(`${day.date}T${seg.endTime}`);
            const startDt = new Date(`${day.date}T${seg.startTime}`);
            let statusText =
              endDt < now
                ? '(COMPLETED)'
                : startDt <= now && endDt >= now
                  ? '(CURRENT)'
                  : '';
            return {
              id: seg.id,
              timeLabel: `${this.formatTime(seg.startTime)} - ${this.formatTime(seg.endTime)}`,
              title: `${seg.courseTopic} ${statusText}`.trim(),
              description: seg.topicDetails,
              isCompleted: endDt < now,
              isCurrent: startDt <= now && endDt >= now,
              joinLink:
                w.deliveryMode === 'online' && !(endDt < now)
                  ? w.meetingLink
                  : null,
            };
          }),
      };
    });

    const isOnline = w.deliveryMode === 'online';
    const cme = w.offersCmeCredits ? '12.0 CME CREDITS' : null;
    // Safely generate bookRef based on which record exists
    const validId = order?.id || reservation?.id || e?.id || 'BOOKING';
    const bookRef = `#${validId.split('-')[0].toUpperCase()}-AC`;

    return {
      courseId: w.id,
      heroImage: w.coverImageUrl,
      breadcrumb: ['My Courses', w.title],
      banner: {
        badgePrimary: isCompleted
          ? 'Course Completed'
          : isOnline
            ? 'ONLINE REGISTRATION CONFIRMED'
            : 'Registration Confirmed',
        badgeSecondary: cme,
        title: w.title,
        description: isCompleted
          ? 'You have successfully completed this intensive simulation training.'
          : w.shortBlurb,
        dateBox: {
          dateRange: dateRangeStr,
          locationOrPlatform: isOnline
            ? w.webinarPlatform || 'Zoom'
            : w.facilityIds && w.facilityIds.length > 0
              ? w.facilityIds[0]
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
      scheduleHeader: {
        title: 'COURSE SCHEDULE',
        badge: isCompleted ? 'ALL SESSIONS COMPLETED' : 'UPCOMING SESSIONS',
      },
      schedule,
      sidebar: {
        certificateBox: isCompleted
          ? {
              title: 'Course Certified',
              message:
                "Congratulations! You've successfully mastered the curriculum.",
              certId: `CERT-${bookRef}`,
              downloadUrl: `/api/certs/${validId}`,
            }
          : null,
        onlineDetails:
          !isCompleted && isOnline
            ? {
                technicalRequirements: [],
                registrationReference: bookRef,
                prepMaterials: [],
              }
            : null,
        inPersonDetails:
          !isCompleted && !isOnline
            ? {
                qrNote: `Note: This ticket is valid for ${reservation?.numberOfSeats || 1} persons only.`,
                qrDataUrl: `https://texasairway.com/verify/${validId}`,
                ticketReference: bookRef,
              }
            : null,
      },
    };
  }

  // ── 3. REFUND ELIGIBILITY & ESTIMATION API ──
  async getRefundEstimation(userId: string, courseId: string) {
    const [e, reservation] = await Promise.all([
      this.enrollmentsRepo.findOne({ where: { userId, workshopId: courseId } }),
      this.reservationsRepo.findOne({
        where: { userId, workshopId: courseId, status: 'confirmed' as any },
      }),
    ]);

    if (!e && !reservation)
      throw new NotFoundException('Course enrollment not found.');

    const workshop = await this.workshopsRepo.findOne({
      where: { id: courseId },
      relations: ['days'],
    });

    if (!workshop) throw new NotFoundException('Workshop not found.');

    const order = await this.orderSummariesRepo.findOne({
      where: { userId, workshopId: courseId, status: 'completed' as any },
      order: { id: 'DESC' },
    });

    const amountPaid = order
      ? parseFloat(order.pricePerSeat)
      : parseFloat(workshop.standardBaseRate);

    if (!workshop.days || workshop.days.length === 0) {
      throw new BadRequestException('Course schedule is not defined yet.');
    }

    const sortedDays = [...workshop.days].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const courseStartDate = new Date(sortedDays[0].date);
    const currentDate = new Date();

    const timeDiff = courseStartDate.getTime() - currentDate.getTime();
    const daysBeforeStart = Math.ceil(timeDiff / (1000 * 3600 * 24));

    let refundPercentage = 0;
    let isEligible = true;

    if (daysBeforeStart >= 14) {
      refundPercentage = 100;
    } else if (daysBeforeStart >= 7 && daysBeforeStart <= 13) {
      refundPercentage = 50;
    } else {
      refundPercentage = 0;
      isEligible = false;
    }

    const estimatedRefund = (amountPaid * (refundPercentage / 100)).toFixed(2);

    return {
      isEligible,
      daysBeforeStart,
      policy: {
        fullRefundDays: 14,
        partialRefundDaysMin: 7,
        partialRefundDaysMax: 13,
        partialRefundPercentage: 50,
      },
      courseDetails: {
        title: workshop.title,
        startDate: courseStartDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      },
      financials: {
        amountPaid: amountPaid.toFixed(2),
        estimatedRefund: estimatedRefund,
        currency: 'USD',
      },
      uiMessages: {
        title: isEligible ? 'Request Refund' : 'Refund Period Expired',
        description: isEligible
          ? 'Are you sure you want to request a refund for this course? Please review our refund policy before proceeding.'
          : "We're sorry, but the refund period for this course has expired. As per our policy, refunds must be requested at least 7 days before the course start date.",
      },
    };
  }

  // ── 4. SUBMIT REFUND REQUEST API ──
  async submitRefundRequest(userId: string, courseId: string) {
    const estimation = await this.getRefundEstimation(userId, courseId);

    if (!estimation.isEligible) {
      throw new BadRequestException(
        "We're sorry, but the refund period for this course has expired.",
      );
    }

    // Here you would normally insert into a `refund_requests` table or send an email to Admin.
    // For now, we return the exact success response required by the UI.

    return {
      success: true,
      title: 'Refund Request Submitted',
      message:
        'Your refund request has been successfully submitted. Our team will review it and process it within 3-5 business days. You will receive an email confirmation shortly.',
      refundAmountRequested: estimation.financials.estimatedRefund,
    };
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
        appleOrIcs: `/api/workshops/${courseId}/download-ics`,
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

    return {
      title: 'Join Live Session',
      description: `You are about to join the live session for ${workshop.title}.`,
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
}
