import { IsString, MinLength } from 'class-validator';

export class SessionStatusParamsDto {
  @IsString()
  @MinLength(1)
  sessionId: string;
}
