import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from "typeorm";
import { WorkshopReservation } from "./workshop-reservation.entity";

@Entity("workshop_attendees")
export class WorkshopAttendee {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    reservationId: string;

    @Column({ type: "varchar", length: 200 })
    fullName: string;

    @Column({ type: "varchar", length: 200 })
    professionalRole: string;

    @Column({ type: "varchar", length: 50, nullable: true })
    npiNumber?: string;

    @Column({ type: "varchar", length: 200 })
    email: string;

    @ManyToOne(() => WorkshopReservation, reservation => reservation.attendees)
    @JoinColumn({ name: "reservationId" })
    reservation: WorkshopReservation;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
