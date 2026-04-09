import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { NotificationsService } from './notifications.service';
import {
  NotificationFilterDto,
  UpdatePreferencesDto,
} from './dto/notifications.dto';

@Controller('admin/notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class NotificationsController {
  constructor(private readonly notifService: NotificationsService) {}

  @Get('dropdown')
  getDropdownNotifications(@Req() req: AuthenticatedRequest) {
    return this.notifService.getDropdownNotifications(req.user.id);
  }

  @Get()
  getAllNotifications(
    @Req() req: AuthenticatedRequest,
    @Query() query: NotificationFilterDto,
  ) {
    return this.notifService.getAllNotifications(req.user.id, query);
  }

  @Patch('mark-all-read')
  markAllAsRead(@Req() req: AuthenticatedRequest) {
    return this.notifService.markAllAsRead(req.user.id);
  }

  @Get('preferences')
  getPreferences(@Req() req: AuthenticatedRequest) {
    return this.notifService.getPreferences(req.user.id, req.user.medicalEmail);
  }

  @Post('preferences')
  updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.notifService.updatePreferences(req.user.id, dto);
  }
}
