import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

import { AnalyticsService } from './analytics.service';
import {
  AnalyticsQueryDto,
  PopularCoursesQueryDto,
  RevenueChartQueryDto,
  TopProductsQueryDto,
} from './dto/analytics-query.dto';

@Controller('admin/analytics')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  getSummaryMetrics(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getSummaryMetrics(query);
  }

  // @Get('traffic-sources')
  // getTrafficSources(@Query() query: AnalyticsQueryDto) {
  //   return this.analyticsService.getTrafficSources(query);
  // }

  @Get('revenue-chart')
  getRevenueChart(@Query() query: RevenueChartQueryDto) {
    return this.analyticsService.getRevenueChart(query);
  }

  @Get('popular-courses')
  getPopularCourses(@Query() query: PopularCoursesQueryDto) {
    return this.analyticsService.getPopularCourses(query);
  }

  @Get('popular-courses/metrics')
  getPopularCoursesMetrics(@Query() query: PopularCoursesQueryDto) {
    return this.analyticsService.getPopularCoursesMetrics(query);
  }

  @Get('top-products')
  getTopProducts(@Query() query: TopProductsQueryDto) {
    return this.analyticsService.getTopProducts(query);
  }

  @Get('top-products/metrics')
  getTopProductsMetrics(@Query() query: TopProductsQueryDto) {
    return this.analyticsService.getTopProductsMetrics(query);
  }
}
