import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Faculty } from './entities/faculty.entity';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class FacultyService {
  constructor(
    @InjectRepository(Faculty)
    private facultyRepo: Repository<Faculty>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async create(dto: CreateFacultyDto) {
    const emailExists = await this.facultyRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (emailExists) {
      throw new BadRequestException('Email already exists');
    }

    const npiExists = await this.facultyRepo.findOne({
      where: { npiNumber: dto.npiNumber },
    });

    if (npiExists) {
      throw new BadRequestException('NPI already exists');
    }

    // ✅ Check if user already exists with this email
    const userEmail = dto.email.toLowerCase();
    let user = await this.userRepo.findOne({
      where: { medicalEmail: userEmail },
    });

    // ✅ Create user with INSTRUCTOR role if doesn't exist
    if (!user) {
      const tempPassword = Math.random().toString(36).slice(-12); // Temporary password
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      user = this.userRepo.create({
        fullLegalName: `${dto.firstName} ${dto.lastName}`,
        firstName: dto.firstName,
        lastName: dto.lastName,
        medicalEmail: userEmail,
        phoneNumber: dto.phoneNumber,
        professionalRole:
          dto.primaryClinicalRole || dto.medicalDesignation || 'Instructor',
        password: passwordHash,
        role: UserRole.INSTRUCTOR, // ✅ Faculty gets INSTRUCTOR role
        status: UserStatus.ACTIVE,
        isVerified: false,
        profilePhotoUrl: dto.imageUrl,
      });
      await this.userRepo.save(user);
    } else if (user.role !== UserRole.INSTRUCTOR) {
      // ✅ If user exists but is not instructor, update role to INSTRUCTOR
      user.role = UserRole.INSTRUCTOR;
      await this.userRepo.save(user);
    }

    const faculty = this.facultyRepo.create({
      ...dto,
      email: dto.email.toLowerCase(),
    });

    await this.facultyRepo.save(faculty);

    return {
      message: 'Faculty added successfully',
      data: {
        faculty,
        user: {
          id: user.id,
          email: user.medicalEmail,
          name: user.fullLegalName,
          role: user.role,
        },
      },
    };
  }

  async list(params: { q?: string; page?: string; limit?: string }) {
    const q = String(params.q ?? '').trim();
    const page = Math.max(parseInt(String(params.page ?? '1'), 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(String(params.limit ?? '10'), 10) || 10, 1),
      50,
    );
    const skip = (page - 1) * limit;

    const qb = this.facultyRepo.createQueryBuilder('f');

    if (q) {
      const like = `%${q.toLowerCase()}%`;
      qb.where('LOWER(f.firstName) LIKE :like', { like })
        .orWhere('LOWER(f.lastName) LIKE :like', { like })
        .orWhere('LOWER(f.medicalDesignation) LIKE :like', { like })
        .orWhere('LOWER(f.institutionOrHospital) LIKE :like', { like });
    }

    qb.orderBy('f.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      message: 'Faculty fetched successfully',
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
