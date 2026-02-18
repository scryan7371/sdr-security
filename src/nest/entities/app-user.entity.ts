import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "app_user" })
export class AppUserEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "varchar" })
  email!: string;
}
