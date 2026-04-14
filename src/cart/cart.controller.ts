import { Controller, Post, Get, Delete, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CartService } from './cart.service';
import { AddToCartDto, ReorderDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

@Controller('cart')
@UseGuards(AuthGuard('jwt'))
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('add')
  addToCart(@Req() req: AuthenticatedRequest, @Body() dto: AddToCartDto) {
    return this.cartService.addToCart(req.user.id, dto);
  }

  @Get()
  getCart(@Req() req: AuthenticatedRequest) {
    return this.cartService.getCart(req.user.id);
  }

  @Patch('update')
  updateCartItem(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateCartItem(
      req.user.id,
      dto.productId,
      dto.quantity,
    );
  }

  @Delete(':productId')
  removeCartItem(
    @Req() req: AuthenticatedRequest,
    @Param('productId') productId: string,
  ) {
    return this.cartService.removeCartItem(req.user.id, productId);
  }

  @Post('reorder')
  reorderPastOrder(@Req() req: AuthenticatedRequest, @Body() dto: ReorderDto) {
    const userEmail = req.user.medicalEmail;
    return this.cartService.reorderFromPastOrder(
      req.user.id,
      userEmail,
      dto.orderId,
    );
  }
}
