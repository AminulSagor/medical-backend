import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from "typeorm";

@Entity("blog_categories")
export class BlogCategory {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index({ unique: true })
    @Column({ type: "varchar", length: 120 })
    name: string;

    @Index({ unique: true })
    @Column({ type: "varchar", length: 140 })
    slug: string;

    @Column({ type: "text", nullable: true })
    description?: string;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
