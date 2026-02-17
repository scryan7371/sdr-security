import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "app_user" })
export class AppUserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  email!: string;

  @Column({ type: "varchar", name: "password_hash" })
  passwordHash!: string;

  @Column({ type: "varchar", name: "first_name", nullable: true })
  firstName!: string | null;

  @Column({ type: "varchar", name: "last_name", nullable: true })
  lastName!: string | null;

  @Column({ type: "timestamptz", name: "email_verified_at", nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ type: "varchar", name: "email_verification_token", nullable: true })
  emailVerificationToken!: string | null;

  @Column({ type: "timestamptz", name: "admin_approved_at", nullable: true })
  adminApprovedAt!: Date | null;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;
}
