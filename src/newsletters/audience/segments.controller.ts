import {
  Body,
  Controller,
  Delete,
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
import { MutationSuccessResponseDto } from '../../common/dto/mutation-success-response.dto';
import { SegmentsService } from './segments.service';
import { ListSegmentsQueryDto } from './dto/list-segments-query.dto';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import { AddSegmentMembersDto } from './dto/add-segment-members.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

@Controller('admin/newsletters/general/segments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Get()
  list(@Query() query: ListSegmentsQueryDto): Promise<Record<string, unknown>> {
    return this.segmentsService.list(query);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSegmentDto,
  ): Promise<Record<string, unknown>> {
    return this.segmentsService.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSegmentDto,
  ): Promise<Record<string, unknown>> {
    return this.segmentsService.update(req.user.id, id, dto);
  }

  @Post(':id/members')
  addMembers(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddSegmentMembersDto,
  ): Promise<Record<string, unknown>> {
    return this.segmentsService.addMembers(req.user.id, id, dto);
  }

  @Delete(':id/members/:subscriberId')
  removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('subscriberId', new ParseUUIDPipe()) subscriberId: string,
  ): Promise<MutationSuccessResponseDto> {
    return this.segmentsService.removeMember(req.user.id, id, subscriberId);
  }
}
