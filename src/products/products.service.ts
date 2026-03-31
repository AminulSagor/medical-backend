import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { Category } from '../categories/entities/category.entity';
import { QueryFailedError } from 'typeorm';
import { GetProductsQueryDto } from './dto/get-products.query.dto';
import { NotFoundException } from '@nestjs/common';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsPublicQueryDto } from './dto/list-products-public.query.dto';
import { CartRequestDto } from './dto/cart.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private productsRepo: Repository<Product>,
    @InjectRepository(Category) private categoriesRepo: Repository<Category>,
  ) {}

  async create(dto: CreateProductDto) {
    const actual = Number(dto.actualPrice ?? '0');
    const offer = Number(dto.offerPrice ?? '0');

    // ✅ business rule validation
    if (offer > 0 && offer >= actual) {
      throw new BadRequestException(
        'Offer price must be less than actual price',
      );
    }

    const tiers = dto.bulkPriceTiers ?? [];
    for (const t of tiers) {
      const tierPrice = Number(t.price);
      if (tierPrice <= 0) {
        throw new BadRequestException('Bulk tier price must be greater than 0');
      }
      if (tierPrice >= actual) {
        throw new BadRequestException(
          'Bulk tier price must be less than actual price',
        );
      }
    }

    // ✅ Validate all category IDs
    if (dto.categoryId && dto.categoryId.length > 0) {
      for (const catId of dto.categoryId) {
        const category = await this.categoriesRepo.findOne({
          where: { id: catId },
        });
        if (!category) {
          throw new BadRequestException(`Invalid categoryId: ${catId}`);
        }
      }
    }

    const payload: DeepPartial<Product> = {
      // ✅ products table
      name: dto.name,
      clinicalDescription: dto.clinicalDescription ?? undefined,
      brand: dto.brand ?? undefined,
      categoryId: dto.categoryId,
      tags: dto.tags ?? [],
      actualPrice: dto.actualPrice ?? '0',
      offerPrice: dto.offerPrice ?? '0',
      bulkPriceTiers: (dto.bulkPriceTiers ?? []).map((t) => ({
        minQty: t.minQty,
        price: t.price,
      })),
      sku: dto.sku,
      barcode: dto.barcode ?? undefined,
      stockQuantity: dto.stockQuantity ?? 0,
      lowStockAlert: dto.lowStockAlert ?? 0,
      isActive: dto.isActive ?? true,
      backorder: dto.backorder ?? false,

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
        technicalSpecifications: (dto.technicalSpecifications ?? []).map(
          (s) => ({
            name: s.name,
            value: s.value,
          }),
        ),
      },
    };

    try {
      const product = this.productsRepo.create(payload);
      return await this.productsRepo.save(product);
    } catch (error) {
      // ✅ PostgreSQL duplicate key error code
      if (
        error instanceof QueryFailedError &&
        (error as any).driverError?.code === '23505'
      ) {
        throw new BadRequestException('SKU already exists');
      }

      throw error; // rethrow other errors
    }
  }

  async findAll(query: GetProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.productsRepo.createQueryBuilder('p');

    // --- tabs counts (independent query) ---
    const countsRaw = await this.productsRepo
      .createQueryBuilder('p')
      .select([
        'COUNT(*) AS all',
        `COUNT(*) FILTER (WHERE p.isActive = true) AS active`,
        `COUNT(*) FILTER (WHERE p.stockQuantity = 0) AS out_of_stock`,
        `COUNT(*) FILTER (WHERE p.stockQuantity > 0 AND p.stockQuantity <= p.lowStockAlert) AS low_stock`,
      ])
      .getRawOne();

    // --- tab filters ---
    if (query.tab === 'active') {
      qb.andWhere('p.isActive = :isActive', { isActive: true });
    }

    if (query.tab === 'out_of_stock') {
      qb.andWhere('p.stockQuantity = 0');
    }

    if (query.tab === 'low_stock') {
      qb.andWhere('p.stockQuantity > 0');
      qb.andWhere('p.stockQuantity <= p.lowStockAlert');
    }

    // --- category filter by names ---
    if (query.categoryNames && query.categoryNames.length > 0) {
      const categories = await this.categoriesRepo.find({
        where: query.categoryNames.map((name) => ({ name })),
      });
      const categoryIds = categories.map((c) => c.id);
      if (categoryIds.length > 0) {
        qb.andWhere('p.categoryId && :categoryIds', {
          categoryIds,
        });
      }
    }

    // --- tags filter by names ---
    if (query.tagNames && query.tagNames.length > 0) {
      qb.andWhere('p.tags && :tagNames', {
        tagNames: query.tagNames,
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
        { s },
      );
    }

    qb.orderBy('p.createdAt', 'DESC');
    qb.skip(skip).take(limit);

    const total = await qb.getCount();
    const entities = await qb.getMany();

    const items = entities.map((p) => ({
      ...p,
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
      relations: ['details'],
    });

    // ✅ Quick update rule: only stockQuantity + offerPrice allowed
    if (dto.quickUpdate === true) {
      const allowed = new Set(['quickUpdate', 'stockQuantity', 'offerPrice']);

      const keys = Object.keys(dto).filter(
        (k) => (dto as any)[k] !== undefined,
      );
      const invalid = keys.filter((k) => !allowed.has(k));

      if (invalid.length > 0) {
        throw new BadRequestException(
          `Quick update allows only stockQuantity and offerPrice. Invalid fields: ${invalid.join(', ')}`,
        );
      }

      // Optional safety: if quickUpdate true but neither field sent
      if (dto.stockQuantity === undefined && dto.offerPrice === undefined) {
        throw new BadRequestException(
          'Quick update requires at least one of: stockQuantity, offerPrice',
        );
      }
    }

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // ✅ Validate all category IDs if provided
    if (dto.categoryId && dto.categoryId.length > 0) {
      for (const catId of dto.categoryId) {
        const category = await this.categoriesRepo.findOne({
          where: { id: catId },
        });
        if (!category) {
          throw new BadRequestException(`Invalid categoryId: ${catId}`);
        }
      }
    }

    // ✅ compute effective prices (old + new) for business rules
    const effectiveActual = Number(
      dto.actualPrice ?? product.actualPrice ?? '0',
    );
    const effectiveOffer = Number(dto.offerPrice ?? product.offerPrice ?? '0');

    if (effectiveOffer > 0 && effectiveOffer >= effectiveActual) {
      throw new BadRequestException(
        'Offer price must be less than actual price',
      );
    }

    const effectiveTiers = dto.bulkPriceTiers ?? product.bulkPriceTiers ?? [];
    for (const t of effectiveTiers) {
      const tierPrice = Number(t.price);
      if (tierPrice <= 0) {
        throw new BadRequestException('Bulk tier price must be greater than 0');
      }
      if (tierPrice >= effectiveActual) {
        throw new BadRequestException(
          'Bulk tier price must be less than actual price',
        );
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
    if (dto.clinicalDescription !== undefined)
      product.clinicalDescription = dto.clinicalDescription;
    if (dto.brand !== undefined) product.brand = dto.brand;
    if (dto.categoryId !== undefined) product.categoryId = dto.categoryId;
    if (dto.tags !== undefined) product.tags = dto.tags;

    if (dto.actualPrice !== undefined) product.actualPrice = dto.actualPrice;
    if (dto.offerPrice !== undefined) product.offerPrice = dto.offerPrice;
    if (dto.bulkPriceTiers !== undefined)
      product.bulkPriceTiers = dto.bulkPriceTiers;

    if (dto.sku !== undefined) product.sku = dto.sku;
    if (dto.barcode !== undefined) product.barcode = dto.barcode;
    if (dto.stockQuantity !== undefined)
      product.stockQuantity = dto.stockQuantity;
    if (dto.lowStockAlert !== undefined)
      product.lowStockAlert = dto.lowStockAlert;
    if (dto.isActive !== undefined) product.isActive = dto.isActive;
    if (dto.backorder !== undefined) product.backorder = dto.backorder;

    // --- apply updates to product_details table ---
    if (dto.images !== undefined) product.details.images = dto.images;
    if (dto.frontendBadges !== undefined)
      product.details.frontendBadges = dto.frontendBadges;
    if (dto.frequentlyBoughtTogether !== undefined)
      product.details.frequentlyBoughtTogether = dto.frequentlyBoughtTogether;
    if (dto.bundleUpsells !== undefined)
      product.details.bundleUpsells = dto.bundleUpsells;

    if (dto.clinicalBenefits !== undefined) {
      product.details.clinicalBenefits = dto.clinicalBenefits.map((b) => ({
        icon: b.icon,
        title: b.title,
        description: b.description,
      }));
    }

    if (dto.technicalSpecifications !== undefined) {
      product.details.technicalSpecifications = dto.technicalSpecifications.map(
        (s) => ({
          name: s.name,
          value: s.value,
        }),
      );
    }

    try {
      return await this.productsRepo.save(product);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as any).driverError?.code === '23505'
      ) {
        throw new BadRequestException('SKU already exists');
      }
      throw error;
    }
  }

  // ✅ PUBLIC: Get all categories with product count and brands
  async getCategoriesWithProductCount() {
    const categories = await this.categoriesRepo.find();

    // Get all active products
    const products = await this.productsRepo.find({
      where: { isActive: true },
      select: [
        'id',
        'categoryId',
        'brand',
        'name',
        'clinicalDescription',
        'actualPrice',
        'offerPrice',
      ],
      relations: ['details'],
    });

    // Get unique brands
    const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))];

    // Calculate price range
    const prices = products.map((p) => Number(p.offerPrice) || Number(p.actualPrice) || 0);
    const priceRange = {
      min: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0,
    };

    // Calculate product count per category
    const categoriesWithCount = categories.map((category) => {
      const productCount = products.filter((p) =>
        p.categoryId.includes(category.id),
      ).length;

      return {
        name: category.name,
        productCount,
      };
    });

    return {
      categories: categoriesWithCount,
      brands,
      priceRange,
    };
  }

  // ✅ PUBLIC: Get products with filters
  async findAllPublic(query: ListProductsPublicQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const skip = (page - 1) * limit;

    const qb = this.productsRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.details', 'details')
      .where('p.isActive = :isActive', { isActive: true });

    // Search filter
    if (query.search && query.search.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(
                    LOWER(p.name) LIKE :s
                    OR LOWER(p.sku) LIKE :s
                    OR LOWER(p.clinicalDescription) LIKE :s
                )`,
        { s },
      );
    }

    // Category filter by names
    if (query.categoryNames && query.categoryNames.length > 0) {
      const categories = await this.categoriesRepo.find({
        where: query.categoryNames.map((name) => ({ name })),
      });
      const categoryIds = categories.map((c) => c.id);
      if (categoryIds.length > 0) {
        qb.andWhere('p.categoryId && :categoryIds', {
          categoryIds,
        });
      }
    }

    // Brand filter
    if (query.brands && query.brands.length > 0) {
      qb.andWhere('p.brand IN (:...brands)', { brands: query.brands });
    }

    // Price range filter
    if (query.minPrice) {
      qb.andWhere('CAST(p.offerPrice AS DECIMAL) >= :minPrice', {
        minPrice: query.minPrice,
      });
    }

    if (query.maxPrice) {
      qb.andWhere('CAST(p.offerPrice AS DECIMAL) <= :maxPrice', {
        maxPrice: query.maxPrice,
      });
    }

    // Sorting
    switch (query.sortBy) {
      case 'price-asc':
        qb.orderBy('CAST(p.offerPrice AS DECIMAL)', 'ASC');
        break;
      case 'price-desc':
        qb.orderBy('CAST(p.offerPrice AS DECIMAL)', 'DESC');
        break;
      case 'name-asc':
        qb.orderBy('p.name', 'ASC');
        break;
      case 'name-desc':
        qb.orderBy('p.name', 'DESC');
        break;
      case 'newest':
      default:
        qb.orderBy('p.createdAt', 'DESC');
        break;
    }

    const total = await qb.getCount();
    const products = await qb.skip(skip).take(limit).getMany();

    // Get category names for products
    const categoryIds = [...new Set(products.flatMap((p) => p.categoryId))];
    const categories = await this.categoriesRepo.find({
      where: categoryIds.map((id) => ({ id })),
    });

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    const items = products.map((p) => ({
      id: p.id,
      photo: p.details?.images?.[0] || null,
      category: p.categoryId
        .map((id) => categoryMap.get(id))
        .filter(Boolean)
        .join(', '),
      title: p.name,
      description: p.clinicalDescription,
      price: p.actualPrice,
      discountedPrice: p.offerPrice,
      brand: p.brand,
      inStock: p.stockQuantity > 0,
      badge: p.details?.frontendBadges?.[0]?.toUpperCase().replace(/-/g, ' ') || null,
    }));

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ✅ PUBLIC: Get full product details by ID
  async getProductDetails(id: string) {
    const product = await this.productsRepo.findOne({
      where: { id, isActive: true },
      relations: ['details'],
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Get category names
    const categories = await this.categoriesRepo.find({
      where: product.categoryId.map((id) => ({ id })),
    });

    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      sku: product.sku,
      clinicalDescription: product.clinicalDescription,
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      tags: product.tags,
      actualPrice: product.actualPrice,
      offerPrice: product.offerPrice,
      bulkPriceTiers: product.bulkPriceTiers,
      stockQuantity: product.stockQuantity,
      inStock: product.stockQuantity > 0,
      backorder: product.backorder,
      images: product.details?.images || [],
      frontendBadges: product.details?.frontendBadges || [],
      clinicalBenefits: product.details?.clinicalBenefits || [],
      technicalSpecifications: product.details?.technicalSpecifications || [],
      frequentlyBoughtTogether: product.details?.frequentlyBoughtTogether || [],
      bundleUpsells: product.details?.bundleUpsells || [],
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  // ✅ PUBLIC: Calculate cart summary
  async calculateCart(dto: CartRequestDto) {
    const TAX_RATE = 0.1; // 10% tax rate (adjust as needed)

    const productIds = dto.items.map((item) => item.productId);
    const products = await this.productsRepo.find({
      where: productIds.map((id) => ({ id })),
      relations: ['details'],
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('Some products not found');
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    const cartItems = dto.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestException(`Product not found: ${item.productId}`);
      }

      const price = Number(product.offerPrice || product.actualPrice);
      const itemTotal = price * item.quantity;
      subtotal += itemTotal;

      return {
        productId: product.id,
        photo: product.details?.images?.[0] || null,
        name: product.name,
        sku: product.sku,
        inStock: product.stockQuantity > 0,
        price: product.offerPrice || product.actualPrice,
        quantity: item.quantity,
        itemTotal: itemTotal.toFixed(2),
      };
    });

    const estimatedTax = subtotal * TAX_RATE;
    const orderTotal = subtotal + estimatedTax;

    return {
      items: cartItems,
      orderSummary: {
        subtotal: subtotal.toFixed(2),
        estimatedTax: estimatedTax.toFixed(2),
        orderTotal: orderTotal.toFixed(2),
      },
    };
  }
}
