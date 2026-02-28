import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { SecurityJwtGuard } from "./security-jwt.guard";
import { SecurityAuthService } from "./security-auth.service";
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
} from "./dto/auth.dto";

type AuthedRequest = {
  user: { sub: string };
};

@Controller("security/auth")
@ApiTags("security-auth")
export class SecurityAuthController {
  constructor(private readonly authService: SecurityAuthService) {}

  @Post("register")
  @ApiOperation({ summary: "Register a new user" })
  @ApiBody({ type: RegisterDto })
  async register(
    @Body()
    body: {
      email?: string;
      password?: string;
    },
  ) {
    if (!body.email || !body.password) {
      throw new BadRequestException("Email and password are required");
    }
    return this.authService.register({
      email: body.email,
      password: body.password,
    });
  }

  @Post("login")
  @ApiOperation({ summary: "Login with email/password" })
  @ApiBody({ type: LoginDto })
  async login(@Body() body: { email?: string; password?: string }) {
    if (!body.email || !body.password) {
      throw new BadRequestException("Email and password are required");
    }
    return this.authService.login({
      email: body.email,
      password: body.password,
    });
  }

  @Post("refresh")
  @ApiOperation({ summary: "Refresh access token" })
  @ApiBody({ type: RefreshDto })
  async refresh(@Body() body: { refreshToken?: string }) {
    if (!body.refreshToken) {
      throw new BadRequestException("Refresh token is required");
    }
    return this.authService.refresh(body.refreshToken);
  }

  @UseGuards(SecurityJwtGuard)
  @Post("logout")
  @ApiOperation({ summary: "Logout user" })
  @ApiBearerAuth()
  @ApiBody({ type: LogoutDto })
  async logout(@Body() body: { refreshToken?: string }) {
    return this.authService.logout(body.refreshToken);
  }

  @UseGuards(SecurityJwtGuard)
  @Post("change-password")
  @ApiOperation({ summary: "Change password for authenticated user" })
  @ApiBearerAuth()
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(
    @Req() request: AuthedRequest,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException(
        "Current password and new password are required",
      );
    }
    return this.authService.changePassword({
      userId: request.user.sub,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
  }

  @Post("forgot-password")
  @ApiOperation({ summary: "Request password reset token by email" })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(@Body() body: { email?: string }) {
    if (!body.email) {
      throw new BadRequestException("Email is required");
    }
    return this.authService.requestForgotPassword(body.email);
  }

  @Post("reset-password")
  @ApiOperation({ summary: "Reset password with token" })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() body: { token?: string; newPassword?: string }) {
    if (!body.token || !body.newPassword) {
      throw new BadRequestException("Token and newPassword are required");
    }
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  @Get("verify-email")
  @ApiOperation({ summary: "Verify email using token" })
  @ApiQuery({ name: "token", required: true })
  async verifyEmail(@Query("token") token?: string) {
    if (!token) {
      throw new BadRequestException("Verification token is required");
    }
    return this.authService.verifyEmailByToken(token);
  }
}
