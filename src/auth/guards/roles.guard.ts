import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles =
            this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
                context.getHandler(),
                context.getClass(),
            ]) || [];

        if (requiredRoles.length === 0) return true;

        const req = context.switchToHttp().getRequest();
        const jwtUser = req.user;

        if (!jwtUser) throw new ForbiddenException("Unauthorized");

        const role = jwtUser.role;
        if (!role) throw new ForbiddenException("Unauthorized");

        if (!requiredRoles.includes(role)) {
            throw new ForbiddenException("Admin only");
        }

        return true;
    }
}