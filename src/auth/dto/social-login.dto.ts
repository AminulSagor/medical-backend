import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleSocialLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

export class FacebookSocialLoginDto {
  @IsString()
  @IsNotEmpty()
  accessToken: string;
}
