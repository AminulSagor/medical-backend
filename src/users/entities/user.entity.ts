import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export enum UserRole {
  ADMIN = "admin",
  USER = "user",
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 200 })
  fullLegalName: string;

  @Index("UQ_users_medicalEmail", { unique: true })
  @Column({ type: "varchar", length: 320 })
  medicalEmail: string;

  @Column({ type: "varchar", length: 150 })
  professionalRole: string;

  @Column({ type: "varchar", length: 255 })
  password: string;

  @Column({ type: "boolean", default: false })
  isVerified: boolean;

  // ✅ ADD THIS (admin/user)
  @Column({ type: "enum", enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
