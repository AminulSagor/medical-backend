import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from "typeorm";

@Entity("faculty")
export class Faculty {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    /* ---------- Account Details ---------- */

    @Column({ type: "varchar", length: 120 })
    firstName: string;

    @Column({ type: "varchar", length: 120 })
    lastName: string;

    @Column({ type: "varchar", length: 50 })
    phoneNumber: string;

    @Index("UQ_faculty_email", { unique: true })
    @Column({ type: "varchar", length: 320 })
    email: string;

    @Column({ type: "varchar", length: 500, nullable: true })
    imageUrl?: string;

    /* ---------- Clinical Credentials ---------- */

    @Column({ type: "varchar", length: 150, nullable: true })
    primaryClinicalRole?: string;

    @Column({ type: "varchar", length: 120, nullable: true })
    medicalDesignation?: string;

    @Column({ type: "varchar", length: 200, nullable: true })
    institutionOrHospital?: string;

    // ✅ unique NPI
    @Index("UQ_faculty_npiNumber", { unique: true })
    @Column({ type: "varchar", length: 10 })
    npiNumber: string;

    /* ---------- Role Assignment ---------- */

    @Column({ type: "varchar", length: 100 })
    assignedRole: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
