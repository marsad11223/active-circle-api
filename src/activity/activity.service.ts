import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Activity } from 'src/schemas/activity.schema';
import { Rating } from 'src/schemas/rating.schema';
import {
  Booking,
  BookingStatus,
  PaymentStatus,
} from 'src/schemas/booking.schema';
import mongoose, { Model } from 'mongoose';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { BrowseActivitiesDto, PriceFilter } from './dto/browse-activities.dto';
import { User, Role } from 'src/schemas/user.schema';
import { RecurringType, ActivityStatus } from 'src/schemas/activity.schema';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { MailerService } from '@nestjs-modules/mailer';
import {
  activityCancelledFreeToMember,
  activityCancelledWithRefundToMember,
} from 'src/utils/email-templates';

@Injectable()
export class ActivityService {
  private stripe: Stripe;

  constructor(
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Rating.name)
    private readonly ratingModel: Model<Rating>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    private configService: ConfigService,
    private readonly mailerService: MailerService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (stripeSecretKey) {
      this.stripe = new Stripe(stripeSecretKey);
    }
  }

  async create(
    createActivityDto: CreateActivityDto,
    hostId: string,
  ): Promise<Activity> {
    try {
      // Verify user is a host
      const host = await this.userModel.findById(hostId);
      if (!host) {
        throw new NotFoundException('Host not found');
      }

      // Check if user has host role or grantRole
      const isHost =
        host.role === Role.host ||
        host.grantRole === Role.host ||
        host.role === Role.superAdmin;

      if (!isHost) {
        throw new ForbiddenException(
          'Only hosts can create activities. Please switch to host profile.',
        );
      }

      // Convert date string to Date object
      const activityDate = new Date(createActivityDto.date);

      const newActivity = await this.activityModel.create({
        ...createActivityDto,
        hostId: new mongoose.Types.ObjectId(hostId),
        date: activityDate,
        price: createActivityDto.price ?? 0, // Default to 0 if not provided
        recurring: createActivityDto.recurring ?? RecurringType.ONE_TIME,
        status: ActivityStatus.ACTIVE, // New activities are active by default
        created_at: new Date(),
        updated_at: new Date(),
      });

      return newActivity;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async findAll(): Promise<any[]> {
    try {
      const activities = await this.activityModel
        .find({
          deleted_at: null,
          status: ActivityStatus.ACTIVE, // Only show active activities
        })
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      return this.addRatingsToActivities(activities);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  /**
   * Helper method to get booking count for activities
   * Only counts CONFIRMED bookings (not PENDING requests)
   */
  private async getBookingCounts(
    activityIds: mongoose.Types.ObjectId[],
  ): Promise<Map<string, number>> {
    const bookingCounts = await this.bookingModel.aggregate([
      {
        $match: {
          activityId: { $in: activityIds },
          status: BookingStatus.CONFIRMED,
          deleted_at: null,
        },
      },
      {
        $group: {
          _id: '$activityId',
          count: { $sum: 1 },
        },
      },
    ]);

    const countsMap = new Map<string, number>();
    bookingCounts.forEach((item) => {
      countsMap.set(item._id.toString(), item.count);
    });

    return countsMap;
  }

  /**
   * Helper method to add rating information to activities
   */
  private async addRatingsToActivities(activities: Activity[]): Promise<any[]> {
    if (!activities || activities.length === 0) {
      return [];
    }

    const activityIds = activities.map((activity) => activity._id);

    // Get ratings for all activities in one query
    const ratingsData = await this.ratingModel.aggregate([
      {
        $match: {
          activityId: { $in: activityIds },
          deleted_at: null,
        },
      },
      {
        $group: {
          _id: '$activityId',
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    // Create a map of activityId -> rating info
    const ratingsMap = new Map();
    ratingsData.forEach((rating) => {
      ratingsMap.set(rating._id.toString(), {
        averageRating: Math.round(rating.averageRating * 10) / 10, // Round to 1 decimal
        totalReviews: rating.totalReviews,
      });
    });

    // Get booking counts for all activities
    const bookingCountsMap = await this.getBookingCounts(
      activityIds as mongoose.Types.ObjectId[],
    );

    // Add rating information and booking counts to each activity
    return activities.map((activity) => {
      const activityObj = activity.toObject();
      const activityId = (activity._id as any).toString();
      const ratingInfo = ratingsMap.get(activityId) || {
        averageRating: 0,
        totalReviews: 0,
      };

      const bookedCount = bookingCountsMap.get(activityId) || 0;
      const remainingSeats = Math.max(
        0,
        activity.maxParticipants - bookedCount,
      );

      return {
        ...activityObj,
        rating: {
          averageRating: ratingInfo.averageRating,
          totalReviews: ratingInfo.totalReviews,
        },
        bookingInfo: {
          bookedCount: bookedCount,
          remainingSeats: remainingSeats,
          maxParticipants: activity.maxParticipants,
        },
      };
    });
  }

  /**
   * Helper method to add rating information to a single activity
   * Includes full reviews/ratings array
   */
  private async addRatingToActivity(activity: Activity): Promise<any> {
    const activityId = (activity._id as any).toString();

    // Get all ratings/reviews for this activity with member and host details
    const ratings = await this.ratingModel
      .find({
        activityId: new mongoose.Types.ObjectId(activityId),
        deleted_at: null,
      })
      .populate('memberId', 'name email profilePhoto')
      .populate('hostId', 'name email profilePhoto')
      .sort({ created_at: -1 });

    const totalReviews = ratings.length;
    const averageRating =
      totalReviews > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 0;

    const activityObj = activity.toObject();

    // Get booking count for this activity (only CONFIRMED bookings)
    const bookedCount = await this.bookingModel.countDocuments({
      activityId: new mongoose.Types.ObjectId(activityId),
      status: BookingStatus.CONFIRMED,
      deleted_at: null,
    });

    const remainingSeats = Math.max(0, activity.maxParticipants - bookedCount);

    return {
      ...activityObj,
      rating: {
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        totalReviews: totalReviews,
        reviews: ratings.map((rating) => {
          const member = rating.memberId as any;
          const host = rating.hostId as any;
          return {
            _id: rating._id,
            rating: rating.rating,
            review: rating.review,
            hostReply: rating.hostReply || null,
            hostReplyDate: rating.hostReplyDate || null,
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
              profilePhoto: member?.profilePhoto || null,
            },
            createdAt: rating.created_at,
          };
        }),
      },
      bookingInfo: {
        bookedCount: bookedCount,
        remainingSeats: remainingSeats,
        maxParticipants: activity.maxParticipants,
      },
    };
  }

  async browseActivities(
    filters: BrowseActivitiesDto,
    memberId?: string,
  ): Promise<{ activities: any[]; total: number }> {
    try {
      // Build query
      const query: any = {
        deleted_at: null,
        status: ActivityStatus.ACTIVE, // Only show active activities by default
      };

      // Search filter (title or description)
      if (filters.search) {
        query.$or = [
          { title: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } },
        ];
      }

      // Category filter (array of categories)
      // Ensure category is always an array
      let categoryArray: string[] = [];
      if (filters.category) {
        if (Array.isArray(filters.category)) {
          categoryArray = filters.category;
        } else {
          // Convert single string to array
          categoryArray = [filters.category];
        }
      }

      if (categoryArray.length > 0) {
        // Filter out 'All' if present
        const categories = categoryArray.filter((cat) => cat !== 'All');
        if (categories.length > 0) {
          // Match activities that have any of the specified categories
          query.category = { $in: categories };
        }
      }

      // Date filter
      if (filters.date) {
        const filterDate = new Date(filters.date);
        const startOfDay = new Date(filterDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(filterDate);
        endOfDay.setHours(23, 59, 59, 999);
        query.date = {
          $gte: startOfDay,
          $lte: endOfDay,
        };
      }

      // Price filter
      if (filters.price) {
        if (filters.price === PriceFilter.FREE) {
          query.price = { $eq: 0 };
        } else if (filters.price === PriceFilter.PAID) {
          query.price = { $gt: 0 };
        }
        // If 'all', no price filter applied
      }

      // Get member's radius if memberId is provided
      let maxDistance = filters.maxDistance;
      if (memberId && !maxDistance) {
        const member = await this.userModel.findById(memberId);
        if (member && member.radius) {
          maxDistance = member.radius;
        }
      }

      // Note: Distance filtering would require geolocation data (lat/lng)
      // For now, we'll return all activities and let frontend handle distance
      // In future, you can add lat/lng to Activity schema and use $geoNear

      // Execute query
      const activities = await this.activityModel
        .find(query)
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      // Get total count
      const total = await this.activityModel.countDocuments(query);

      // Add rating information to activities using helper method
      const activitiesWithRatings =
        await this.addRatingsToActivities(activities);

      // If memberId is provided, check which activities are already booked
      let activitiesWithBookingStatus = activitiesWithRatings;
      if (memberId) {
        const activityIds = activities.map((activity) => activity._id);

        // Get all bookings for this member for these activities (pending or confirmed only)
        const bookings = await this.bookingModel.find({
          memberId: new mongoose.Types.ObjectId(memberId),
          activityId: { $in: activityIds },
          status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
          deleted_at: null,
        });

        // Create a map of activityId -> booking status
        const bookingMap = new Map();
        bookings.forEach((booking) => {
          const activityId = (booking.activityId as any).toString();
          bookingMap.set(activityId, {
            isBooked: true,
            bookingStatus: booking.status,
            bookingId: booking._id,
          });
        });

        // Add booking information to each activity
        activitiesWithBookingStatus = activitiesWithRatings.map((activity) => {
          const activityId = activity._id.toString();
          const memberBookingStatus = bookingMap.get(activityId) || {
            isBooked: false,
            bookingStatus: null,
            bookingId: null,
          };

          return {
            ...activity,
            isBooked: memberBookingStatus.isBooked,
            bookingStatus: memberBookingStatus.bookingStatus,
            bookingId: memberBookingStatus.bookingId,
            // Explicitly preserve bookingInfo if it exists
            bookingInfo: activity.bookingInfo || {
              bookedCount: 0,
              remainingSeats: activity.maxParticipants || 0,
              maxParticipants: activity.maxParticipants || 0,
            },
          };
        });
      } else {
        // If no memberId, add default values
        activitiesWithBookingStatus = activitiesWithRatings.map((activity) => ({
          ...activity,
          isBooked: false,
          bookingStatus: null,
          bookingId: null,
          // bookingInfo already includes bookedCount, remainingSeats, maxParticipants
        }));
      }

      return {
        activities: activitiesWithBookingStatus,
        total,
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async findOne(id: string, memberId?: string): Promise<any> {
    try {
      const isValidID = mongoose.isValidObjectId(id);
      if (!isValidID) {
        throw new BadRequestException('Invalid activity ID');
      }

      const activity = await this.activityModel
        .findOne({ _id: id, deleted_at: null })
        .populate('hostId', 'name email profilePhoto');

      if (!activity) {
        throw new NotFoundException('Activity not found');
      }

      const activityWithRating = await this.addRatingToActivity(activity);

      // If memberId is provided, check if member has booked this activity
      if (memberId) {
        const booking = await this.bookingModel.findOne({
          memberId: new mongoose.Types.ObjectId(memberId),
          activityId: new mongoose.Types.ObjectId(id),
          status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
          deleted_at: null,
        });

        return {
          ...activityWithRating,
          isBooked: !!booking,
          bookingStatus: booking ? booking.status : null,
          bookingId: booking ? booking._id : null,
        };
      }

      // If no memberId, add default values
      return {
        ...activityWithRating,
        isBooked: false,
        bookingStatus: null,
        bookingId: null,
      };
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

  async findByHost(hostId: string): Promise<any[]> {
    try {
      console.log(hostId, 'hostId');
      const isValidID = mongoose.isValidObjectId(hostId);
      if (!isValidID) {
        throw new BadRequestException('Invalid host ID');
      }

      // Hosts can see all their activities (active, completed, cancelled)
      const activities = await this.activityModel
        .find({
          hostId: new mongoose.Types.ObjectId(hostId),
          deleted_at: null,
        })
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      return this.addRatingsToActivities(activities);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async update(
    id: string,
    updateActivityDto: UpdateActivityDto,
    userId: string,
  ): Promise<Activity> {
    try {
      const activity = await this.findOne(id);
      if (!activity) {
        throw new NotFoundException('Activity not found');
      }

      // Check if user is the host who created the activity or superAdmin
      // Handle both populated and non-populated hostId
      let activityHostId: string;
      if (
        activity.hostId &&
        typeof activity.hostId === 'object' &&
        '_id' in activity.hostId
      ) {
        // hostId is populated (User object)
        activityHostId = activity.hostId._id.toString();
      } else {
        // hostId is just ObjectId
        activityHostId = activity.hostId.toString();
      }
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const isSuperAdmin = user.role === Role.superAdmin;
      const isActivityHost = activityHostId === userId;

      if (!isSuperAdmin && !isActivityHost) {
        throw new ForbiddenException('You can only update your own activities');
      }

      // Convert date string to Date object if date is being updated
      const updateData: any = {
        ...updateActivityDto,
        updated_at: new Date(),
      };

      if (updateActivityDto.date) {
        updateData.date = new Date(updateActivityDto.date);
      }

      const updatedActivity = await this.activityModel.findByIdAndUpdate(
        id,
        updateData,
        { new: true },
      );

      if (!updatedActivity) {
        throw new NotFoundException('Activity not found after update');
      }

      return updatedActivity;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ForbiddenException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async remove(id: string, userId: string): Promise<{ message: string }> {
    try {
      const activity = await this.findOne(id);
      if (!activity) {
        throw new NotFoundException('Activity not found');
      }

      // Check if user is the host who created the activity or superAdmin
      // Handle both populated and non-populated hostId
      let activityHostId: string;
      if (
        activity.hostId &&
        typeof activity.hostId === 'object' &&
        '_id' in activity.hostId
      ) {
        // hostId is populated (User object)
        activityHostId = activity.hostId._id.toString();
      } else {
        // hostId is just ObjectId
        activityHostId = activity.hostId.toString();
      }
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const isSuperAdmin = user.role === Role.superAdmin;
      const isActivityHost = activityHostId === userId;

      if (!isSuperAdmin && !isActivityHost) {
        throw new ForbiddenException('You can only delete your own activities');
      }

      // Soft delete
      await this.activityModel.findByIdAndUpdate(
        id,
        { deleted_at: new Date(), updated_at: new Date() },
        { new: true },
      );

      return {
        message: 'Activity deleted successfully',
      };
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ForbiddenException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async markAsCompleted(id: string, userId: string): Promise<Activity> {
    try {
      const activity = await this.activityModel.findOne({
        _id: id,
        deleted_at: null,
      });

      if (!activity) {
        throw new NotFoundException('Activity not found');
      }

      // Check if user is the host who created the activity or superAdmin
      const activityHostId = (activity.hostId as any).toString();
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const isSuperAdmin = user.role === Role.superAdmin;
      const isActivityHost = activityHostId === userId;

      if (!isSuperAdmin && !isActivityHost) {
        throw new ForbiddenException(
          'You can only mark your own activities as completed',
        );
      }

      // Mark activity as completed
      activity.status = ActivityStatus.COMPLETED;
      activity.updated_at = new Date();
      await activity.save();

      return activity;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ForbiddenException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async reoccurActivity(
    id: string,
    newDate: Date,
    newTime: string,
    userId: string,
  ): Promise<Activity> {
    try {
      const originalActivity = await this.activityModel.findOne({
        _id: id,
        deleted_at: null,
      });

      if (!originalActivity) {
        throw new NotFoundException('Activity not found');
      }

      // Check if user is the host who created the activity or superAdmin
      const activityHostId = (originalActivity.hostId as any).toString();
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const isSuperAdmin = user.role === Role.superAdmin;
      const isActivityHost = activityHostId === userId;

      if (!isSuperAdmin && !isActivityHost) {
        throw new ForbiddenException(
          'You can only re-occur your own activities',
        );
      }

      // Create a new activity based on the original one
      const newActivity = await this.activityModel.create({
        hostId: originalActivity.hostId,
        title: originalActivity.title,
        description: originalActivity.description,
        category: originalActivity.category,
        location: originalActivity.location,
        date: newDate,
        time: newTime,
        maxParticipants: originalActivity.maxParticipants,
        price: originalActivity.price ?? 0,
        recurring: originalActivity.recurring,
        additionalInformation: originalActivity.additionalInformation,
        picture: originalActivity.picture,
        status: ActivityStatus.ACTIVE, // New activity starts as active
        created_at: new Date(),
        updated_at: new Date(),
      });

      return newActivity;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ForbiddenException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async getUpcomingActivities(hostId: string): Promise<any[]> {
    try {
      const isValidID = mongoose.isValidObjectId(hostId);
      if (!isValidID) {
        throw new BadRequestException('Invalid host ID');
      }

      const now = new Date();
      now.setHours(0, 0, 0, 0); // Start of today

      // Get upcoming activities (date >= today and status = ACTIVE)
      const activities = await this.activityModel
        .find({
          hostId: new mongoose.Types.ObjectId(hostId),
          deleted_at: null,
          status: ActivityStatus.ACTIVE,
          date: { $gte: now },
        })
        .populate('hostId', 'name email profilePhoto')
        .sort({ date: 1 }); // Sort by date ascending (earliest first)

      return this.addRatingsToActivities(activities);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async cancelActivity(
    id: string,
    userId: string,
    cancelReason?: string,
  ): Promise<{ message: string; refundsProcessed: number }> {
    try {
      const activity = await this.activityModel.findOne({
        _id: id,
        deleted_at: null,
      });

      if (!activity) {
        throw new NotFoundException('Activity not found');
      }

      // Check if user is the host who created the activity or superAdmin
      const activityHostId = (activity.hostId as any).toString();
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const isSuperAdmin = user.role === Role.superAdmin;
      const isActivityHost = activityHostId === userId;

      if (!isSuperAdmin && !isActivityHost) {
        throw new ForbiddenException('You can only cancel your own activities');
      }

      // Check if activity is already cancelled or completed
      if (activity.status === ActivityStatus.CANCELLED) {
        throw new BadRequestException('Activity is already cancelled');
      }

      if (activity.status === ActivityStatus.COMPLETED) {
        throw new BadRequestException('Cannot cancel a completed activity');
      }

      // Mark activity as cancelled
      activity.status = ActivityStatus.CANCELLED;
      activity.updated_at = new Date();
      await activity.save();

      // Get all confirmed bookings for this activity
      const confirmedBookings = await this.bookingModel.find({
        activityId: new mongoose.Types.ObjectId(id),
        status: BookingStatus.CONFIRMED,
        deleted_at: null,
      });

      // Get all pending bookings for this activity
      const pendingBookings = await this.bookingModel.find({
        activityId: new mongoose.Types.ObjectId(id),
        status: BookingStatus.PENDING,
        deleted_at: null,
      });

      // Process refunds for paid activities
      let refundsProcessed = 0;
      const isPaidActivity = (activity.price || 0) > 0;

      if (isPaidActivity) {
        // Process refunds for confirmed bookings
        for (const booking of confirmedBookings) {
          if (booking.amount > 0 && booking.paymentIntentId) {
            try {
              // Calculate refund amount (fee - stripe fee)
              // Stripe fee: 2.9% + 30 cents
              const stripeFeePercentage = 0.029;
              const stripeFeeFixed = 30; // 30 cents
              const originalAmountCents = Math.round(booking.amount * 100);
              const stripeFee =
                Math.round(originalAmountCents * stripeFeePercentage) +
                stripeFeeFixed;
              const refundAmount = Math.max(0, originalAmountCents - stripeFee);

              if (refundAmount > 0 && this.stripe) {
                // Get charge ID from booking or payment intent
                let chargeId = booking.stripeChargeId;
                if (!chargeId && booking.paymentIntentId) {
                  try {
                    const paymentIntent =
                      await this.stripe.paymentIntents.retrieve(
                        booking.paymentIntentId,
                      );
                    chargeId = paymentIntent.latest_charge as string;
                  } catch (err) {
                    console.error('Error retrieving payment intent:', err);
                  }
                }

                if (chargeId) {
                  try {
                    // Create partial refund
                    const refund = await this.stripe.refunds.create({
                      charge: chargeId,
                      amount: refundAmount,
                      reason: 'requested_by_customer',
                      metadata: {
                        bookingId: (booking._id as any).toString(),
                        activityId: id,
                        type: 'activity_cancelled_by_host',
                      },
                    });

                    // Update booking
                    booking.status = BookingStatus.CANCELLED;
                    booking.paymentStatus = PaymentStatus.REFUNDED;
                    booking.stripeRefundId = refund.id;
                    booking.declineReason =
                      cancelReason || 'Activity cancelled by host';
                    booking.updated_at = new Date();
                    await booking.save();

                    refundsProcessed++;

                    // Send email notification
                    const member = await this.userModel.findById(
                      booking.memberId,
                    );
                    if (member) {
                      const emailsEnabled =
                        this.configService.get<string>('EMAILS_ENABLED') ===
                        'true';
                      if (emailsEnabled) {
                        try {
                          const activityDate = new Date(activity.date);
                          await this.mailerService.sendMail({
                            to: member.email,
                            subject: 'Activity Cancelled - Refund Processed',
                            html: activityCancelledWithRefundToMember({
                              memberName: member.name,
                              memberEmail: member.email,
                              activityTitle: activity.title,
                              activityDate: activityDate.toLocaleDateString(
                                'en-US',
                                {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                },
                              ),
                              cancelReason: cancelReason,
                              originalAmount: booking.amount,
                              refundAmount: refundAmount,
                              refundId: refund.id,
                            }),
                          });
                        } catch (emailError: any) {
                          console.error(
                            'Error sending cancellation email:',
                            emailError,
                          );
                        }
                      }
                    }
                  } catch (refundError: any) {
                    console.error(
                      `Error processing refund for booking ${(booking._id as any).toString()}:`,
                      refundError.message,
                    );
                  }
                }
              }
            } catch (refundError: any) {
              console.error(
                `Error processing refund for booking ${(booking._id as any).toString()}:`,
                refundError.message,
              );
              // Continue with other bookings even if one fails
            }
          }
        }

        // Cancel pending bookings (no refund needed as payment wasn't captured)
        for (const booking of pendingBookings) {
          if (booking.amount > 0 && booking.paymentIntentId && this.stripe) {
            try {
              // Cancel the payment intent (release authorization)
              await this.stripe.paymentIntents.cancel(booking.paymentIntentId);
            } catch (cancelError: any) {
              console.error(
                `Error cancelling payment intent for booking ${(booking._id as any).toString()}:`,
                cancelError.message,
              );
            }
          }

          booking.status = BookingStatus.CANCELLED;
          booking.declineReason = cancelReason || 'Activity cancelled by host';
          booking.updated_at = new Date();
          await booking.save();

          // Send email notification for free activity cancellation
          const member = await this.userModel.findById(booking.memberId);
          if (member) {
            const emailsEnabled =
              this.configService.get<string>('EMAILS_ENABLED') === 'true';
            if (emailsEnabled) {
              try {
                const activityDate = new Date(activity.date);
                await this.mailerService.sendMail({
                  to: member.email,
                  subject: 'Activity Cancelled',
                  html: activityCancelledFreeToMember({
                    memberName: member.name,
                    memberEmail: member.email,
                    activityTitle: activity.title,
                    activityDate: activityDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    }),
                    cancelReason: cancelReason,
                  }),
                });
              } catch (emailError: any) {
                console.error('Error sending cancellation email:', emailError);
              }
            }
          }
        }
      } else {
        // Free activity - just cancel all bookings and send emails
        const allBookings = [...confirmedBookings, ...pendingBookings];
        for (const booking of allBookings) {
          booking.status = BookingStatus.CANCELLED;
          booking.declineReason = cancelReason || 'Activity cancelled by host';
          booking.updated_at = new Date();
          await booking.save();

          // Send email notification
          const member = await this.userModel.findById(booking.memberId);
          if (member) {
            const emailsEnabled =
              this.configService.get<string>('EMAILS_ENABLED') === 'true';
            if (emailsEnabled) {
              try {
                const activityDate = new Date(activity.date);
                await this.mailerService.sendMail({
                  to: member.email,
                  subject: 'Activity Cancelled',
                  html: activityCancelledFreeToMember({
                    memberName: member.name,
                    memberEmail: member.email,
                    activityTitle: activity.title,
                    activityDate: activityDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    }),
                    cancelReason: cancelReason,
                  }),
                });
              } catch (emailError: any) {
                console.error('Error sending cancellation email:', emailError);
              }
            }
          }
        }
      }

      return {
        message: 'Activity cancelled successfully',
        refundsProcessed: refundsProcessed,
      };
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ForbiddenException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }
}
