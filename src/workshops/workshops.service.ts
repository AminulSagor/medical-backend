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
}
