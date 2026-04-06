import { IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { UserStatus } from '../entities/user.entity';

export class ActivateDeactivateUserDto {
  @IsEnum(UserStatus)
  status: UserStatus;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;
}
