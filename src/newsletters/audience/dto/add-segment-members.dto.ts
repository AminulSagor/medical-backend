import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AddSegmentMembersDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1000)
  @IsUUID('4', { each: true })
  subscriberIds: string[];
}
