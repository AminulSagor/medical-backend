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
import { Order } from 'src/orders/entities/order.entity';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

  private async getOrCreateCart(userId: string): Promise<Cart> {
    let cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) {
      cart = this.cartRepo.create({ userId });
      cart = await this.cartRepo.save(cart);
    }
    return cart;
  }

  async clearCart(userId: string) {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (cart) {
      // Delete all items associated with this cart
      await this.cartItemRepo.delete({ cartId: cart.id });
    }
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

  async reorderFromPastOrder(
    userId: string,
    userEmail: string,
    orderId: string,
  ) {
    // 1. Verify the order exists and belongs to this user
    const order = await this.orderRepo.findOne({
      where: { id: orderId, customerEmail: userEmail },
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException('Order not found or access denied');
    }

    const cart = await this.getOrCreateCart(userId);
    let successfullyAddedCount = 0;

    // 2. Loop through past order items and intelligently add them to the cart
    for (const item of order.items) {
      if (!item.productId) continue;

      // Check if product is still active/exists
      const product = await this.productRepo.findOne({
        where: { id: item.productId, isActive: true },
      });

      if (!product) continue; // Skip discontinued products silently

      let cartItem = await this.cartItemRepo.findOne({
        where: { cartId: cart.id, productId: item.productId },
      });

      const newQuantity = cartItem
        ? cartItem.quantity + item.quantity
        : item.quantity;

      // 3. Stock Safety Check (Add as much as possible without failing the whole request)
      if (!product.backorder && newQuantity > product.stockQuantity) {
        const currentCartQty = cartItem ? cartItem.quantity : 0;
        const addableStock = product.stockQuantity - currentCartQty;

        if (addableStock > 0) {
          if (cartItem) {
            cartItem.quantity += addableStock;
            await this.cartItemRepo.save(cartItem);
          } else {
            await this.cartItemRepo.save(
              this.cartItemRepo.create({
                cartId: cart.id,
                productId: product.id,
                quantity: addableStock,
              }),
            );
          }
          successfullyAddedCount++;
        }
      } else {
        // Full stock available
        if (cartItem) {
          cartItem.quantity = newQuantity;
          await this.cartItemRepo.save(cartItem);
        } else {
          await this.cartItemRepo.save(
            this.cartItemRepo.create({
              cartId: cart.id,
              productId: product.id,
              quantity: item.quantity,
            }),
          );
        }
        successfullyAddedCount++;
      }
    }

    if (successfullyAddedCount === 0 && order.items.length > 0) {
      throw new BadRequestException(
        'None of the items from this order are currently available in stock.',
      );
    }

    // 4. Return the fully updated cart
    return this.getCart(userId);
  }
}
