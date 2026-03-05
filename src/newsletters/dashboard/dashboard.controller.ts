import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import { GetRecentTransmissionsQueryDto } from './dto/get-recent-transmissions-query.dto';

@Controller('admin/newsletters/general')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard')
  getDashboard(): Promise<Record<string, unknown>> {
    return this.dashboardService.getDashboard();
  }

  @Get('transmissions/recent')
  getRecentTransmissions(
    @Query() query: GetRecentTransmissionsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.dashboardService.getRecentTransmissions(query);
  }
}
