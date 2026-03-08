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
import { WorkshopOrderAttendee } from "./workshop-order-attendee.entity";

export enum OrderSummaryStatus {
    PENDING = "pending",
    COMPLETED = "completed",
    EXPIRED = "expired",
}

@Entity("workshop_order_summaries")
export class WorkshopOrderSummary {
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

    @Column({ type: "boolean", default: false })
    discountApplied: boolean;

    @Column({ type: "text", nullable: true })
    discountInfo?: string;

    @Column({ type: "enum", enum: OrderSummaryStatus, default: OrderSummaryStatus.PENDING })
    status: OrderSummaryStatus;

    @ManyToOne(() => Workshop, { eager: false })
    @JoinColumn({ name: "workshopId" })
    workshop: Workshop;

    @ManyToOne(() => User, { eager: false })
    @JoinColumn({ name: "userId" })
    user: User;

    @OneToMany(() => WorkshopOrderAttendee, attendee => attendee.orderSummary, { cascade: true, eager: true })
    attendees: WorkshopOrderAttendee[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
