import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  Subscription,
  SubscriptionStatus,
} from '../schemas/subscription.schema';
import { User } from '../schemas/user.schema';

@Injectable()
export class SubscriptionService {
  private stripe: Stripe;

  constructor(
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<Subscription>,
    @InjectModel(User.name) private userModel: Model<User>,
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

  async createSubscription(userId: string) {
    // Check if user exists and is a host
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== 'host') {
      throw new BadRequestException('Only hosts can subscribe');
    }

    // Check if user already has an active subscription
    const existingSubscription = await this.subscriptionModel.findOne({
      userId,
      status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
    });

    if (existingSubscription) {
      throw new BadRequestException('User already has an active subscription');
    }

    // Create or get Stripe customer
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: userId.toString(), // Convert ObjectId to string for Stripe
        },
      });
      stripeCustomerId = customer.id;

      // Update user with Stripe customer ID
      await this.userModel.findByIdAndUpdate(userId, {
        stripeCustomerId,
      });
    }

    // Get the price ID from environment variables
    const priceId = this.configService.get<string>('STRIPE_PRICE_ID');
    if (!priceId) {
      throw new BadRequestException('Stripe price ID not configured');
    }

    // Create subscription
    const stripeSubscription = await this.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });

    console.log('Stripe subscription created:', {
      id: stripeSubscription.id,
      status: stripeSubscription.status,
      current_period_start: (stripeSubscription as any).current_period_start,
      current_period_end: (stripeSubscription as any).current_period_end,
    });

    // Save subscription to database
    // Extract dates safely from Stripe subscription
    const subscriptionData: any = stripeSubscription;
    const periodStart = subscriptionData.current_period_start;
    const periodEnd = subscriptionData.current_period_end;

    const newSubscription = new this.subscriptionModel({
      userId,
      stripeCustomerId,
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId: priceId,
      status: stripeSubscription.status,
      currentPeriodStart: periodStart
        ? new Date(periodStart * 1000)
        : new Date(),
      currentPeriodEnd: periodEnd
        ? new Date(periodEnd * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default to 30 days from now
    });

    await newSubscription.save();

    // Get client secret from the subscription
    let clientSecret: string | null = null;
    const invoice = stripeSubscription.latest_invoice as any;

    console.log('Invoice details:', {
      invoice_exists: !!invoice,
      invoice_type: typeof invoice,
      invoice_id: typeof invoice === 'object' ? invoice?.id : invoice,
    });

    if (invoice) {
      // Try to get payment intent from expanded invoice
      const paymentIntent = invoice.payment_intent;

      console.log('Payment Intent details:', {
        pi_exists: !!paymentIntent,
        pi_type: typeof paymentIntent,
        pi_value:
          typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id,
        has_client_secret: !!paymentIntent?.client_secret,
      });

      // If payment_intent is just an ID string, fetch it manually
      if (typeof paymentIntent === 'string') {
        console.log(
          'Payment intent not expanded, fetching manually:',
          paymentIntent,
        );
        const fetchedPaymentIntent =
          await this.stripe.paymentIntents.retrieve(paymentIntent);
        clientSecret = fetchedPaymentIntent.client_secret || null;
      } else if (paymentIntent?.client_secret) {
        // Payment intent was properly expanded
        clientSecret = paymentIntent.client_secret || null;
      } else if (typeof invoice === 'string') {
        // Invoice is just an ID, fetch it manually
        console.log('Invoice not expanded, fetching manually:', invoice);
        const fetchedInvoice: any =
          await this.stripe.invoices.retrieve(invoice);
        if (fetchedInvoice.payment_intent) {
          const fetchedPaymentIntent =
            await this.stripe.paymentIntents.retrieve(
              fetchedInvoice.payment_intent as string,
            );
          clientSecret = fetchedPaymentIntent.client_secret || null;
        }
      }
    }

    console.log('Final client secret:', clientSecret ? 'Found' : 'Not found');

    return {
      subscriptionId: stripeSubscription.id,
      clientSecret,
      status: stripeSubscription.status,
    };
  }

  async getSubscriptionStatus(userId: string) {
    const subscription = await this.subscriptionModel.findOne({ userId });

    if (!subscription) {
      return {
        hasSubscription: false,
        status: null,
      };
    }

    return {
      hasSubscription: true,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    };
  }

  async cancelSubscription(userId: string) {
    const subscription = await this.subscriptionModel.findOne({
      userId,
      status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
    });

    if (!subscription) {
      throw new NotFoundException('No active subscription found');
    }

    // Cancel subscription at period end
    const canceledSubscription = await this.stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      },
    );

    // Update database
    subscription.cancelAtPeriodEnd = true;
    subscription.updated_at = new Date();
    await subscription.save();

    return {
      message: 'Subscription will be canceled at the end of the billing period',
      cancelAt: canceledSubscription.cancel_at
        ? new Date(canceledSubscription.cancel_at * 1000)
        : null,
    };
  }

  async handleWebhookEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
        await this.handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleSubscriptionUpdate(subscription: Stripe.Subscription) {
    const dbSubscription = await this.subscriptionModel.findOne({
      stripeSubscriptionId: subscription.id,
    });

    if (!dbSubscription) {
      console.log('Subscription not found in database');
      return;
    }

    const subAny = subscription as any;
    dbSubscription.status = subscription.status as SubscriptionStatus;
    dbSubscription.currentPeriodStart = new Date(
      subAny.current_period_start * 1000,
    );
    dbSubscription.currentPeriodEnd = new Date(
      subAny.current_period_end * 1000,
    );
    dbSubscription.cancelAtPeriodEnd = subAny.cancel_at_period_end;
    dbSubscription.updated_at = new Date();
    await dbSubscription.save();

    // Update user subscription status
    const isActive = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIALING,
    ].includes(subscription.status as SubscriptionStatus);

    await this.userModel.findByIdAndUpdate(dbSubscription.userId, {
      hasActiveSubscription: isActive,
    });
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const dbSubscription = await this.subscriptionModel.findOne({
      stripeSubscriptionId: subscription.id,
    });

    if (!dbSubscription) {
      return;
    }

    dbSubscription.status = SubscriptionStatus.CANCELED;
    dbSubscription.updated_at = new Date();
    await dbSubscription.save();

    // Update user subscription status
    await this.userModel.findByIdAndUpdate(dbSubscription.userId, {
      hasActiveSubscription: false,
    });
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    const invoiceAny = invoice as any;
    if (!invoiceAny.subscription) {
      return;
    }

    const subscription = await this.subscriptionModel.findOne({
      stripeSubscriptionId: invoiceAny.subscription as string,
    });

    if (!subscription) {
      return;
    }

    // Update subscription status to active
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.updated_at = new Date();
    await subscription.save();

    // Update user subscription status
    await this.userModel.findByIdAndUpdate(subscription.userId, {
      hasActiveSubscription: true,
    });
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const invoiceAny = invoice as any;
    if (!invoiceAny.subscription) {
      return;
    }

    const subscription = await this.subscriptionModel.findOne({
      stripeSubscriptionId: invoiceAny.subscription as string,
    });

    if (!subscription) {
      return;
    }

    // Update subscription status
    subscription.status = SubscriptionStatus.PAST_DUE;
    subscription.updated_at = new Date();
    await subscription.save();

    // Update user subscription status
    await this.userModel.findByIdAndUpdate(subscription.userId, {
      hasActiveSubscription: false,
    });
  }
}
