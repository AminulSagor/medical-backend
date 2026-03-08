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
import { WorkshopOrderSummary } from "./workshop-order-summary.entity";

@Entity("workshop_order_attendees")
export class WorkshopOrderAttendee {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    orderSummaryId: string;

    @Column({ type: "varchar", length: 200 })
    fullName: string;

    @Column({ type: "varchar", length: 200 })
    professionalRole: string;

    @Column({ type: "varchar", length: 50, nullable: true })
    npiNumber?: string;

    @Column({ type: "varchar", length: 200 })
    email: string;

    @ManyToOne(() => WorkshopOrderSummary, orderSummary => orderSummary.attendees)
    @JoinColumn({ name: "orderSummaryId" })
    orderSummary: WorkshopOrderSummary;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
