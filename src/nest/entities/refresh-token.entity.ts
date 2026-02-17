import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "refresh_token" })
export class RefreshTokenEntity {
  @PrimaryColumn({ type: "varchar" })
  id!: string;

  @Column({ type: "varchar", name: "token_hash" })
  tokenHash!: string;

  @Column({ type: "timestamptz", name: "expires_at" })
  expiresAt!: Date;

  @Column({ type: "timestamptz", name: "revoked_at", nullable: true })
  revokedAt!: Date | null;

  @Column({ type: "varchar", name: "userId", nullable: true })
  userId!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
