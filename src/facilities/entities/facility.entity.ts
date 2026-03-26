import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("facilities")
export class Facility {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "varchar", length: 200 })
    facilityName: string;

    @Column({ type: "varchar", length: 50 })
    roomNumber: string;

    @Column({ type: "varchar", length: 400 })
    physicalAddress: string;

    @Column({ type: "text", nullable: true })
    capacityNotes?: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}