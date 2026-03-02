import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GetUploadUrlDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  fileName: string; // e.g., "document.pdf", "profile.jpg"

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  contentType: string; // e.g., "image/jpeg", "application/pdf"

  @IsString()
  @MaxLength(100)
  folder?: string; // Optional: e.g., "vendors", "offices", "documents"
}

export class RefreshReadUrlDto {
  @IsNotEmpty()
  @IsString()
  fileKey: string; // The S3 key of the file
}
