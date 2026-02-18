import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "security_user" })
export class SecurityUserEntity {
  @PrimaryColumn({ type: "varchar", name: "user_id" })
  userId!: string;

  @Column({ type: "varchar", name: "password_hash" })
  passwordHash!: string;

  @Column({ type: "timestamptz", name: "email_verified_at", nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ type: "varchar", name: "email_verification_token", nullable: true })
  emailVerificationToken!: string | null;

  @Column({ type: "timestamptz", name: "admin_approved_at", nullable: true })
  adminApprovedAt!: Date | null;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
