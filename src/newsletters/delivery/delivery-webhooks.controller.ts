import { Body, Controller, Headers, Post } from '@nestjs/common';
import { DeliveryWebhookService } from './delivery-webhook.service';

@Controller('webhooks/newsletters')
export class DeliveryWebhooksController {
  constructor(
    private readonly deliveryWebhookService: DeliveryWebhookService,
  ) {}

  @Post('events')
  ingestEvents(
    @Body() payload: unknown,
    @Headers('x-provider-signature') signature?: string,
    @Headers('x-provider') provider?: string,
  ): Promise<Record<string, unknown>> {
    return this.deliveryWebhookService.ingestProviderEvents({
      provider: provider ?? 'UNKNOWN',
      signature: signature ?? null,
      payload,
    });
  }
}
