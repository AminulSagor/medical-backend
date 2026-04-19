import { IsString, MaxLength, IsOptional } from 'class-validator';

export class BlogCoverImageDto {
  @IsString()
  @MaxLength(2000)
  imageUrl: string;

  @IsString()
  @MaxLength(100)
  imageType: string;
}
