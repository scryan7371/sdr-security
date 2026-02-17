import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ADMIN_ROLE } from "../api/contracts";

@Injectable()
export class SecurityAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: { roles?: string[] };
    }>();
    const roles = request.user?.roles ?? [];
    if (!roles.includes(ADMIN_ROLE)) {
      throw new ForbiddenException("Admin access required");
    }
    return true;
  }
}
