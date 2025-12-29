import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Activity } from 'src/schemas/activity.schema';
import { Rating } from 'src/schemas/rating.schema';
import { Booking, BookingStatus } from 'src/schemas/booking.schema';
import mongoose, { Model } from 'mongoose';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { BrowseActivitiesDto, PriceFilter } from './dto/browse-activities.dto';
import { User, Role } from 'src/schemas/user.schema';
import { RecurringType } from 'src/schemas/activity.schema';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Rating.name)
    private readonly ratingModel: Model<Rating>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
  ) {}

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
        .find({ deleted_at: null })
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      return this.addRatingsToActivities(activities);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
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

    // Add rating information to each activity
    return activities.map((activity) => {
      const activityObj = activity.toObject();
      const activityId = (activity._id as any).toString();
      const ratingInfo = ratingsMap.get(activityId) || {
        averageRating: 0,
        totalReviews: 0,
      };

      return {
        ...activityObj,
        rating: {
          averageRating: ratingInfo.averageRating,
          totalReviews: ratingInfo.totalReviews,
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

    // Get all ratings/reviews for this activity with member details
    const ratings = await this.ratingModel
      .find({
        activityId: new mongoose.Types.ObjectId(activityId),
        deleted_at: null,
      })
      .populate('memberId', 'name email profilePhoto')
      .sort({ created_at: -1 });

    const totalReviews = ratings.length;
    const averageRating =
      totalReviews > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 0;

    const activityObj = activity.toObject();

    return {
      ...activityObj,
      rating: {
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        totalReviews: totalReviews,
        reviews: ratings.map((rating) => {
          const member = rating.memberId as any;
          return {
            _id: rating._id,
            rating: rating.rating,
            review: rating.review,
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
    };
  }

  async browseActivities(
    filters: BrowseActivitiesDto,
    memberId?: string,
  ): Promise<{ activities: any[]; total: number }> {
    try {
      // Build query
      const query: any = { deleted_at: null };

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
          const bookingInfo = bookingMap.get(activityId) || {
            isBooked: false,
            bookingStatus: null,
            bookingId: null,
          };

          return {
            ...activity,
            isBooked: bookingInfo.isBooked,
            bookingStatus: bookingInfo.bookingStatus,
            bookingId: bookingInfo.bookingId,
          };
        });
      } else {
        // If no memberId, add default values
        activitiesWithBookingStatus = activitiesWithRatings.map((activity) => ({
          ...activity,
          isBooked: false,
          bookingStatus: null,
          bookingId: null,
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

  async findOne(id: string): Promise<any> {
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

      return this.addRatingToActivity(activity);
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

      const activities = await this.activityModel
        .find({ hostId: new mongoose.Types.ObjectId(hostId), deleted_at: null })
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
}
