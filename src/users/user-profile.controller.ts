import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { UsersService } from './users.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UserProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  getMyProfile(@Req() req: AuthenticatedRequest) {
    return this.usersService.getMyProfile(req.user.id);
  }

  @Patch('profile')
  updateMyProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateMyProfileDto,
  ) {
    return this.usersService.updateMyProfile(req.user.id, dto);
  }
}
