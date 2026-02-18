import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { SecurityAdminGuard } from "./security-admin.guard";
import { SecurityJwtGuard } from "./security-jwt.guard";
import { SecurityWorkflowsService } from "./security-workflows.service";
import {
  AssignRoleDto,
  CreateRoleDto,
  SetAdminApprovalDto,
  SetUserActiveDto,
  SetUserRolesDto,
} from "./dto/workflows.dto";

@Controller("security/workflows")
@ApiTags("security-workflows")
export class SecurityWorkflowsController {
  constructor(private readonly workflowsService: SecurityWorkflowsService) {}

  @Post("users/:id/email-verified")
  @ApiOperation({ summary: "Mark user email as verified and notify admins" })
  async markEmailVerified(@Param("id") id: string) {
    return this.workflowsService.markEmailVerifiedAndNotifyAdmins(id);
  }

  @Patch("users/:id/admin-approval")
  @UseGuards(SecurityJwtGuard, SecurityAdminGuard)
  @ApiOperation({ summary: "Approve/unapprove user and notify on approval" })
  @ApiBearerAuth()
  @ApiBody({ type: SetAdminApprovalDto })
  async setAdminApproval(
    @Param("id") id: string,
    @Body() body: { approved?: boolean },
  ) {
    if (typeof body.approved !== "boolean") {
      throw new BadRequestException("approved is required");
    }
    return this.workflowsService.setAdminApprovalAndNotifyUser(
      id,
      body.approved,
    );
  }

  @Patch("users/:id/active")
  @UseGuards(SecurityJwtGuard, SecurityAdminGuard)
  @ApiOperation({ summary: "Activate/deactivate a user" })
  @ApiBearerAuth()
  @ApiBody({ type: SetUserActiveDto })
  async setUserActive(
    @Param("id") id: string,
    @Body() body: { active?: boolean },
  ) {
    if (typeof body.active !== "boolean") {
      throw new BadRequestException("active is required");
    }
    return this.workflowsService.setUserActive(id, body.active);
  }

  @Get("roles")
  @UseGuards(SecurityJwtGuard, SecurityAdminGuard)
  @ApiOperation({ summary: "List role catalog" })
  @ApiBearerAuth()
  async listRoles() {
    return { roles: await this.workflowsService.listRoles() };
  }

  @Post("roles")
  @UseGuards(SecurityJwtGuard, SecurityAdminGuard)
  @ApiOperation({ summary: "Create or update a role" })
  @ApiBearerAuth()
  @ApiBody({ type: CreateRoleDto })
  async createRole(
    @Body() body: { role?: string; description?: string | null },
  ) {
    if (!body.role || !body.role.trim()) {
      throw new BadRequestException("role is required");
    }
    return {
      roles: await this.workflowsService.createRole(
        body.role,
        body.description,
      ),
    };
  }

  @Delete("roles/:role")
  @UseGuards(SecurityJwtGuard, SecurityAdminGuard)
  @ApiOperation({ summary: "Remove a role" })
  @ApiBearerAuth()
  async removeRole(@Param("role") role: string) {
    return this.workflowsService.removeRole(role);
  }

  @Get("users/:userId/roles")
  @UseGuards(SecurityJwtGuard, SecurityAdminGuard)
  @ApiOperation({ summary: "Get assigned roles for a user" })
  @ApiParam({
    name: "userId",
    description: "User id from app_user.id",
    type: String,
  })
  @ApiBearerAuth()
  async getUserRoles(@Param("userId") userId: string) {
    return this.workflowsService.getUserRoles(userId);
  }

  @Put("users/:userId/roles")
  @UseGuards(SecurityJwtGuard, SecurityAdminGuard)
  @ApiOperation({ summary: "Replace user roles" })
  @ApiParam({
    name: "userId",
    description: "User id from app_user.id",
    type: String,
  })
  @ApiBearerAuth()
  @ApiBody({ type: SetUserRolesDto })
  async setUserRoles(
    @Param("userId") userId: string,
    @Body() body: { roles?: string[] },
  ) {
    if (!Array.isArray(body.roles)) {
      throw new BadRequestException("roles must be an array");
    }
    return this.workflowsService.setUserRoles(userId, body.roles);
  }

  @Post("users/:userId/roles")
  @UseGuards(SecurityJwtGuard, SecurityAdminGuard)
  @ApiOperation({ summary: "Assign one role to a user" })
  @ApiParam({
    name: "userId",
    description: "User id from app_user.id",
    type: String,
  })
  @ApiBearerAuth()
  @ApiBody({ type: AssignRoleDto })
  async assignUserRole(
    @Param("userId") userId: string,
    @Body() body: { role?: string },
  ) {
    if (!body.role || !body.role.trim()) {
      throw new BadRequestException("role is required");
    }
    return this.workflowsService.assignRoleToUser(userId, body.role);
  }

  @Delete("users/:userId/roles/:role")
  @UseGuards(SecurityJwtGuard, SecurityAdminGuard)
  @ApiOperation({ summary: "Remove one role from a user" })
  @ApiParam({
    name: "userId",
    description: "User id from app_user.id",
    type: String,
  })
  @ApiBearerAuth()
  async removeUserRole(
    @Param("userId") userId: string,
    @Param("role") role: string,
  ) {
    return this.workflowsService.removeRoleFromUser(userId, role);
  }
}
