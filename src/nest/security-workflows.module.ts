import { DynamicModule, Module, Provider } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SecurityWorkflowNotifier } from "./contracts";
import { SECURITY_AUTH_OPTIONS } from "./security-auth.constants";
import { SecurityAuthModuleOptions } from "./security-auth.options";
import { SecurityAdminGuard } from "./security-admin.guard";
import { SecurityJwtGuard } from "./security-jwt.guard";
import { AppUserEntity } from "./entities/app-user.entity";
import { SecurityRoleEntity } from "./entities/security-role.entity";
import { SecurityUserRoleEntity } from "./entities/security-user-role.entity";
import { SecurityWorkflowsController } from "./security-workflows.controller";
import { SecurityWorkflowsService } from "./security-workflows.service";
import { SECURITY_WORKFLOW_NOTIFIER } from "./tokens";

const noopNotifier: SecurityWorkflowNotifier = {
  sendAdminsUserEmailVerified: async () => undefined,
  sendUserAccountApproved: async () => undefined,
};

@Module({})
export class SecurityWorkflowsModule {
  static forRoot(options?: {
    notifierProvider?: Provider<SecurityWorkflowNotifier>;
    auth?: SecurityAuthModuleOptions;
  }): DynamicModule {
    const notifierProvider: Provider = options?.notifierProvider ?? {
      provide: SECURITY_WORKFLOW_NOTIFIER,
      useValue: noopNotifier,
    };

    return {
      module: SecurityWorkflowsModule,
      imports: [
        TypeOrmModule.forFeature([
          AppUserEntity,
          SecurityRoleEntity,
          SecurityUserRoleEntity,
        ]),
      ],
      controllers: [SecurityWorkflowsController],
      providers: [
        {
          provide: SECURITY_AUTH_OPTIONS,
          useValue: options?.auth ?? { jwtSecret: "dev-secret" },
        },
        SecurityWorkflowsService,
        SecurityJwtGuard,
        SecurityAdminGuard,
        notifierProvider,
      ],
      exports: [SecurityWorkflowsService],
    };
  }
}
