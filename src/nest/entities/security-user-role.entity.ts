import { v7 as uuidv7 } from "uuid";
import { BeforeInsert, Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "security_user_role" })
export class SecurityUserRoleEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @Column({ type: "uuid", name: "role_id" })
  roleId!: string;

  @BeforeInsert()
  ensureId() {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
