import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { CadenceService } from './cadence.service';
import { UpdateCadenceDto } from './dto/update-cadence.dto';
import { GetAvailableCadenceSlotsQueryDto } from './dto/get-available-cadence-slots-query.dto';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

@Controller('admin/newsletters/general/cadence')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class CadenceController {
  constructor(private readonly cadenceService: CadenceService) {}

  @Get()
  getCurrent(): Promise<Record<string, unknown>> {
    return this.cadenceService.getCurrent();
  }

  @Patch()
  update(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateCadenceDto,
  ): Promise<Record<string, unknown>> {
    return this.cadenceService.update(req.user.id, dto);
  }

  @Get('available-slots')
  getAvailableSlots(
    @Query() query: GetAvailableCadenceSlotsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.cadenceService.getAvailableSlots(query);
  }
}
