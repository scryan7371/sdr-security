import { ApiProperty } from "@nestjs/swagger";

export class SetAdminApprovalDto {
  @ApiProperty({ example: true })
  approved!: boolean;
}

export class SetUserActiveDto {
  @ApiProperty({ example: false })
  active!: boolean;
}

export class CreateRoleDto {
  @ApiProperty({ example: "COACH" })
  role!: string;

  @ApiProperty({ required: false, nullable: true, example: "Coaching access" })
  description?: string | null;
}

export class SetUserRolesDto {
  @ApiProperty({ type: [String], example: ["ADMIN", "COACH"] })
  roles!: string[];
}

export class AssignRoleDto {
  @ApiProperty({ example: "COACH" })
  role!: string;
}
