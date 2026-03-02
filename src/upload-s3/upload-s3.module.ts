import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UploadS3Service } from './upload-s3.service';
import { UploadS3Controller } from './upload-s3.controller';

@Module({
  imports: [ConfigModule],
  controllers: [UploadS3Controller],
  providers: [UploadS3Service],
  exports: [UploadS3Service],
})
export class UploadS3Module {}
