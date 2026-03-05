import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToOne,
    JoinColumn,
} from "typeorm";
import { BlogPost } from "./blog-post.entity";

@Entity("blog_post_seo")
export class BlogPostSeo {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid", unique: true })
    postId: string;

    @Column({ type: "varchar", length: 160, nullable: true })
    metaTitle?: string;

    @Column({ type: "varchar", length: 320, nullable: true })
    metaDescription?: string;

    @OneToOne(() => BlogPost, (post) => post.seo, { onDelete: "CASCADE" })
    @JoinColumn({ name: "postId" })
    post: BlogPost;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
