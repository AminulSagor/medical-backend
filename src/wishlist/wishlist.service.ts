import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WishlistItem } from './entities/wishlist-item.entity';
import { Product } from '../products/entities/product.entity';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem)
    private readonly wishlistRepo: Repository<WishlistItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async addToWishlist(userId: string, productId: string) {
    const product = await this.productRepo.findOne({
      where: { id: productId, isActive: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found or inactive');
    }

    const existing = await this.wishlistRepo.findOne({
      where: { userId, productId },
    });

    if (!existing) {
      const item = this.wishlistRepo.create({ userId, productId });
      await this.wishlistRepo.save(item);
    }

    return this.getWishlist(userId);
  }

  async removeFromWishlist(userId: string, productId: string) {
    await this.wishlistRepo.delete({ userId, productId });
    return this.getWishlist(userId);
  }

  async getWishlist(userId: string) {
    const items = await this.wishlistRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (items.length === 0) {
      return {
        message: 'Wishlist retrieved successfully',
        data: { items: [], totalItems: 0 },
      };
    }

    const productIds = items.map((i) => i.productId);
    const products = await this.productRepo.find({
      where: productIds.map((id) => ({ id })),
      relations: ['details'],
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const mappedItems = items
      .map((item) => {
        const product = productMap.get(item.productId);
        if (!product) return null;

        const price = Number(product.offerPrice || product.actualPrice);

        return {
          wishlistItemId: item.id,
          productId: product.id,
          name: product.name,
          sku: product.sku,
          imageUrl: product.details?.images?.[0] || null,
          price: price.toFixed(2),
          actualPrice: Number(product.actualPrice).toFixed(2),
          offerPrice: product.offerPrice
            ? Number(product.offerPrice).toFixed(2)
            : null,
          inStock:
            product.stockQuantity > 0 || product.backorder,
          stockQuantity: product.stockQuantity,
          addedAt: item.createdAt,
        };
      })
      .filter(Boolean);

    return {
      message: 'Wishlist retrieved successfully',
      data: {
        items: mappedItems,
        totalItems: mappedItems.length,
      },
    };
  }

  async getWishlistProductIds(userId: string): Promise<string[]> {
    const items = await this.wishlistRepo.find({
      where: { userId },
      select: ['productId'],
    });
    return items.map((i) => i.productId);
  }
}
