// import {
//   Body,
//   Controller,
//   Get,
//   Param,
//   ParseUUIDPipe,
//   Post,
//   Query,
//   Req,
//   UseGuards,
// } from '@nestjs/common';
// import { AuthGuard } from '@nestjs/passport';
// import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
// import { UnsubscribeService } from './unsubscribe.service';
// import { ListUnsubscribeRequestsQueryDto } from './dto/list-unsubscribe-requests-query.dto';
// import { ProcessUnsubscribeRequestDto } from './dto/process-unsubscribe-request.dto';
// import { PublicUnsubscribeQueryDto } from './dto/public-unsubscribe-query.dto';
// import { RolesGuard } from 'src/auth/guards/roles.guard';
// import { Roles } from 'src/auth/decorators/roles.decorator';

// @Controller()
// export class UnsubscribeController {
//   constructor(private readonly unsubscribeService: UnsubscribeService) {}

//   @Get('admin/newsletters/general/unsubscribe-requests')
//   @UseGuards(AuthGuard('jwt'), RolesGuard)
//   @Roles('admin')
//   listAdmin(
//     @Query() query: ListUnsubscribeRequestsQueryDto,
//   ): Promise<Record<string, unknown>> {
//     return this.unsubscribeService.list(query);
//   }

//   @Post('admin/newsletters/general/unsubscribe-requests/:id/process')
//   @UseGuards(AuthGuard('jwt'), RolesGuard)
//   @Roles('admin')
//   processAdmin(
//     @Req() req: AuthenticatedRequest,
//     @Param('id', new ParseUUIDPipe()) id: string,
//     @Body() dto: ProcessUnsubscribeRequestDto,
//   ): Promise<Record<string, unknown>> {
//     return this.unsubscribeService.process(req.user.id, id, dto);
//   }

//   @Get('newsletters/general/unsubscribe')
//   publicUnsubscribe(
//     @Query() query: PublicUnsubscribeQueryDto,
//   ): Promise<Record<string, unknown>> {
//     return this.unsubscribeService.publicUnsubscribe(query.token);
//   }
// }

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { UnsubscribeService } from './unsubscribe.service';
import { ListUnsubscribeRequestsQueryDto } from './dto/list-unsubscribe-requests-query.dto';
import { ConfirmUnsubscribeDto } from './dto/confirm-unsubscribe.dto';
import { DismissUnsubscribeDto } from './dto/dismiss-unsubscribe.dto';
import { BulkProcessUnsubscribeDto } from './dto/bulk-process-unsubscribe.dto';
import { PublicUnsubscribeQueryDto } from './dto/public-unsubscribe-query.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

@Controller('unsubscribe')
export class UnsubscribeController {
  constructor(private readonly unsubscribeService: UnsubscribeService) {}

  @Get('requests')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  list(
    @Query() query: ListUnsubscribeRequestsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.unsubscribeService.list(query);
  }

  @Get('requests/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  getDetail(@Param('id') id: string): Promise<Record<string, unknown>> {
    return this.unsubscribeService.getDetail(id);
  }

  @Post('requests/:id/confirm')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  confirm(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ConfirmUnsubscribeDto,
  ): Promise<Record<string, unknown>> {
    return this.unsubscribeService.confirm(req.user.id, id, dto);
  }

  @Post('requests/:id/dismiss')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  dismiss(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: DismissUnsubscribeDto,
  ): Promise<Record<string, unknown>> {
    return this.unsubscribeService.dismiss(req.user.id, id, dto);
  }

  @Post('requests/bulk-process')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  bulkProcess(
    @Req() req: AuthenticatedRequest,
    @Body() dto: BulkProcessUnsubscribeDto,
  ): Promise<Record<string, unknown>> {
    return this.unsubscribeService.bulkProcess(req.user.id, dto);
  }

  @Get('export')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  exportList(): Promise<Record<string, unknown>> {
    return this.unsubscribeService.exportUnsubscribed();
  }

  @Post('sync-blocklist')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  syncBlocklist(
    @Req() req: AuthenticatedRequest,
  ): Promise<Record<string, unknown>> {
    return this.unsubscribeService.syncBlocklist(req.user.id);
  }

  @Get('general/unsubscribe')
  publicUnsubscribe(
    @Query() query: PublicUnsubscribeQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.unsubscribeService.publicUnsubscribe(query.token);
  }
}
