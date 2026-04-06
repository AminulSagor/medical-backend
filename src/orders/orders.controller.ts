import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrdersService } from './orders.service';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { UpdateOrderDispatchDto } from './dto/update-order-dispatch.dto';
import { RefundOrderDto } from './dto/refund-order.dto';
import { PrintShippingLabelDto } from './dto/print-shipping-label.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Controller('admin/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('summary')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  getSummary() {
    return this.ordersService.getSummary();
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  list(@Query() query: ListOrdersQueryDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/dispatch')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  updateDispatch(@Param('id') id: string, @Body() dto: UpdateOrderDispatchDto) {
    return this.ordersService.updateDispatch(id, dto);
  }

  @Post(':id/refund')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  refund(@Param('id') id: string, @Body() dto: RefundOrderDto) {
    return this.ordersService.refund(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }

  @Post(':id/labels/print')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  generateLabel(@Param('id') id: string, @Body() dto: PrintShippingLabelDto) {
    return this.ordersService.generateShippingLabelMeta(id, dto);
  }

  @Get(':id/labels/print')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  async printLabel(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const pdf = await this.ordersService.buildShippingLabelPdf(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      download === '1'
        ? `attachment; filename="shipping-label-${id}.pdf"`
        : `inline; filename="shipping-label-${id}.pdf"`,
    );

    res.send(pdf);
  }
}
