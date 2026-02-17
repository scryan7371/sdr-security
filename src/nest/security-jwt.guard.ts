import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from "@nestjs/common";
import { verify } from "jsonwebtoken";
import { SECURITY_AUTH_OPTIONS } from "./security-auth.constants";
import { SecurityAuthModuleOptions } from "./security-auth.options";

type SecurityJwtPayload = {
  sub: string;
  email: string;
  roles: string[];
};

@Injectable()
export class SecurityJwtGuard implements CanActivate {
  constructor(
    @Inject(SECURITY_AUTH_OPTIONS)
    private readonly options: SecurityAuthModuleOptions,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | undefined>;
      user?: SecurityJwtPayload;
    }>();
    const header =
      request.headers?.authorization ?? request.headers?.Authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    const token = header.slice("Bearer ".length);
    try {
      const payload = verify(
        token,
        this.options.jwtSecret,
      ) as SecurityJwtPayload;
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
