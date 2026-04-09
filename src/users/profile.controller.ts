import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

import {
  CreateAdminNoteDto,
  InstructorHistoryQueryDto,
  PaginationQueryDto,
  PurchaseHistoryQueryDto,
} from './dto/user-profile.dto';
import { ProfilesService } from './profiles.service';

@Controller('admin/user-profiles')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class UserProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  // ── ADMIN NOTES ──
  @Post(':id/notes')
  addAdminNote(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: CreateAdminNoteDto,
  ) {
    return this.profilesService.addAdminNote(userId, req.user.id, dto);
  }

  @Get(':id/notes')
  getAdminNotes(@Param('id', ParseUUIDPipe) userId: string) {
    return this.profilesService.getAdminNotes(userId);
  }

  // ── INSTRUCTOR TABS ──
  @Get(':id/instructor/summary')
  getInstructorSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.profilesService.getInstructorSummary(id);
  }

  @Get(':id/instructor/active-courses')
  getInstructorActiveCourses(@Param('id', ParseUUIDPipe) id: string) {
    return this.profilesService.getInstructorActiveCourses(id);
  }

  @Get(':id/instructor/teaching-history')
  getInstructorTeachingHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: InstructorHistoryQueryDto,
  ) {
    return this.profilesService.getInstructorTeachingHistory(id, query);
  }

  // ── STUDENT TABS ──
  @Get(':id/student/summary')
  getStudentSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.profilesService.getStudentSummary(id);
  }

  @Get(':id/student/enrolled-courses')
  getStudentEnrolledCourses(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.profilesService.getStudentEnrolledCourses(id, query);
  }

  @Get(':id/student/purchase-history')
  getStudentPurchaseHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PurchaseHistoryQueryDto,
  ) {
    return this.profilesService.getStudentPurchaseHistory(id, query);
  }
}
