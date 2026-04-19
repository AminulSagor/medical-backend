import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    ManyToMany,
    JoinTable,
    OneToOne,
} from "typeorm";
import { User } from "../../users/entities/user.entity";
import { BlogCategory } from "../../blog-categories/entities/blog-category.entity";
import { Tag } from "../../tags/entities/tag.entity";
import { BlogPostSeo } from "./blog-post-seo.entity";

export enum PublishingStatus {
    DRAFT = "draft",
    SCHEDULED = "scheduled",
    PUBLISHED = "published",
}

@Entity("blog_posts")
export class BlogPost {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "varchar", length: 300 })
    title: string;

    @Column({ type: "text" })
    content: string;

    @Column({ type: "varchar", length: 200, nullable: true })
    authorName?: string;

    @Column({ type: "jsonb", nullable: true })
    coverImages?: { imageUrl: string; imageType: string }[];

    @Index()
    @Column({
        type: "enum",
        enum: PublishingStatus,
        default: PublishingStatus.DRAFT,
    })
    publishingStatus: PublishingStatus;

    @Column({ type: "timestamptz", nullable: true })
    scheduledPublishDate?: Date;

    @Index()
    @Column({ type: "boolean", default: false })
    isFeatured: boolean;

    @Column({ type: "text", nullable: true })
    excerpt?: string;

    @Column({ type: "int", default: 5 })
    readTimeMinutes: number;

    @Index()
    @Column({ type: "int", default: 0 })
    readCount: number;

    @Index()
    @Column({ type: "timestamptz", nullable: true })
    publishedAt?: Date;

    // ── Relations ──

    @OneToOne(() => BlogPostSeo, (seo) => seo.post, {
        cascade: true,
        eager: true,
    })
    seo: BlogPostSeo;

    @ManyToMany(() => User, { eager: true })
    @JoinTable({
        name: "blog_post_authors",
        joinColumn: { name: "postId", referencedColumnName: "id" },
        inverseJoinColumn: { name: "authorId", referencedColumnName: "id" },
    })
    authors: User[];

    @ManyToMany(() => BlogCategory, { eager: true })
    @JoinTable({
        name: "blog_post_categories",
        joinColumn: { name: "postId", referencedColumnName: "id" },
        inverseJoinColumn: { name: "categoryId", referencedColumnName: "id" },
    })
    categories: BlogCategory[];

    @ManyToMany(() => Tag, { eager: true })
    @JoinTable({
        name: "blog_post_tags",
        joinColumn: { name: "postId", referencedColumnName: "id" },
        inverseJoinColumn: { name: "tagId", referencedColumnName: "id" },
    })
    tags: Tag[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
