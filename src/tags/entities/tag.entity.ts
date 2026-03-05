import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
} from "typeorm";

@Entity("tags")
export class Tag {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index({ unique: true })
    @Column({ type: "varchar", length: 100 })
    name: string;

    @Index({ unique: true })
    @Column({ type: "varchar", length: 120 })
    slug: string;

    @CreateDateColumn()
    createdAt: Date;
}
