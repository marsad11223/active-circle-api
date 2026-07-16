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
  AttendanceStatus,
} from 'src/schemas/booking.schema';
import mongoose, { Model } from 'mongoose';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { BrowseActivitiesDto, PriceFilter } from './dto/browse-activities.dto';
import { NearbyActivitiesDto } from './dto/nearby-activities.dto';
import {
  AdminListActivitiesDto,
  ActivitySortBy,
  SortOrder,
  ActivityTimeFilter,
  ActivityStatusFilter,
} from './dto/admin-list-activities.dto';
import { GrantRole, User, Role } from 'src/schemas/user.schema';
import { RecurringType, ActivityStatus } from 'src/schemas/activity.schema';
import {
  Subscription,
  SubscriptionStatus,
  SubscriptionPlan,
} from 'src/schemas/subscription.schema';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { EmailService } from '../email/email.service';

const STANDARD_HOST_FREE_LIMIT = 2;
const STANDARD_HOST_PAID_LIMIT = 1;
const EARTH_RADIUS_MILES = 3958.8;
const MEMBER_NEARBY_RADIUS_MILES = 25;
import {
  activityCancelledFreeToMember,
  activityCancelledWithRefundToMember,
} from 'src/utils/email-templates';
import { DateTime } from 'luxon';
import {
  UK_TZ,
  HOST_SCHEDULE_MAX_RANGE_DAYS,
  activityDateTimeRangeLondon,
  eachLondonDayInclusive,
  ukLocalDateTimeToUtcDate,
} from 'src/utils/uk-time';
import { HostScheduleQueryDto } from './dto/host-schedule-query.dto';
import { NotificationsService } from 'src/notifications/notifications.service';
import { buildNotificationData } from 'src/notifications/notification-payload.util';

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
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<Subscription>,
    private configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (stripeSecretKey) {
      this.stripe = new Stripe(stripeSecretKey);
    }
  }

  /**
   * Get members for an activity (admin or the host of the activity)
   */
  async getActivityMembers(
    activityId: string,
    requesterId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ members: any[]; total: number; page: number; limit: number }> {
    try {
      const activity = await this.activityModel.findById(activityId);
      if (!activity || activity.deleted_at) {
        throw new NotFoundException('Activity not found');
      }

      // Fetch requester to check role
      const requester = await this.userModel
        .findById(requesterId)
        .select('role');
      if (!requester) {
        throw new NotFoundException('Requester not found');
      }

      const isAdmin = requester.role === Role.superAdmin;
      const isHost = (activity.hostId as any).toString() === requesterId;

      if (!isAdmin && !isHost) {
        throw new ForbiddenException(
          'Only activity host or admin can view members list',
        );
      }

      const skip = (page - 1) * limit;

      // Only include confirmed bookings (members who have booked)
      const query: any = {
        activityId: new mongoose.Types.ObjectId(activityId),
        status: BookingStatus.CONFIRMED,
        deleted_at: null,
      };

      const total = await this.bookingModel.countDocuments(query);

      const bookings = await this.bookingModel
        .find(query)
        .populate('memberId', 'name email profilePhoto dateOfBirth gender')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit);

      const members = bookings.map((b) => {
        const member = (b.memberId as any) || null;
        return {
          bookingId: b._id,
          memberId: member?._id || null,
          name: member?.name || null,
          email: member?.email || null,
          profilePhoto: member?.profilePhoto || null,
          dateOfBirth: member?.dateOfBirth || null,
          gender: member?.gender || null,
          amount: b.amount,
          paymentStatus: b.paymentStatus,
          attendanceStatus: b.attendanceStatus,
          createdAt: b.created_at,
        };
      });

      return {
        members,
        total,
        page,
        limit,
      };
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

      const canCreate =
        host.role === Role.premiumMember ||
        host.grantRole === GrantRole.host ||
        host.role === Role.standardMember ||
        host.role === Role.superAdmin ||
        host.isLifetimeHost === true;

      if (!canCreate) {
        throw new ForbiddenException(
          'Only hosts can create activities. Please switch to host mode.',
        );
      }

      // Standard Member (Host plan): free activities only
      if (host.role === Role.standardMember && !host.isLifetimeHost) {
        const price = createActivityDto.price ?? 0;

        // Block paid activities entirely
        if (price > 0) {
          throw new BadRequestException(
            'Standard plan (Host) only supports free activities. Upgrade to Host Plus for paid activities.',
          );
        }

        const sub = await this.subscriptionModel.findOne({
          userId: host._id,
          status: {
            $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
          plan: SubscriptionPlan.STANDARD,
        });
        if (sub?.currentPeriodStart && sub?.currentPeriodEnd) {
          const freeCount = await this.activityModel.countDocuments({
            hostId: new mongoose.Types.ObjectId(hostId),
            status: { $ne: ActivityStatus.CANCELLED },
            created_at: {
              $gte: sub.currentPeriodStart,
              $lte: sub.currentPeriodEnd,
            },
          });
          if (freeCount >= STANDARD_HOST_FREE_LIMIT) {
            throw new BadRequestException(
              `Standard plan limit: you can create up to ${STANDARD_HOST_FREE_LIMIT} free activities per billing period. Upgrade to Host Plus for unlimited.`,
            );
          }
        }
      }
            throw new BadRequestException(
              `Standard plan limit: you can create up to ${STANDARD_HOST_FREE_LIMIT} free activities per billing period. Upgrade to premium for unlimited.`,
            );
          }
          if (price > 0 && paidCount >= STANDARD_HOST_PAID_LIMIT) {
            throw new BadRequestException(
              `Standard plan limit: you can create up to ${STANDARD_HOST_PAID_LIMIT} paid activity per billing period. Upgrade to premium for unlimited.`,
            );
          }
        }
      }

      const startDateTime = ukLocalDateTimeToUtcDate(
        createActivityDto.startDateTime,
      );
      const endDateTime = ukLocalDateTimeToUtcDate(
        createActivityDto.endDateTime,
      );
      if (!startDateTime || !endDateTime) {
        throw new BadRequestException(
          'startDateTime and endDateTime must be valid UK-local ISO datetimes',
        );
      }
      const normalizedPicture = createActivityDto.picture?.trim();
      const normalizedPictures = (createActivityDto.pictures || [])
        .filter((img): img is string => typeof img === 'string')
        .map((img) => img.trim())
        .filter((img) => img.length > 0);

      const primaryPicture = normalizedPicture || normalizedPictures[0];
      if (!primaryPicture) {
        throw new BadRequestException(
          'At least one image is required (picture or pictures)',
        );
      }

      const pictures =
        normalizedPictures.length > 0 ? normalizedPictures : [primaryPicture];

      const newActivity = await this.activityModel.create({
        ...createActivityDto,
        hostId: new mongoose.Types.ObjectId(hostId),
        startDateTime,
        endDateTime,
        date: startDateTime,
        picture: primaryPicture,
        pictures,
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

  async findAll(includePast: boolean = false): Promise<any[]> {
    try {
      const query: any = {
        deleted_at: null,
        status: includePast
          ? { $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED] }
          : ActivityStatus.ACTIVE, // Only show active activities by default
      };

      if (!includePast) {
        query.date = {
          $gte: DateTime.now().setZone(UK_TZ).startOf('day').toUTC().toJSDate(),
        };
      }

      const activities = await this.activityModel
        .find(query)
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
   * Also includes ratings from original activities if activities are re-occurred
   */
  private async addRatingsToActivities(activities: Activity[]): Promise<any[]> {
    if (!activities || activities.length === 0) {
      return [];
    }

    const activityIds = activities.map((activity) => activity._id);

    // Collect all activity IDs including original activity IDs for re-occurred activities
    const allActivityIds = [...activityIds];
    activities.forEach((activity) => {
      const activityObj = activity.toObject();
      if (activityObj.originalActivityId) {
        allActivityIds.push(
          new mongoose.Types.ObjectId(activityObj.originalActivityId),
        );
      }
    });

    // Get ratings for all activities (including original activities) in one query
    const ratingsData = await this.ratingModel.aggregate([
      {
        $match: {
          activityId: { $in: allActivityIds },
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
      const id = rating._id.toString();
      ratingsMap.set(id, {
        averageRating: Math.round(rating.averageRating * 10) / 10, // Round to 1 decimal
        totalReviews: rating.totalReviews,
      });
    });

    // For each activity, combine ratings from current activity and original activity
    const combinedRatingsMap = new Map();
    activities.forEach((activity) => {
      const activityId = (activity._id as any).toString();
      const activityObj = activity.toObject();

      // Get ratings for current activity
      const currentRatings = ratingsMap.get(activityId) || {
        averageRating: 0,
        totalReviews: 0,
      };

      // Get ratings for original activity if exists
      let originalRatings = { averageRating: 0, totalReviews: 0 };
      if (activityObj.originalActivityId) {
        const originalId = activityObj.originalActivityId.toString();
        originalRatings = ratingsMap.get(originalId) || {
          averageRating: 0,
          totalReviews: 0,
        };
      }

      // Combine ratings: calculate weighted average
      const totalReviews =
        currentRatings.totalReviews + originalRatings.totalReviews;
      let averageRating = 0;
      if (totalReviews > 0) {
        const currentSum =
          currentRatings.averageRating * currentRatings.totalReviews;
        const originalSum =
          originalRatings.averageRating * originalRatings.totalReviews;
        averageRating = (currentSum + originalSum) / totalReviews;
      }

      combinedRatingsMap.set(activityId, {
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews: totalReviews,
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
      const ratingInfo = combinedRatingsMap.get(activityId) || {
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
   * Also includes ratings from original activity if this is a re-occurred activity
   */
  private async addRatingToActivity(activity: Activity): Promise<any> {
    const activityId = (activity._id as any).toString();
    const activityObj = activity.toObject();

    // Collect activity IDs to fetch ratings from (current + original if exists)
    const activityIdsToFetch = [new mongoose.Types.ObjectId(activityId)];
    if (activityObj.originalActivityId) {
      activityIdsToFetch.push(
        new mongoose.Types.ObjectId(activityObj.originalActivityId),
      );
    }

    // Get all ratings/reviews for this activity and original activity (if re-occurred)
    const ratings = await this.ratingModel
      .find({
        activityId: { $in: activityIdsToFetch },
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
  ): Promise<{
    activities: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const skip = (page - 1) * limit;

      // Build query
      const query: any = {
        deleted_at: null,
        status: ActivityStatus.ACTIVE, // Only show active activities by default
      };

      // Exclude past activities from browse results by default
      const todayUkStartUtc = DateTime.now()
        .setZone(UK_TZ)
        .startOf('day')
        .toUTC()
        .toJSDate();
      query.date = { $gte: todayUkStartUtc };

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
        const selectedDate = DateTime.fromISO(filters.date, {
          zone: UK_TZ,
        }).startOf('day');
        const startOfDay = selectedDate.toUTC().toJSDate();
        const endOfDay = selectedDate.endOf('day').toUTC().toJSDate();
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
        .sort({ date: 1, created_at: -1 })
        .skip(skip)
        .limit(limit);

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
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async getNearbyActivitiesForMember(
    query: NearbyActivitiesDto,
    memberId: string,
  ): Promise<{ activities: any[]; total: number }> {
    try {
      // Determine date range: either a specific day (when `date` provided)
      // or a whole month when `month` is provided. If `month` is present
      // and `date` is provided, use the year from `date`; otherwise use
      // the current year in UK time.
      let startUtc: Date;
      let endUtc: Date;

      if (query.month !== undefined && query.month !== null) {
        const monthNum = Math.floor(query.month);

        // Determine year precedence: explicit `query.year` -> year from
        // `query.date` -> current UK year.
        let year: number;
        if (query.year !== undefined && query.year !== null) {
          year = Math.floor(query.year);
          if (year < 1900 || year > 3000) {
            throw new BadRequestException('year must be between 1900 and 3000');
          }
        } else if (query.date) {
          year = DateTime.fromISO(query.date, { zone: UK_TZ }).year;
        } else {
          year = DateTime.now().setZone(UK_TZ).year;
        }

        const startOfMonth = DateTime.fromObject(
          {
            year,
            month: monthNum,
          },
          { zone: UK_TZ },
        ).startOf('month');

        if (!startOfMonth.isValid) {
          throw new BadRequestException('month must be between 1 and 12');
        }

        const endOfMonth = startOfMonth.endOf('month');
        startUtc = startOfMonth.toUTC().toJSDate();
        endUtc = endOfMonth.toUTC().toJSDate();
      } else {
        if (!query.date) {
          throw new BadRequestException(
            'date is required when month is not provided',
          );
        }

        const selectedDate = DateTime.fromISO(query.date, {
          zone: UK_TZ,
        }).startOf('day');
        if (!selectedDate.isValid) {
          throw new BadRequestException('date must be a valid ISO date');
        }

        startUtc = selectedDate.toUTC().toJSDate();
        endUtc = selectedDate.endOf('day').toUTC().toJSDate();
      }

      const activities = await this.activityModel
        .find({
          deleted_at: null,
          status: ActivityStatus.ACTIVE,
          date: {
            $gte: startUtc,
            $lte: endUtc,
          },
          'coordinates.lat': { $type: 'number' },
          'coordinates.lng': { $type: 'number' },
        })
        .populate('hostId', 'name email profilePhoto')
        .sort({ date: 1, title: 1 });

      const activitiesWithRatings =
        await this.addRatingsToActivities(activities);

      const nearbyActivities = activitiesWithRatings
        .map((activity) => {
          const lat = activity?.coordinates?.lat;
          const lng = activity?.coordinates?.lng;
          if (typeof lat !== 'number' || typeof lng !== 'number') {
            return null;
          }

          const distanceMiles = this.calculateDistanceMiles(
            query.lat,
            query.lng,
            lat,
            lng,
          );

          if (distanceMiles > MEMBER_NEARBY_RADIUS_MILES) {
            return null;
          }

          return {
            ...activity,
            distanceMiles: Number(distanceMiles.toFixed(2)),
          };
        })
        .filter((activity): activity is any => activity !== null)
        .sort((a, b) => {
          if (a.distanceMiles !== b.distanceMiles) {
            return a.distanceMiles - b.distanceMiles;
          }
          if (a.date && b.date) {
            return new Date(a.date).getTime() - new Date(b.date).getTime();
          }
          return (a.title || '').localeCompare(b.title || '');
        });

      const activityIds = nearbyActivities.map((activity) => activity._id);
      const bookings = await this.bookingModel.find({
        memberId: new mongoose.Types.ObjectId(memberId),
        activityId: { $in: activityIds },
        status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        deleted_at: null,
      });

      const bookingMap = new Map();
      bookings.forEach((booking) => {
        bookingMap.set((booking.activityId as any).toString(), {
          isBooked: true,
          bookingStatus: booking.status,
          bookingId: booking._id,
        });
      });

      const activitiesWithBookingStatus = nearbyActivities.map((activity) => {
        const memberBookingStatus = bookingMap.get(activity._id.toString()) || {
          isBooked: false,
          bookingStatus: null,
          bookingId: null,
        };

        return {
          ...activity,
          isBooked: memberBookingStatus.isBooked,
          bookingStatus: memberBookingStatus.bookingStatus,
          bookingId: memberBookingStatus.bookingId,
        };
      });

      return {
        activities: activitiesWithBookingStatus,
        total: activitiesWithBookingStatus.length,
      };
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException((err as Error).message);
    }
  }

  private calculateDistanceMiles(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
  ): number {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const deltaLat = toRadians(toLat - fromLat);
    const deltaLng = toRadians(toLng - fromLng);
    const originLat = toRadians(fromLat);
    const destinationLat = toRadians(toLat);

    const haversine =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(originLat) *
        Math.cos(destinationLat) *
        Math.sin(deltaLng / 2) ** 2;

    const angularDistance =
      2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    return EARTH_RADIUS_MILES * angularDistance;
  }

  private async getConfirmedMemberIdsForActivity(
    activityId: string,
  ): Promise<string[]> {
    const bookings = await this.bookingModel
      .find({
        activityId: new mongoose.Types.ObjectId(activityId),
        status: BookingStatus.CONFIRMED,
        deleted_at: null,
      })
      .select('memberId')
      .lean();

    return [
      ...new Set(
        bookings
          .map((booking) => booking.memberId?.toString())
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  }

  private async sendBulkActivityNotificationSafely(
    memberIds: string[],
    title: string,
    body: string,
    type: 'activity_updated' | 'activity_cancelled' | 'review_request',
    activityId: string,
  ): Promise<void> {
    if (!memberIds.length) {
      return;
    }

    try {
      const screen =
        type === 'review_request' ? '/(tabs)/reviews' : '/(tabs)/browse-detail';
      await this.notificationsService.sendToMultipleUsers(
        memberIds,
        title,
        body,
        buildNotificationData(type, screen, activityId, {
          id: activityId,
          activityId,
        }),
      );
    } catch (error) {
      console.error(
        `[Push] Failed to send ${type} notifications for activity ${activityId}:`,
        error,
      );
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
      const existingActivity = await this.activityModel.findOne({
        _id: id,
        deleted_at: null,
      });
      if (!existingActivity) {
        throw new NotFoundException('Activity not found');
      }

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

      const updateData: any = {
        ...updateActivityDto,
        updated_at: new Date(),
      };

      if (updateActivityDto.startDateTime) {
        const startDateTime = ukLocalDateTimeToUtcDate(
          updateActivityDto.startDateTime,
        );
        if (!startDateTime) {
          throw new BadRequestException(
            'startDateTime must be a valid UK-local ISO datetime',
          );
        }
        updateData.startDateTime = startDateTime;
        updateData.date = startDateTime;
      }

      if (updateActivityDto.endDateTime) {
        const endDateTime = ukLocalDateTimeToUtcDate(
          updateActivityDto.endDateTime,
        );
        if (!endDateTime) {
          throw new BadRequestException(
            'endDateTime must be a valid UK-local ISO datetime',
          );
        }
        updateData.endDateTime = endDateTime;
      }

      const significantFieldUpdated =
        updateActivityDto.startDateTime !== undefined ||
        updateActivityDto.endDateTime !== undefined ||
        updateActivityDto.location !== undefined ||
        updateActivityDto.coordinates !== undefined;

      const updatedActivity = await this.activityModel.findByIdAndUpdate(
        id,
        updateData,
        { new: true },
      );

      if (!updatedActivity) {
        throw new NotFoundException('Activity not found after update');
      }

      if (significantFieldUpdated) {
        const memberIds = await this.getConfirmedMemberIdsForActivity(id);
        await this.sendBulkActivityNotificationSafely(
          memberIds,
          'Activity Updated',
          'An activity you joined has been updated.',
          'activity_updated',
          (existingActivity._id as any).toString(),
        );
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

      const activityId = (activity._id as any).toString();
      const memberIds = await this.getConfirmedMemberIdsForActivity(activityId);
      await this.sendBulkActivityNotificationSafely(
        memberIds,
        'Share Your Feedback',
        'How was your activity? Leave a quick review.',
        'review_request',
        activityId,
      );

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
    newStartDateTime: string,
    newEndDateTime: string,
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

      // Determine the original activity ID
      // If the activity being re-occurred already has an originalActivityId, use that
      // Otherwise, use the current activity's ID as the original
      const originalActivityId =
        originalActivity.originalActivityId || originalActivity._id;

      const startDateTime = ukLocalDateTimeToUtcDate(newStartDateTime);
      const endDateTime = ukLocalDateTimeToUtcDate(newEndDateTime);
      if (!startDateTime || !endDateTime) {
        throw new BadRequestException(
          'startDateTime and endDateTime must be valid UK-local ISO datetimes',
        );
      }

      // Create a new activity based on the original one
      const newActivity = await this.activityModel.create({
        hostId: originalActivity.hostId,
        title: originalActivity.title,
        description: originalActivity.description,
        category: originalActivity.category,
        location: originalActivity.location,
        coordinates: originalActivity.coordinates,
        difficultyLevel: originalActivity.difficultyLevel,
        startDateTime,
        endDateTime,
        date: startDateTime,
        maxParticipants: originalActivity.maxParticipants,
        price: originalActivity.price ?? 0,
        recurring: originalActivity.recurring,
        additionalInformation: originalActivity.additionalInformation,
        picture: originalActivity.picture,
        pictures: originalActivity.pictures || [originalActivity.picture],
        status: ActivityStatus.ACTIVE, // New activity starts as active
        originalActivityId: originalActivityId, // Link to original activity for ratings
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
        // Process refunds for confirmed bookings — HOST CANCEL = FULL REFUND TO MEMBER
        // Member gets back every penny including platform fee and Stripe fee
        // Platform absorbs any unrecoverable Stripe costs
        for (const booking of confirmedBookings) {
          if (booking.paymentIntentId) {
            try {
              // Full refund of totalAmountPaid (what member was charged)
              const totalPaidCents = Math.round(
                (booking.totalAmountPaid || booking.amount) * 100,
              );

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

              if (chargeId && totalPaidCents > 0) {
                try {
                  const refund = await this.stripe.refunds.create({
                    charge: chargeId,
                    amount: totalPaidCents, // Full refund of everything member paid
                    reason: 'requested_by_customer',
                    metadata: {
                      bookingId: (booking._id as any).toString(),
                      activityId: id,
                      type: 'activity_cancelled_by_host',
                      fullRefund: 'true',
                    },
                  });

                  booking.status = BookingStatus.CANCELLED;
                  booking.paymentStatus = PaymentStatus.REFUNDED;
                  booking.stripeRefundId = refund.id;
                  booking.declineReason = cancelReason || 'Activity cancelled by host';
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
                          await this.emailService.sendMail({
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
                await this.emailService.sendMail({
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
                await this.emailService.sendMail({
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

      const recipientMemberIds = [
        ...new Set(
          [...confirmedBookings, ...pendingBookings]
            .map((booking) => booking.memberId?.toString())
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      await this.sendBulkActivityNotificationSafely(
        recipientMemberIds,
        'Activity Cancelled',
        'An activity you joined was cancelled.',
        'activity_cancelled',
        id,
      );

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

  async getPastActivities(
    hostId: string,
    statusFilter?: string | string[],
  ): Promise<any[]> {
    try {
      const isValidID = mongoose.isValidObjectId(hostId);
      if (!isValidID) {
        throw new BadRequestException('Invalid host ID');
      }

      const now = new Date();
      now.setHours(0, 0, 0, 0); // Start of today

      const allowedStatuses = new Set<string>([
        ActivityStatus.ACTIVE,
        ActivityStatus.COMPLETED,
        ActivityStatus.CANCELLED,
      ]);

      const requestedStatuses = Array.isArray(statusFilter)
        ? statusFilter
        : statusFilter
          ? statusFilter.split(',')
          : [];

      const normalizedStatuses = requestedStatuses
        .map((value) => value.trim())
        .filter((value) => value && value !== ActivityStatusFilter.ALL)
        .filter((value) => allowedStatuses.has(value));

      const query: any = {
        hostId: new mongoose.Types.ObjectId(hostId),
        deleted_at: null,
        date: { $lt: now },
      };

      if (normalizedStatuses.length > 0) {
        query.status =
          normalizedStatuses.length === 1
            ? normalizedStatuses[0]
            : { $in: normalizedStatuses };
      }

      // Get only activities from before today, with optional status filtering
      const activities = await this.activityModel
        .find(query)
        .populate('hostId', 'name email profilePhoto')
        .sort({ date: -1 }); // Sort by date descending (most recent first)

      if (activities.length === 0) {
        return [];
      }

      const activityIds = activities.map((activity) => activity._id);

      // Get all confirmed bookings for these activities
      const allBookings = await this.bookingModel.find({
        activityId: { $in: activityIds },
        status: BookingStatus.CONFIRMED,
        deleted_at: null,
      });

      // Get all ratings for these activities (including original activities if re-occurred)
      const allActivityIdsForRatings = [...activityIds];
      activities.forEach((activity) => {
        const activityObj = activity.toObject();
        if (activityObj.originalActivityId) {
          allActivityIdsForRatings.push(
            new mongoose.Types.ObjectId(activityObj.originalActivityId),
          );
        }
      });

      const allRatings = await this.ratingModel.find({
        activityId: { $in: allActivityIdsForRatings },
        deleted_at: null,
      });

      // Create maps for quick lookup
      const bookingsByActivity = new Map();
      const ratingsByActivity = new Map();

      allBookings.forEach((booking) => {
        const activityId = (booking.activityId as any).toString();
        if (!bookingsByActivity.has(activityId)) {
          bookingsByActivity.set(activityId, []);
        }
        bookingsByActivity.get(activityId).push(booking);
      });

      // Group ratings by activity (including original activity ratings)
      activities.forEach((activity) => {
        const activityId = (activity._id as any).toString();
        const activityObj = activity.toObject();
        const activityIdsToCheck = [activityId];
        if (activityObj.originalActivityId) {
          activityIdsToCheck.push(activityObj.originalActivityId.toString());
        }
        const activityRatings = allRatings.filter((rating) => {
          const ratingActivityId = (rating.activityId as any).toString();
          return activityIdsToCheck.includes(ratingActivityId);
        });
        ratingsByActivity.set(activityId, activityRatings);
      });

      // Build detailed activity data
      const activitiesWithDetails = activities.map((activity) => {
        const activityId = (activity._id as any).toString();
        const bookings = bookingsByActivity.get(activityId) || [];
        const ratings = ratingsByActivity.get(activityId) || [];

        // Calculate attendance breakdown
        const presentCount = bookings.filter(
          (b) => b.attendanceStatus === AttendanceStatus.PRESENT,
        ).length;
        const absentCount = bookings.filter(
          (b) => b.attendanceStatus === AttendanceStatus.ABSENT,
        ).length;
        const pendingCount = bookings.filter(
          (b) =>
            !b.attendanceStatus ||
            b.attendanceStatus === AttendanceStatus.PENDING,
        ).length;

        // Calculate earnings for this activity
        const earningsGenerated = bookings.reduce(
          (sum, booking) => sum + (booking.amount || 0),
          0,
        );

        // Calculate average rating for this activity
        const activityAverageRating =
          ratings.length > 0
            ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
            : 0;

        return {
          _id: activity._id,
          title: activity.title,
          description: activity.description,
          category: activity.category,
          location: activity.location,
          coordinates: activity.coordinates,
          difficultyLevel: activity.difficultyLevel,
          date: activity.date,
          startDateTime: activity.startDateTime || activity.date,
          endDateTime: activity.endDateTime || null,
          recurring: activity.recurring,
          additionalInformation: activity.additionalInformation,
          picture: activity.picture,
          maxParticipants: activity.maxParticipants,
          price: activity.price || 0,
          status: activity.status,
          hostId: activity.hostId,
          attendance: {
            total: bookings.length,
            attended: presentCount,
            noShow: absentCount,
            pending: pendingCount,
            summary: `${presentCount}/${bookings.length} attended`,
          },
          reviewsAndRatings: {
            averageRating: Math.round(activityAverageRating * 10) / 10,
            totalReviews: ratings.length,
            summary: `${Math.round(activityAverageRating * 10) / 10} stars (out of 5, with ${ratings.length} review${ratings.length !== 1 ? 's' : ''})`,
          },
          earningsGenerated: earningsGenerated,
        };
      });

      return activitiesWithDetails;
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  /**
   * Get paginated list of all activities for admin
   * Supports search, filters, and sorting
   */
  async getAllActivitiesForAdmin(filters: AdminListActivitiesDto): Promise<{
    activities: any[];
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

      // Filter by hostId if provided
      if ((filters as any).hostId) {
        if (!mongoose.isValidObjectId((filters as any).hostId)) {
          throw new BadRequestException('Invalid host ID');
        }
        query.hostId = new mongoose.Types.ObjectId((filters as any).hostId);
      }

      // Time filter (upcoming, past, or all)
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Start of today
      const timeFilter = filters.timeFilter || ActivityTimeFilter.ALL;
      const statusFilter = filters.status || ActivityStatusFilter.ALL;

      // Build date and status query based on time filter and status filter
      if (timeFilter === ActivityTimeFilter.UPCOMING) {
        // Upcoming: date >= today
        query.date = { $gte: now };
        // Apply status filter if specified
        if (statusFilter !== ActivityStatusFilter.ALL) {
          query.status = statusFilter;
        } else {
          // Default to active for upcoming if no status filter
          query.status = ActivityStatus.ACTIVE;
        }
      } else if (timeFilter === ActivityTimeFilter.PAST) {
        // Past: date < today OR status = COMPLETED
        if (statusFilter !== ActivityStatusFilter.ALL) {
          // If status filter is specified, combine with date filter
          if (statusFilter === ActivityStatusFilter.COMPLETED) {
            // Completed activities can be any date
            query.status = ActivityStatus.COMPLETED;
          } else {
            // For active or cancelled, check date
            query.date = { $lt: now };
            query.status = statusFilter;
          }
        } else {
          // No status filter: show completed or active with past date
          query.$or = [
            { status: ActivityStatus.COMPLETED },
            {
              status: ActivityStatus.ACTIVE,
              date: { $lt: now },
            },
          ];
        }
      } else {
        // timeFilter === ALL
        // Apply status filter if specified
        if (statusFilter !== ActivityStatusFilter.ALL) {
          query.status = statusFilter;
        }
        // If both are ALL, no additional filters (show all activities)
      }

      // Search filter (title and host name)
      if (filters.search) {
        // First, find host IDs that match the search
        const matchingHosts = await this.userModel.find({
          name: { $regex: filters.search, $options: 'i' },
          deleted_at: null,
        });
        const matchingHostIds = matchingHosts.map((host) => host._id);

        // Build search conditions
        const searchConditions: any[] = [
          { title: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } },
          { location: { $regex: filters.search, $options: 'i' } },
        ];

        if (matchingHostIds.length > 0) {
          searchConditions.push({ hostId: { $in: matchingHostIds } });
        }

        // If query already has $or (from past activities filter), we need to combine
        if (query.$or) {
          // Combine existing $or with search conditions using $and
          query.$and = [{ $or: query.$or }, { $or: searchConditions }];
          delete query.$or;
        } else {
          // No existing $or, just add search conditions
          query.$or = searchConditions;
        }
      }

      // Build sort
      const sortBy = filters.sortBy || ActivitySortBy.DATE;
      const sortOrder = filters.sortOrder === SortOrder.ASC ? 1 : -1;
      const sort: any = {};
      sort[sortBy] = sortOrder;

      // Get total count
      const total = await this.activityModel.countDocuments(query);

      // Get paginated activities
      const activities = await this.activityModel
        .find(query)
        .populate('hostId', 'name email profilePhoto')
        .sort(sort)
        .skip(skip)
        .limit(limit);

      if (activities.length === 0) {
        return {
          activities: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }

      const activityIds = activities.map((activity) => activity._id);

      // Get all confirmed bookings for these activities
      const allBookings = await this.bookingModel.find({
        activityId: { $in: activityIds },
        status: BookingStatus.CONFIRMED,
        deleted_at: null,
      });

      // Get all ratings for these activities (including original activities if re-occurred)
      const allActivityIdsForRatings = [...activityIds];
      activities.forEach((activity) => {
        const activityObj = activity.toObject();
        if (activityObj.originalActivityId) {
          allActivityIdsForRatings.push(
            new mongoose.Types.ObjectId(activityObj.originalActivityId),
          );
        }
      });

      const allRatings = await this.ratingModel.find({
        activityId: { $in: allActivityIdsForRatings },
        deleted_at: null,
      });

      // Create maps for quick lookup
      const bookingsByActivity = new Map();
      const ratingsByActivity = new Map();

      allBookings.forEach((booking) => {
        const activityId = (booking.activityId as any).toString();
        if (!bookingsByActivity.has(activityId)) {
          bookingsByActivity.set(activityId, []);
        }
        bookingsByActivity.get(activityId).push(booking);
      });

      // Group ratings by activity (including original activity ratings)
      activities.forEach((activity) => {
        const activityId = (activity._id as any).toString();
        const activityObj = activity.toObject();
        const activityIdsToCheck = [activityId];
        if (activityObj.originalActivityId) {
          activityIdsToCheck.push(activityObj.originalActivityId.toString());
        }
        const activityRatings = allRatings.filter((rating) => {
          const ratingActivityId = (rating.activityId as any).toString();
          return activityIdsToCheck.includes(ratingActivityId);
        });
        ratingsByActivity.set(activityId, activityRatings);
      });

      // Build detailed activity data
      const activitiesWithDetails = activities.map((activity) => {
        const activityId = (activity._id as any).toString();
        const bookings = bookingsByActivity.get(activityId) || [];
        const ratings = ratingsByActivity.get(activityId) || [];

        // Calculate attendance breakdown
        const presentCount = bookings.filter(
          (b) => b.attendanceStatus === AttendanceStatus.PRESENT,
        ).length;
        const absentCount = bookings.filter(
          (b) => b.attendanceStatus === AttendanceStatus.ABSENT,
        ).length;
        const pendingCount = bookings.filter(
          (b) =>
            !b.attendanceStatus ||
            b.attendanceStatus === AttendanceStatus.PENDING,
        ).length;

        // Calculate earnings for this activity
        const earningsGenerated = bookings.reduce(
          (sum, booking) => sum + (booking.amount || 0),
          0,
        );

        // Calculate average rating for this activity
        const activityAverageRating =
          ratings.length > 0
            ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
            : 0;

        const activityObj = activity.toObject();
        const host = activityObj.hostId as any;

        return {
          _id: activity._id,
          title: activity.title,
          description: activity.description,
          category: activity.category,
          location: activity.location,
          coordinates: activity.coordinates,
          difficultyLevel: activity.difficultyLevel,
          date: activity.date,
          startDateTime: activity.startDateTime || activity.date,
          endDateTime: activity.endDateTime || null,
          recurring: activity.recurring,
          additionalInformation: activity.additionalInformation,
          picture: activity.picture,
          maxParticipants: activity.maxParticipants,
          price: activity.price || 0,
          status: activity.status,
          hostId: activity.hostId,
          hostDetails: {
            _id: host?._id || host,
            name: host?.name || '',
            email: host?.email || '',
            profilePhoto: host?.profilePhoto || null,
          },
          attendance: {
            total: bookings.length,
            attended: presentCount,
            noShow: absentCount,
            pending: pendingCount,
            summary: `${presentCount}/${bookings.length} attended`,
          },
          reviewsAndRatings: {
            averageRating: Math.round(activityAverageRating * 10) / 10,
            totalReviews: ratings.length,
            summary: `${Math.round(activityAverageRating * 10) / 10}/5 (${ratings.length} review${ratings.length !== 1 ? 's' : ''})`,
          },
          earningsGenerated: earningsGenerated,
          created_at: activity.created_at,
          updated_at: activity.updated_at,
        };
      });

      return {
        activities: activitiesWithDetails,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  /**
   * Public host schedule: hourly buckets (0–23) per UK calendar day for a date range.
   * All wall-clock times use Europe/London (GMT/BST), not server local time.
   */
  async getHostSchedule(
    hostId: string,
    dto: HostScheduleQueryDto,
  ): Promise<{
    timeZone: string;
    hostId: string;
    from: string;
    to: string;
    days: Array<{
      date: string;
      offsetLabel: string;
      hours: Array<{
        hour: number;
        activities: Array<Record<string, unknown>>;
      }>;
    }>;
  }> {
    try {
      const isValidID = mongoose.isValidObjectId(hostId);
      if (!isValidID) {
        throw new BadRequestException('Invalid host ID');
      }

      const host = await this.userModel
        .findById(hostId)
        .select('_id deleted_at');
      if (!host || host.deleted_at) {
        throw new NotFoundException('Host not found');
      }

      const from = DateTime.fromISO(dto.from, { zone: UK_TZ }).startOf('day');
      const to = DateTime.fromISO(dto.to, { zone: UK_TZ }).startOf('day');
      if (!from.isValid || !to.isValid) {
        throw new BadRequestException(
          'from and to must be valid ISO dates (YYYY-MM-DD)',
        );
      }
      if (to < from) {
        throw new BadRequestException('to must be on or after from');
      }
      const spanDays = to.diff(from, 'days').days + 1;
      if (spanDays > HOST_SCHEDULE_MAX_RANGE_DAYS) {
        throw new BadRequestException(
          `Date range must not exceed ${HOST_SCHEDULE_MAX_RANGE_DAYS} days`,
        );
      }

      const queryFrom = from
        .minus({ days: 2 })
        .startOf('day')
        .toUTC()
        .toJSDate();
      const queryTo = to.plus({ days: 2 }).endOf('day').toUTC().toJSDate();

      const rawActivities = await this.activityModel
        .find({
          hostId: new mongoose.Types.ObjectId(hostId),
          deleted_at: null,
          status: { $ne: ActivityStatus.CANCELLED },
          date: { $gte: queryFrom, $lte: queryTo },
        })
        .select(
          'title description category location date startDateTime endDateTime time picture price maxParticipants recurring status',
        )
        .sort({ date: 1 })
        .lean();

      const dayKeys: string[] = [];
      for (const d of eachLondonDayInclusive(dto.from, dto.to)) {
        dayKeys.push(d.toFormat('yyyy-MM-dd'));
      }

      type HourMap = Map<number, Array<Record<string, unknown>>>;
      const byDayHour = new Map<string, HourMap>();
      for (const dk of dayKeys) {
        const m: HourMap = new Map();
        for (let h = 0; h < 24; h++) {
          m.set(h, []);
        }
        byDayHour.set(dk, m);
      }

      for (const act of rawActivities) {
        const { start, end } = activityDateTimeRangeLondon(act as any);
        if (!start || !start.isValid || !end || !end.isValid) {
          continue;
        }
        const normalizedEnd = end <= start ? end.plus({ days: 1 }) : end;
        const activityPayload = {
          _id: act._id,
          title: act.title,
          description: act.description,
          category: act.category,
          location: act.location,
          date: act.date,
          startDateTime: act.startDateTime || act.date,
          endDateTime: act.endDateTime || null,
          picture: act.picture,
          price: act.price ?? 0,
          maxParticipants: act.maxParticipants,
          recurring: act.recurring,
          status: act.status,
        };

        let bucketCursor = start.startOf('hour');
        while (bucketCursor < normalizedEnd) {
          const ymd = bucketCursor.toFormat('yyyy-MM-dd');
          const dayBuckets = byDayHour.get(ymd);
          if (dayBuckets) {
            const list = dayBuckets.get(bucketCursor.hour);
            if (list) {
              list.push({ ...activityPayload });
            }
          }
          bucketCursor = bucketCursor.plus({ hours: 1 });
        }
      }

      const days = dayKeys.map((dateStr) => {
        const d = DateTime.fromISO(dateStr, { zone: UK_TZ }).startOf('day');
        const hourMap = byDayHour.get(dateStr)!;
        const hours: Array<{
          hour: number;
          activities: Array<Record<string, unknown>>;
        }> = [];
        for (let h = 0; h < 24; h++) {
          hours.push({
            hour: h,
            activities: hourMap.get(h) ?? [],
          });
        }
        return {
          date: dateStr,
          offsetLabel: d.toFormat('ZZ'),
          hours,
        };
      });

      return {
        timeZone: UK_TZ,
        hostId,
        from: from.toFormat('yyyy-MM-dd'),
        to: to.toFormat('yyyy-MM-dd'),
        days,
      };
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new BadRequestException((err as Error).message);
    }
  }
}
