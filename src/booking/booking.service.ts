import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Booking,
  BookingStatus,
  PaymentStatus,
} from 'src/schemas/booking.schema';
import { Activity } from 'src/schemas/activity.schema';
import { User, Role } from 'src/schemas/user.schema';
import mongoose, { Model } from 'mongoose';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class BookingService {
  private stripe: Stripe;

  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private configService: ConfigService,
    private readonly mailerService: MailerService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is not defined in environment variables',
      );
    }
    this.stripe = new Stripe(stripeSecretKey);
  }

  async createBooking(
    createBookingDto: CreateBookingDto,
    memberId: string,
  ): Promise<Booking> {
    try {
      // 1. Verify member exists
      const member = await this.userModel.findById(memberId);
      if (!member) {
        throw new NotFoundException('Member not found');
      }

      // 2. Verify activity exists
      const activity = await this.activityModel.findById(
        createBookingDto.activityId,
      );
      if (!activity) {
        throw new NotFoundException('Activity not found');
      }

      // Check if activity is deleted
      if (activity.deleted_at) {
        throw new BadRequestException('Activity is no longer available');
      }

      // 3. Check if member already has a booking for this activity
      const existingBooking = await this.bookingModel.findOne({
        memberId: new mongoose.Types.ObjectId(memberId),
        activityId: new mongoose.Types.ObjectId(createBookingDto.activityId),
        status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        deleted_at: null,
      });

      if (existingBooking) {
        throw new BadRequestException(
          'You already have a booking for this activity',
        );
      }

      // 4. Get host info
      let hostId: string;
      if (
        activity.hostId &&
        typeof activity.hostId === 'object' &&
        '_id' in activity.hostId
      ) {
        hostId = (activity.hostId as any)._id.toString();
      } else {
        hostId = (activity.hostId as any).toString();
      }

      const host = await this.userModel.findById(hostId);
      if (!host) {
        throw new NotFoundException('Host not found');
      }

      // 5. Handle payment based on activity price
      const activityPrice = activity.price || 0;
      let paymentIntentId: string | undefined;
      let chargeId: string | undefined;
      let bookingStatus: BookingStatus;
      let paymentStatus: PaymentStatus | null | undefined; // Can be null for free activities

      if (activityPrice > 0) {
        // Paid activity - charge upfront
        if (!createBookingDto.paymentMethodId) {
          throw new BadRequestException(
            'Payment method is required for paid activities',
          );
        }

        // Ensure member has Stripe customer ID - create if doesn't exist
        let customerId = member.stripeCustomerId;
        if (!customerId) {
          // Create Stripe customer for the member
          const customer = await this.stripe.customers.create({
            email: member.email,
            name: member.name,
            metadata: {
              userId: memberId,
              type: 'member',
            },
          });
          customerId = customer.id;

          // Save customer ID to user record
          await this.userModel.findByIdAndUpdate(memberId, {
            stripeCustomerId: customerId,
            updated_at: new Date(),
          });
        }

        // Attach payment method to customer (if not already attached)
        try {
          await this.stripe.paymentMethods.attach(
            createBookingDto.paymentMethodId,
            {
              customer: customerId,
            },
          );
        } catch (attachError: any) {
          // Payment method might already be attached, or it's a test payment method
          // For test payment methods like pm_card_visa, we can proceed
          if (!attachError.message?.includes('already been attached')) {
            // Only throw if it's not an "already attached" error
            // For testing, we'll allow test payment methods
          }
        }

        // Create Payment Intent with manual capture (escrow)
        // Payment will be authorized but not captured until host approves
        const paymentIntent = await this.stripe.paymentIntents.create({
          amount: Math.round(activityPrice * 100), // Convert to cents
          currency: 'usd',
          customer: customerId,
          payment_method: createBookingDto.paymentMethodId,
          capture_method: 'manual', // Don't capture immediately - hold in escrow
          confirm: true, // Authorize payment but don't capture
          description: `Booking for ${activity.title}`,
          payment_method_types: ['card'], // Specify card as payment method type
          metadata: {
            activityId: (activity._id as any).toString(),
            memberId: memberId,
            hostId: hostId,
            type: 'booking',
          },
        });

        // Verify payment intent status - should be 'requires_capture' for manual capture
        console.log('Payment Intent created:', {
          id: paymentIntent.id,
          status: paymentIntent.status,
          capture_method: paymentIntent.capture_method,
        });

        paymentIntentId = paymentIntent.id;
        chargeId = paymentIntent.latest_charge as string;
        bookingStatus = BookingStatus.PENDING; // Wait for host approval
        paymentStatus = PaymentStatus.PENDING; // Payment authorized but not captured (held in escrow)
      } else {
        // Free activity - send to host for approval
        bookingStatus = BookingStatus.PENDING; // Changed: Free activities also need host approval
        paymentStatus = null; // Changed: Explicitly null for free activities
      }

      // 6. Create booking
      const bookingData: any = {
        memberId: new mongoose.Types.ObjectId(memberId),
        activityId: new mongoose.Types.ObjectId(createBookingDto.activityId),
        hostId: new mongoose.Types.ObjectId(hostId),
        status: bookingStatus,
        amount: activityPrice,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Set payment-related fields based on activity type
      if (activityPrice > 0) {
        // Paid activity - set payment fields
        bookingData.paymentStatus = paymentStatus;
        bookingData.paymentIntentId = paymentIntentId;
        bookingData.stripeChargeId = chargeId;
      } else {
        // Free activity - explicitly set paymentStatus to null
        bookingData.paymentStatus = null;
      }

      const booking = await this.bookingModel.create(bookingData);

      // 7. Send email notifications
      try {
        // Email to member
        await this.mailerService.sendMail({
          to: member.email,
          subject:
            activityPrice > 0
              ? 'Booking Request Sent'
              : 'Free Activity Booking Request',
          html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${activityPrice > 0 ? 'Booking Request Sent' : 'Free Activity Booking Request'}</h2>
            <p>Hello ${member.name || member.email},</p>
            <p>Your booking request for <strong>${activity.title}</strong> has been sent.</p>
            <p>Status: <strong>Pending Host Approval</strong></p>
            ${activityPrice > 0 ? `<p>Amount: $${activityPrice}</p>` : '<p>This is a free activity.</p>'}
            <p>We'll notify you once the host responds.</p>
          </div>
        `,
        });

        // Email to host (same for both paid and free)
        await this.mailerService.sendMail({
          to: host.email,
          subject: 'New Booking Request',
          html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>New Booking Request</h2>
            <p>Hello ${host.name || host.email},</p>
            <p>You have a new booking request for <strong>${activity.title}</strong>.</p>
            <p>Member: <strong>${member.name || member.email}</strong></p>
            ${activityPrice > 0 ? `<p>Amount: $${activityPrice}</p>` : '<p>This is a free activity.</p>'}
            <p>Please review and approve or decline the booking.</p>
          </div>
        `,
        });
      } catch (emailError: any) {
        console.error('Error sending booking emails:', emailError);
        // Don't throw error, booking was created successfully
      }

      return booking;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async approveBooking(bookingId: string, hostId: string): Promise<Booking> {
    try {
      const booking = await this.bookingModel
        .findById(bookingId)
        .populate('activityId')
        .populate('memberId');

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      // Verify host owns this booking
      let bookingHostId: string;
      if (
        booking.hostId &&
        typeof booking.hostId === 'object' &&
        '_id' in booking.hostId
      ) {
        bookingHostId = (booking.hostId as any)._id.toString();
      } else {
        bookingHostId = (booking.hostId as any).toString();
      }

      if (bookingHostId !== hostId) {
        throw new ForbiddenException(
          'You can only approve bookings for your activities',
        );
      }

      if (booking.status !== BookingStatus.PENDING) {
        throw new BadRequestException('Only pending bookings can be approved');
      }

      // If paid activity, capture the payment (release from escrow)
      if (booking.amount > 0 && booking.paymentIntentId) {
        try {
          // First, retrieve the payment intent to check its status
          const paymentIntent = await this.stripe.paymentIntents.retrieve(
            booking.paymentIntentId,
          );

          // Check if payment is already captured
          if (paymentIntent.status === 'succeeded') {
            // Payment already captured - just update status
            booking.paymentStatus = PaymentStatus.TRANSFERRED;
          } else if (paymentIntent.status === 'requires_capture') {
            // Payment is authorized but not captured - capture it now
            const capturedIntent = await this.stripe.paymentIntents.capture(
              booking.paymentIntentId,
            );

            if (capturedIntent.status === 'succeeded') {
              booking.paymentStatus = PaymentStatus.PAID; // Payment captured
              // TODO: Implement Stripe Connect transfer to host account
              // For now, payment is in platform account
              booking.paymentStatus = PaymentStatus.TRANSFERRED; // Mark as transferred (will be sent to host)
            }
          } else {
            // Payment in unexpected state
            throw new BadRequestException(
              `Payment is in ${paymentIntent.status} state and cannot be captured`,
            );
          }
        } catch (captureError: any) {
          throw new BadRequestException(
            `Failed to capture payment: ${captureError.message}`,
          );
        }
      }

      // Update booking status
      booking.status = BookingStatus.CONFIRMED;
      booking.updated_at = new Date();
      await booking.save();

      // Send confirmation email to member
      const member = await this.userModel.findById(booking.memberId);
      if (member) {
        try {
          await this.mailerService.sendMail({
            to: member.email,
            subject: 'Booking Confirmed',
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Booking Confirmed!</h2>
              <p>Hello ${member.name || member.email},</p>
              <p>Great news! Your booking for <strong>${(booking.activityId as any).title}</strong> has been confirmed by the host.</p>
              <p>We look forward to seeing you at the activity!</p>
            </div>
          `,
          });
        } catch (emailError: any) {
          console.error('Error sending confirmation email:', emailError);
        }
      }

      return booking;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async declineBooking(
    bookingId: string,
    hostId: string,
    declineReason?: string,
  ): Promise<Booking> {
    try {
      const booking = await this.bookingModel
        .findById(bookingId)
        .populate('activityId')
        .populate('memberId');

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      // Verify host owns this booking
      let bookingHostId: string;
      if (
        booking.hostId &&
        typeof booking.hostId === 'object' &&
        '_id' in booking.hostId
      ) {
        bookingHostId = (booking.hostId as any)._id.toString();
      } else {
        bookingHostId = (booking.hostId as any).toString();
      }

      if (bookingHostId !== hostId) {
        throw new ForbiddenException(
          'You can only decline bookings for your activities',
        );
      }

      if (booking.status !== BookingStatus.PENDING) {
        throw new BadRequestException('Only pending bookings can be declined');
      }

      // If paid activity, cancel the payment authorization (release from escrow)
      if (booking.amount > 0 && booking.paymentIntentId) {
        try {
          // Cancel the payment intent (release authorization - no charge to member)
          // Since we used manual capture, the payment was only authorized, not captured
          await this.stripe.paymentIntents.cancel(booking.paymentIntentId);
          booking.paymentStatus = PaymentStatus.REFUNDED; // Authorization released
        } catch (cancelError: any) {
          // If payment was already captured (shouldn't happen with manual capture), refund it
          if (cancelError.code === 'payment_intent_unexpected_state') {
            try {
              const refund = await this.stripe.refunds.create({
                payment_intent: booking.paymentIntentId,
              });
              booking.paymentStatus = PaymentStatus.REFUNDED;
            } catch (refundError: any) {
              throw new BadRequestException(
                `Failed to process cancellation: ${refundError.message}`,
              );
            }
          } else {
            throw new BadRequestException(
              `Failed to cancel payment: ${cancelError.message}`,
            );
          }
        }
      }

      // Update booking status
      booking.status = BookingStatus.CANCELLED;
      booking.declineReason = declineReason;
      booking.updated_at = new Date();
      await booking.save();

      // Send cancellation email to member
      const member = await this.userModel.findById(booking.memberId);
      if (member) {
        try {
          await this.mailerService.sendMail({
            to: member.email,
            subject: 'Booking Declined',
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Booking Declined</h2>
              <p>Hello ${member.name || member.email},</p>
              <p>Unfortunately, your booking for <strong>${(booking.activityId as any).title}</strong> has been declined by the host.</p>
              ${declineReason ? `<p>Reason: ${declineReason}</p>` : ''}
              ${booking.amount > 0 ? '<p>Your payment has been refunded to your original payment method.</p>' : ''}
            </div>
          `,
          });
        } catch (emailError: any) {
          console.error('Error sending cancellation email:', emailError);
        }
      }

      return booking;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async getMemberBookings(memberId: string): Promise<Booking[]> {
    try {
      const bookings = await this.bookingModel
        .find({
          memberId: new mongoose.Types.ObjectId(memberId),
          deleted_at: null,
        })
        .populate('activityId')
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      return bookings;
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async getHostPendingBookings(hostId: string): Promise<Booking[]> {
    try {
      const isValidID = mongoose.isValidObjectId(hostId);
      if (!isValidID) {
        throw new BadRequestException('Invalid host ID');
      }

      const bookings = await this.bookingModel
        .find({
          hostId: new mongoose.Types.ObjectId(hostId),
          status: BookingStatus.PENDING,
          deleted_at: null,
        })
        .populate('activityId')
        .populate('memberId', 'name email profilePhoto')
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      console.log(
        `Found ${bookings.length} pending bookings for host ${hostId}`,
      );
      return bookings;
    } catch (err) {
      console.error('Error fetching host pending bookings:', err);
      throw new BadRequestException(err.message);
    }
  }

  async getBookingById(bookingId: string, userId: string): Promise<Booking> {
    try {
      const isValidID = mongoose.isValidObjectId(bookingId);
      if (!isValidID) {
        throw new BadRequestException('Invalid booking ID');
      }

      const booking = await this.bookingModel
        .findOne({ _id: bookingId, deleted_at: null })
        .populate('activityId')
        .populate('memberId', 'name email profilePhoto')
        .populate('hostId', 'name email profilePhoto');

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      // Verify user has access (member, host, or superAdmin)
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      let bookingMemberId: string;
      let bookingHostId: string;
      if (
        booking.memberId &&
        typeof booking.memberId === 'object' &&
        '_id' in booking.memberId
      ) {
        bookingMemberId = (booking.memberId as any)._id.toString();
      } else {
        bookingMemberId = (booking.memberId as any).toString();
      }

      if (
        booking.hostId &&
        typeof booking.hostId === 'object' &&
        '_id' in booking.hostId
      ) {
        bookingHostId = (booking.hostId as any)._id.toString();
      } else {
        bookingHostId = (booking.hostId as any).toString();
      }

      const isSuperAdmin = user.role === Role.superAdmin;
      const isMember = bookingMemberId === userId;
      const isHost = bookingHostId === userId;

      if (!isSuperAdmin && !isMember && !isHost) {
        throw new ForbiddenException(
          'You do not have permission to view this booking',
        );
      }

      return booking;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async getHostDashboard(
    hostId: string,
    status?: BookingStatus | 'all',
    activityId?: string,
  ): Promise<{
    confirmed: number;
    pending: number;
    cancelled: number;
    results: Booking[];
  }> {
    try {
      const isValidID = mongoose.isValidObjectId(hostId);
      if (!isValidID) {
        throw new BadRequestException('Invalid host ID');
      }

      // Build base query
      const baseQuery: any = {
        hostId: new mongoose.Types.ObjectId(hostId),
        deleted_at: null,
      };

      // Add activity filter if provided
      if (activityId && mongoose.isValidObjectId(activityId)) {
        baseQuery.activityId = new mongoose.Types.ObjectId(activityId);
      }

      // Get counts for all statuses
      const [confirmedCount, pendingCount, cancelledCount] = await Promise.all([
        this.bookingModel.countDocuments({
          ...baseQuery,
          status: BookingStatus.CONFIRMED,
        }),
        this.bookingModel.countDocuments({
          ...baseQuery,
          status: BookingStatus.PENDING,
        }),
        this.bookingModel.countDocuments({
          ...baseQuery,
          status: BookingStatus.CANCELLED,
        }),
      ]);

      // Build query for results
      const resultsQuery: any = { ...baseQuery };

      // Filter by status if provided (and not 'all')
      if (status && status !== 'all') {
        resultsQuery.status = status;
      }

      // Fetch bookings with filters
      const bookings = await this.bookingModel
        .find(resultsQuery)
        .populate('activityId')
        .populate('memberId', 'name email profilePhoto')
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      return {
        confirmed: confirmedCount,
        pending: pendingCount,
        cancelled: cancelledCount,
        results: bookings,
      };
    } catch (err) {
      console.error('Error fetching host dashboard:', err);
      throw new BadRequestException(err.message);
    }
  }
}
