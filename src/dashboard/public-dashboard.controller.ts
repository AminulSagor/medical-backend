import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { PublicNavbarSearchQueryDto } from './dto/public-navbar-search-query.dto';

@Controller('dashboard')
export class PublicDashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('home/search')
  searchNavbar(@Query() query: PublicNavbarSearchQueryDto) {
    return this.dashboardService.searchNavbar(query);
  }

  @Get('home/overview-stats')
  getHomepageOverviewStats() {
    return this.dashboardService.getHomepageOverviewStats();
  }
}
