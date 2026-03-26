import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Facility } from "./entities/facility.entity";
import { CreateFacilityDto } from "./dto/create-facility.dto";
import { UpdateFacilityDto } from "./dto/update-facility.dto";


@Injectable()
export class FacilitiesService {
    constructor(@InjectRepository(Facility) private repo: Repository<Facility>) { }

    async create(dto: CreateFacilityDto) {
        const facilityName = dto.facilityName?.trim();
        if (!facilityName) throw new BadRequestException("Facility name is required");

        const roomNumber = dto.roomNumber?.trim();
        if (!roomNumber) throw new BadRequestException("Room number is required");

        const physicalAddress = dto.physicalAddress?.trim();
        if (!physicalAddress) throw new BadRequestException("Physical address is required");

        const exists = await this.repo.findOne({ where: { facilityName } });
        if (exists) throw new BadRequestException("Facility already exists");

        const facility = this.repo.create({
            facilityName,
            roomNumber,
            physicalAddress,
            capacityNotes: dto.capacityNotes?.trim() || undefined,
        });

        const saved = await this.repo.save(facility);
        return { message: "Facility created successfully", data: saved };
    }

    async update(id: string, dto: UpdateFacilityDto) {
        const facility = await this.repo.findOne({ where: { id } });
        if (!facility) throw new NotFoundException("Facility not found");

        if (dto.facilityName !== undefined) {
            const name = dto.facilityName.trim();
            if (!name) throw new BadRequestException("Facility name cannot be empty");

            const exists = await this.repo.findOne({ where: { facilityName: name } });
            if (exists && exists.id !== id) {
                throw new BadRequestException("Facility name already exists");
            }
            facility.facilityName = name;
        }

        if (dto.roomNumber !== undefined) {
            facility.roomNumber = dto.roomNumber.trim();
        }

        if (dto.physicalAddress !== undefined) {
            facility.physicalAddress = dto.physicalAddress.trim();
        }

        if (dto.capacityNotes !== undefined) {
            facility.capacityNotes = dto.capacityNotes?.trim() || undefined;
        }

        const saved = await this.repo.save(facility);
        return { message: "Facility updated successfully", data: saved };
    }

    async listActive() {
        const items = await this.repo.find({ order: { facilityName: "ASC" } });
        return { items };
    }
}