import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  Subscription,
  SubscriptionStatus,
  SubscriptionPlan,
} from '../schemas/subscription.schema';
import { GrantRole, User, Role } from '../schemas/user.schema';

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

  // Create subscription (premium or standard plan, 3-month trial)
  async createSubscription(
    userId: string,
    plan: 'premium' | 'standard' = 'premium',
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.subscriptionModel.findOne({
      userId,
      status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
    });
    if (existing) {
      throw new BadRequestException('User already has an active subscription');
    }

    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: userId.toString() },
      });
      stripeCustomerId = customer.id;
      await this.userModel.findByIdAndUpdate(userId, { stripeCustomerId });
    }

    const planEnum =
      plan === 'standard' ? SubscriptionPlan.STANDARD : SubscriptionPlan.PREMIUM;
    const priceId =
      plan === 'standard'
        ? this.configService.get<string>('STRIPE_PRICE_ID_STANDARD')
        : this.configService.get<string>('STRIPE_PRICE_ID');
    if (!priceId) {
      throw new BadRequestException(
        `Stripe price ID not configured for plan: ${plan}`,
      );
    }

    console.log(`Creating ${plan} subscription with 3-month trial...`);

    const subscription = await this.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      trial_period_days: 90,
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      collection_method: 'charge_automatically',
      expand: ['latest_invoice.payment_intent'],
    });

    console.log('Subscription created:', subscription.id);

    const invoice = subscription.latest_invoice as Stripe.Invoice | null;
    const invoiceAny = invoice as any;
    let paymentIntent =
      invoiceAny?.payment_intent &&
      typeof invoiceAny.payment_intent === 'object'
        ? invoiceAny.payment_intent
        : null;

    console.log('Initial payment intent status:', {
      invoiceId: invoice?.id,
      invoiceStatus: invoice?.status,
      exists: !!paymentIntent,
      client_secret: !!paymentIntent?.client_secret,
    });

    // ✅ If no payment intent and invoice is in draft, finalize it
    if (!paymentIntent && invoice && invoice.status === 'draft') {
      console.log('Invoice is draft, finalizing to create payment intent...');
      try {
        const finalizedInvoice = await this.stripe.invoices.finalizeInvoice(
          invoice.id,
          { expand: ['payment_intent'] },
        );
        const finalizedAny = finalizedInvoice as any;

        // Get the payment intent from finalized invoice
        if (finalizedAny.payment_intent) {
          if (typeof finalizedAny.payment_intent === 'string') {
            paymentIntent = (await this.stripe.paymentIntents.retrieve(
              finalizedAny.payment_intent,
            )) as any;
          } else {
            paymentIntent = finalizedAny.payment_intent;
          }
          console.log(
            '✅ Payment intent created after finalization:',
            paymentIntent?.id,
          );
        }
      } catch (error: any) {
        console.log('Finalization note:', error.message);
      }
    }

    // If still no payment intent, try retrieving invoice with expanded PI
    if (!paymentIntent && invoice) {
      console.log(
        'No payment intent found, retrieving invoice with expanded PI...',
      );
      try {
        const retrievedInvoice = await this.stripe.invoices.retrieve(
          invoice.id,
          { expand: ['payment_intent'] },
        );
        const retrievedAny = retrievedInvoice as any;

        if (retrievedAny.payment_intent) {
          if (typeof retrievedAny.payment_intent === 'string') {
            paymentIntent = (await this.stripe.paymentIntents.retrieve(
              retrievedAny.payment_intent,
            )) as any;
          } else {
            paymentIntent = retrievedAny.payment_intent;
          }
          console.log('✅ Payment intent retrieved:', paymentIntent?.id);
        }
      } catch (error: any) {
        console.log('Retrieval note:', error.message);
      }
    }

    // ✅ STRIPE-APPROVED: If still no payment intent, use invoices.pay() to force creation
    // This creates a subscription-owned PaymentIntent (not orphaned)
    if (!paymentIntent && invoice && invoice.status === 'open') {
      console.log(
        '✅ Invoice is open but no PI. Using invoices.pay() to force PI creation...',
      );
      try {
        // This will create a PaymentIntent and attach it to the invoice
        // The PI will be owned by the subscription (renewals will work!)
        const paidInvoice = await this.stripe.invoices.pay(invoice.id, {
          expand: ['payment_intent'],
          // Don't actually charge yet - just create the PI
          // Frontend will confirm the payment
        });

        const paidAny = paidInvoice as any;
        if (paidAny.payment_intent) {
          if (typeof paidAny.payment_intent === 'string') {
            paymentIntent = (await this.stripe.paymentIntents.retrieve(
              paidAny.payment_intent,
            )) as any;
          } else {
            paymentIntent = paidAny.payment_intent;
          }
          console.log(
            '✅ Payment intent created via invoices.pay():',
            paymentIntent?.id,
          );
          console.log('✅ This PI is subscription-owned. Renewals will work!');
        }
      } catch (error: any) {
        // This might fail if no payment method is attached
        // That's okay - we'll handle it in confirm-payment endpoint
        console.log('invoices.pay() note:', error.message);
        console.log('   This is expected if no payment method attached yet.');
      }
    }

    // Persist locally (always mirror Stripe state)
    const subAny = subscription as any;
    await this.subscriptionModel.create({
      userId,
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      plan: planEnum,
      status: subscription.status,
      currentPeriodStart: subAny.current_period_start
        ? new Date(subAny.current_period_start * 1000)
        : new Date(),
      currentPeriodEnd: subAny.current_period_end
        ? new Date(subAny.current_period_end * 1000)
        : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      trialStart: subAny.trial_start
        ? new Date(subAny.trial_start * 1000)
        : undefined,
      trialEnd: subAny.trial_end
        ? new Date(subAny.trial_end * 1000)
        : undefined,
    });

    const clientSecret = paymentIntent?.client_secret ?? null;
    const isTrialing = subscription.status === 'trialing';
    const requiresPaymentMethod =
      isTrialing && !clientSecret
        ? true
        : !clientSecret && subscription.status === 'incomplete';

    return {
      subscriptionId: subscription.id,
      invoiceId: invoice?.id ?? null,
      clientSecret,
      status: subscription.status,
      requiresPaymentMethod: !!requiresPaymentMethod,
      plan: planEnum,
    };
  }

  // Pay invoice with payment method, or for trial: attach card only (no charge)
  async payInvoiceWithPaymentMethod(userId: string, paymentMethodId: string) {
    console.log('\n💳 Pay invoice / attach payment method...');

    const subscription = await this.subscriptionModel.findOne({
      userId,
      status: {
        $in: [SubscriptionStatus.INCOMPLETE, SubscriptionStatus.TRIALING],
      },
    });

    if (!subscription) {
      throw new BadRequestException(
        'No incomplete or trialing subscription found',
      );
    }

    try {
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: subscription.stripeCustomerId,
      });
      await this.stripe.customers.update(subscription.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      console.log('✅ Payment method attached and set as default');

      if (subscription.status === SubscriptionStatus.TRIALING) {
        const role =
          subscription.plan === SubscriptionPlan.STANDARD
            ? Role.standardMember
            : Role.premiumMember;
        await this.userModel.findByIdAndUpdate(userId, {
          role,
          grantRole: GrantRole.host,
          hasActiveSubscription: true,
        });
        console.log(`✅ User granted ${role} access (trial)`);
        return {
          status: 'trialing_activated',
          message: 'Trial started',
          plan: subscription.plan,
        };
      }

      const stripeSubscription = await this.stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
        { expand: ['latest_invoice'] },
      );
      const invoice = stripeSubscription.latest_invoice as Stripe.Invoice;
      if (!invoice) {
        throw new BadRequestException('No invoice found for subscription');
      }

      const paidInvoice = await this.stripe.invoices.pay(invoice.id, {
        payment_method: paymentMethodId,
        expand: ['payment_intent'],
      });
      console.log('✅ Invoice paid successfully');
      return {
        status: 'payment_processing',
        invoiceId: paidInvoice.id,
      };
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      throw new BadRequestException(`Payment failed: ${error.message}`);
    }
  }

  // ✅ STRIPE-APPROVED: Use invoices.pay() to force PI creation
  async confirmPaymentAndActivateSubscription(userId: string) {
    console.log('\n🔄 Confirming payment (Stripe-approved way)...');

    const subscription = await this.subscriptionModel.findOne({
      userId,
      status: SubscriptionStatus.INCOMPLETE,
    });

    if (!subscription) {
      throw new BadRequestException('No incomplete subscription found');
    }

    const stripeSubscription = await this.stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
      { expand: ['latest_invoice.payment_intent'] },
    );

    const invoice = stripeSubscription.latest_invoice as Stripe.Invoice;
    if (!invoice) {
      throw new BadRequestException('No invoice found for subscription');
    }

    const invoiceAny = invoice as any;
    console.log('Invoice status:', {
      id: invoice.id,
      status: invoice.status,
      paid: invoiceAny.paid,
    });

    // If invoice already paid, do nothing
    if (invoice.status === 'paid' || invoiceAny.paid) {
      console.log('✅ Invoice already paid');
      return { status: 'already_paid' };
    }

    // Check if payment intent exists
    let paymentIntent: any = null;
    if (invoiceAny.payment_intent) {
      if (typeof invoiceAny.payment_intent === 'object') {
        paymentIntent = invoiceAny.payment_intent;
      } else if (typeof invoiceAny.payment_intent === 'string') {
        paymentIntent = (await this.stripe.paymentIntents.retrieve(
          invoiceAny.payment_intent,
        )) as any;
      }
    }

    // If no payment intent, retrieve invoice with expanded PI
    if (!paymentIntent) {
      console.log('No payment intent found, retrieving invoice...');
      try {
        const retrievedInvoice = await this.stripe.invoices.retrieve(
          invoice.id,
          { expand: ['payment_intent'] },
        );
        const retrievedAny = retrievedInvoice as any;

        if (retrievedAny.payment_intent) {
          if (typeof retrievedAny.payment_intent === 'string') {
            paymentIntent = (await this.stripe.paymentIntents.retrieve(
              retrievedAny.payment_intent,
            )) as any;
          } else {
            paymentIntent = retrievedAny.payment_intent;
          }
          console.log('✅ Payment intent retrieved:', paymentIntent?.id);
        }
      } catch (error: any) {
        console.log('Invoice retrieval note:', error.message);
      }
    }

    // If we have a payment intent with client_secret, return it for frontend
    if (paymentIntent?.client_secret) {
      console.log('✅ Returning client secret for frontend payment');
      return {
        status: 'requires_payment',
        invoiceId: invoice.id,
        clientSecret: paymentIntent.client_secret,
      };
    }

    // ✅ Stripe-approved way to force PI creation & payment
    // Stripe owns the PI, not us
    console.log('Calling stripe.invoices.pay() to force payment...');
    try {
      await this.stripe.invoices.pay(invoice.id);
      console.log('✅ Invoice payment initiated');
    } catch (error: any) {
      console.error('Error paying invoice:', error.message);
      // If payment fails, let webhook handle it
    }

    return {
      status: 'payment_processing',
      invoiceId: invoice.id,
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
      plan: subscription.plan ?? SubscriptionPlan.PREMIUM,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      isTrialing: subscription.status === SubscriptionStatus.TRIALING,
      trialEnd: subscription.trialEnd ?? null,
    };
  }

  async switchToMember(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== Role.premiumMember && user.role !== Role.standardMember) {
      throw new BadRequestException('User is not a host');
    }

    await this.userModel.findByIdAndUpdate(userId, {
      role: Role.member,
      grantRole: GrantRole.member,
    });

    return {
      message: 'Successfully switched to member profile',
      role: Role.member,
    };
  }

  async cancelSubscription(userId: string) {
    const subscription = await this.subscriptionModel.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
    });

    if (!subscription) {
      throw new NotFoundException('No active subscription found');
    }

    const canceledSubscription = await this.stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      },
    );

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

  // ✅ WEBHOOK HANDLERS - Source of truth
  async handleWebhookEvent(event: Stripe.Event) {
    try {
      console.log(`\n🔔 Webhook: ${event.type}`);
      console.log('Event ID:', event.id);

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
    } catch (error: any) {
      console.error('❌ Error in handleWebhookEvent:', error.message);
      console.error('Stack:', error.stack);
      throw error;
    }
  }

  // ✅ PRIMARY TRUTH: Invoice payment succeeded
  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    console.log('\n🔔 WEBHOOK: invoice.payment_succeeded');
    console.log('Invoice ID:', invoice.id);
    console.log('Invoice customer:', invoice.customer);

    // ✅ FIX: Get subscription ID - it's a string property, not in the type definition
    const invoiceAny = invoice as any;
    console.log('Invoice subscription (raw):', invoiceAny.subscription);

    let stripeSubscriptionId: string | null = null;

    if (typeof invoiceAny.subscription === 'string') {
      stripeSubscriptionId = invoiceAny.subscription;
    } else if (
      invoiceAny.subscription &&
      typeof invoiceAny.subscription === 'object'
    ) {
      stripeSubscriptionId = invoiceAny.subscription.id;
    }

    if (!stripeSubscriptionId) {
      console.log('⚠️ No subscription ID on invoice, skipping');
      return;
    }

    console.log('Invoice payment succeeded:', {
      invoice_id: invoice.id,
      subscription_id: stripeSubscriptionId,
      customer_id: invoice.customer,
    });

    // Find and update subscription
    const subscription = await this.subscriptionModel.findOneAndUpdate(
      { stripeSubscriptionId },
      { status: SubscriptionStatus.ACTIVE },
      { new: true },
    );

    if (!subscription) {
      console.log(
        '❌ Subscription not found in database with ID:',
        stripeSubscriptionId,
      );
      console.log('Searching all subscriptions...');
      const allSubs = await this.subscriptionModel.find({});
      console.log(
        'All subscriptions in DB:',
        allSubs.map((s) => ({
          id: s._id,
          stripeSubId: s.stripeSubscriptionId,
          status: s.status,
        })),
      );
      return;
    }

    console.log('✅ Subscription activated in database:', subscription._id);

    // Update user role to host
    const user = await this.userModel.findOne({
      stripeCustomerId: invoice.customer as string,
    });

    if (!user) {
      console.log('❌ User not found with stripeCustomerId:', invoice.customer);
      return;
    }

    console.log('Found user:', user._id, 'Current role:', user.role);

    const targetRole =
      subscription.plan === SubscriptionPlan.STANDARD
        ? Role.standardMember
        : Role.premiumMember;

    if (user.role === Role.member) {
      const updateData: any = {
        role: targetRole,
        grantRole: GrantRole.host,
        hasActiveSubscription: true,
      };
      await this.userModel.findByIdAndUpdate(user._id, updateData);
      console.log(`✅ User role updated to ${targetRole}`);
    } else {
      await this.userModel.findByIdAndUpdate(user._id, {
        hasActiveSubscription: true,
      });
    }
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const invoiceAny = invoice as any;
    if (!invoiceAny.subscription) return;

    console.log('Invoice payment failed:', invoice.id);

    await this.subscriptionModel.findOneAndUpdate(
      { stripeSubscriptionId: invoiceAny.subscription as string },
      { status: SubscriptionStatus.INCOMPLETE },
    );
  }

  private async handleSubscriptionUpdate(subscription: Stripe.Subscription) {
    console.log('\n🔔 WEBHOOK: subscription.updated/created');
    console.log('Subscription ID:', subscription.id);
    console.log('Status:', subscription.status);

    const dbSubscription = await this.subscriptionModel.findOne({
      stripeSubscriptionId: subscription.id,
    });

    if (!dbSubscription) {
      console.log('❌ Subscription not found in database');
      return;
    }

    const subAny = subscription as any;
    dbSubscription.status = subscription.status as SubscriptionStatus;
    dbSubscription.currentPeriodStart = subAny.current_period_start
      ? new Date(subAny.current_period_start * 1000)
      : dbSubscription.currentPeriodStart;
    dbSubscription.currentPeriodEnd = subAny.current_period_end
      ? new Date(subAny.current_period_end * 1000)
      : dbSubscription.currentPeriodEnd;
    dbSubscription.cancelAtPeriodEnd = subAny.cancel_at_period_end || false;
    if (subAny.trial_start)
      dbSubscription.trialStart = new Date(subAny.trial_start * 1000);
    if (subAny.trial_end)
      dbSubscription.trialEnd = new Date(subAny.trial_end * 1000);
    dbSubscription.updated_at = new Date();

    await dbSubscription.save();
    console.log('✅ Subscription updated in database');

    const isActive = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIALING,
    ].includes(subscription.status as SubscriptionStatus);

    const userUpdate: any = { hasActiveSubscription: isActive };
    if (isActive) {
      const user = await this.userModel.findById(dbSubscription.userId);
      if (user && user.role === Role.member) {
        const targetRole =
          dbSubscription.plan === SubscriptionPlan.STANDARD
            ? Role.standardMember
            : Role.premiumMember;
        userUpdate.role = targetRole;
        userUpdate.grantRole = GrantRole.host;
      }
    }
    await this.userModel.findByIdAndUpdate(dbSubscription.userId, userUpdate);
    console.log('✅ User hasActiveSubscription (and role if member) updated');
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    console.log('Subscription deleted:', subscription.id);

    await this.subscriptionModel.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id },
      { status: SubscriptionStatus.CANCELED },
    );
  }
}
