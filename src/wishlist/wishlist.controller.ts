import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WishlistService } from './wishlist.service';
import { AddToWishlistDto } from './dto/wishlist.dto';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

@Controller('wishlist')
@UseGuards(AuthGuard('jwt'))
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Post('add')
  addToWishlist(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AddToWishlistDto,
  ) {
    return this.wishlistService.addToWishlist(req.user.id, dto.productId);
  }

  @Delete(':productId')
  removeFromWishlist(
    @Req() req: AuthenticatedRequest,
    @Param('productId') productId: string,
  ) {
    return this.wishlistService.removeFromWishlist(req.user.id, productId);
  }

  @Get()
  getWishlist(@Req() req: AuthenticatedRequest) {
    return this.wishlistService.getWishlist(req.user.id);
  }

  @Get('product-ids')
  getWishlistProductIds(@Req() req: AuthenticatedRequest) {
    return this.wishlistService.getWishlistProductIds(req.user.id);
  }
}
