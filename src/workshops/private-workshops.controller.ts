import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { WorkshopsService } from './workshops.service';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import {
  ListMyCoursesLoggedQueryDto,
  ListMyCoursesQueryDto,
} from './dto/list-my-courses.query.dto';
import type { Response } from 'express';

@Controller('workshops/private')
export class PrivateWorkshopsController {
  constructor(private readonly workshopsService: WorkshopsService) {}

  @Get('dashboard/summary')
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

  // @Get('tickets/:ticketId')
  // getPublicTicketDetails(@Param('ticketId') ticketId: string) {
  //   return this.workshopsService.getPublicTicketDetails(ticketId);
  // }

  // 2. Get QR Code Data URL
  @Get('tickets/:id/qr')
  getTicketQrCode(@Param('id') ticketId: string) {
    return this.workshopsService.getTicketQrCode(ticketId);
  }

  // 3. Download PDF Ticket
  @Get('tickets/:id/download')
  downloadTicketPdf(@Param('id') ticketId: string, @Res() res: Response) {
    // Note: We don't return anything directly here because the service pipes the PDF buffer to the response stream.
    this.workshopsService.generateTicketPdf(ticketId, res);
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
