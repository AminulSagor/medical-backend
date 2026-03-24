import {
  Body,
  Controller,
  Post,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UploadS3Service } from './upload-s3.service';
import { GetUploadUrlDto, RefreshReadUrlDto } from './dto/get-upload-url.dto';

@Controller('upload')
@UseGuards(AuthGuard('jwt'))
export class UploadS3Controller {
  constructor(private readonly uploadS3Service: UploadS3Service) {}

  /**
   * Step 1: Get a signed URL for uploading a file
   * 
   * Flow:
   * 1. Client calls this endpoint with file metadata
   * 2. Backend generates a unique S3 key and returns:
   *    - signedUrl: Use this to PUT the file directly to S3 from client (expires in 5 min)
   *    - readUrl: Store this in your database (expires in 7 days)
   *    - fileKey: Store this in your database (permanent reference)
   * 3. Client uploads file directly to S3 using the signedUrl
   * 4. Client saves readUrl and fileKey in database
   * 
   * @example Request Body:
   * {
   *   "fileName": "profile-photo.jpg",
   *   "contentType": "image/jpeg",
   *   "folder": "vendors"  // optional
   * }
   * 
   * @example Response:
   * {
   *   "signedUrl": "https://bucket.s3.amazonaws.com/...",
   *   "readUrl": "https://bucket.s3.amazonaws.com/...",
   *   "fileKey": "vendors/1234567890-uuid.jpg"
   * }
   */
  @Post('get-upload-url')
  @HttpCode(HttpStatus.OK)
  async getUploadUrl(@Body() dto: GetUploadUrlDto) {
    const fileKey = this.uploadS3Service.generateFileKey(
      dto.fileName,
      dto.folder,
    );

    const result = await this.uploadS3Service.generateUploadUrl(
      fileKey,
      dto.contentType,
    );

    return {
      message: 'Upload URL generated successfully',
      ...result,
      instructions: {
        step1: 'Use signedUrl to PUT your file to S3 (expires in 5 minutes)',
        step2: 'Store readUrl and fileKey in your database',
        step3: 'When readUrl expires (7 days), call /upload/refresh-read-url',
      },
    };
  }

  /**
   * Refresh the read URL for an existing file
   * 
   * Use this when the stored readUrl has expired (after 7 days)
   * The fileKey remains permanent
   * 
   * @example Request Body:
   * {
   *   "fileKey": "vendors/1234567890-uuid.jpg"
   * }
   * 
   * @example Response:
   * {
   *   "readUrl": "https://bucket.s3.amazonaws.com/..."
   * }
   */
  @Post('refresh-read-url')
  @HttpCode(HttpStatus.OK)
  async refreshReadUrl(@Body() dto: RefreshReadUrlDto) {
    const readUrl = await this.uploadS3Service.generateReadUrl(dto.fileKey);

    return {
      message: 'Read URL refreshed successfully',
      readUrl,
      fileKey: dto.fileKey,
      expiresIn: '7 days',
    };
  }

  /**
   * Health check for S3 configuration
   */
  @Get('health')
  async checkHealth() {
    // This will throw an error if S3 is not configured
    try {
      const testKey = this.uploadS3Service.generateFileKey('test.txt');
      return {
        status: 'healthy',
        message: 'S3 upload service is properly configured',
        sampleFileKey: testKey,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
      };
    }
  }
}

