import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DeepPartial } from "typeorm";
import { Product } from "./entities/product.entity";
import { CreateProductDto } from "./dto/create-product.dto";
import { Category } from "../categories/entities/category.entity";
import { QueryFailedError } from "typeorm";
import { GetProductsQueryDto } from "./dto/get-products.query.dto";
import { NotFoundException } from "@nestjs/common";
import { UpdateProductDto } from "./dto/update-product.dto";


@Injectable()
export class ProductsService {
    constructor(
        @InjectRepository(Product) private productsRepo: Repository<Product>,
        @InjectRepository(Category) private categoriesRepo: Repository<Category>,
    ) { }


    async create(dto: CreateProductDto) {
        const actual = Number(dto.actualPrice ?? "0");
        const offer = Number(dto.offerPrice ?? "0");

        // ✅ business rule validation
        if (offer > 0 && offer >= actual) {
            throw new BadRequestException(
                "Offer price must be less than actual price"
            );
        }

        const tiers = dto.bulkPriceTiers ?? [];
        for (const t of tiers) {
            const tierPrice = Number(t.price);
            if (tierPrice <= 0) {
                throw new BadRequestException("Bulk tier price must be greater than 0");
            }
            if (tierPrice >= actual) {
                throw new BadRequestException("Bulk tier price must be less than actual price");
            }
        }

        const category = await this.categoriesRepo.findOne({
            where: { id: dto.categoryId },
        });
        if (!category) {
            throw new BadRequestException("Invalid categoryId");
        }

        const payload: DeepPartial<Product> = {
            // ✅ products table
            name: dto.name,
            clinicalDescription: dto.clinicalDescription ?? undefined,
            categoryId: dto.categoryId,
            tags: dto.tags ?? [],
            actualPrice: dto.actualPrice ?? "0",
            offerPrice: dto.offerPrice ?? "0",
            bulkPriceTiers: (dto.bulkPriceTiers ?? []).map((t) => ({
                minQty: t.minQty,
                price: t.price,
            })),
            sku: dto.sku,
            stockQuantity: dto.stockQuantity ?? 0,
            lowStockAlert: dto.lowStockAlert ?? 0,
            isActive: dto.isActive ?? true,

            // ✅ product_details table
            details: {
                images: dto.images ?? [],
                frontendBadges: dto.frontendBadges ?? [],
                frequentlyBoughtTogether: dto.frequentlyBoughtTogether ?? [],
                bundleUpsells: dto.bundleUpsells ?? [],
                clinicalBenefits: (dto.clinicalBenefits ?? []).map((b) => ({
                    icon: b.icon,
                    title: b.title,
                    description: b.description,
                })),
                technicalSpecifications: (dto.technicalSpecifications ?? []).map((s) => ({
                    name: s.name,
                    value: s.value,
                })),
            },
        };

        try {
            const product = this.productsRepo.create(payload);
            return await this.productsRepo.save(product);
        } catch (error) {

            // ✅ PostgreSQL duplicate key error code
            if (error instanceof QueryFailedError && (error as any).driverError?.code === "23505") {
                throw new BadRequestException("SKU already exists");
            }

            throw error; // rethrow other errors
        }
    }


    async findAll(query: GetProductsQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        const skip = (page - 1) * limit;

        const qb = this.productsRepo.createQueryBuilder("p");
        qb.leftJoin("categories", "c", "c.id = p.categoryId");
        qb.addSelect("c.name", "categoryName");

        // --- tabs counts (independent query) ---
        const countsRaw = await this.productsRepo
            .createQueryBuilder("p")
            .select([
                "COUNT(*) AS all",
                `COUNT(*) FILTER (WHERE p.isActive = true) AS active`,
                `COUNT(*) FILTER (WHERE p.stockQuantity = 0) AS out_of_stock`,
                `COUNT(*) FILTER (WHERE p.stockQuantity > 0 AND p.stockQuantity <= p.lowStockAlert) AS low_stock`,
            ])
            .getRawOne();

        // --- tab filters ---
        if (query.tab === "active") {
            qb.andWhere("p.isActive = :isActive", { isActive: true });
        }

        if (query.tab === "out_of_stock") {
            qb.andWhere("p.stockQuantity = 0");
        }

        if (query.tab === "low_stock") {
            qb.andWhere("p.stockQuantity > 0");
            qb.andWhere("p.stockQuantity <= p.lowStockAlert");
        }

        // --- category filter ---
        if (query.category && query.category.trim() && query.category !== "All") {
            qb.andWhere("LOWER(c.name) = LOWER(:categoryName)", {
                categoryName: query.category.trim(),
            });
        }

        // --- search (name, sku, tags) ---
        if (query.search && query.search.trim()) {
            const s = `%${query.search.trim().toLowerCase()}%`;

            qb.andWhere(
                `(
        LOWER(p.name) LIKE :s
        OR LOWER(p.sku) LIKE :s
        OR EXISTS (
          SELECT 1
          FROM unnest(p.tags) t
          WHERE LOWER(t) LIKE :s
        )
      )`,
                { s }
            );
        }

        qb.orderBy("p.createdAt", "DESC");
        qb.skip(skip).take(limit);

        const total = await qb.getCount();
        const { entities, raw } = await qb.getRawAndEntities();

        const items = entities.map((p, i) => ({
            ...p,
            categoryName: raw[i]?.categoryName ?? null,
            // optional: remove id from response
            categoryId: undefined,
        }));


        return {
            items,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
            tabsCount: {
                all: Number(countsRaw?.all ?? 0),
                active: Number(countsRaw?.active ?? 0),
                out_of_stock: Number(countsRaw?.out_of_stock ?? 0),
                low_stock: Number(countsRaw?.low_stock ?? 0),
            },
        };
    }



