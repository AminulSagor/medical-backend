import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Facility } from "./entities/facility.entity";
import { CreateFacilityDto } from "./dto/create-facility.dto";


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
}