import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateWorkshopDto } from './dto/create-workshop.dto';
import { UpdateWorkshopDto } from './dto/update-workshop.dto';
import { ListWorkshopsQueryDto } from './dto/list-workshops.query.dto';
import { WorkshopsService } from './workshops.service';
import { ListWorkshopEnrolleesQueryDto } from './dto/list-workshop-enrollees.query.dto';
import { WorkshopStatsQueryDto } from './dto/workshop-stats-query.dto';
import { ConfirmWorkshopRefundDto } from './dto/confirm-workshop-refund.dto';

@Controller('admin/workshops')
export class WorkshopsController {
  constructor(private readonly service: WorkshopsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  async create(@Body() dto: CreateWorkshopDto) {
    // If ID is provided, update existing workshop (upsert)
    if (dto.id) {
      return this.service.update(dto.id, dto);
    }
    // Otherwise create new workshop
    return this.service.create(dto);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateWorkshopDto) {
    return this.service.update(id, dto);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  findOne(@Param('id') id: string) {
    return this.service.getWorkshopById(id);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  list(@Query() query: ListWorkshopsQueryDto) {
    return this.service.list(query);
  }

  @Get(':workshopId/enrollees')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  getWorkshopEnrollees(
    @Param('workshopId') workshopId: string,
    @Query() query: ListWorkshopEnrolleesQueryDto,
  ) {
    return this.service.getWorkshopEnrollees(workshopId, query);
  }

  @Get(':workshopId/enrollees/:reservationId/refund-preview')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  getRefundPreview(
    @Param('workshopId') workshopId: string,
    @Param('reservationId') reservationId: string,
  ) {
    return this.service.getRefundPreview(workshopId, reservationId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':workshopId/refunds/confirm')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  confirmRefund(
    @Req() req: any,
    @Param('workshopId') workshopId: string,
    @Body() dto: ConfirmWorkshopRefundDto,
  ) {
    const adminId = req.user.id;
    return this.service.confirmRefund(workshopId, adminId, dto);
  }

  @Get('stats')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  getWorkshopStats(@Query() query: WorkshopStatsQueryDto) {
    return this.service.getWorkshopStats(query);
  }
}
