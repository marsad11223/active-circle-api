import {
  Controller,
  Post,
  Get,
  Delete,
  UseGuards,
  Headers,
  Req,
  BadRequestException,
  Param,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/GetUser.Decorator';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Role } from '../schemas/user.schema';

@Controller('subscription')
export class SubscriptionController {
  private stripe: Stripe;

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private configService: ConfigService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is not defined in environment variables',
      );
    }
    this.stripe = new Stripe(stripeSecretKey);
  }

  @Post('create')
  @UseGuards(JwtAuthGuard)
  async createSubscription(@GetUser() user: any) {
    return this.subscriptionService.createSubscription(user._id);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getSubscriptionStatus(@GetUser() user: any) {
    return this.subscriptionService.getSubscriptionStatus(user._id);
  }

  @Post('switch-to-member')
  @UseGuards(JwtAuthGuard)
  async switchToMember(@GetUser() user: any) {
    return await this.subscriptionService.switchToMember(user._id);
  }

  @Delete('cancel')
  @UseGuards(JwtAuthGuard)
  async cancelSubscription(
    @GetUser() user: any,
    @Query('hostId') hostId?: string,
  ) {
    const targetId = hostId ? hostId : user._id;

    // Only superAdmin can cancel other hosts' subscriptions
    if (hostId && user.role !== Role.superAdmin) {
      throw new ForbiddenException(
        'You are not allowed to cancel this subscription',
      );
    }

    return this.subscriptionService.cancelSubscription(targetId);
  }

  @Post('confirm-payment')
  @UseGuards(JwtAuthGuard)
  async confirmPayment(@GetUser() user: any, @Req() request: any) {
    const { paymentIntentId } = request.body;
    if (!paymentIntentId) {
      throw new BadRequestException('paymentIntentId is required');
    }
    return this.subscriptionService.confirmPaymentAndActivateSubscription(
      user._id,
      paymentIntentId,
    );
  }

  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() request: RawBodyRequest<Request>,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (!webhookSecret) {
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET is not configured');
    }

    if (!request.rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        request.rawBody,
        signature,
        webhookSecret,
      );
    } catch (err: any) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    await this.subscriptionService.handleWebhookEvent(event);

    return { received: true };
  }
}
