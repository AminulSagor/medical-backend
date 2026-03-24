import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
    Index,
} from "typeorm";
import { Workshop } from "./workshop.entity";
import { User } from "../../users/entities/user.entity";
import { WorkshopAttendee } from "./workshop-attendee.entity";

export enum ReservationStatus {
    PENDING = "pending",
    CONFIRMED = "confirmed",
    CANCELLED = "cancelled",
}

@Entity("workshop_reservations")
export class WorkshopReservation {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    workshopId: string;

    @Index()
    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "int" })
    numberOfSeats: number;

    @Column({ type: "numeric", precision: 12, scale: 2 })
    pricePerSeat: string;

    @Column({ type: "numeric", precision: 12, scale: 2 })
    totalPrice: string;

    @Column({ type: "enum", enum: ReservationStatus, default: ReservationStatus.PENDING })
    status: ReservationStatus;

    @Column({ type: "text", nullable: true })
    notes?: string;

    @ManyToOne(() => Workshop, { eager: false })
    @JoinColumn({ name: "workshopId" })
    workshop: Workshop;

    @ManyToOne(() => User, { eager: false })
    @JoinColumn({ name: "userId" })
    user: User;

    @OneToMany(() => WorkshopAttendee, attendee => attendee.reservation, { cascade: true, eager: true })
    attendees: WorkshopAttendee[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
