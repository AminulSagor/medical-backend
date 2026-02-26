import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    OneToOne,
    PrimaryColumn,
    UpdateDateColumn,
} from "typeorm";
import { Product, BulkPriceTier, ClinicalBenefit, TechnicalSpecification, FrontendBadge } from "./product.entity";

@Entity("product_details")
export class ProductDetails {
    // ✅ shared PK with product (1:1)
    @PrimaryColumn("uuid")
    productId: string;

    @OneToOne(() => Product, (p) => p.details, { onDelete: "CASCADE" })
    @JoinColumn({ name: "productId" })
    product: Product;

    // ✅ Media
    @Column({ type: "text", array: true, default: () => "ARRAY[]::text[]" })
    images: string[];

    // ✅ UI badges
    @Column({ type: "text", array: true, default: () => "ARRAY[]::text[]" })
    frontendBadges: FrontendBadge[];

    // ✅ Relationships
    @Column({ type: "text", array: true, default: () => "ARRAY[]::text[]" })
    frequentlyBoughtTogether: string[];

    @Column({ type: "text", array: true, default: () => "ARRAY[]::text[]" })
    bundleUpsells: string[];

    // ✅ Cards / lists
    @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
    clinicalBenefits: ClinicalBenefit[];

    @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
    technicalSpecifications: TechnicalSpecification[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
