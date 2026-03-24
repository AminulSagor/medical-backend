import {
  IsInt,
  IsMimeType,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class AddCourseAnnouncementAttachmentDto {
  @IsString()
  @IsNotEmpty()
  fileKey: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsMimeType()
  mimeType: string;

  @IsInt()
  @Min(1)
  fileSizeBytes: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
