import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    Index,
} from "typeorm";
import { Workshop } from "./workshop.entity";
import { WorkshopSegment } from "./workshop-segment.entity";

@Entity("workshop_days")
export class WorkshopDay {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    workshopId: string;

    // Day date (ex: 2026-02-22)
    @Column({ type: "date" })
    date: string;

    // 1,2,3... (UI: Day 1, Day 2)
    @Column({ type: "int" })
    dayNumber: number;

    @ManyToOne(() => Workshop, (w) => w.days, { onDelete: "CASCADE" })
    workshop: Workshop;

    @OneToMany(() => WorkshopSegment, (s) => s.day, { cascade: true, eager: true })
    segments: WorkshopSegment[];
}