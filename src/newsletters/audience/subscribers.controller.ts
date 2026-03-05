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
}
