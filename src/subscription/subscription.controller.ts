import {
  Controller,
  Post,
  Get,
  Delete,
  UseGuards,
  Headers,
  Req,
  BadRequestException,
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
  async createSubscription(
    @GetUser() user: any,
    @Req() req: { body?: { plan?: 'premium' | 'standard' } },
  ) {
    const plan = req.body?.plan ?? 'premium';
    return this.subscriptionService.createSubscription(user._id, plan);
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
  async confirmPayment(@GetUser() user: any) {
    // ✅ Stripe-approved: No payment intent ID needed
    // Just trigger invoices.pay() which creates PI if needed
    return this.subscriptionService.confirmPaymentAndActivateSubscription(
      user._id,
    );
  }

  @Post('pay-with-payment-method')
  @UseGuards(JwtAuthGuard)
  async payWithPaymentMethod(@GetUser() user: any, @Req() request: any) {
    const { paymentMethodId } = request.body;

    if (!paymentMethodId) {
      throw new BadRequestException('Payment method ID is required');
    }

    return this.subscriptionService.payInvoiceWithPaymentMethod(
      user._id,
      paymentMethodId,
    );
  }

  @Post('upgrade')
  @UseGuards(JwtAuthGuard)
  async upgradeSubscription(@GetUser() user: any) {
    return this.subscriptionService.upgradeSubscription(user._id);
  }

  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() request: RawBodyRequest<Request>,
  ) {
    console.log('\n🔔 WEBHOOK RECEIVED');
    console.log('Signature present:', !!signature);
    console.log('Request has rawBody:', !!request.rawBody);
    console.log('RawBody type:', typeof request.rawBody);
    console.log('RawBody length:', request.rawBody?.length);

    if (!signature) {
      console.error('❌ No signature');
      throw new BadRequestException('Missing stripe-signature header');
    }

    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (!webhookSecret) {
      console.error('❌ No webhook secret configured');
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET is not configured');
    }

    if (!request.rawBody) {
      console.error('❌ No raw body');
      throw new BadRequestException('Missing raw body');
    }

    console.log('About to construct event...');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        request.rawBody,
        signature,
        webhookSecret,
      );
      console.log('✅ Webhook signature verified');
      console.log('Event type:', event.type);
      console.log('Event ID:', event.id);
    } catch (err: any) {
      console.error('❌ Webhook signature verification failed:', err.message);
      console.error('Error stack:', err.stack);
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    console.log('About to call handleWebhookEvent...');
    try {
      await this.subscriptionService.handleWebhookEvent(event);
      console.log('✅ Webhook processed successfully');
    } catch (error: any) {
      console.error('❌ Error processing webhook:', error.message);
      console.error('Error stack:', error.stack);
      throw error;
    }

    return { received: true };
  }
}
