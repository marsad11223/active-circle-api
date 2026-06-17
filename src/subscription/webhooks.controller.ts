import { Body, Controller, Post } from '@nestjs/common';
import { IapSubscriptionService } from './iap-subscription.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly iapSubscriptionService: IapSubscriptionService,
  ) {}

  @Post('apple')
  async handleApple(@Body() body: { signedPayload?: string }) {
    return this.iapSubscriptionService.handleAppleWebhook(body);
  }

  @Post('google')
  async handleGoogle(@Body() body: Record<string, unknown>) {
    return this.iapSubscriptionService.handleGoogleWebhook(body);
  }
}
