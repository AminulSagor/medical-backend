import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { UnsubscribeService } from './unsubscribe.service';
import { ListUnsubscribeRequestsQueryDto } from './dto/list-unsubscribe-requests-query.dto';
import { ProcessUnsubscribeRequestDto } from './dto/process-unsubscribe-request.dto';
import { PublicUnsubscribeQueryDto } from './dto/public-unsubscribe-query.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

@Controller()
export class UnsubscribeController {
  constructor(private readonly unsubscribeService: UnsubscribeService) {}

  @Get('admin/newsletters/general/unsubscribe-requests')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  listAdmin(
    @Query() query: ListUnsubscribeRequestsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.unsubscribeService.list(query);
  }

  @Post('admin/newsletters/general/unsubscribe-requests/:id/process')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  processAdmin(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ProcessUnsubscribeRequestDto,
  ): Promise<Record<string, unknown>> {
    return this.unsubscribeService.process(req.user.id, id, dto);
  }

  @Get('newsletters/general/unsubscribe')
  publicUnsubscribe(
    @Query() query: PublicUnsubscribeQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.unsubscribeService.publicUnsubscribe(query.token);
  }
}
