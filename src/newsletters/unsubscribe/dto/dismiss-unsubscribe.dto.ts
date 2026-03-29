import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DismissUnsubscribeDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}
