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
  AttendanceStatus,
} from 'src/schemas/booking.schema';
import { Activity, ActivityStatus } from 'src/schemas/activity.schema';
import { User, Role } from 'src/schemas/user.schema';
import { Rating } from 'src/schemas/rating.schema';
import mongoose, { Model } from 'mongoose';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import {
  AdminListBookingsDto,
  BookingSortBy,
  SortOrder,
} from './dto/admin-list-bookings.dto';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SendGridService } from '../sendgrid/sendgrid.service';
import {
  bookingRequestSentToMember,
  newBookingRequestToHost,
  bookingConfirmedToMember,
  bookingDeclinedToMember,
  bookingCancelledFreeToMember,
  bookingCancelledWithRefundToMember,
} from 'src/utils/email-templates';

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
    @InjectModel(Rating.name)
    private readonly ratingModel: Model<Rating>,
    private configService: ConfigService,
    private readonly sendGridService: SendGridService,
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

      // Check if activity is active (not completed or cancelled)
      if (activity.status && activity.status !== ActivityStatus.ACTIVE) {
        throw new BadRequestException(
          'This activity is no longer accepting bookings',
        );
      }

      // Check if there are remaining seats available (only count CONFIRMED bookings)
      const bookedCount = await this.bookingModel.countDocuments({
        activityId: new mongoose.Types.ObjectId(createBookingDto.activityId),
        status: BookingStatus.CONFIRMED,
        deleted_at: null,
      });

      const remainingSeats = activity.maxParticipants - bookedCount;
      if (remainingSeats <= 0) {
        throw new BadRequestException(
          'No seats available. This activity is fully booked.',
        );
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
        // Generate invoice number for paid bookings
        bookingData.invoiceNumber = await this.generateInvoiceNumber();
      } else {
        // Free activity - explicitly set paymentStatus to null
        bookingData.paymentStatus = null;
      }

      const booking = await this.bookingModel.create(bookingData);

      // 7. Send email notifications
      const emailsEnabled =
        this.configService.get<string>('EMAILS_ENABLED') === 'true';
      if (emailsEnabled) {
        try {
          // Email to member
          await this.sendGridService.sendMail({
            to: member.email,
            subject:
              activityPrice > 0
                ? 'Booking Request Sent'
                : 'Free Activity Booking Request',
            html: bookingRequestSentToMember({
              memberName: member.name,
              memberEmail: member.email,
              activityTitle: activity.title,
              activityPrice: activityPrice,
            }),
          });

          // Email to host (same for both paid and free)
          await this.sendGridService.sendMail({
            to: host.email,
            subject: 'New Booking Request',
            html: newBookingRequestToHost({
              hostName: host.name,
              hostEmail: host.email,
              activityTitle: activity.title,
              memberName: member.name,
              memberEmail: member.email,
              activityPrice: activityPrice,
            }),
          });
        } catch (emailError: any) {
          console.error('Error sending booking emails:', emailError);
          // Don't throw error, booking was created successfully
        }
      }

      // Mark host and admin(s) as having new booking requests
      try {
        await this.userModel.findByIdAndUpdate(hostId, {
          $set: { hasNewBookings: true, updated_at: new Date() },
        });
      } catch (err) {
        console.error('Failed to set host hasNewBookings flag:', err);
      }

      try {
        await this.userModel.updateMany(
          { role: Role.superAdmin },
          { $set: { hasNewBookings: true, updated_at: new Date() } },
        );
      } catch (err) {
        console.error('Failed to set admin hasNewBookings flag:', err);
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

      // Check if accepting this booking would exceed maxParticipants
      const activity = booking.activityId as any;
      if (!activity) {
        throw new NotFoundException('Activity not found');
      }

      // Count current confirmed bookings for this activity
      const currentConfirmedCount = await this.bookingModel.countDocuments({
        activityId: new mongoose.Types.ObjectId(activity._id || activity),
        status: BookingStatus.CONFIRMED,
        deleted_at: null,
      });

      // Check if accepting this booking would exceed maxParticipants
      if (currentConfirmedCount >= activity.maxParticipants) {
        throw new BadRequestException(
          'Cannot approve booking. Activity is already fully booked.',
        );
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
      const emailsEnabled =
        this.configService.get<string>('EMAILS_ENABLED') === 'true';
      const member = await this.userModel.findById(booking.memberId);
      if (member && emailsEnabled) {
        try {
          await this.sendGridService.sendMail({
            to: member.email,
            subject: 'Booking Confirmed',
            html: bookingConfirmedToMember({
              memberName: member.name,
              memberEmail: member.email,
              activityTitle: (booking.activityId as any).title,
            }),
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
              await this.stripe.refunds.create({
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
      const emailsEnabled =
        this.configService.get<string>('EMAILS_ENABLED') === 'true';
      const member = await this.userModel.findById(booking.memberId);
      if (member && emailsEnabled) {
        try {
          await this.sendGridService.sendMail({
            to: member.email,
            subject: 'Booking Declined',
            html: bookingDeclinedToMember({
              memberName: member.name,
              memberEmail: member.email,
              activityTitle: (booking.activityId as any).title,
              declineReason: declineReason,
              isPaid: booking.amount > 0,
            }),
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

  async getMemberBookings(
    memberId: string,
    filter: 'upcoming' | 'pending' | 'past' | 'cancelled' | 'all' = 'all',
  ): Promise<any[]> {
    try {
      const isValidID = mongoose.isValidObjectId(memberId);
      if (!isValidID) {
        throw new BadRequestException('Invalid member ID');
      }

      // Base query
      const baseQuery: any = {
        memberId: new mongoose.Types.ObjectId(memberId),
        deleted_at: null,
      };

      // Apply filter based on type
      if (filter === 'pending') {
        baseQuery.status = BookingStatus.PENDING;
      } else if (filter === 'cancelled') {
        baseQuery.status = BookingStatus.CANCELLED;
      } else if (filter === 'upcoming' || filter === 'past') {
        // For upcoming/past, we need confirmed bookings
        baseQuery.status = BookingStatus.CONFIRMED;
      }
      // 'all' doesn't add any status filter

      // Fetch bookings with populated data
      const bookings = await this.bookingModel
        .find(baseQuery)
        .populate('activityId')
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      // Filter by date for upcoming/past
      let filteredBookings = bookings;
      if (filter === 'upcoming' || filter === 'past') {
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Start of today

        filteredBookings = bookings.filter((booking) => {
          const activity = booking.activityId as any;
          if (!activity || !activity.date) {
            return false;
          }

          const activityDate = new Date(activity.date);
          activityDate.setHours(0, 0, 0, 0);

          if (filter === 'upcoming') {
            // Upcoming: activity date is today or in the future
            return activityDate >= now;
          } else {
            // Past: activity date is before today
            return activityDate < now;
          }
        });
      }

      // For past activities, check if member has reviewed each booking
      if (filter === 'past') {
        const bookingIds = filteredBookings.map((b) => b._id);

        // Get all ratings for these bookings
        const ratings = await this.ratingModel.find({
          bookingId: { $in: bookingIds },
          deleted_at: null,
        });

        // Create a map of bookingId -> rating exists
        const reviewedBookingIds = new Set(
          ratings.map((r) => (r.bookingId as any).toString()),
        );

        // Add isReviewed flag to each booking
        return filteredBookings.map((booking) => {
          const bookingObj = booking.toObject();
          const bookingId = (booking._id as any).toString();
          return {
            ...bookingObj,
            isReviewed: reviewedBookingIds.has(bookingId),
          };
        });
      }

      return filteredBookings;
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
        .populate('memberId', 'name email profilePhoto dateOfBirth gender')
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      console.log(
        `Found ${bookings.length} pending bookings for host ${hostId}`,
      );
      // Clear host hasNewBookings since they fetched their pending bookings
      try {
        await this.userModel.findByIdAndUpdate(hostId, {
          $set: { hasNewBookings: false, updated_at: new Date() },
        });
      } catch (err) {
        console.error('Failed to clear host hasNewBookings flag:', err);
      }

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
        .populate('memberId', 'name email profilePhoto dateOfBirth gender')
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
        .populate('memberId', 'name email profilePhoto dateOfBirth gender')
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

  async getActivityBookingsForAttendance(
    activityId: string,
    hostId: string,
  ): Promise<Booking[]> {
    try {
      const isValidActivityId = mongoose.isValidObjectId(activityId);
      const isValidHostId = mongoose.isValidObjectId(hostId);

      if (!isValidActivityId) {
        throw new BadRequestException('Invalid activity ID');
      }
      if (!isValidHostId) {
        throw new BadRequestException('Invalid host ID');
      }

      // Verify activity exists and belongs to host
      const activity = await this.activityModel.findById(activityId);
      if (!activity) {
        throw new NotFoundException('Activity not found');
      }

      // Check if host owns this activity
      let activityHostId: string;
      if (
        activity.hostId &&
        typeof activity.hostId === 'object' &&
        '_id' in activity.hostId
      ) {
        activityHostId = (activity.hostId as any)._id.toString();
      } else {
        activityHostId = (activity.hostId as any).toString();
      }

      if (activityHostId !== hostId) {
        throw new ForbiddenException(
          'You can only view attendance for your own activities',
        );
      }

      // Get all confirmed bookings for this activity
      const bookings = await this.bookingModel
        .find({
          activityId: new mongoose.Types.ObjectId(activityId),
          hostId: new mongoose.Types.ObjectId(hostId),
          status: BookingStatus.CONFIRMED, // Only confirmed bookings can have attendance
          deleted_at: null,
        })
        .populate('memberId', 'name email profilePhoto dateOfBirth gender')
        .populate('activityId', 'title date time')
        .sort({ created_at: -1 });

      return bookings;
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

  async markAttendance(
    bookingId: string,
    attendanceStatus: AttendanceStatus,
    hostId: string,
  ): Promise<Booking> {
    try {
      const isValidBookingId = mongoose.isValidObjectId(bookingId);
      const isValidHostId = mongoose.isValidObjectId(hostId);

      if (!isValidBookingId) {
        throw new BadRequestException('Invalid booking ID');
      }
      if (!isValidHostId) {
        throw new BadRequestException('Invalid host ID');
      }

      const booking = await this.bookingModel
        .findById(bookingId)
        .populate('activityId')
        .populate('memberId', 'name email profilePhoto dateOfBirth gender');

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
          'You can only mark attendance for your own activities',
        );
      }

      // Only allow attendance marking for confirmed bookings
      if (booking.status !== BookingStatus.CONFIRMED) {
        throw new BadRequestException(
          'Attendance can only be marked for confirmed bookings',
        );
      }

      // Update attendance status
      booking.attendanceStatus = attendanceStatus;
      booking.updated_at = new Date();
      await booking.save();

      // Populate member details before returning
      const updatedBooking = await this.bookingModel
        .findById(bookingId)
        .populate('memberId', 'name email profilePhoto')
        .populate('activityId', 'title date time')
        .populate('hostId', 'name email');

      return updatedBooking || booking;
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

  async cancelBookingByMember(
    bookingId: string,
    memberId: string,
    cancelReason?: string,
  ): Promise<Booking> {
    try {
      const isValidBookingId = mongoose.isValidObjectId(bookingId);
      const isValidMemberId = mongoose.isValidObjectId(memberId);

      if (!isValidBookingId) {
        throw new BadRequestException('Invalid booking ID');
      }
      if (!isValidMemberId) {
        throw new BadRequestException('Invalid member ID');
      }

      const booking = await this.bookingModel
        .findById(bookingId)
        .populate('activityId')
        .populate('memberId');

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      // Verify member owns this booking
      let bookingMemberId: string;
      if (
        booking.memberId &&
        typeof booking.memberId === 'object' &&
        '_id' in booking.memberId
      ) {
        bookingMemberId = (booking.memberId as any)._id.toString();
      } else {
        bookingMemberId = (booking.memberId as any).toString();
      }

      if (bookingMemberId !== memberId) {
        throw new ForbiddenException('You can only cancel your own bookings');
      }

      // Allow members to cancel confirmed bookings or withdraw pending requests
      if (
        booking.status !== BookingStatus.CONFIRMED &&
        booking.status !== BookingStatus.PENDING
      ) {
        throw new BadRequestException(
          'Only confirmed or pending bookings can be cancelled/withdrawn',
        );
      }

      const activity = booking.activityId as any;
      if (!activity || !activity.date) {
        throw new BadRequestException('Activity date not found');
      }

      // Calculate time difference
      const activityDate = new Date(activity.date);
      const now = new Date();
      const hoursUntilEvent =
        (activityDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Handle free activities - immediate cancellation (applies to pending or confirmed)
      if (booking.amount === 0 || !booking.paymentStatus) {
        const wasPending = booking.status === BookingStatus.PENDING;
        booking.status = BookingStatus.CANCELLED;
        booking.declineReason = cancelReason || 'Cancelled by member';
        booking.updated_at = new Date();
        await booking.save();

        // Send cancellation email
        const emailsEnabled =
          this.configService.get<string>('EMAILS_ENABLED') === 'true';
        const member = await this.userModel.findById(memberId);
        if (member && emailsEnabled) {
          try {
            await this.sendGridService.sendMail({
              to: member.email,
              subject: wasPending ? 'Booking Withdrawn' : 'Booking Cancelled',
              html: bookingCancelledFreeToMember({
                memberName: member.name,
                memberEmail: member.email,
                activityTitle: activity.title,
                cancelReason: cancelReason,
              }),
            });
          } catch (emailError: any) {
            console.error('Error sending cancellation email:', emailError);
          }
        }

        return booking;
      }

      // Handle paid activities - refund logic
      // For pending paid bookings: cancel the payment intent (release auth)
      if (booking.status === BookingStatus.PENDING) {
        if (!booking.paymentIntentId) {
          throw new BadRequestException(
            'Payment information not found for this booking',
          );
        }

        try {
          await this.stripe.paymentIntents.cancel(booking.paymentIntentId);
          booking.paymentStatus = PaymentStatus.REFUNDED; // Authorization released
        } catch (cancelError: any) {
          // If payment is in an unexpected state, attempt refund as fallback
          if (cancelError.code === 'payment_intent_unexpected_state') {
            try {
              await this.stripe.refunds.create({
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

        // Mark booking cancelled and save
        booking.status = BookingStatus.CANCELLED;
        booking.declineReason = cancelReason || 'Withdrawn by member';
        booking.updated_at = new Date();
        await booking.save();

        // Send notification to member
        const emailsEnabled =
          this.configService.get<string>('EMAILS_ENABLED') === 'true';
        const member = await this.userModel.findById(memberId);
        if (member && emailsEnabled) {
          try {
            await this.sendGridService.sendMail({
              to: member.email,
              subject: 'Booking Withdrawn',
              html: bookingDeclinedToMember({
                memberName: member.name,
                memberEmail: member.email,
                activityTitle: activity.title,
                declineReason: cancelReason,
                isPaid: true,
              }),
            });
          } catch (emailError: any) {
            console.error('Error sending withdrawal email:', emailError);
          }
        }

        return booking;
      }

      // Now handle refunds for confirmed bookings
      if (!booking.paymentIntentId) {
        throw new BadRequestException(
          'Payment information not found for this booking',
        );
      }

      // Check if already refunded
      if (booking.paymentStatus === PaymentStatus.REFUNDED) {
        throw new BadRequestException('This booking has already been refunded');
      }

      let refundAmount: number;
      let refundPercentage: number;
      const stripeFeePercentage = 0.029; // 2.9%
      const stripeFeeFixed = 30; // 30 cents

      if (hoursUntilEvent >= 48) {
        // 48+ hours: refund = payment - (2.9% + 30¢) Stripe fees
        const originalAmountCents = Math.round(booking.amount * 100);
        const stripeFee =
          Math.round(originalAmountCents * stripeFeePercentage) +
          stripeFeeFixed;
        refundAmount = originalAmountCents - stripeFee;
        refundPercentage = Math.round(
          (refundAmount / originalAmountCents) * 100,
        );
      } else if (hoursUntilEvent >= 24) {
        // 24-48 hours: refund = payment - 50% of payment - (2.9% + 30¢) of payment
        // Formula: payment - 50% - (2.9% + 30¢) - both calculated on original payment
        const originalAmountCents = Math.round(booking.amount * 100);
        const penaltyAmount = Math.round(originalAmountCents * 0.5); // 50% penalty
        const stripeFee =
          Math.round(originalAmountCents * stripeFeePercentage) +
          stripeFeeFixed; // Fee on original amount
        refundAmount = Math.max(
          0,
          originalAmountCents - penaltyAmount - stripeFee,
        );
        refundPercentage = Math.round(
          (refundAmount / originalAmountCents) * 100,
        );
      } else {
        // Less than 24 hours: no refund
        throw new BadRequestException(
          'Cancellation is not allowed less than 24 hours before the event. No refund will be issued.',
        );
      }

      // If booking was pending (authorized but not captured) and member withdraws,
      // cancelling the payment intent will release the authorization (similar to host decline)
      // Process Stripe refund / cancellation
      try {
        // First, retrieve the payment intent to get the charge ID
        const paymentIntent = await this.stripe.paymentIntents.retrieve(
          booking.paymentIntentId,
        );

        // Get charge ID from payment intent or booking
        const chargeId =
          (paymentIntent.latest_charge as string) || booking.stripeChargeId;
        if (!chargeId) {
          throw new BadRequestException('Charge ID not found');
        }

        // Create partial refund
        const refund = await this.stripe.refunds.create({
          charge: chargeId,
          amount: refundAmount, // Amount in cents
          reason: 'requested_by_customer',
          metadata: {
            bookingId: bookingId,
            memberId: memberId,
            refundPercentage: refundPercentage.toString(),
            hoursUntilEvent: hoursUntilEvent.toFixed(2),
          },
        });

        booking.status = BookingStatus.CANCELLED;
        booking.paymentStatus = PaymentStatus.REFUNDED;
        booking.stripeRefundId = refund.id;
        booking.declineReason =
          cancelReason || `Cancelled by member. ${refundPercentage}% refunded.`;
        booking.updated_at = new Date();
        await booking.save();

        // Send cancellation email with refund details
        const emailsEnabled =
          this.configService.get<string>('EMAILS_ENABLED') === 'true';
        const member = await this.userModel.findById(memberId);
        if (member && emailsEnabled) {
          try {
            await this.sendGridService.sendMail({
              to: member.email,
              subject: 'Booking Cancelled - Refund Processed',
              html: bookingCancelledWithRefundToMember({
                memberName: member.name,
                memberEmail: member.email,
                activityTitle: activity.title,
                cancelReason: cancelReason,
                originalAmount: booking.amount,
                refundAmount: refundAmount,
                refundPercentage: refundPercentage,
                refundId: refund.id,
              }),
            });
          } catch (emailError: any) {
            console.error('Error sending cancellation email:', emailError);
          }
        }

        return booking;
      } catch (refundError: any) {
        console.error('Error processing refund:', refundError);
        throw new BadRequestException(
          `Failed to process refund: ${refundError.message}`,
        );
      }
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

  /**
   * Generate unique invoice number in format: INV-YYYY-XXX
   * Example: INV-2024-001
   */
  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    // Find the highest invoice number for this year
    const lastInvoice = await this.bookingModel
      .findOne({
        invoiceNumber: { $regex: `^${prefix}` },
        deleted_at: null,
      })
      .sort({ invoiceNumber: -1 })
      .select('invoiceNumber');

    let sequence = 1;
    if (lastInvoice && lastInvoice.invoiceNumber) {
      const lastSequence = parseInt(
        lastInvoice.invoiceNumber.replace(prefix, ''),
      );
      if (!isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }

    // Format with leading zeros (e.g., 001, 002, ...)
    const sequenceStr = sequence.toString().padStart(3, '0');
    return `${prefix}${sequenceStr}`;
  }

  /**
   * Get payment history with summary statistics for a member
   */
  async getPaymentHistory(memberId: string): Promise<{
    summary: {
      totalActivities: number;
      paidActivities: number;
      freeActivities: number;
    };
    paymentHistory: any[];
  }> {
    try {
      const isValidId = mongoose.isValidObjectId(memberId);
      if (!isValidId) {
        throw new BadRequestException('Invalid member ID');
      }

      // Get all bookings for the member (excluding cancelled)
      const bookings = await this.bookingModel
        .find({
          memberId: new mongoose.Types.ObjectId(memberId),
          status: { $ne: BookingStatus.CANCELLED },
          deleted_at: null,
        })
        .populate('activityId')
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      // Calculate summary statistics
      const totalActivities = bookings.length;
      const paidActivities = bookings.filter(
        (b) => b.amount > 0 && b.paymentStatus !== null,
      ).length;
      const freeActivities = bookings.filter((b) => b.amount === 0).length;

      // Format payment history
      const paymentHistory = bookings.map((booking) => {
        const activity = booking.activityId as any;
        const host = booking.hostId as any;

        // Determine status based on booking status and activity date
        let displayStatus = 'Completed';
        if (booking.status === BookingStatus.PENDING) {
          displayStatus = 'Pending';
        } else if (booking.status === BookingStatus.CANCELLED) {
          displayStatus = 'Cancelled';
        } else if (booking.status === BookingStatus.CONFIRMED) {
          if (activity && activity.date) {
            const activityDate = new Date(activity.date);
            const now = new Date();
            if (activityDate > now) {
              displayStatus = 'Upcoming';
            } else {
              displayStatus = 'Completed';
            }
          }
        }

        return {
          _id: booking._id,
          activity: {
            _id: activity?._id || activity,
            title: activity?.title || '',
            picture: activity?.picture || null,
            date: activity?.date || null,
            location: activity?.location || null,
          },
          host: {
            _id: host?._id || host,
            name: host?.name || '',
            email: host?.email || '',
            profilePhoto: host?.profilePhoto || null,
          },
          bookingDate: booking.created_at,
          activityDate: activity?.date || null,
          type: booking.amount > 0 ? 'Paid Activity' : 'Free Activity',
          amount: booking.amount,
          status: displayStatus,
          paymentStatus: booking.paymentStatus,
          invoiceNumber: booking.invoiceNumber || null,
          paymentIntentId: booking.paymentIntentId || null,
        };
      });

      return {
        summary: {
          totalActivities,
          paidActivities,
          freeActivities,
        },
        paymentHistory,
      };
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  /**
   * Get invoice details for a specific booking
   */
  async getInvoiceDetails(bookingId: string, memberId: string): Promise<any> {
    try {
      const isValidBookingId = mongoose.isValidObjectId(bookingId);
      const isValidMemberId = mongoose.isValidObjectId(memberId);

      if (!isValidBookingId) {
        throw new BadRequestException('Invalid booking ID');
      }
      if (!isValidMemberId) {
        throw new BadRequestException('Invalid member ID');
      }

      // Get booking with populated data
      const booking = await this.bookingModel
        .findOne({
          _id: bookingId,
          memberId: new mongoose.Types.ObjectId(memberId),
          deleted_at: null,
        })
        .populate('activityId')
        .populate('hostId', 'name email profilePhoto')
        .populate('memberId', 'name email dateOfBirth gender');

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      // Verify member owns this booking
      const bookingMemberId =
        (booking.memberId as any)?._id?.toString() ||
        (booking.memberId as any)?.toString();
      if (bookingMemberId !== memberId) {
        throw new ForbiddenException(
          'You do not have permission to view this invoice',
        );
      }

      const activity = booking.activityId as any;
      const host = booking.hostId as any;
      const member = booking.memberId as any;

      // Get payment details from Stripe if it's a paid booking
      let paymentMethod: {
        type: string;
        card: {
          brand: string;
          last4: string;
          expMonth: number;
          expYear: number;
        };
      } | null = null;
      let transactionId: string | null = null;

      if (booking.amount > 0 && booking.paymentIntentId) {
        try {
          // Get payment intent from Stripe with expanded payment method
          const paymentIntent = await this.stripe.paymentIntents.retrieve(
            booking.paymentIntentId,
            {
              expand: ['payment_method', 'latest_charge'],
            },
          );

          transactionId = paymentIntent.id;

          // Try to get payment method from payment intent first (most reliable)
          let paymentMethodId: string | null = null;

          if (paymentIntent.payment_method) {
            // Payment method might be expanded or just an ID
            if (typeof paymentIntent.payment_method === 'string') {
              paymentMethodId = paymentIntent.payment_method;
            } else {
              // Already expanded
              const pm = paymentIntent.payment_method as any;
              if (pm.card) {
                paymentMethod = {
                  type: pm.type || 'card',
                  card: {
                    brand: pm.card.brand || 'unknown',
                    last4: pm.card.last4 || '',
                    expMonth: pm.card.exp_month || 0,
                    expYear: pm.card.exp_year || 0,
                  },
                };
              } else {
                paymentMethodId = pm.id;
              }
            }
          }

          // If we have a payment method ID but not the details, retrieve it
          if (!paymentMethod && paymentMethodId) {
            try {
              const paymentMethodDetails =
                await this.stripe.paymentMethods.retrieve(paymentMethodId);

              if (paymentMethodDetails.card) {
                paymentMethod = {
                  type: paymentMethodDetails.type,
                  card: {
                    brand: paymentMethodDetails.card.brand,
                    last4: paymentMethodDetails.card.last4,
                    expMonth: paymentMethodDetails.card.exp_month,
                    expYear: paymentMethodDetails.card.exp_year,
                  },
                };
              }
            } catch (pmError: any) {
              console.error(
                'Error retrieving payment method details:',
                pmError.message,
              );
            }
          }

          // Fallback: Try to get from charge if payment intent didn't work
          if (!paymentMethod && paymentIntent.latest_charge) {
            try {
              const chargeId =
                typeof paymentIntent.latest_charge === 'string'
                  ? paymentIntent.latest_charge
                  : paymentIntent.latest_charge.id;

              const chargeDetails = await this.stripe.charges.retrieve(
                chargeId,
                {
                  expand: ['payment_method'],
                },
              );

              // Extract payment method from charge
              if (chargeDetails.payment_method) {
                let chargePmId: string | null = null;
                if (typeof chargeDetails.payment_method === 'string') {
                  chargePmId = chargeDetails.payment_method;
                } else {
                  const chargePm = chargeDetails.payment_method as any;
                  if (chargePm.card) {
                    paymentMethod = {
                      type: chargePm.type || 'card',
                      card: {
                        brand: chargePm.card.brand || 'unknown',
                        last4: chargePm.card.last4 || '',
                        expMonth: chargePm.card.exp_month || 0,
                        expYear: chargePm.card.exp_year || 0,
                      },
                    };
                  } else {
                    chargePmId = chargePm.id;
                  }
                }

                // If we still need to retrieve it
                if (!paymentMethod && chargePmId) {
                  const paymentMethodDetails =
                    await this.stripe.paymentMethods.retrieve(chargePmId);

                  if (paymentMethodDetails.card) {
                    paymentMethod = {
                      type: paymentMethodDetails.type,
                      card: {
                        brand: paymentMethodDetails.card.brand,
                        last4: paymentMethodDetails.card.last4,
                        expMonth: paymentMethodDetails.card.exp_month,
                        expYear: paymentMethodDetails.card.exp_year,
                      },
                    };
                  }
                }
              }
            } catch (chargeError: any) {
              console.error(
                'Error retrieving payment method from charge:',
                chargeError.message,
              );
            }
          }

          // Log if we still don't have payment method
          if (!paymentMethod) {
            console.warn(
              `Could not retrieve payment method for payment intent: ${booking.paymentIntentId}`,
            );
          }
        } catch (stripeError: any) {
          console.error(
            'Error fetching Stripe payment details:',
            stripeError.message,
          );
          // Continue without Stripe details if there's an error
        }
      }

      // Determine status
      let displayStatus = 'Completed';
      if (booking.status === BookingStatus.PENDING) {
        displayStatus = 'Pending';
      } else if (booking.status === BookingStatus.CANCELLED) {
        displayStatus = 'Cancelled';
      } else if (booking.status === BookingStatus.CONFIRMED) {
        if (activity && activity.date) {
          const activityDate = new Date(activity.date);
          const now = new Date();
          if (activityDate > now) {
            displayStatus = 'Upcoming';
          } else {
            displayStatus = 'Completed';
          }
        }
      }

      // Format payment method display
      let paymentMethodDisplay: string | null = null;
      if (paymentMethod && paymentMethod.card) {
        const brand =
          paymentMethod.card.brand.charAt(0).toUpperCase() +
          paymentMethod.card.brand.slice(1);
        paymentMethodDisplay = `${brand} ending in ${paymentMethod.card.last4}`;
      }

      return {
        invoiceNumber: booking.invoiceNumber || null,
        transactionId: transactionId || booking.paymentIntentId || null,
        date: booking.created_at,
        status: displayStatus,
        activity: {
          _id: activity?._id || activity,
          title: activity?.title || '',
          picture: activity?.picture || null,
          date: activity?.date || null,
          location: activity?.location || null,
        },
        host: {
          _id: host?._id || host,
          name: host?.name || '',
          email: host?.email || '',
          profilePhoto: host?.profilePhoto || null,
        },
        member: {
          _id: member?._id || member,
          name: member?.name || '',
          email: member?.email || '',
        },
        activityFee: booking.amount,
        paymentMethod: paymentMethodDisplay,
        totalPaid: booking.amount,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.status,
      };
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

  /**
   * Get all members (confirmed + pending) for an activity
   * Used by host to view attendee list
   */
  async getActivityMembers(
    activityId: string,
    hostId: string,
  ): Promise<{
    activity: any;
    totalAttendees: number;
    confirmed: number;
    pending: number;
    maxParticipants: number;
    members: any[];
  }> {
    try {
      const isValidActivityId = mongoose.isValidObjectId(activityId);
      const isValidHostId = mongoose.isValidObjectId(hostId);

      if (!isValidActivityId) {
        throw new BadRequestException('Invalid activity ID');
      }
      if (!isValidHostId) {
        throw new BadRequestException('Invalid host ID');
      }

      // Verify activity exists and belongs to host
      const activity = await this.activityModel.findById(activityId);
      if (!activity) {
        throw new NotFoundException('Activity not found');
      }

      // Check if host owns this activity
      let activityHostId: string;
      if (
        activity.hostId &&
        typeof activity.hostId === 'object' &&
        '_id' in activity.hostId
      ) {
        activityHostId = (activity.hostId as any)._id.toString();
      } else {
        activityHostId = (activity.hostId as any).toString();
      }

      if (activityHostId !== hostId) {
        throw new ForbiddenException(
          'You can only view members for your own activities',
        );
      }

      // Get all bookings (confirmed and pending) for this activity
      const bookings = await this.bookingModel
        .find({
          activityId: new mongoose.Types.ObjectId(activityId),
          hostId: new mongoose.Types.ObjectId(hostId),
          status: { $in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
          deleted_at: null,
        })
        .populate('memberId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      const confirmedCount = bookings.filter(
        (b) => b.status === BookingStatus.CONFIRMED,
      ).length;
      const pendingCount = bookings.filter(
        (b) => b.status === BookingStatus.PENDING,
      ).length;

      // Format member data
      const members = bookings.map((booking) => {
        const member = booking.memberId as any;
        return {
          _id: booking._id,
          member: {
            _id: member?._id || member,
            name: member?.name || '',
            email: member?.email || '',
            profilePhoto: member?.profilePhoto || null,
          },
          status: booking.status,
          bookedOn: booking.created_at,
          amount: booking.amount,
        };
      });

      return {
        activity: {
          _id: activity._id,
          title: activity.title,
          date: activity.date,
          time: activity.time,
          location: activity.location,
        },
        totalAttendees: bookings.length,
        confirmed: confirmedCount,
        pending: pendingCount,
        maxParticipants: activity.maxParticipants,
        members: members,
      };
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

  /**
   * Get paginated list of all bookings for admin
   * Supports search, filters, and sorting
   */
  async getAllBookingsForAdmin(filters: AdminListBookingsDto): Promise<{
    bookings: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const skip = (page - 1) * limit;

      // Build base query
      const query: any = {
        deleted_at: null,
      };

      // Filter by member id if provided (admin wants bookings of a specific member)
      if (filters.memberId) {
        if (!mongoose.isValidObjectId(filters.memberId)) {
          throw new BadRequestException('Invalid member ID');
        }

        query.memberId = new mongoose.Types.ObjectId(filters.memberId);
      }

      // Status filter
      if (filters.status) {
        query.status = filters.status;
      }

      // Payment status filter
      if (filters.paymentStatus !== undefined) {
        if (filters.paymentStatus === null) {
          // Filter for free activities (paymentStatus is null)
          query.paymentStatus = null;
        } else {
          query.paymentStatus = filters.paymentStatus;
        }
      }

      // Attendance status filter
      if (filters.attendanceStatus) {
        query.attendanceStatus = filters.attendanceStatus;
      }

      // Date range filter (activity date)
      let activityDateFilter: any = null;
      if (filters.startDate || filters.endDate) {
        activityDateFilter = {};
        if (filters.startDate) {
          const startDate = new Date(filters.startDate);
          startDate.setHours(0, 0, 0, 0);
          activityDateFilter.$gte = startDate;
        }
        if (filters.endDate) {
          const endDate = new Date(filters.endDate);
          endDate.setHours(23, 59, 59, 999);
          activityDateFilter.$lte = endDate;
        }
      }

      // Search filter (member name, activity title, host name)
      if (filters.search) {
        // Find matching members
        const matchingMembers = await this.userModel.find({
          name: { $regex: filters.search, $options: 'i' },
          deleted_at: null,
        });
        const matchingMemberIds = matchingMembers.map((member) => member._id);

        // Find matching hosts
        const matchingHosts = await this.userModel.find({
          name: { $regex: filters.search, $options: 'i' },
          deleted_at: null,
        });
        const matchingHostIds = matchingHosts.map((host) => host._id);

        // Find matching activities
        const matchingActivities = await this.activityModel.find({
          $or: [
            { title: { $regex: filters.search, $options: 'i' } },
            { description: { $regex: filters.search, $options: 'i' } },
            { location: { $regex: filters.search, $options: 'i' } },
          ],
          deleted_at: null,
        });
        const matchingActivityIds = matchingActivities.map(
          (activity) => activity._id,
        );

        // Build search conditions
        const searchConditions: any[] = [];

        if (matchingMemberIds.length > 0) {
          searchConditions.push({ memberId: { $in: matchingMemberIds } });
        }

        if (matchingHostIds.length > 0) {
          searchConditions.push({ hostId: { $in: matchingHostIds } });
        }

        if (matchingActivityIds.length > 0) {
          searchConditions.push({ activityId: { $in: matchingActivityIds } });
        }

        if (searchConditions.length > 0) {
          query.$or = searchConditions;
        } else {
          // No matches found, return empty result
          query._id = { $in: [] };
        }
      }

      // Build sort
      const sortBy = filters.sortBy || BookingSortBy.CREATED_AT;
      const sortOrder = filters.sortOrder === SortOrder.ASC ? 1 : -1;
      const sort: any = {};

      // Handle special case for activity date sorting
      if (sortBy === BookingSortBy.ACTIVITY_DATE) {
        // We'll sort after populating activities
        sort.created_at = sortOrder; // Temporary sort
      } else {
        sort[sortBy] = sortOrder;
      }

      // Get paginated bookings
      let bookings = await this.bookingModel
        .find(query)
        .populate('memberId', 'name email profilePhoto')
        .populate('hostId', 'name email profilePhoto')
        .populate(
          'activityId',
          'title description location date time picture category maxParticipants price status',
        )
        .sort(sort)
        .skip(skip)
        .limit(limit);

      // Filter by activity date if specified (after populating)
      if (activityDateFilter) {
        bookings = bookings.filter((booking) => {
          const activity = booking.activityId as any;
          if (!activity || !activity.date) return false;
          const activityDate = new Date(activity.date);
          if (
            activityDateFilter.$gte &&
            activityDate < activityDateFilter.$gte
          ) {
            return false;
          }
          if (
            activityDateFilter.$lte &&
            activityDate > activityDateFilter.$lte
          ) {
            return false;
          }
          return true;
        });
      }

      // Get total count - need to account for activity date filter
      let total: number;
      if (activityDateFilter) {
        // Use aggregation pipeline to filter by activity date efficiently
        const matchStage: any = { ...query };

        const lookupStage = {
          $lookup: {
            from: 'activities',
            localField: 'activityId',
            foreignField: '_id',
            as: 'activity',
          },
        };

        const unwindStage = {
          $unwind: { path: '$activity', preserveNullAndEmptyArrays: false },
        };

        const activityDateMatch: any = {};
        if (activityDateFilter.$gte) {
          activityDateMatch['activity.date'] = {
            $gte: activityDateFilter.$gte,
          };
        }
        if (activityDateFilter.$lte) {
          if (activityDateMatch['activity.date']) {
            activityDateMatch['activity.date'].$lte = activityDateFilter.$lte;
          } else {
            activityDateMatch['activity.date'] = {
              $lte: activityDateFilter.$lte,
            };
          }
        }

        const countResult = await this.bookingModel.aggregate([
          { $match: matchStage },
          lookupStage,
          unwindStage,
          { $match: activityDateMatch },
          { $count: 'total' },
        ]);

        total = countResult.length > 0 ? countResult[0].total : 0;
      } else {
        total = await this.bookingModel.countDocuments(query);
      }

      // Sort by activity date if requested (after filtering)
      if (sortBy === BookingSortBy.ACTIVITY_DATE) {
        bookings.sort((a, b) => {
          const activityA = a.activityId as any;
          const activityB = b.activityId as any;
          const dateA = activityA?.date
            ? new Date(activityA.date).getTime()
            : 0;
          const dateB = activityB?.date
            ? new Date(activityB.date).getTime()
            : 0;
          return sortOrder === 1 ? dateA - dateB : dateB - dateA;
        });
      }

      // Format booking data
      const formattedBookings = bookings.map((booking) => {
        const member = booking.memberId as any;
        const host = booking.hostId as any;
        const activity = booking.activityId as any;

        return {
          _id: booking._id,
          member: {
            _id: member?._id || member,
            name: member?.name || '',
            email: member?.email || '',
            profilePhoto: member?.profilePhoto || null,
          },
          host: {
            _id: host?._id || host,
            name: host?.name || '',
            email: host?.email || '',
            profilePhoto: host?.profilePhoto || null,
          },
          activity: {
            _id: activity?._id || activity,
            title: activity?.title || '',
            description: activity?.description || '',
            location: activity?.location || '',
            date: activity?.date || null,
            time: activity?.time || '',
            picture: activity?.picture || null,
            category: activity?.category || [],
            maxParticipants: activity?.maxParticipants || 0,
            price: activity?.price || 0,
            status: activity?.status || null,
          },
          status: booking.status,
          paymentStatus: booking.paymentStatus || null,
          attendanceStatus:
            booking.attendanceStatus || AttendanceStatus.PENDING,
          amount: booking.amount || 0,
          invoiceNumber: booking.invoiceNumber || null,
          declineReason: booking.declineReason || null,
          created_at: booking.created_at,
          updated_at: booking.updated_at,
        };
      });

      return {
        bookings: formattedBookings,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }
}
