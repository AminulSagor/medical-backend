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
import { MutationSuccessResponseDto } from '../../common/dto/mutation-success-response.dto';
import { BroadcastsService } from './broadcasts.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { UpdateBroadcastDto } from './dto/update-broadcast.dto';
import { ListBroadcastsQueryDto } from './dto/list-broadcasts-query.dto';
import { ScheduleBroadcastDto } from './dto/schedule-broadcast.dto';
import { CancelBroadcastDto } from './dto/cancel-broadcast.dto';
import { AddBroadcastAttachmentDto } from './dto/add-broadcast-attachment.dto';
import { SearchArticleSourcesQueryDto } from './dto/search-article-sources-query.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetWorkspaceMetricsQueryDto } from './dto/get-workspace-metrics-query.dto';
import { ListWorkspaceBroadcastsQueryDto } from './dto/list-workspace-broadcasts-query.dto';
import { ReorderQueueBroadcastsDto } from './dto/reorder-queue-broadcasts.dto';
import { GetCancelPreviewQueryDto } from './dto/get-cancel-preview-query.dto';
import { GetScheduleSuccessQueryDto } from './dto/get-schedule-success-query.dto';

@Controller('admin/newsletters/general/broadcasts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class BroadcastsController {
  constructor(private readonly broadcastsService: BroadcastsService) {}

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateBroadcastDto,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.createDraft(req.user.id, dto);
  }

  @Get()
  list(
    @Query() query: ListBroadcastsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.list(query);
  }

  @Get('article-sources/search')
  searchArticleSources(
    @Query() query: SearchArticleSourcesQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.searchArticleSources(query);
  }

  @Get(':id')
  getById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.getDetail(id);
  }

  @Get(':id/preview')
  preview(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.preview(id);
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBroadcastDto,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.update(req.user.id, id, dto);
  }

  @Post(':id/attachments')
  addAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddBroadcastAttachmentDto,
  ): Promise<MutationSuccessResponseDto> {
    return this.broadcastsService.addAttachment(req.user.id, id, dto);
  }

  @Delete(':id/attachments/:attachmentId')
  removeAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ): Promise<MutationSuccessResponseDto> {
    return this.broadcastsService.removeAttachment(
      req.user.id,
      id,
      attachmentId,
    );
  }

  // @Post(':id/schedule')
  // schedule(
  //   @Req() req: AuthenticatedRequest,
  //   @Param('id', new ParseUUIDPipe()) id: string,
  //   @Body() dto: ScheduleBroadcastDto,
  // ): Promise<Record<string, unknown>> {
  //   return this.broadcastsService.schedule(req.user.id, id, dto);
  // }

  // API to set and save the schedule configuration
  @Patch(':id/schedule-settings')
  setScheduleSettings(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ScheduleBroadcastDto,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.setScheduleSettings(req.user.id, id, dto);
  }

  // API to execute the final scheduling process
  @Post(':id/schedule')
  executeSchedule(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.executeSchedule(req.user.id, id);
  }

  @Post(':id/cancel')
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelBroadcastDto,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.cancel(req.user.id, id, dto);
  }

  @Get('workspace/metrics')
  getWorkspaceMetrics(
    @Query() query: GetWorkspaceMetricsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.getWorkspaceMetrics(query);
  }

  @Get('workspace/list')
  listWorkspace(
    @Query() query: ListWorkspaceBroadcastsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.listWorkspace(query);
  }

  @Post('queue/reorder')
  reorderQueue(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReorderQueueBroadcastsDto,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.reorderQueue(req.user.id, dto);
  }

  @Get(':id/ui-view')
  getUiView(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.getUiViewPayload(id);
  }

  @Get(':id/cancel-preview')
  getCancelPreview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: GetCancelPreviewQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.getCancelPreview(id, query);
  }

  @Get(':id/schedule-success')
  getScheduleSuccessPayload(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: GetScheduleSuccessQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.getScheduleSuccessPayload(id, query);
  }

  @Get(':id/report')
  getBroadcastReport(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Record<string, unknown>> {
    return this.broadcastsService.getBroadcastReport(id);
  }
}
