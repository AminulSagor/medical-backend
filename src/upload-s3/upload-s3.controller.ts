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
import { GetUploadUrlDto } from './dto/get-upload-url.dto';

@Controller('upload')
@UseGuards(AuthGuard('jwt'))
export class UploadS3Controller {
  constructor(private readonly uploadS3Service: UploadS3Service) {}

  /**
   * Generate S3 upload URL
   *
   * Flow:
   * 1. Client requests upload URL
   * 2. Backend generates:
   *    - signedUrl (temporary upload URL)
   *    - publicUrl (permanent file URL)
   *    - fileKey (S3 file reference)
   * 3. Client uploads file directly to S3 using PUT
   * 4. Store publicUrl + fileKey in database
   *
   * @example Request:
   * {
   *   "fileName": "profile.jpg",
   *   "contentType": "image/jpeg",
   *   "folder": "vendors"
   * }
   *
   * @example Response:
   * {
   *   "signedUrl": "...",
   *   "publicUrl": "...",
   *   "fileKey": "vendors/123.jpg"
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
        step1:
          'Use signedUrl to upload file to S3 using PUT request',
        step2:
          'Store publicUrl and fileKey in your database',
        step3:
          'Use publicUrl directly in frontend',
        note:
          'publicUrl never expires',
      },
    };
  }

  /**
   * Health check
   */
  @Get('health')
  async checkHealth() {
    try {
      const testKey =
        this.uploadS3Service.generateFileKey('test.txt');

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