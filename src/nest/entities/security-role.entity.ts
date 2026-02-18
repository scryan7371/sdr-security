import { v7 as uuidv7 } from "uuid";
import { BeforeInsert, Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "security_role" })
export class SecurityRoleEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "varchar", name: "role_key", unique: true })
  roleKey!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "boolean", name: "is_system", default: false })
  isSystem!: boolean;

  @BeforeInsert()
  ensureId() {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
