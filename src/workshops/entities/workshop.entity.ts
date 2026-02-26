import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    ManyToMany,
    JoinTable,
    OneToMany,
} from "typeorm";
import { Faculty } from "../../faculty/entities/faculty.entity";
import { WorkshopDay } from "./workshop-day.entity";
import { WorkshopGroupDiscount } from "./workshop-group-discount.entity";

export enum WorkshopDeliveryMode {
    IN_PERSON = "in_person",
    ONLINE = "online",
}

@Entity("workshops")
export class Workshop {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "varchar", length: 220 })
    title: string;

    @Column({ type: "text", nullable: true })
    shortBlurb?: string;

    @Column({ type: "enum", enum: WorkshopDeliveryMode })
    deliveryMode: WorkshopDeliveryMode;

    // cover image url
    @Column({ type: "text", nullable: true })
    coverImageUrl?: string;

    // syllabus/details
    @Column({ type: "text", nullable: true })
    learningObjectives?: string; // store as HTML/text from editor

    @Column({ type: "boolean", default: false })
    offersCmeCredits: boolean;

    @Column({ type: "text", nullable: true })
    cmeCreditsInfo?: string;

    // location
    @Index()
    @Column({ type: "uuid" })
    facilityId: string;

    // inventory
    @Column({ type: "int" })
    capacity: number;

    @Column({ type: "int" })
    alertAt: number;

    // pricing
    @Column({ type: "numeric", precision: 12, scale: 2 })
    standardBaseRate: string;

    @Column({ type: "boolean", default: false })
    groupDiscountEnabled: boolean;

    // relations
    @OneToMany(() => WorkshopDay, (d) => d.workshop, { cascade: true, eager: true })
    days: WorkshopDay[];

    @OneToMany(() => WorkshopGroupDiscount, (g) => g.workshop, {
        cascade: true,
        eager: true,
    })
    groupDiscounts: WorkshopGroupDiscount[];

    // faculty assignment
    @ManyToMany(() => Faculty, { eager: true })
    @JoinTable({
        name: "workshop_faculty",
        joinColumn: { name: "workshopId", referencedColumnName: "id" },
        inverseJoinColumn: { name: "facultyId", referencedColumnName: "id" },
    })
    faculty: Faculty[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}