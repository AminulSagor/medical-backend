import { IsString, MaxLength } from 'class-validator';

export class PublicUnsubscribeQueryDto {
  @IsString()
  @MaxLength(500)
  token: string;
}
