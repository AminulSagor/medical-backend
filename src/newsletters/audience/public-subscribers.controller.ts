import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { SubscribersService } from './subscribers.service';
import {
  CompleteSubscriberProfileDto,
  PublicSubscribeDto,
} from './dto/public-subscribe.dto';

@Controller('public/newsletters/general')
export class PublicSubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @Post('subscribe')
  subscribe(@Body() dto: PublicSubscribeDto): Promise<Record<string, unknown>> {
    return this.subscribersService.publicSubscribe(dto);
  }

  @Patch('subscribe/:id/complete-profile')
  completeProfile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CompleteSubscriberProfileDto,
  ): Promise<Record<string, unknown>> {
    return this.subscribersService.completePublicSubscriberProfile(id, dto);
  }
}
