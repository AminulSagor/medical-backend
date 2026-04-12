import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { Product } from '../products/entities/product.entity';
import { AddToCartDto } from './dto/add-to-cart.dto';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  private async getOrCreateCart(userId: string): Promise<Cart> {
    let cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) {
      cart = this.cartRepo.create({ userId });
      cart = await this.cartRepo.save(cart);
    }
    return cart;
  }

  async addToCart(userId: string, dto: AddToCartDto) {
    // 1. Verify the product exists and is active
    const product = await this.productRepo.findOne({
      where: { id: dto.productId, isActive: true },
      relations: ['details'],
    });

    if (!product) {
      throw new NotFoundException(
        'Product not found or is currently inactive.',
      );
    }

    // 2. Get or create the user's cart
    const cart = await this.getOrCreateCart(userId);

    // 3. Check if the item is already in the cart
    let cartItem = await this.cartItemRepo.findOne({
      where: { cartId: cart.id, productId: dto.productId },
    });

    const newQuantity = cartItem
      ? cartItem.quantity + dto.quantity
      : dto.quantity;

    // 4. Verify Stock Availability
    if (!product.backorder && newQuantity > product.stockQuantity) {
      throw new BadRequestException(
        `Cannot add ${dto.quantity} to cart. Only ${product.stockQuantity} items left in stock.`,
      );
    }

    // 5. Save the Cart Item
    if (cartItem) {
      cartItem.quantity = newQuantity;
      await this.cartItemRepo.save(cartItem);
    } else {
      cartItem = this.cartItemRepo.create({
        cartId: cart.id,
        productId: dto.productId,
        quantity: dto.quantity,
      });
      await this.cartItemRepo.save(cartItem);
    }

    // 6. Return the updated cart summary
    return this.getCart(userId);
  }

  // Helper method to return the full cart with product details
  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);

    // If cart is empty, return empty structure
    if (!cart.items || cart.items.length === 0) {
      return {
        message: 'Cart retrieved successfully',
        data: {
          cartId: cart.id,
          items: [],
          summary: {
            subtotal: '0.00',
            totalItems: 0,
          },
        },
      };
    }

    // Fetch product details for items in the cart
    const productIds = cart.items.map((item) => item.productId);
    const products = await this.productRepo.find({
      where: productIds.map((id) => ({ id })),
      relations: ['details'],
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let totalItems = 0;

    const mappedItems = cart.items
      .map((item) => {
        const product = productMap.get(item.productId);

        // If product was deleted or became inactive after adding to cart
        if (!product) {
          return null;
        }

        const price = Number(product.offerPrice || product.actualPrice);
        const lineTotal = price * item.quantity;

        subtotal += lineTotal;
        totalItems += item.quantity;

        return {
          cartItemId: item.id,
          productId: product.id,
          name: product.name,
          sku: product.sku,
          imageUrl: product.details?.images?.[0] || null,
          unitPrice: price.toFixed(2),
          quantity: item.quantity,
          lineTotal: lineTotal.toFixed(2),
          inStock: product.stockQuantity >= item.quantity || product.backorder,
        };
      })
      .filter(Boolean); // Remove nulls if products were deleted

    return {
      message: 'Cart updated successfully',
      data: {
        cartId: cart.id,
        items: mappedItems,
        summary: {
          subtotal: subtotal.toFixed(2),
          totalItems,
        },
      },
    };
  }
}
