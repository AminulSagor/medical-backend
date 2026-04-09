import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

import { BlogDistributionService } from './blog-distribution.service';
import {
  DistributeBlastDto,
  DistributeCohortsDto,
  DistributeNewsletterDto,
} from './dto/blog-distribution.dto';

@Controller('admin/blog/:id/distribute')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class BlogDistributionController {
  constructor(private readonly distributionService: BlogDistributionService) {}

  // ── Pre-flight Info for Modals ──
  @Get('options')
  getDistributionOptions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    return this.distributionService.getDistributionOptions(id);
  }

  // ── Option 1: Immediate Email Blast ──
  @Post('blast')
  distributeViaBlast(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DistributeBlastDto,
  ): Promise<Record<string, unknown>> {
    return this.distributionService.distributeViaBlast(req.user.id, id, dto);
  }

  // ── Option 2: Add to Weekly/Monthly Newsletter Queue ──
  @Post('newsletter')
  distributeViaNewsletterQueue(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DistributeNewsletterDto,
  ): Promise<Record<string, unknown>> {
    return this.distributionService.distributeViaNewsletterQueue(
      req.user.id,
      id,
      dto,
    );
  }

  // ── Option 3: Target Course Cohorts ──
  @Post('cohorts')
  distributeToCohorts(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DistributeCohortsDto,
  ): Promise<Record<string, unknown>> {
    return this.distributionService.distributeToCohorts(req.user.id, id, dto);
  }
}
