import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, In } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryFailedError } from 'typeorm';
import { GetProductsQueryDto } from './dto/get-products.query.dto';
import { NotFoundException } from '@nestjs/common';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsPublicQueryDto } from './dto/list-products-public.query.dto';
import { CartRequestDto } from './dto/cart.dto';
import { Review, ReviewStatus } from '../reviews/entities/review.entity';
import { AdminProductViewResponse } from 'src/common/interfaces/response.interface';
import { OrderItem } from 'src/orders/entities/order-item.entity';
import { Category } from 'src/categories/entities/category.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private productsRepo: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
    @InjectRepository(Review) private reviewsRepo: Repository<Review>,
    @InjectRepository(OrderItem) private orderItemRepo: Repository<OrderItem>,
  ) {}

  private async validateProductCategoryIds(categoryIds: string[] = []) {
    if (!categoryIds.length) {
      return;
    }

    const uniqueIds = [...new Set(categoryIds)];
    const categories = await this.categoriesRepo.findBy({
      id: In(uniqueIds),
    });

    if (categories.length !== uniqueIds.length) {
      const foundIds = new Set(categories.map((c) => c.id));
      const invalidIds = uniqueIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `Invalid product categoryId: ${invalidIds.join(', ')}`,
      );
    }
  }

  private async getProductCategoryMapByIds(categoryIds: string[]) {
    const uniqueIds = [...new Set(categoryIds.filter(Boolean))];
    if (!uniqueIds.length) {
      return new Map<string, Category>();
    }

    const categories = await this.categoriesRepo.findBy({
      id: In(uniqueIds),
    });

    return new Map(categories.map((c) => [c.id, c]));
  }

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
    await this.validateProductCategoryIds(dto.categoryId ?? []);

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

  // ✅ ADMIN: Search products (for frequently bought together)
  async searchProducts(q: string) {
    if (!q || !q.trim()) {
      return [];
    }

    const search = `%${q.trim().toLowerCase()}%`;

    const products = await this.productsRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.name', 'p.sku'])
      .where('LOWER(p.name) LIKE :search', { search })
      .orWhere('LOWER(p.sku) LIKE :search', { search })
      .orderBy('p.name', 'ASC')
      .limit(10)
      .getMany();

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
    }));
  }

  // ✅ ADMIN: Get single product by ID (for edit mode)
  async findOneAdmin(id: string) {
    const product = await this.productsRepo.findOne({
      where: { id },
      relations: ['details'],
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const categoryMap = await this.getProductCategoryMapByIds(
      product.categoryId ?? [],
    );

    const categoryDetails = (product.categoryId ?? [])
      .map((catId) => categoryMap.get(catId))
      .filter(Boolean)
      .map((c) => ({
        id: c!.id,
        name: c!.name,
      }));

    return {
      id: product.id,
      name: product.name,
      clinicalDescription: product.clinicalDescription,
      brand: product.brand,
      sku: product.sku,
      barcode: product.barcode,
      categoryIds: product.categoryId,
      categories: categoryDetails.map((c) => c.name),
      categoryDetails,
      tags: product.tags,
      actualPrice: product.actualPrice,
      offerPrice: product.offerPrice,
      bulkPriceTiers: product.bulkPriceTiers,
      stockQuantity: product.stockQuantity,
      lowStockAlert: product.lowStockAlert,
      backorder: product.backorder,
      isActive: product.isActive,
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

  async getAdminProductView(
    productId: string,
  ): Promise<AdminProductViewResponse> {
    const product = await this.productsRepo.findOne({
      where: { id: productId },
      relations: ['details'],
    });

    if (!product) throw new NotFoundException('Product not found');

    const now = new Date();
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prev30 = new Date(last30.getTime() - 30 * 24 * 60 * 60 * 1000);

    const qb = this.orderItemRepo
      .createQueryBuilder('item')
      .leftJoin('item.order', 'order')
      .where('item.productId = :productId', { productId });

    const current = await qb
      .clone()
      .andWhere('order.createdAt >= :last30', { last30 })
      .select([
        'SUM(item.quantity) as units',
        'SUM(item.total) as revenue',
        'MAX(order.createdAt) as lastSale',
      ])
      .getRawOne();

    const previous = await qb
      .clone()
      .andWhere('order.createdAt BETWEEN :prev30 AND :last30', {
        prev30,
        last30,
      })
      .select(['SUM(item.quantity) as units', 'SUM(item.total) as revenue'])
      .getRawOne();

    const currentUnits = Number(current?.units || 0);
    const currentRevenue = Number(current?.revenue || 0);
    const prevUnits = Number(previous?.units || 0);
    const prevRevenue = Number(previous?.revenue || 0);

    const unitsChange =
      prevUnits === 0 ? 100 : ((currentUnits - prevUnits) / prevUnits) * 100;

    const revenueChange =
      prevRevenue === 0
        ? 100
        : ((currentRevenue - prevRevenue) / prevRevenue) * 100;

    const crossIds = [
      ...(product.details?.frequentlyBoughtTogether || []),
      ...(product.details?.bundleUpsells || []),
    ];

    const crossProducts = crossIds.length
      ? await this.productsRepo.findBy({ id: In(crossIds) })
      : [];

    const categoryMap = await this.getProductCategoryMapByIds(
      product.categoryId ?? [],
    );

    const categoryNames = (product.categoryId ?? [])
      .map((catId) => categoryMap.get(catId)?.name)
      .filter((name): name is string => Boolean(name));

    const primaryCategory = categoryNames[0] ?? '';

    const mapMini = (p: Product) => ({
      id: p.id,
      name: p.name,
      image: p.details?.images?.[0] ?? null,
      price: p.offerPrice,
    });

    return {
      summary: {
        totalUnitsSold: currentUnits,
        totalRevenue: currentRevenue,
        lastSaleDate: current?.lastsale || current?.lastSale || null,
        comparison: {
          unitsSoldChangePct: Number(unitsChange.toFixed(2)),
          revenueChangePct: Number(revenueChange.toFixed(2)),
        },
      },

      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        brand: product.brand,
        clinicalDescription: product.clinicalDescription,

        images: product.details?.images || [],
        badges: product.details?.frontendBadges || [],

        organization: {
          availability: product.stockQuantity > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
          department: primaryCategory,
        },

        clinicalBenefits: product.details?.clinicalBenefits || [],
        technicalSpecifications: product.details?.technicalSpecifications || [],

        pricing: {
          publicPrice: product.actualPrice,
          memberPrice: product.offerPrice,
          bulkTiers: product.bulkPriceTiers,
        },

        inventory: {
          currentStock: product.stockQuantity,
          status:
            product.stockQuantity === 0
              ? 'OUT'
              : product.stockQuantity <= product.lowStockAlert
                ? 'LOW'
                : 'OPTIMAL',
        },

        crossSell: {
          frequentlyBoughtTogether: crossProducts
            .filter((p) =>
              (product.details?.frequentlyBoughtTogether || []).includes(p.id),
            )
            .map(mapMini),

          bundleUpsells: crossProducts
            .filter((p) =>
              (product.details?.bundleUpsells || []).includes(p.id),
            )
            .map(mapMini),
        },
      },
    };
  }

  async findAll(query: GetProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.productsRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.details', 'details');

    const countsRaw = await this.productsRepo
      .createQueryBuilder('p')
      .select([
        'COUNT(*) AS all',
        `COUNT(*) FILTER (WHERE p.isActive = true) AS active`,
        `COUNT(*) FILTER (WHERE p.isActive = false) AS draft`,
        `COUNT(*) FILTER (WHERE p.stockQuantity = 0) AS out_of_stock`,
        `COUNT(*) FILTER (WHERE p.stockQuantity > 0 AND p.stockQuantity <= p.lowStockAlert) AS low_stock`,
      ])
      .getRawOne();

    if (query.tab === 'active') {
      qb.andWhere('p.isActive = :isActive', { isActive: true });
    }

    if (query.tab === 'draft') {
      qb.andWhere('p.isActive = :isActive', { isActive: false });
    }

    if (query.tab === 'out_of_stock') {
      qb.andWhere('p.stockQuantity = 0');
    }

    if (query.tab === 'low_stock') {
      qb.andWhere('p.stockQuantity > 0');
      qb.andWhere('p.stockQuantity <= p.lowStockAlert');
    }

    const requestedCategoryNames = [
      ...(query.categoryNames ?? []),
      ...(query.category &&
      query.category.trim() &&
      query.category.trim().toLowerCase() !== 'all'
        ? [query.category]
        : []),
    ]
      .map((name) => name.trim())
      .filter(Boolean);

    if (requestedCategoryNames.length > 0) {
      const categoryQb = this.categoriesRepo.createQueryBuilder('c');

      requestedCategoryNames.forEach((name, index) => {
        categoryQb.orWhere(`LOWER(c.name) LIKE :name${index}`, {
          [`name${index}`]: `%${name.toLowerCase()}%`,
        });
      });

      const categories = await categoryQb.getMany();
      const categoryIds = categories.map((c) => c.id);

      if (categoryIds.length > 0) {
        qb.andWhere('p.categoryId && :categoryIds', { categoryIds });
      } else {
        qb.andWhere('1 = 0');
      }
    }

    if (query.tagNames && query.tagNames.length > 0) {
      qb.andWhere('p.tags && :tagNames', {
        tagNames: query.tagNames,
      });
    }

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

    const allCategoryIds = [
      ...new Set(entities.flatMap((p) => p.categoryId || [])),
    ];

    const categoryMap = await this.getProductCategoryMapByIds(allCategoryIds);

    const items = entities.map((p) => {
      const categoryDetails = (p.categoryId || [])
        .map((id) => categoryMap.get(id))
        .filter(Boolean)
        .map((c) => ({
          id: c!.id,
          name: c!.name,
        }));

      const categoryNames = categoryDetails.map((c) => c.name);

      return {
        id: p.id,
        name: p.name,
        clinicalDescription: p.clinicalDescription,
        brand: p.brand,
        sku: p.sku,
        barcode: p.barcode,
        categoryIds: p.categoryId || [],
        categories: categoryNames,
        // categoryDetails,
        categoryLabel: categoryNames.join(', '),
        tags: p.tags,
        actualPrice: p.actualPrice,
        offerPrice: p.offerPrice,
        bulkPriceTiers: p.bulkPriceTiers,
        stockQuantity: p.stockQuantity,
        lowStockAlert: p.lowStockAlert,
        backorder: p.backorder,
        isActive: p.isActive,
        photo: p.details?.images?.[0] ?? null,
        frontendBadges: p.details?.frontendBadges || [],
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

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
        draft: Number(countsRaw?.draft ?? 0),
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

    if (dto.categoryId !== undefined) {
      await this.validateProductCategoryIds(dto.categoryId);
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
    const categories = await this.categoriesRepo.find({
      order: { name: 'ASC' },
    });

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

    const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))];

    const prices = products.map(
      (p) => Number(p.offerPrice) || Number(p.actualPrice) || 0,
    );

    const priceRange = {
      min: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0,
    };

    const categoriesWithCount = categories.map((category) => {
      const productCount = products.filter((p) =>
        (p.categoryId || []).includes(category.id),
      ).length;

      return {
        id: category.id,
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

  async findAllPublic(query: ListProductsPublicQueryDto) {
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 12;
      const skip = (page - 1) * limit;

      const qb = this.productsRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.details', 'details')
        .where('p.isActive = :isActive', { isActive: true });

      if (query.search && query.search.trim()) {
        const s = `%${query.search.trim().toLowerCase()}%`;
        qb.andWhere(
          `(
          LOWER(p.name) LIKE :s
          OR LOWER(p.sku) LIKE :s
          OR LOWER(COALESCE(p.clinicalDescription, '')) LIKE :s
        )`,
          { s },
        );
      }

      if (query.categoryIds && query.categoryIds.length > 0) {
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        const validCategoryIds = query.categoryIds.filter((id) =>
          uuidRegex.test(id),
        );

        if (validCategoryIds.length > 0) {
          qb.andWhere('p.categoryId && :categoryIds', {
            categoryIds: validCategoryIds,
          });
        }
      }

      if (query.brands && query.brands.length > 0) {
        qb.andWhere('p.brand IN (:...brands)', { brands: query.brands });
      }

      const effectivePrice = (p: Product) => {
        const offer = Number(p.offerPrice ?? 0);
        const actual = Number(p.actualPrice ?? 0);
        return offer > 0 ? offer : actual;
      };

      if (query.minPrice) {
        const minPrice = Number(query.minPrice);
        qb.andWhere(
          `
        COALESCE(
          NULLIF(CAST(p."offerPrice" AS NUMERIC), 0),
          CAST(p."actualPrice" AS NUMERIC)
        ) >= :minPrice
        `,
          { minPrice },
        );
      }

      if (query.maxPrice) {
        const maxPrice = Number(query.maxPrice);
        qb.andWhere(
          `
        COALESCE(
          NULLIF(CAST(p."offerPrice" AS NUMERIC), 0),
          CAST(p."actualPrice" AS NUMERIC)
        ) <= :maxPrice
        `,
          { maxPrice },
        );
      }

      // Fetch all matched rows first, then sort safely in JS
      const products = await qb.getMany();

      switch (query.sortBy) {
        case 'price-asc':
          products.sort((a, b) => effectivePrice(a) - effectivePrice(b));
          break;

        case 'price-desc':
          products.sort((a, b) => effectivePrice(b) - effectivePrice(a));
          break;

        case 'name-asc':
          products.sort((a, b) => a.name.localeCompare(b.name));
          break;

        case 'name-desc':
          products.sort((a, b) => b.name.localeCompare(a.name));
          break;

        case 'newest':
        default:
          products.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );
          break;
      }

      const total = products.length;
      const paginatedProducts = products.slice(skip, skip + limit);

      const categoryIds = [
        ...new Set(paginatedProducts.flatMap((p) => p.categoryId || [])),
      ];

      let categoryMap = new Map<string, string>();

      if (categoryIds.length > 0) {
        const categories = await this.categoriesRepo.findBy({
          id: In(categoryIds),
        });
        categoryMap = new Map(categories.map((c) => [c.id, c.name]));
      }

      const items = paginatedProducts.map((p) => {
        const categoryDetails = (p.categoryId || [])
          .map((id) => ({
            id,
            name: categoryMap.get(id) ?? '',
          }))
          .filter((c) => c.name);

        return {
          id: p.id,
          photo: p.details?.images?.[0] || null,
          category: categoryDetails.map((c) => c.name).join(', '),
          categoryIds: p.categoryId || [],
          categories: categoryDetails.map((c) => c.name),
          categoryDetails,
          title: p.name,
          description: p.clinicalDescription,
          price: p.actualPrice,
          discountedPrice: p.offerPrice,
          brand: p.brand,
          inStock: p.stockQuantity > 0,
          badge:
            p.details?.frontendBadges?.[0]?.toUpperCase().replace(/-/g, ' ') ||
            null,
        };
      });

      return {
        items,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
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

    const categoryMap = await this.getProductCategoryMapByIds(
      product.categoryId ?? [],
    );

    const categories = (product.categoryId ?? [])
      .map((catId) => categoryMap.get(catId))
      .filter(Boolean)
      .map((c) => ({
        id: c!.id,
        name: c!.name,
      }));

    const ratingResult = await this.reviewsRepo
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'averageRating')
      .addSelect('COUNT(r.id)', 'reviewsCount')
      .where('r.productId = :productId', { productId: id })
      .andWhere('r.status = :status', { status: ReviewStatus.APPROVED })
      .getRawOne();

    const rating = {
      average: ratingResult.averageRating
        ? parseFloat(parseFloat(ratingResult.averageRating).toFixed(1))
        : 0,
      count: parseInt(ratingResult.reviewsCount, 10) || 0,
    };

    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      sku: product.sku,
      clinicalDescription: product.clinicalDescription,
      categories,
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
      rating,
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
        availableQuantity: product.stockQuantity,
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
