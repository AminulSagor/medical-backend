import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

import { CourseAnnouncementsService } from './course-announcements.service';
import { ListCohortsQueryDto } from './dto/list-cohorts-query.dto';
import { CreateCourseAnnouncementDto } from './dto/create-course-announcement.dto';
import { UpdateCourseAnnouncementDto } from './dto/update-course-announcement.dto';
import { ListCourseRecipientsQueryDto } from './dto/list-recipients-query.dto';
import { SetCourseRecipientsDto } from './dto/set-recipients.dto';
import { AddCourseAnnouncementAttachmentDto } from './dto/add-course-announcement-attachment.dto';
import { ToggleRecipientDto } from './dto/toggle-recipient.dto';

@Controller('admin/newsletters/course-announcements')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class CourseAnnouncementsController {
  constructor(private readonly service: CourseAnnouncementsService) {}

  @Get('dashboard')
  getDashboard(): Promise<Record<string, unknown>> {
    return this.service.getDashboard();
  }

  @Get('cohorts')
  listCohorts(
    @Query() query: ListCohortsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.service.listCohorts(query);
  }

  @Post('cohorts/:workshopId/broadcasts')
  upsertDraft(
    @Req() req: AuthenticatedRequest,
    @Param('workshopId', new ParseUUIDPipe()) workshopId: string,
  ): Promise<Record<string, unknown>> {
    return this.service.upsertDraft(req.user.id, workshopId);
  }

  // @Post('broadcasts')
  // createDraft(
  //   @Req() req: AuthenticatedRequest,
  //   @Body() dto: CreateCourseAnnouncementDto,
  // ): Promise<Record<string, unknown>> {
  //   return this.service.createDraft(req.user.id, dto);
  // }

  @Get('broadcasts/:id')
  getDetail(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Record<string, unknown>> {
    return this.service.getDetail(id);
  }

  @Patch('broadcasts/:id')
  updateDraft(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCourseAnnouncementDto,
  ): Promise<Record<string, unknown>> {
    return this.service.updateDraft(req.user.id, id, dto);
  }

  @Get('broadcasts/:id/recipients')
  listRecipients(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListCourseRecipientsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.service.listRecipients(id, query);
  }

  @Post('broadcasts/:id/recipients')
  setRecipients(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetCourseRecipientsDto,
  ): Promise<Record<string, unknown>> {
    return this.service.setRecipients(req.user.id, id, dto);
  }

  @Post('broadcasts/:id/send')
  send(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Record<string, unknown>> {
    return this.service.send(req.user.id, id);
  }

  @Get('transmissions')
  listTransmissions(
    @Query() query: { page?: number; limit?: number; search?: string },
  ): Promise<Record<string, unknown>> {
    return this.service.listTransmissions(query);
  }

  @Patch('broadcasts/:id/recipients/:userId')
  toggleRecipient(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: ToggleRecipientDto,
  ): Promise<Record<string, unknown>> {
    return this.service.toggleRecipient(req.user.id, id, userId, dto);
  }

  @Post('broadcasts/:id/attachments')
  addAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddCourseAnnouncementAttachmentDto,
  ): Promise<Record<string, unknown>> {
    return this.service.addAttachment(req.user.id, id, dto);
  }

  @Delete('broadcasts/:id/attachments/:attachmentId')
  removeAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ): Promise<Record<string, unknown>> {
    return this.service.removeAttachment(req.user.id, id, attachmentId);
  }
}
