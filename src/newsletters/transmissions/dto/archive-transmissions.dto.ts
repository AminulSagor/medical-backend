import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ArchiveTransmissionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  broadcastIds: string[];
}
