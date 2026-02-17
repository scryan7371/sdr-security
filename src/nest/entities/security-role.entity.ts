import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "security_role" })
export class SecurityRoleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", name: "role_key", unique: true })
  roleKey!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "boolean", name: "is_system", default: false })
  isSystem!: boolean;
}
