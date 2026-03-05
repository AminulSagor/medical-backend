import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { RolesGuard } from "./guards/roles.guard";
import { MailService } from "../common/services/mail.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { User } from "../users/entities/user.entity";
import { UsersModule } from "../users/users.module";
import { JwtStrategy } from "./jwt.strategy";
import { StringValue } from "ms";


@Module({
    imports: [
        UsersModule,
        TypeOrmModule.forFeature([User]),
        PassportModule.register({ defaultStrategy: "jwt" }),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get<string>("JWT_SECRET", "CHANGE_ME"),
                signOptions: {
                    expiresIn: config.get<StringValue>(
                        "JWT_EXPIRES_IN",
                        "7d" as StringValue
                    ),
                },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, MailService, JwtStrategy, RolesGuard],
    exports: [JwtModule, PassportModule, RolesGuard],
})
export class AuthModule { }