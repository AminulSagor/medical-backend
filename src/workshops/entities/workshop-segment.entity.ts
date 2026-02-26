import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index } from "typeorm";
import { WorkshopDay } from "./workshop-day.entity";

@Entity("workshop_segments")
export class WorkshopSegment {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    dayId: string;

    @Column({ type: "int" })
    segmentNumber: number;

    @Column({ type: "varchar", length: 220 })
    courseTopic: string;

    @Column({ type: "text", nullable: true })
    topicDetails?: string;

    // stored as Postgres TIME
    @Column({ type: "time" })
    startTime: string;

    @Column({ type: "time" })
    endTime: string;

    @ManyToOne(() => WorkshopDay, (d) => d.segments, { onDelete: "CASCADE" })
    day: WorkshopDay;
}