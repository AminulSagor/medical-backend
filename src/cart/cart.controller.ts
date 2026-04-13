import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CartService } from './cart.service';
import { AddToCartDto, ReorderDto } from './dto/add-to-cart.dto';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

@Controller('cart')
@UseGuards(AuthGuard('jwt')) // ✅ This enforces the sign-in requirement
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('add')
  addToCart(@Req() req: AuthenticatedRequest, @Body() dto: AddToCartDto) {
    // req.user.id comes from the decoded JWT token
    return this.cartService.addToCart(req.user.id, dto);
  }

  @Get()
  getCart(@Req() req: AuthenticatedRequest) {
    return this.cartService.getCart(req.user.id);
  }

  @Post('reorder')
  reorderPastOrder(@Req() req: AuthenticatedRequest, @Body() dto: ReorderDto) {
    // Use medicalEmail or email depending on your exact JWT payload
    const userEmail = req.user.medicalEmail;
    return this.cartService.reorderFromPastOrder(
      req.user.id,
      userEmail,
      dto.orderId,
    );
  }
}
