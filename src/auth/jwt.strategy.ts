import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";

type JwtPayload = {
    sub: string;
    role?: string;
    medicalEmail?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
    constructor(private readonly config: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: config.get<string>("JWT_SECRET", "CHANGE_ME"),
        });
    }

    async validate(payload: JwtPayload) {
        if (!payload?.sub) throw new UnauthorizedException("Invalid token");

        // req.user will be this object
        return {
            id: payload.sub,
            sub: payload.sub,
            role: payload.role,
            medicalEmail: payload.medicalEmail,
        };
    }
}