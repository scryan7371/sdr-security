import { ApiProperty } from "@nestjs/swagger";

export class RegisterDto {
  @ApiProperty({ example: "user@example.com" })
  email!: string;

  @ApiProperty({ example: "StrongPass1" })
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: "user@example.com" })
  email!: string;

  @ApiProperty({ example: "StrongPass1" })
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ example: "refresh-token" })
  refreshToken!: string;
}

export class LogoutDto {
  @ApiProperty({ required: false, example: "refresh-token" })
  refreshToken?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: "OldPass1" })
  currentPassword!: string;

  @ApiProperty({ example: "NewPass1" })
  newPassword!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: "user@example.com" })
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: "reset-token" })
  token!: string;

  @ApiProperty({ example: "NewPass1" })
  newPassword!: string;
}
