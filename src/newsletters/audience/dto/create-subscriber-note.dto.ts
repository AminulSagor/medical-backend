import { IsString, MaxLength } from 'class-validator';

export class CreateSubscriberNoteDto {
  @IsString()
  @MaxLength(2000)
  note: string;
}
