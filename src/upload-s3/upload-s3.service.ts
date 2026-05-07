import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadS3Service implements OnModuleInit {
  private readonly logger = new Logger(UploadS3Service.name);
  private s3Client: S3Client | null = null;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly expirySeconds: number;
  private isConfigured: boolean = false;

  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET') || '';

    this.region =
      this.configService.get<string>('AWS_S3_REGION') || 'ap-south-1';

    // Upload URL expiry (5 minutes)
    this.expirySeconds = 300;

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');

    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    if (accessKeyId && secretAccessKey && this.bucketName) {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });

      this.isConfigured = true;

      this.logger.log('S3 client initialized successfully');
    } else {
      this.logger.warn(
        'S3 credentials not configured - upload features unavailable',
      );
    }
  }

  onModuleInit() {
    this.logger.log(
      `S3Service initialized. Configured: ${this.isConfigured}, Bucket: ${this.bucketName || 'NOT SET'
      }`,
    );
  }

  private checkConfiguration() {
    if (!this.isConfigured || !this.s3Client) {
      throw new InternalServerErrorException(
        'S3 is not configured properly',
      );
    }
  }

  /**
   * Generate unique S3 file key
   */
  generateFileKey(fileName: string, folder?: string): string {
    const timestamp = Date.now();

    const uniqueId = uuidv4();

    const fileExtension = fileName.split('.').pop() || '';

    const baseKey = `${timestamp}-${uniqueId}.${fileExtension}`;

    return folder ? `${folder}/${baseKey}` : baseKey;
  }

  /**
   * Generate upload URL + permanent public URL
   */
  async generateUploadUrl(key: string, contentType: string) {
    this.checkConfiguration();

    try {
      // Upload command
      const putCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType
      });

      // Temporary upload URL
      const signedUrl = await getSignedUrl(this.s3Client!, putCommand, {
        expiresIn: this.expirySeconds,
      });

      // Permanent public URL
      const publicUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;

      return {
        signedUrl,
        fileKey: key,
        publicUrl,
      };
    } catch (error) {
      this.logger.error('S3 Upload URL Error:', error);

      throw new InternalServerErrorException(
        'Could not generate upload URL',
      );
    }
  }
}
