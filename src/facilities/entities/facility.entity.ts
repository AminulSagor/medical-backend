import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

@Entity("facilities")
export class Facility {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "varchar", length: 200 })
    name: string;

    @Column({ type: "varchar", length: 400 })
    address: string;
}