import { DynamicModule, Module, Provider } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SecurityWorkflowNotifier } from "./contracts";
import { AppUserEntity } from "./entities/app-user.entity";
import { PasswordResetTokenEntity } from "./entities/password-reset-token.entity";
import { RefreshTokenEntity } from "./entities/refresh-token.entity";
import { SecurityRoleEntity } from "./entities/security-role.entity";
import { SecurityUserEntity } from "./entities/security-user.entity";
import { SecurityUserRoleEntity } from "./entities/security-user-role.entity";
import { SecurityAdminGuard } from "./security-admin.guard";
import { SecurityAuthController } from "./security-auth.controller";
import { SecurityAuthService } from "./security-auth.service";
import { SECURITY_AUTH_OPTIONS } from "./security-auth.constants";
import { SecurityAuthModuleOptions } from "./security-auth.options";
import { SecurityJwtGuard } from "./security-jwt.guard";
import { SecurityWorkflowsController } from "./security-workflows.controller";
import { SecurityWorkflowsService } from "./security-workflows.service";
import { SECURITY_WORKFLOW_NOTIFIER } from "./tokens";

const noopNotifier: SecurityWorkflowNotifier = {
  sendEmailVerification: async () => undefined,
  sendPasswordReset: async () => undefined,
  sendAdminsUserEmailVerified: async () => undefined,
  sendUserAccountApproved: async () => undefined,
};

@Module({})
export class SecurityAuthModule {
  static forRoot(options: {
    auth: SecurityAuthModuleOptions;
    notifierProvider?: Provider<SecurityWorkflowNotifier>;
  }): DynamicModule {
    const notifierProvider: Provider = options.notifierProvider ?? {
      provide: SECURITY_WORKFLOW_NOTIFIER,
      useValue: noopNotifier,
    };

    return {
      module: SecurityAuthModule,
      imports: [
        TypeOrmModule.forFeature([
          AppUserEntity,
          SecurityUserEntity,
          RefreshTokenEntity,
          PasswordResetTokenEntity,
          SecurityRoleEntity,
          SecurityUserRoleEntity,
        ]),
      ],
      controllers: [SecurityAuthController, SecurityWorkflowsController],
      providers: [
        {
          provide: SECURITY_AUTH_OPTIONS,
          useValue: options.auth,
        },
        SecurityAuthService,
        SecurityWorkflowsService,
        SecurityJwtGuard,
        SecurityAdminGuard,
        notifierProvider,
      ],
      exports: [SecurityAuthService, SecurityWorkflowsService],
    };
  }
}
