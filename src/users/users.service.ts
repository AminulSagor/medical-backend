import {
  BadRequestException,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import * as bcrypt from 'bcrypt';
import { MasterDirectoryQueryDto } from './dto/master-directory.query.dto';
import { UpdateMyProfileDto, ChangePasswordDto } from './dto/update-my-profile.dto';

function toInt(v: any, fallback: number) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function shiftPgParams(sql: string, shiftBy: number) {
  return sql.replace(/\$(\d+)/g, (_, d) => `$${Number(d) + shiftBy}`);
}

function pickSortOrder(sortOrder: any) {
  const v = String(sortOrder ?? 'desc').toLowerCase();
  return v === 'asc' ? 'ASC' : 'DESC';
}

function pickStatus(status: any) {
  const v = String(status ?? '').toLowerCase();
  if (v === 'active') return 'active';
  if (v === 'inactive') return 'inactive';
  return null;
}

async function adminGetUserProfile(userId:string){
  const user = await this.usersRepo.findOne
}

function splitFullLegalName(fullLegalName?: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  const clean = String(fullLegalName ?? '').trim();
  if (!clean) {
    return { firstName: null, lastName: null };
  }

  const tokens = clean.split(/\s+/);
  if (tokens.length === 1) {
    return { firstName: tokens[0], lastName: null };
  }

  return {
    firstName: tokens[0],
    lastName: tokens.slice(1).join(' '),
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(Faculty) private facultyRepo: Repository<Faculty>,
  ) {}

  private buildSelfProfilePayload(user: User) {
    const fallback = splitFullLegalName(user.fullLegalName);

    const firstName = user.firstName?.trim() || fallback.firstName || null;
    const lastName = user.lastName?.trim() || fallback.lastName || null;
    const title = user.professionalTitle?.trim() || user.credentials?.trim() || null;

    return {
      profilePicture: user.profilePhotoUrl ?? null,
      firstName,
      lastName,
      emailAddress: user.medicalEmail,
      phoneNumber: user.phoneNumber ?? null,
      title,
      role: user.professionalRole,
      institutionOrHospital: user.institutionOrHospital ?? null,
      npiNumber: user.npiNumber ?? null,
    };
  }

  async getMyProfile(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return {
      message: 'Profile fetched successfully',
      data: this.buildSelfProfilePayload(user),
    };
  }

  async updateMyProfile(userId: string, dto: UpdateMyProfileDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.profilePicture !== undefined && dto.profilePicture !== null) {
      user.profilePhotoUrl = dto.profilePicture.trim();
    }

    if (dto.firstName !== undefined && dto.firstName !== null) {
      user.firstName = dto.firstName.trim();
    }

    if (dto.lastName !== undefined && dto.lastName !== null) {
      user.lastName = dto.lastName.trim();
    }

    if (dto.phoneNumber !== undefined && dto.phoneNumber !== null) {
      user.phoneNumber = dto.phoneNumber.trim();
    }

    if (dto.title !== undefined && dto.title !== null) {
      const title = dto.title.trim();
      user.professionalTitle = title;
      user.credentials = title;
    }

    if (dto.role !== undefined && dto.role !== null) {
      user.professionalRole = dto.role.trim();
    }

    if (
      dto.institutionOrHospital !== undefined &&
      dto.institutionOrHospital !== null
    ) {
      user.institutionOrHospital = dto.institutionOrHospital.trim();
    }

    if (dto.npiNumber !== undefined && dto.npiNumber !== null) {
      user.npiNumber = dto.npiNumber.trim();
    }

    const parsedCurrent = splitFullLegalName(user.fullLegalName);
    const firstName = user.firstName?.trim() || parsedCurrent.firstName || '';
    const lastName = user.lastName?.trim() || parsedCurrent.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName.length > 0) {
      user.fullLegalName = fullName;
    }

    const updated = await this.usersRepo.save(user);

    return {
      message: 'Profile updated successfully',
      data: this.buildSelfProfilePayload(updated),
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) throw new BadRequestException('Current password is incorrect');

    const hash = await bcrypt.hash(newPassword, 10);
    user.password = hash;

    const updated = await this.usersRepo.save(user);

    return {
      message: 'Password changed successfully',
      data: {
        id: updated.id,
        medicalEmail: updated.medicalEmail,
      },
    };
  }

  async adminListUsers(query: any) {
    const tabCounts = await this.getTabCounts();
    const page = toInt(query.page, 1);
    const limit = Math.min(toInt(query.limit, 10), 100);
    const offset = (page - 1) * limit;

    const q = String(query.q ?? '')
      .trim()
      .toLowerCase();

    const joinDate = query.joinDate ? String(query.joinDate) : null;

    const status = pickStatus(query.status);
    const sortOrder = pickSortOrder(query.sortOrder);

    // placeholders (no assumptions)
    const courseId = query.courseId ? String(query.courseId) : null;
    const productId = query.productId ? String(query.productId) : null;

    const rawTab = String(query.tab ?? 'all').toLowerCase();

    // accept common aliases from frontend
    const tab =
      rawTab === 'student'
        ? 'students'
        : rawTab === 'students'
          ? 'students'
          : rawTab === 'faculty'
            ? 'faculty'
            : rawTab === 'all'
              ? 'all'
              : null;

    if (!tab) {
      throw new BadRequestException(
        `Invalid tab. Use tab=all | students | faculty`,
      );
    }

    if (query.sortOrder && tab !== 'students') {
      throw new BadRequestException(
        'sortOrder can be used only with tab=students',
      );
    }

    if (productId && tab !== 'students') {
      throw new BadRequestException(
        'productId can be used only with tab=students',
      );
    }

    // ✅ Courses filter exists in UI but schema not provided yet
    if (courseId) {
      throw new BadRequestException(
        'courseId filter is not implemented yet (share courses/enrollments schema).',
      );
    }

    // ✅ Students tab: products + spent need schema
    if (tab === 'students') {
      if (productId) {
        throw new BadRequestException(
          'productId filter is not implemented yet (share products/purchases schema).',
        );
      }
    }

    const usersQB = this.usersRepo
      .createQueryBuilder('u')
      .select([
        `'student' as "type"`,
        `u.id as "id"`,
        `u."fullLegalName" as "name"`,
        `u."medicalEmail" as "email"`,
        `u.role::text as "role"`,
        `COALESCE(u."professionalRole",'') as "credential"`,
        `CASE WHEN u."isVerified" = true THEN 'active' ELSE 'inactive' END as "status"`,
        `NULL::int as "coursesCount"`,
        `u."createdAt" as "joinedAt"`,
      ])
      .where(`u.role = :userRole`, { userRole: UserRole.USER });

    // status filter (students only)
    if (status === 'active') {
      usersQB.andWhere(`u."isVerified" = true`);
    }
    if (status === 'inactive') {
      usersQB.andWhere(`u."isVerified" = false`);
    }

    if (q) {
      usersQB.andWhere(
        `(LOWER(u."fullLegalName") LIKE :q OR LOWER(u."medicalEmail") LIKE :q OR LOWER(COALESCE(u."professionalRole", '')) LIKE :q)`,
        { q: `%${q}%` },
      );
    }

    // ✅ joinDate filter (students) - calendar date match (PostgreSQL)
    if (joinDate) {
      usersQB.andWhere(`u."createdAt"::date = :joinDate`, { joinDate });
    }

    const facultyQB = this.facultyRepo
      .createQueryBuilder('f')
      .select([
        `'faculty' as "type"`,
        `f.id as "id"`,
        `(f."firstName" || ' ' || f."lastName") as "name"`,
        `f.email as "email"`,
        `f."assignedRole"::text as "role"`,
        `TRIM(CONCAT(COALESCE(f."primaryClinicalRole", ''), ' ', COALESCE(f."medicalDesignation", ''))) as "credential"`,
        `'active' as "status"`,
        `NULL::int as "coursesCount"`,
        `f."createdAt" as "joinedAt"`,
      ]);

    // faculty has no inactive state; if client asks inactive, return none
    if (status === 'inactive') {
      facultyQB.andWhere('1=0');
    }

    if (q) {
      facultyQB.andWhere(
        `(
          LOWER(f."firstName") LIKE :fq OR
          LOWER(f."lastName") LIKE :fq OR
          LOWER(f.email) LIKE :fq OR
          LOWER(COALESCE(f."primaryClinicalRole", '')) LIKE :fq OR
          LOWER(COALESCE(f."medicalDesignation", '')) LIKE :fq
        )`,
        { fq: `%${q}%` },
      );
    }

    if (tab === 'students') {
      const [sql, params] = usersQB.getQueryAndParameters();
      const totalRes = await this.usersRepo.query(
        `SELECT COUNT(*)::int as "total" FROM (${sql}) t`,
        params,
      );
      const total = totalRes?.[0]?.total ?? 0;
      const totalPages = Math.ceil(total / limit) || 1;

      const rows = await this.usersRepo.query(
        `SELECT * FROM (${sql}) t ORDER BY "joinedAt" ${sortOrder} LIMIT ${limit} OFFSET ${offset}`,
        params,
      );

      return {
        message: 'Users fetched successfully',
        meta: {
          page,
          limit,
          total,
          totalPages,
        },
        tabSelected: tab,
        tabsCount: tabCounts,
        data: rows,
      };
    }

    if (tab === 'faculty') {
      const [sql, params] = facultyQB.getQueryAndParameters();
      const totalRes = await this.usersRepo.query(
        `SELECT COUNT(*)::int as "total" FROM (${sql}) t`,
        params,
      );
      const total = totalRes?.[0]?.total ?? 0;
      const totalPages = Math.ceil(total / limit) || 1;

      const rows = await this.usersRepo.query(
        `SELECT * FROM (${sql}) t ORDER BY "joinedAt" DESC LIMIT ${limit} OFFSET ${offset}`,
        params,
      );

      return {
        message: 'Users fetched successfully',
        meta: {
          page,
          limit,
          total,
          totalPages,
        },
        tabSelected: tab,
        tabsCount: tabCounts,
        data: rows,
      };
    }

    const [uSql, uParams] = usersQB.getQueryAndParameters();
    const [fSqlRaw, fParams] = facultyQB.getQueryAndParameters();

    const fSql = shiftPgParams(fSqlRaw, uParams.length);
    const unionSql = `(${uSql}) UNION ALL (${fSql})`;
    const unionParams = [...uParams, ...fParams];

    const totalRes = await this.usersRepo.query(
      `SELECT COUNT(*)::int as "total" FROM (${unionSql}) t`,
      unionParams,
    );
    const total = totalRes?.[0]?.total ?? 0;
    const totalPages = Math.ceil(total / limit) || 1;

    const rows = await this.usersRepo.query(
      `SELECT * FROM (${unionSql}) t ORDER BY "joinedAt" DESC LIMIT ${limit} OFFSET ${offset}`,
      unionParams,
    );

    return {
      message: 'Users fetched successfully',
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      tabSelected: tab,
      tabsCount: tabCounts,
      data: rows,
    };
  }

  private async getTabCounts() {
    const students = await this.usersRepo.count({
      where: { role: UserRole.USER },
    });

    const faculty = await this.facultyRepo.count();

    return {
      all: students + faculty,
      students,
      faculty,
    };
  }

  async updateAdminEmail(adminId: string, newEmail: string) {
    const user = await this.usersRepo.findOne({ where: { id: adminId } });
    if (!user) throw new NotFoundException('Admin not found');

    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admin can update profile settings');
    }

    user.medicalEmail = newEmail.toLowerCase();
    return this.usersRepo.save(user);
  }

  async changeAdminPassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.usersRepo.findOne({ where: { id: adminId } });
    if (!user) throw new NotFoundException('Admin not found');

    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admin can update profile settings');
    }

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) throw new BadRequestException('Current password incorrect');

    const hash = await bcrypt.hash(newPassword, 10);
    user.password = hash;

    return this.usersRepo.save(user);
  }

  // ✅ UPDATE USER ROLE (Admin only)
  async updateUserRole(userId: string, newRole: UserRole) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    user.role = newRole;
    const updated = await this.usersRepo.save(user);

    return {
      message: 'User role updated successfully',
      data: {
        id: updated.id,
        fullLegalName: updated.fullLegalName,
        medicalEmail: updated.medicalEmail,
        role: updated.role,
        status: updated.status,
      },
    };
  }

  // ✅ GET SINGLE USER PROFILE (Admin only)
  async adminGetUserProfile(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return {
      message: 'User profile fetched successfully',
      data: {
        id: user.id,
        fullName: user.fullLegalName,
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        email: user.medicalEmail,
        phoneNumber: user.phoneNumber || null,
        profilePhoto: user.profilePhotoUrl || null,
        role: user.role,
        professionalRole: user.professionalRole,
        professionalTitle: user.professionalTitle || null,
        credentials: user.credentials || null,
        institutionOrHospital: user.institutionOrHospital || null,
        npiNumber: user.npiNumber || null,
        status: user.status,
        isVerified: user.isVerified,
        coursesCount: user.coursesCount,
        joinedDate: user.createdAt,
        lastActive: user.lastActiveAt || null,
        updatedAt: user.updatedAt,
      },
    };
  }

  // ✅ MASTER USER DIRECTORY
  async getMasterDirectory(query: MasterDirectoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // Calculate statistics
    const stats = await this.calculateDirectoryStatistics();

    // Build query for user table
    const qb = this.usersRepo.createQueryBuilder('user');

    // Search filter
    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(user.fullLegalName) LIKE :s OR LOWER(user.medicalEmail) LIKE :s)',
        { s },
      );
    }

    // Role filter
    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }

    // Status filter
    if (query.status) {
      qb.andWhere('user.status = :status', { status: query.status });
    }

    // Sorting
    switch (query.sortBy) {
      case 'name':
        qb.orderBy(
          'user.fullLegalName',
          query.sortOrder === 'asc' ? 'ASC' : 'DESC',
        );
        break;
      case 'email':
        qb.orderBy(
          'user.medicalEmail',
          query.sortOrder === 'asc' ? 'ASC' : 'DESC',
        );
        break;
      case 'courses':
        qb.orderBy(
          'user.coursesCount',
          query.sortOrder === 'asc' ? 'ASC' : 'DESC',
        );
        break;
      case 'joinedDate':
      default:
        qb.orderBy(
          'user.createdAt',
          query.sortOrder === 'asc' ? 'ASC' : 'DESC',
        );
        break;
    }

    const [users, total] = await qb.skip(skip).take(limit).getManyAndCount();

    // Transform users to table format
    const tableData = users.map((user) => ({
      id: user.id,
      userIdentity: {
        name: user.fullLegalName,
        email: user.medicalEmail,
        profilePhoto: user.profilePhotoUrl,
      },
      role: user.role,
      credential: user.credentials || user.professionalRole,
      status: user.status,
      courses: user.coursesCount,
      joinedDate: user.createdAt,
      lastActive: user.lastActiveAt,
    }));

    return {
      statistics: stats,
      table: {
        data: tableData,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  private async calculateDirectoryStatistics() {
    // Total community count
    const totalCommunity = await this.usersRepo.count();

    // Active students count
    const activeStudents = await this.usersRepo.count({
      where: {
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
      },
    });

    // Growth pulse (users joined in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentUsers = await this.usersRepo
      .createQueryBuilder('user')
      .where('user.createdAt >= :thirtyDaysAgo', { thirtyDaysAgo })
      .getCount();

    const previousUsers = await this.usersRepo
      .createQueryBuilder('user')
      .where('user.createdAt < :thirtyDaysAgo', { thirtyDaysAgo })
      .getCount();

    const growthPulse =
      previousUsers > 0
        ? ((recentUsers / previousUsers) * 100).toFixed(1) + '%'
        : '0%';

    // Engagement rate (users active in last 7 days / total users)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const activeUsersLastWeek = await this.usersRepo
      .createQueryBuilder('user')
      .where('user.lastActiveAt >= :sevenDaysAgo', { sevenDaysAgo })
      .getCount();

    const engagementRate =
      totalCommunity > 0
        ? ((activeUsersLastWeek / totalCommunity) * 100).toFixed(1) + '%'
        : '0%';

    // Role distribution
    const roleCounts = await this.usersRepo
      .createQueryBuilder('user')
      .select('user.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('user.role')
      .getRawMany();

    const roleDistribution = roleCounts.reduce(
      (acc, item) => {
        acc[item.role] = parseInt(item.count);
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalCommunity,
      activeStudents,
      growthPulse,
      engagementRate,
      roleDistribution,
    };
  }
}
