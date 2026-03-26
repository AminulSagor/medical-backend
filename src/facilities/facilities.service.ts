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
        const name = dto.name?.trim();
        if (!name) throw new BadRequestException("Facility name is required");

        const address = dto.address?.trim();
        if (!address) throw new BadRequestException("Facility address is required");

        const exists = await this.repo.findOne({ where: { name } });
        if (exists) throw new BadRequestException("Facility already exists");

        const facility = this.repo.create({ name, address });
        return await this.repo.save(facility);
    }

    async listActive() {
        // since there is no isActive anymore, this returns all
        const items = await this.repo.find({ order: { name: "ASC" } });
        return { items };
    }

    async findOne(id: string) {
        const facility = await this.repo.findOne({ where: { id } });
        if (!facility) throw new NotFoundException("Facility not found");
        return facility;
    }

    async update(id: string, dto: UpdateFacilityDto) {
        const facility = await this.findOne(id);

        if (dto.name !== undefined) {
            const name = dto.name.trim();
            if (!name) throw new BadRequestException("Facility name is required");
            const exists = await this.repo.findOne({ where: { name } });
            if (exists && exists.id !== id) throw new BadRequestException("Facility already exists");
            facility.name = name;
        }

        if (dto.address !== undefined) {
            const address = dto.address.trim();
            if (!address) throw new BadRequestException("Facility address is required");
            facility.address = address;
        }

        return await this.repo.save(facility);
    }

    async remove(id: string) {
        const facility = await this.findOne(id);
        await this.repo.remove(facility);
        return { message: "Facility deleted successfully" };
    }
}