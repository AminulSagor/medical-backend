import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DeepPartial, Repository } from "typeorm";
import { Workshop } from "./entities/workshop.entity";
import { CreateWorkshopDto } from "./dto/create-workshop.dto";
import { Facility } from "../facilities/entities/facility.entity";
import { Faculty } from "../faculty/entities/faculty.entity";
import { ListWorkshopsQueryDto } from "./dto/list-workshops.query.dto";


function parse12hToTime(v: string): string {
    // expects: "08:00 AM"
    const raw = String(v ?? "").trim();
    const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) throw new BadRequestException(`Invalid time format: ${raw}. Use "08:00 AM"`);

    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();

    if (hh < 1 || hh > 12) throw new BadRequestException(`Invalid hour: ${raw}`);
    if (mm < 0 || mm > 59) throw new BadRequestException(`Invalid minute: ${raw}`);

    if (ap === "AM") {
        if (hh === 12) hh = 0;
    } else {
        if (hh !== 12) hh += 12;
    }

    const HH = String(hh).padStart(2, "0");
    const MM = String(mm).padStart(2, "0");
    return `${HH}:${MM}:00`;
}

@Injectable()
export class WorkshopsService {
    constructor(
        @InjectRepository(Workshop) private workshopsRepo: Repository<Workshop>,
        @InjectRepository(Facility) private facilitiesRepo: Repository<Facility>,
        @InjectRepository(Faculty) private facultyRepo: Repository<Faculty>,
    ) { }



    async create(dto: CreateWorkshopDto) {
        // --- validations ---
        const title = dto.title?.trim();
        if (!title) throw new BadRequestException("Workshop title is required");

        const baseRate = Number(dto.standardBaseRate ?? "0");
        if (!Number.isFinite(baseRate) || baseRate <= 0) {
            throw new BadRequestException("standardBaseRate must be greater than 0");
        }

        if (dto.alertAt > dto.capacity) {
            throw new BadRequestException("alertAt cannot be greater than capacity");
        }

        // CME rule
        if (dto.offersCmeCredits === true) {
            const info = String(dto.cmeCreditsInfo ?? "").trim();
            if (!info) {
                throw new BadRequestException("cmeCreditsInfo is required when offersCmeCredits = true");
            }
        }

        // facility must exist
        const facility = await this.facilitiesRepo.findOne({
            where: { id: dto.facilityId },
        });
        if (!facility) {
            throw new BadRequestException("Invalid facilityId");
        }
        if (!facility) throw new BadRequestException("Invalid facilityId");

        // group discount validation
        const groupDiscounts = dto.groupDiscounts ?? [];

        if (dto.groupDiscountEnabled === true) {
            if (groupDiscounts.length === 0) {
                throw new BadRequestException("groupDiscounts required when groupDiscountEnabled = true");
            }

            for (const g of groupDiscounts) {
                const rate = Number(g.groupRatePerPerson ?? "0");
                if (!Number.isFinite(rate) || rate <= 0) {
                    throw new BadRequestException("groupRatePerPerson must be greater than 0");
                }
                if (rate >= baseRate) {
                    throw new BadRequestException("groupRatePerPerson must be less than standardBaseRate");
                }
            }
        } else {
            if (groupDiscounts.length > 0) {
                throw new BadRequestException("groupDiscounts must be empty when groupDiscountEnabled = false");
            }
        }

        // days/segments validation + time parsing
        if (!dto.days?.length) throw new BadRequestException("At least one day is required");

        const normalizedDays = dto.days.map((d) => {
            if (!d.segments?.length) {
                throw new BadRequestException(`Day ${d.dayNumber} must have at least one segment`);
            }

            const segments = d.segments.map((s) => {
                const start = parse12hToTime(s.startTime);
                const end = parse12hToTime(s.endTime);
                if (start >= end) {
                    throw new BadRequestException(
                        `Invalid segment time (day ${d.dayNumber}, segment ${s.segmentNumber}): startTime must be before endTime`
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
                if (!s.courseTopic) throw new BadRequestException("courseTopic is required");
                if (nums.has(s.segmentNumber)) {
                    throw new BadRequestException(`Duplicate segmentNumber ${s.segmentNumber} in day ${d.dayNumber}`);
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
                throw new BadRequestException("One or more facultyIds are invalid");
            }
        }

        const payload: DeepPartial<Workshop> = {
            deliveryMode: dto.deliveryMode,
            title,
            shortBlurb: dto.shortBlurb?.trim() || undefined,
            coverImageUrl: dto.coverImageUrl?.trim() || undefined,
            learningObjectives: dto.learningObjectives ?? undefined,
            offersCmeCredits: dto.offersCmeCredits,
            cmeCreditsInfo: dto.offersCmeCredits ? String(dto.cmeCreditsInfo).trim() : undefined,

            facilityId: dto.facilityId,

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



    async list(query: ListWorkshopsQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        const skip = (page - 1) * limit;

        const qb = this.workshopsRepo.createQueryBuilder("w");

        // filters
        if (query.q?.trim()) {
            qb.andWhere("LOWER(w.title) LIKE :q", { q: `%${query.q.toLowerCase().trim()}%` });
        }

        if (query.facilityId) {
            qb.andWhere("w.facilityId = :facilityId", { facilityId: query.facilityId });
        }

        if (query.deliveryMode) {
            qb.andWhere("w.deliveryMode = :deliveryMode", { deliveryMode: query.deliveryMode });
        }

        if (query.offersCmeCredits) {
            qb.andWhere("w.offersCmeCredits = :offersCmeCredits", {
                offersCmeCredits: query.offersCmeCredits === "true",
            });
        }

        if (query.groupDiscountEnabled) {
            qb.andWhere("w.groupDiscountEnabled = :groupDiscountEnabled", {
                groupDiscountEnabled: query.groupDiscountEnabled === "true",
            });
        }

        // filter by faculty (workshop_faculty join table)
        if (query.facultyId) {
            qb.innerJoin("workshop_faculty", "wf", "wf.workshopId = w.id AND wf.facultyId = :facultyId", {
                facultyId: query.facultyId,
            });
        }

        // sorting
        const sortBy = query.sortBy ?? "createdAt";
        const sortOrder = (query.sortOrder ?? "desc").toUpperCase() as "ASC" | "DESC";
        qb.orderBy(`w.${sortBy}`, sortOrder);

        // pagination
        qb.skip(skip).take(limit);

        const [data, total] = await qb.getManyAndCount();

        return {
            message: "Workshops fetched successfully",
            meta: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1),
            },
            data,
        };
    }
}