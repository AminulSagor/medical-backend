import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateExpertReviewDto } from './dto/create-expert-review.dto';
import { UpdateExpertReviewDto } from './dto/update-expert-review.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/users/entities/user.entity';
import { ExpertReviewsService } from './expert-reviews.service';

@Controller('expert-reviews')
export class ExpertReviewsController {
  constructor(private readonly expertReviewsService: ExpertReviewsService) {}

  @Get()
  findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.expertReviewsService.findAllPublic(page ?? 1, limit ?? 10);
  }

  @Get(':id')
  getByReviewId(@Param('id') id: string) {
    return this.expertReviewsService.getByReviewId(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateExpertReviewDto) {
    return this.expertReviewsService.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateExpertReviewDto) {
    return this.expertReviewsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.expertReviewsService.remove(id);
  }
}
