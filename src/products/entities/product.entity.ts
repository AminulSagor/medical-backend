import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    OneToOne,
} from "typeorm";
import { ProductDetails } from "./product-details.entity";

// ✅ put type OUTSIDE the class
export type BulkPriceTier = {
    minQty: number;
    price: string;
};

export type ClinicalBenefit = {
    icon: string;
    title: string;
    description?: string;
};

export type TechnicalSpecification = {
    name: string;
    value: string;
};

export enum FrontendBadge {
    PROFESSIONAL_GRADE = "professional-grade",
    USED_IN_WORKSHOP = "used-in-workshop",
    NEW_ARRIVAL = "new-arrival",
}

@Entity("products")
export class Product {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "varchar", length: 200 })
    name: string;

    @Column({ type: "text", nullable: true })
    clinicalDescription?: string;

    @Index()
    @Column({ type: "uuid" })
    categoryId: string;

    @Column({ type: "text", array: true, default: () => "ARRAY[]::text[]" })
    tags: string[];

    // pricing/inventory
    @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
    actualPrice: string;

    @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
    offerPrice: string;

    @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
    bulkPriceTiers: BulkPriceTier[];

    @Index({ unique: true }) // industry best practice
    @Column({ type: "varchar", length: 80 })
    sku: string;

    @Column({ type: "int", default: 0 })
    stockQuantity: number;

    @Column({ type: "int", default: 0 })
    lowStockAlert: number;

    // Status
    @Column({ type: "boolean", default: true })
    isActive: boolean;

    // ✅ second table relation (eager = returned in response automatically)
    @OneToOne(() => ProductDetails, (d) => d.product, {
        cascade: true,
        eager: true,
    })
    details: ProductDetails;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
