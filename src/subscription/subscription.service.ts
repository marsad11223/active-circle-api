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
import { User, Role } from '../schemas/user.schema';

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
    // Check if user exists
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Allow both members and hosts to subscribe
    // Note: Role will be updated to 'host' only after payment succeeds
    // Do NOT update role here - wait for payment confirmation

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
    // The expand parameter doesn't always work, so we fetch the invoice explicitly
    let clientSecret: string | null = null;
    const invoiceRef = stripeSubscription.latest_invoice as any;
    const invoiceId =
      typeof invoiceRef === 'string' ? invoiceRef : invoiceRef?.id;

    console.log('Invoice ID from subscription:', invoiceId);

    if (invoiceId) {
      try {
        // Explicitly retrieve the invoice with payment_intent expanded
        console.log(
          'Fetching invoice explicitly with payment_intent expanded...',
        );
        const invoice: any = await this.stripe.invoices.retrieve(invoiceId, {
          expand: ['payment_intent'],
        });

        console.log('Invoice retrieved:', {
          id: invoice.id,
          status: invoice.status,
          has_payment_intent: !!invoice.payment_intent,
          payment_intent_type: typeof invoice.payment_intent,
        });

        const paymentIntent = invoice.payment_intent;

        if (paymentIntent && typeof paymentIntent === 'object') {
          // Payment intent exists and is expanded
          clientSecret = paymentIntent.client_secret || null;
          console.log(
            'Client secret extracted from expanded payment intent:',
            !!clientSecret,
          );
        } else if (typeof paymentIntent === 'string') {
          // Payment intent is just an ID, fetch it manually
          console.log(
            'Payment intent is a string ID, fetching:',
            paymentIntent,
          );
          const fetchedPI =
            await this.stripe.paymentIntents.retrieve(paymentIntent);
          clientSecret = fetchedPI.client_secret || null;
        } else {
          // No payment intent exists - try to finalize invoice first
          console.log(
            'No payment intent found on invoice, attempting to finalize invoice...',
          );

          try {
            // Finalize the invoice - this should create a payment intent
            // Don't use auto_advance: false, let Stripe handle it properly
            const finalizedInvoice: any =
              await this.stripe.invoices.finalizeInvoice(invoiceId);

            console.log('Invoice finalized:', {
              id: finalizedInvoice.id,
              status: finalizedInvoice.status,
              has_payment_intent: !!finalizedInvoice.payment_intent,
            });

            // Check if payment intent was created after finalization
            if (finalizedInvoice.payment_intent) {
              const piId =
                typeof finalizedInvoice.payment_intent === 'string'
                  ? finalizedInvoice.payment_intent
                  : finalizedInvoice.payment_intent.id;

              const fetchedPI = await this.stripe.paymentIntents.retrieve(piId);
              clientSecret = fetchedPI.client_secret || null;
              console.log(
                'Payment intent from finalized invoice:',
                !!clientSecret,
              );
            } else {
              // If still no payment intent after finalization, wait and retry
              console.log(
                'No payment intent immediately after finalization, waiting...',
              );
              await new Promise((resolve) => setTimeout(resolve, 2000));

              // Retrieve invoice again to check for payment intent
              const retryInvoice: any = await this.stripe.invoices.retrieve(
                invoiceId,
                { expand: ['payment_intent'] },
              );

              if (retryInvoice.payment_intent) {
                const piId =
                  typeof retryInvoice.payment_intent === 'string'
                    ? retryInvoice.payment_intent
                    : retryInvoice.payment_intent.id;

                const fetchedPI =
                  await this.stripe.paymentIntents.retrieve(piId);
                clientSecret = fetchedPI.client_secret || null;
                console.log('Payment intent found on retry:', !!clientSecret);
              } else {
                // If still no payment intent, create one and attach to invoice
                console.log(
                  'Payment intent not created by Stripe, creating one and linking to invoice...',
                );

                const newPaymentIntent =
                  await this.stripe.paymentIntents.create({
                    amount: invoice.amount_due,
                    currency: invoice.currency || 'gbp',
                    customer: invoice.customer,
                    payment_method_types: ['card'],
                    metadata: {
                      invoice_id: invoice.id,
                      subscription_id: stripeSubscription.id,
                      userId: userId.toString(),
                    },
                  });

                clientSecret = newPaymentIntent.client_secret;
                console.log(
                  'Payment intent created and linked:',
                  !!clientSecret,
                );
              }
            }
          } catch (finalizeError: any) {
            console.error(
              'Error finalizing invoice or getting payment intent:',
              finalizeError.message,
            );

            // Fallback: Create payment intent manually
            console.log('Creating payment intent as fallback...');
            try {
              const newPaymentIntent = await this.stripe.paymentIntents.create({
                amount: invoice.amount_due,
                currency: invoice.currency || 'gbp',
                customer: invoice.customer,
                payment_method_types: ['card'],
                metadata: {
                  invoice_id: invoice.id,
                  subscription_id: stripeSubscription.id,
                  userId: userId.toString(),
                },
              });

              clientSecret = newPaymentIntent.client_secret;
              console.log('Fallback payment intent created:', !!clientSecret);
            } catch (piError: any) {
              console.error(
                'Error creating fallback payment intent:',
                piError.message,
              );
              throw new BadRequestException(
                `Failed to create payment intent: ${piError.message}. Please try again.`,
              );
            }
          }
        }
      } catch (error) {
        console.error('Error fetching invoice:', error.message);
      }
    } else {
      console.log('No invoice ID found on subscription');
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

  async switchToMember(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== Role.host) {
      throw new BadRequestException('User is not a host');
    }

    // Switch role to member and update lastRole
    await this.userModel.findByIdAndUpdate(userId, {
      role: Role.member,
      lastRole: Role.member,
    });

    return {
      message: 'Successfully switched to member profile',
      role: Role.member,
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

  async confirmPaymentAndActivateSubscription(
    userId: string,
    paymentIntentId: string,
  ) {
    try {
      // Retrieve the payment intent with charges expanded
      const paymentIntent: any = await this.stripe.paymentIntents.retrieve(
        paymentIntentId,
        {
          expand: ['charges'],
        },
      );

      console.log('Payment intent retrieved:', {
        id: paymentIntent.id,
        status: paymentIntent.status,
        metadata: paymentIntent.metadata,
      });

      if (paymentIntent.status !== 'succeeded') {
        throw new BadRequestException('Payment intent is not succeeded yet');
      }

      const invoiceId = paymentIntent.metadata?.invoice_id;
      const subscriptionId = paymentIntent.metadata?.subscription_id;
      const paymentMethodId = paymentIntent.payment_method as string;

      if (!invoiceId) {
        throw new BadRequestException('Invoice ID not found in payment intent');
      }

      // Get customer ID from payment intent
      const customerId = paymentIntent.customer as string;

      if (!customerId) {
        throw new BadRequestException(
          'Customer ID not found in payment intent',
        );
      }

      // When payment intent succeeds, Stripe automatically pays the invoice
      // Wait a moment for Stripe to process, then check invoice status
      console.log(
        'Payment intent succeeded, waiting for Stripe to process invoice...',
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check invoice status - it should be paid automatically by Stripe
      const invoiceCheck: any = await this.stripe.invoices.retrieve(invoiceId, {
        expand: ['payment_intent'],
      });

      console.log('Invoice status after payment intent success:', {
        id: invoiceCheck.id,
        status: invoiceCheck.status,
        paid: invoiceCheck.paid,
        payment_intent_id: invoiceCheck.payment_intent
          ? typeof invoiceCheck.payment_intent === 'string'
            ? invoiceCheck.payment_intent
            : invoiceCheck.payment_intent.id
          : null,
        payment_intent_matches: invoiceCheck.payment_intent
          ? typeof invoiceCheck.payment_intent === 'string'
            ? invoiceCheck.payment_intent === paymentIntentId
            : invoiceCheck.payment_intent.id === paymentIntentId
          : false,
      });

      let invoice: any = invoiceCheck;

      // If invoice is not paid yet, we need to pay it manually
      if (!invoiceCheck.paid) {
        console.log(
          'Invoice not automatically paid. Payment intent succeeded but invoice not linked.',
        );
        console.log('Paying invoice manually using payment intent...');

        try {
          // Get the charge from payment intent
          const charges: any = paymentIntent.charges?.data || [];
          if (charges.length > 0) {
            const charge = charges[0];
            console.log('Using charge from payment intent:', charge.id);

            // Pay invoice using the charge
            const paidInvoice: any = await this.stripe.invoices.pay(invoiceId, {
              paid_out_of_band: true,
            });

            console.log('Invoice paid manually:', {
              id: paidInvoice.id,
              paid: paidInvoice.paid,
              status: paidInvoice.status,
            });

            invoice = paidInvoice;
          } else {
            // If no charge, try to pay with payment method
            if (paymentMethodId) {
              console.log(
                'Paying invoice with payment method:',
                paymentMethodId,
              );

              // First attach payment method to customer if needed
              try {
                const pm: any =
                  await this.stripe.paymentMethods.retrieve(paymentMethodId);
                if (!pm.customer || pm.customer !== customerId) {
                  await this.stripe.paymentMethods.attach(paymentMethodId, {
                    customer: customerId,
                  });
                }
              } catch (attachError: any) {
                if (!attachError.message.includes('already been attached')) {
                  console.log(
                    'Payment method attachment note:',
                    attachError.message,
                  );
                }
              }

              // Pay invoice
              const paidInvoice: any =
                await this.stripe.invoices.pay(invoiceId);
              invoice = paidInvoice;
              console.log('Invoice paid with payment method:', invoice.paid);
            } else {
              throw new Error(
                'No charge or payment method available to pay invoice',
              );
            }
          }
        } catch (payError: any) {
          console.error('Error paying invoice manually:', payError.message);
          // Payment succeeded, so we'll mark subscription as active anyway
          console.log(
            'Payment succeeded, will activate subscription despite invoice payment issue',
          );
        }
      } else {
        console.log('Invoice automatically paid by Stripe (as expected)');
      }

      // Find and update subscription
      if (subscriptionId) {
        // Retrieve the subscription from Stripe to get its actual status
        const stripeSub: any =
          await this.stripe.subscriptions.retrieve(subscriptionId);

        console.log('Stripe subscription status after invoice payment:', {
          id: stripeSub.id,
          status: stripeSub.status,
        });

        // If subscription is still incomplete, we need to properly activate it in Stripe
        if (stripeSub.status === 'incomplete') {
          console.log(
            'Subscription still incomplete in Stripe, attempting to activate...',
          );

          try {
            // If invoice is paid, wait a moment and refresh subscription
            // Stripe should automatically activate it
            if (invoice.paid) {
              console.log(
                'Invoice is paid, waiting for Stripe to activate subscription...',
              );

              // Wait 1 second for Stripe to process
              await new Promise((resolve) => setTimeout(resolve, 1000));

              // Refresh subscription to get updated status
              const refreshedSub: any =
                await this.stripe.subscriptions.retrieve(subscriptionId);

              console.log(
                'Refreshed subscription status:',
                refreshedSub.status,
              );

              if (refreshedSub.status === 'active') {
                stripeSub.status = 'active';
                console.log('Subscription automatically activated by Stripe');
              } else {
                // If still incomplete, the payment intent might not be linked to invoice
                // In this case, we'll mark it as active in our DB but note Stripe status
                console.log(
                  'Warning: Invoice paid but Stripe subscription still incomplete',
                );
                console.log(
                  'This may be because payment intent was created separately from invoice',
                );
                console.log(
                  'Subscription will be marked active in database, but Stripe shows incomplete',
                );
              }
            } else {
              console.log(
                'Invoice not paid, cannot activate subscription in Stripe',
              );
            }
          } catch (updateError: any) {
            console.log(
              'Error checking subscription status in Stripe:',
              updateError.message,
            );
          }
        }

        // Update our database
        const subscription = await this.subscriptionModel.findOne({
          stripeSubscriptionId: subscriptionId,
        });

        if (subscription) {
          // Since payment intent succeeded, payment was successful
          // Activate subscription even if invoice payment had issues
          const finalStatus =
            stripeSub.status === 'active' ||
            invoice.paid ||
            paymentIntent.status === 'succeeded'
              ? SubscriptionStatus.ACTIVE
              : SubscriptionStatus.INCOMPLETE;

          subscription.status = finalStatus;
          subscription.updated_at = new Date();

          // Update period dates from Stripe
          if (stripeSub.current_period_start) {
            subscription.currentPeriodStart = new Date(
              stripeSub.current_period_start * 1000,
            );
          }
          if (stripeSub.current_period_end) {
            subscription.currentPeriodEnd = new Date(
              stripeSub.current_period_end * 1000,
            );
          }

          await subscription.save();

          // Update user subscription status and role (only when payment succeeds)
          const user = await this.userModel.findById(userId);
          if (!user) {
            throw new NotFoundException('User not found');
          }

          const updateData: any = {
            hasActiveSubscription: finalStatus === SubscriptionStatus.ACTIVE,
          };

          // Only update role to host when payment actually succeeds
          if (finalStatus === SubscriptionStatus.ACTIVE) {
            // Save current grantRole as lastRole before switching to host (if not already host)
            if (user.role === Role.member) {
              const currentGrantRole = user.grantRole || Role.member;
              updateData.lastRole = currentGrantRole;
            }
            updateData.role = Role.host; // Permanent role - user has paid
            updateData.grantRole = Role.host; // Current selected role
          }

          await this.userModel.findByIdAndUpdate(userId, updateData);

          console.log('Subscription updated in database:', {
            status: finalStatus,
            stripeStatus: stripeSub.status,
          });
        }
      }

      return {
        success: true,
        message: 'Payment confirmed and subscription activated',
        invoiceId: invoice.id,
        subscriptionId,
      };
    } catch (error: any) {
      console.error('Error confirming payment:', error.message);
      throw new BadRequestException(
        error.message || 'Failed to confirm payment',
      );
    }
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

      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event.data.object);
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

    // Update user subscription status and ensure role is host
    const user = await this.userModel.findById(subscription.userId);
    const updateData: any = {
      hasActiveSubscription: true,
      role: Role.host,
      grantRole: Role.host, // Current selected role
    };

    // Save current grantRole as lastRole before switching to host (if not already host)
    if (user && user.role === Role.member) {
      const currentGrantRole = user.grantRole || Role.member;
      updateData.lastRole = currentGrantRole;
    } else if (!user?.lastRole) {
      // If already host but no lastRole set, set it
      updateData.lastRole = user?.grantRole || Role.host;
    }

    await this.userModel.findByIdAndUpdate(subscription.userId, updateData);
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

  private async handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const piAny = paymentIntent as any;
    const invoiceId = piAny.metadata?.invoice_id;
    const subscriptionId = piAny.metadata?.subscription_id;

    console.log('Payment intent succeeded:', {
      payment_intent_id: paymentIntent.id,
      invoice_id: invoiceId,
      subscription_id: subscriptionId,
    });

    if (invoiceId) {
      try {
        // Pay the invoice with this payment intent
        const invoice = await this.stripe.invoices.pay(invoiceId, {
          payment_method: piAny.payment_method,
        });

        console.log('Invoice paid successfully:', {
          invoice_id: invoice.id,
          status: invoice.status,
        });

        // This will trigger invoice.payment_succeeded webhook
        // which will activate the subscription
      } catch (error: any) {
        console.error('Error paying invoice:', error.message);
      }
    } else if (subscriptionId) {
      // If no invoice ID, try to update subscription directly
      const subscription = await this.subscriptionModel.findOne({
        stripeSubscriptionId: subscriptionId,
      });

      if (subscription) {
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.updated_at = new Date();
        await subscription.save();

        // Update user subscription status and role (only when payment succeeds)
        const user = await this.userModel.findById(subscription.userId);
        const updateData: any = {
          hasActiveSubscription: true,
          role: Role.host,
          grantRole: Role.host, // Current selected role
        };

        // Save current grantRole as lastRole before switching to host (if not already host)
        if (user && user.role === Role.member) {
          const currentGrantRole = user.grantRole || Role.member;
          updateData.lastRole = currentGrantRole;
        } else if (!user?.lastRole) {
          // If already host but no lastRole set, set it
          updateData.lastRole = user?.grantRole || Role.host;
        }

        await this.userModel.findByIdAndUpdate(subscription.userId, updateData);

        console.log('Subscription activated directly from payment intent');
      }
    }
  }
}
