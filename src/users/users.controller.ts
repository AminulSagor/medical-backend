import {
  Controller,
  Get,
  Query,
  Patch,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from './users.service';
import {
  UpdateAdminEmailDto,
  ChangeAdminPasswordDto,
} from './dto/admin-profile-settings.dto';
import { MasterDirectoryQueryDto } from './dto/master-directory.query.dto';

@Controller('admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  list(@Query() query: any) {
    return this.usersService.adminListUsers(query);
  }

  // ✅ MASTER USER DIRECTORY
  @Get('directory/master')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  getMasterDirectory(@Query() query: MasterDirectoryQueryDto) {
    return this.usersService.getMasterDirectory(query);
  }

  // ✅ ADMIN PROFILE SETTINGS
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Patch('adminProfile/settings/email')
  updateAdminEmail(@Body() dto: UpdateAdminEmailDto, @Req() req: Request) {
    console.log('REQ.USER:', (req as any).user); // 👈 ADD HERE

    return this.usersService.updateAdminEmail(
      (req as any).user.sub,
      dto.newEmail,
    );
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Patch('adminProfile/settings/password')
  changeAdminPassword(
    @Body() dto: ChangeAdminPasswordDto,
    @Req() req: Request,
  ) {
    console.log('REQ.USER:', (req as any).user); // 👈 ADD HERE

    return this.usersService.changeAdminPassword(
      (req as any).user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
