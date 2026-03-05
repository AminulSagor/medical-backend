import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AddBroadcastAttachmentDto {
  @IsString()
  @MaxLength(300)
  fileKey: string;

  @IsString()
  @MaxLength(255)
  fileName: string;

  @IsString()
  @MaxLength(120)
  mimeType: string;

  @IsInt()
  @Min(1)
  fileSizeBytes: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
