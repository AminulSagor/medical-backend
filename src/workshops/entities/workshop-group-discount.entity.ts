import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index } from "typeorm";
import { Workshop } from "./workshop.entity";

@Entity("workshop_group_discounts")
export class WorkshopGroupDiscount {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    workshopId: string;

    @Column({ type: "int" })
    minimumAttendees: number;

    @Column({ type: "numeric", precision: 12, scale: 2 })
    groupRatePerPerson: string;

    @ManyToOne(() => Workshop, (w) => w.groupDiscounts, { onDelete: "CASCADE" })
    workshop: Workshop;
}