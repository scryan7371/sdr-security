import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "app_user" })
export class AppUserEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "varchar" })
  email!: string;

  @Column({ type: "varchar", nullable: true, name: "first_name" })
  firstName!: string | null;

  @Column({ type: "varchar", nullable: true, name: "last_name" })
  lastName!: string | null;
}
