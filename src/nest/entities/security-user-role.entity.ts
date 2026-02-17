import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "security_user_role" })
export class SecurityUserRoleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", name: "user_id" })
  userId!: string;

  @Column({ type: "uuid", name: "role_id" })
  roleId!: string;
}
