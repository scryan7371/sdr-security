import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "app_user" })
export class AppUserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  email!: string;
}