    async update(id: string, dto: UpdateProductDto) {
        // ✅ load previous (best practice for PATCH)
        const product = await this.productsRepo.findOne({
            where: { id },
            relations: ["details"],
        });


        // ✅ Quick update rule: only stockQuantity + offerPrice allowed
        if (dto.quickUpdate === true) {
            const allowed = new Set(["quickUpdate", "stockQuantity", "offerPrice"]);

            const keys = Object.keys(dto).filter((k) => (dto as any)[k] !== undefined);
            const invalid = keys.filter((k) => !allowed.has(k));

            if (invalid.length > 0) {
                throw new BadRequestException(
                    `Quick update allows only stockQuantity and offerPrice. Invalid fields: ${invalid.join(", ")}`
                );
            }

            // Optional safety: if quickUpdate true but neither field sent
            if (dto.stockQuantity === undefined && dto.offerPrice === undefined) {
                throw new BadRequestException(
                    "Quick update requires at least one of: stockQuantity, offerPrice"
                );
            }
        }


        if (!product) {
            throw new NotFoundException("Product not found");
        }

        // ✅ validate category if provided
        if (dto.categoryId) {
            const category = await this.categoriesRepo.findOne({
                where: { id: dto.categoryId },
            });
            if (!category) {
                throw new BadRequestException("Invalid categoryId");
            }
        }

        // ✅ compute effective prices (old + new) for business rules
        const effectiveActual = Number(dto.actualPrice ?? product.actualPrice ?? "0");
        const effectiveOffer = Number(dto.offerPrice ?? product.offerPrice ?? "0");

        if (effectiveOffer > 0 && effectiveOffer >= effectiveActual) {
            throw new BadRequestException("Offer price must be less than actual price");
        }

        const effectiveTiers = dto.bulkPriceTiers ?? product.bulkPriceTiers ?? [];
        for (const t of effectiveTiers) {
            const tierPrice = Number(t.price);
            if (tierPrice <= 0) {
                throw new BadRequestException("Bulk tier price must be greater than 0");
            }
            if (tierPrice >= effectiveActual) {
                throw new BadRequestException("Bulk tier price must be less than actual price");
            }
        }

        // ✅ ensure details exists (safety for old rows)
        if (!product.details) {
            product.details = {
                productId: product.id,
                images: [],
                frontendBadges: [],
                frequentlyBoughtTogether: [],
                bundleUpsells: [],
                clinicalBenefits: [],
                technicalSpecifications: [],
            } as any;
        }

        // --- apply updates to products table ---
        if (dto.name !== undefined) product.name = dto.name;
        if (dto.clinicalDescription !== undefined) product.clinicalDescription = dto.clinicalDescription;
        if (dto.categoryId !== undefined) product.categoryId = dto.categoryId;
        if (dto.tags !== undefined) product.tags = dto.tags;

        if (dto.actualPrice !== undefined) product.actualPrice = dto.actualPrice;
        if (dto.offerPrice !== undefined) product.offerPrice = dto.offerPrice;
        if (dto.bulkPriceTiers !== undefined) product.bulkPriceTiers = dto.bulkPriceTiers;

        if (dto.sku !== undefined) product.sku = dto.sku;
        if (dto.stockQuantity !== undefined) product.stockQuantity = dto.stockQuantity;
        if (dto.lowStockAlert !== undefined) product.lowStockAlert = dto.lowStockAlert;
        if (dto.isActive !== undefined) product.isActive = dto.isActive;

        // --- apply updates to product_details table ---
        if (dto.images !== undefined) product.details.images = dto.images;
        if (dto.frontendBadges !== undefined) product.details.frontendBadges = dto.frontendBadges;
        if (dto.frequentlyBoughtTogether !== undefined)
            product.details.frequentlyBoughtTogether = dto.frequentlyBoughtTogether;
        if (dto.bundleUpsells !== undefined) product.details.bundleUpsells = dto.bundleUpsells;

        if (dto.clinicalBenefits !== undefined) {
            product.details.clinicalBenefits = dto.clinicalBenefits.map((b) => ({
                icon: b.icon,
                title: b.title,
                description: b.description,
            }));
        }

        if (dto.technicalSpecifications !== undefined) {
            product.details.technicalSpecifications = dto.technicalSpecifications.map((s) => ({
                name: s.name,
                value: s.value,
            }));
        }

        try {
            return await this.productsRepo.save(product);
        } catch (error) {
            if (error instanceof QueryFailedError && (error as any).driverError?.code === "23505") {
                throw new BadRequestException("SKU already exists");
            }
            throw error;
        }
    }


}
