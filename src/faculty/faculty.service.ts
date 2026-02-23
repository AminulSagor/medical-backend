import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Faculty } from "./entities/faculty.entity";
import { CreateFacultyDto } from "./dto/create-faculty.dto";

@Injectable()
export class FacultyService {
  constructor(
    @InjectRepository(Faculty)
    private facultyRepo: Repository<Faculty>
  ) { }


  async create(dto: CreateFacultyDto) {

    const emailExists = await this.facultyRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (emailExists) {
      throw new BadRequestException("Email already exists");
    }

    const npiExists = await this.facultyRepo.findOne({
      where: { npiNumber: dto.npiNumber },
    });

    if (npiExists) {
      throw new BadRequestException("NPI already exists");
    }

    const faculty = this.facultyRepo.create({
      ...dto,
      email: dto.email.toLowerCase(),
    });

    await this.facultyRepo.save(faculty);

    return {
      message: "Faculty added successfully",
      data: faculty,
    };
  }



  async list(params: { q?: string; page?: string; limit?: string }) {
    const q = String(params.q ?? "").trim();
    const page = Math.max(parseInt(String(params.page ?? "1"), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(params.limit ?? "10"), 10) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const qb = this.facultyRepo.createQueryBuilder("f");

    if (q) {
      const like = `%${q.toLowerCase()}%`;
      qb.where("LOWER(f.firstName) LIKE :like", { like })
        .orWhere("LOWER(f.lastName) LIKE :like", { like })
        .orWhere("LOWER(f.medicalDesignation) LIKE :like", { like })
        .orWhere("LOWER(f.institutionOrHospital) LIKE :like", { like });
    }

    qb.orderBy("f.createdAt", "DESC").skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      message: "Faculty fetched successfully",
      meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
      data,
    };
  }

}
