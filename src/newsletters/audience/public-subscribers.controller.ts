import { Body, Controller, Post } from '@nestjs/common';
import { SubscribersService } from './subscribers.service';
import { PublicSubscribeDto } from './dto/public-subscribe.dto';

@Controller('public/newsletters/general')
export class PublicSubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @Post('subscribe')
  subscribe(@Body() dto: PublicSubscribeDto): Promise<Record<string, unknown>> {
    return this.subscribersService.publicSubscribe(dto);
  }
}
