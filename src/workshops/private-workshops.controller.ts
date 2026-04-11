import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WorkshopsService } from './workshops.service';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import {
  ListMyCoursesLoggedQueryDto,
  ListMyCoursesQueryDto,
} from './dto/list-my-courses.query.dto';

@Controller('workshops/private')
export class PrivateWorkshopsController {
  constructor(private readonly workshopsService: WorkshopsService) {}

  @Get('my-courses/summary')
  @UseGuards(AuthGuard('jwt'))
  getMyCoursesSummary(@Req() req: AuthenticatedRequest) {
    return this.workshopsService.getMyCoursesSummary(req.user.id);
  }

  @Get('my-courses')
  @UseGuards(AuthGuard('jwt'))
  getMyCourses(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListMyCoursesLoggedQueryDto,
  ) {
    // Requires a logged-in user to fetch their own enrollments
    return this.workshopsService.getMyCoursesLogged(req.user.id, query);
  }

  @Get('tickets/:ticketId')
  getPublicTicketDetails(@Param('ticketId') ticketId: string) {
    return this.workshopsService.getPublicTicketDetails(ticketId);
  }

  @Get('my-courses/:courseId')
  @UseGuards(AuthGuard('jwt'))
  getMyCourseDetails(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
  ) {
    return this.workshopsService.getMyCourseDetails(req.user.id, courseId);
  }

  // 1. Get Refund Eligibility & Info
  @Get('my-courses/:courseId/refund-info')
  getRefundEstimation(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
  ) {
    return this.workshopsService.getRefundEstimation(req.user.id, courseId);
  }

  // 2. Submit Refund Request
  @Post('my-courses/:courseId/refund')
  submitRefundRequest(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
  ) {
    return this.workshopsService.submitRefundRequest(req.user.id, courseId);
  }

  // 3. Get Calendar Links
  @Get('my-courses/:courseId/calendar')
  getCalendarLinks(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
  ) {
    return this.workshopsService.getCalendarLinks(req.user.id, courseId);
  }

  // 4. Get Live Meeting Info
  @Get('my-courses/:courseId/meeting')
  getMeetingDetails(
    @Req() req: AuthenticatedRequest,
    @Param('courseId') courseId: string,
  ) {
    return this.workshopsService.getMeetingDetails(req.user.id, courseId);
  }
}
