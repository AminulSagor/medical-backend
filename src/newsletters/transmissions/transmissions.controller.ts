import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { TransmissionsService } from './transmissions.service';
import { ListTransmissionsQueryDto } from './dto/list-transmissions-query.dto';
import { ArchiveTransmissionsDto } from './dto/archive-transmissions.dto';
import { ListTransmissionRecipientsQueryDto } from './dto/list-transmission-recipients-query.dto';

@Controller('admin/newsletters/transmissions')
export class TransmissionsController {
  constructor(private readonly transmissionsService: TransmissionsService) {}

  @Get()
  list(
    @Query() query: ListTransmissionsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.transmissionsService.list(query);
  }

  @Post('archive')
  archive(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ArchiveTransmissionsDto,
  ): Promise<Record<string, unknown>> {
    return this.transmissionsService.archive(req.user.id, dto);
  }

  @Get(':broadcastId/report')
  getReport(
    @Param('broadcastId') broadcastId: string,
  ): Promise<Record<string, unknown>> {
    return this.transmissionsService.getReport(broadcastId);
  }

  @Get(':broadcastId/recipients')
  listRecipients(
    @Param('broadcastId') broadcastId: string,
    @Query() query: ListTransmissionRecipientsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.transmissionsService.listRecipients(broadcastId, query);
  }

  @Get(':broadcastId/sent-content')
  getSentContent(
    @Param('broadcastId') broadcastId: string,
  ): Promise<Record<string, unknown>> {
    return this.transmissionsService.getSentContent(broadcastId);
  }
}
