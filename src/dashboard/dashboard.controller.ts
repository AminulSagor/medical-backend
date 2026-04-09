import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@Controller('admin/dashboard')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  getOverviewAnalytics() {
    return this.dashboardService.getOverviewAnalytics();
  }
}
