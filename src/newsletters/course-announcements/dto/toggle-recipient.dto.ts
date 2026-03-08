import { IsBoolean } from 'class-validator';

export class ToggleRecipientDto {
  @IsBoolean()
  selected: boolean;
}
