import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { FacultyModule } from './faculty/faculty.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { WorkshopsModule } from './workshops/workshops.module';
import { UploadS3Module } from './upload-s3/upload-s3.module';
import { BlogModule } from './blog/blog.module';
import { TagsModule } from './tags/tags.module';
import { BlogCategoriesModule } from './blog-categories/blog-categories.module';
import { NewslettersModule } from './newsletters/newsletters.module';
import { ProductTagsModule } from './product-tags/product-tags.module';
import { ReviewsModule } from './reviews/reviews.module';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: Number(config.get<string>('DB_PORT') || 5432),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: true, // dev only
      }),
    }),

    UsersModule,
    AuthModule,
    ProductsModule,
    CategoriesModule,
    FacultyModule,
    FacilitiesModule,
    WorkshopsModule,
    UploadS3Module,
    BlogModule,
    TagsModule,
    BlogCategoriesModule,
    NewslettersModule,
    ProductTagsModule,
    ReviewsModule,
    OrdersModule,
  ],
})
export class AppModule {}
