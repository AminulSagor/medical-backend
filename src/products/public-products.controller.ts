import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ListProductsPublicQueryDto } from './dto/list-products-public.query.dto';
import { CartRequestDto } from './dto/cart.dto';

@Controller('public/products')
export class PublicProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ✅ Get filter options (categories, brands, price range)
  @Get('filters')
  async getFilters() {
    return this.productsService.getCategoriesWithProductCount();
  }

  // ✅ Alias for filters (backward compatibility)
  @Get('categories')
  async getCategories() {
    return this.productsService.getCategoriesWithProductCount();
  }

  // ✅ Get products with filters (category, brand, price range)
  @Get()
  async listProducts(@Query() query: ListProductsPublicQueryDto) {
    return this.productsService.findAllPublic(query);
  }

  // ✅ Get full product details by ID
  @Get(':id')
  async getProductDetails(@Param('id') id: string) {
    return this.productsService.getProductDetails(id);
  }

  // ✅ Calculate cart summary
  @Post('cart/calculate')
  async calculateCart(@Body() dto: CartRequestDto) {
    return this.productsService.calculateCart(dto);
  }
}
