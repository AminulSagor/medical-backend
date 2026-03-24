import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { SubscribersService } from './subscribers.service';
import { ListSubscribersQueryDto } from './dto/list-subscribers-query.dto';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UpdateSubscriberProfileDto } from './dto/update-subscriber-profile.dto';
import { CreateSubscriberNoteDto } from './dto/create-subscriber-note.dto';
import { SubscriberHistoryQueryDto } from './dto/subscriber-history-query.dto';
import { ListSubscribersAdvancedQueryDto } from './dto/list-subscribers-advanced-query.dto';

@Controller('admin/newsletters/general/subscribers')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @Get()
  list(
    @Query() query: ListSubscribersQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.subscribersService.list(query);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSubscriberDto,
  ): Promise<Record<string, unknown>> {
    return this.subscribersService.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSubscriberDto,
  ): Promise<Record<string, unknown>> {
    return this.subscribersService.update(req.user.id, id, dto);
  }

  @Get('advanced')
  listAdvanced(
    @Query() query: ListSubscribersAdvancedQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.subscribersService.listAdvanced(query);
  }

  @Get('filter-options')
  getFilterOptions(): Promise<Record<string, unknown>> {
    return this.subscribersService.getFilterOptions();
  }

  @Get(':id/profile')
  getProfile(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Record<string, unknown>> {
    return this.subscribersService.getProfile(id);
  }

  @Patch(':id/profile')
  updateProfile(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSubscriberProfileDto,
  ): Promise<Record<string, unknown>> {
    return this.subscribersService.updateProfile(req.user.id, id, dto);
  }

  @Post(':id/notes')
  addNote(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateSubscriberNoteDto,
  ): Promise<Record<string, unknown>> {
    return this.subscribersService.addNote(req.user.id, id, dto);
  }

  @Get(':id/newsletter-history')
  getNewsletterHistory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: SubscriberHistoryQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.subscribersService.getNewsletterHistory(id, query);
  }

  @Get(':id/order-history')
  getOrderHistory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: SubscriberHistoryQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.subscribersService.getOrderHistory(id, query);
  }
}
