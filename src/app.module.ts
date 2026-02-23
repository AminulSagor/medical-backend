import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { ProductsModule } from "./products/products.module";
import { CategoriesModule } from "./categories/categories.module";
import { FacultyModule } from "./faculty/faculty.module";
import { FacilitiesModule } from "./facilities/facilities.module";
import { WorkshopsModule } from "./workshops/workshops.module";


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get<string>("DB_HOST"),
        port: Number(config.get<string>("DB_PORT") || 5432),
        username: config.get<string>("DB_USER"),
        password: config.get<string>("DB_PASSWORD"),
        database: config.get<string>("DB_NAME"),
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
  ],
})
export class AppModule { }



