import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Rating } from 'src/schemas/rating.schema';
import { Booking, BookingStatus } from 'src/schemas/booking.schema';
import { Activity } from 'src/schemas/activity.schema';
import { User } from 'src/schemas/user.schema';
import mongoose, { Model } from 'mongoose';
import { CreateRatingDto } from './dto/create-rating.dto';
import { ReplyToReviewDto } from './dto/reply-to-review.dto';
import { ForbiddenException } from '@nestjs/common';

@Injectable()
export class RatingService {
  constructor(
    @InjectModel(Rating.name)
    private readonly ratingModel: Model<Rating>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  async createRating(
    createRatingDto: CreateRatingDto,
    memberId: string,
  ): Promise<Rating> {
    try {
      const isValidBookingId = mongoose.isValidObjectId(
        createRatingDto.bookingId,
      );
      const isValidMemberId = mongoose.isValidObjectId(memberId);

      if (!isValidBookingId) {
        throw new BadRequestException('Invalid booking ID');
      }
      if (!isValidMemberId) {
        throw new BadRequestException('Invalid member ID');
      }

      // Verify booking exists and belongs to member
      const booking = await this.bookingModel
        .findById(createRatingDto.bookingId)
        .populate('activityId');

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
        throw new BadRequestException(
          'You can only rate activities you have booked',
        );
      }

      // Only allow rating for confirmed bookings
      if (booking.status !== BookingStatus.CONFIRMED) {
        throw new BadRequestException(
          'You can only rate confirmed bookings',
        );
      }

      const activity = booking.activityId as any;
      if (!activity) {
        throw new NotFoundException('Activity not found');
      }

      // Check if activity date has passed (can only rate past activities)
      const activityDate = new Date(activity.date);
      const now = new Date();
      if (activityDate > now) {
        throw new BadRequestException(
          'You can only rate activities that have already occurred',
        );
      }

      // Check if rating already exists for this booking
      const existingRating = await this.ratingModel.findOne({
        bookingId: new mongoose.Types.ObjectId(createRatingDto.bookingId),
        deleted_at: null,
      });

      if (existingRating) {
        throw new ConflictException(
          'You have already rated this activity',
        );
      }

      // Get host ID
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

      // Create rating
      const rating = await this.ratingModel.create({
        memberId: new mongoose.Types.ObjectId(memberId),
        activityId: new mongoose.Types.ObjectId(activity._id),
        hostId: new mongoose.Types.ObjectId(hostId),
        bookingId: new mongoose.Types.ObjectId(createRatingDto.bookingId),
        rating: createRatingDto.rating,
        review: createRatingDto.review,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Populate and return
      const populatedRating = await this.ratingModel
        .findById(rating._id)
        .populate('memberId', 'name email profilePhoto')
        .populate('activityId', 'title')
        .populate('hostId', 'name email');

      if (!populatedRating) {
        throw new NotFoundException('Rating not found after creation');
      }

      return populatedRating;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async getActivityRatings(activityId: string): Promise<{
    averageRating: number;
    totalRatings: number;
    ratings: Rating[];
  }> {
    try {
      const isValidActivityId = mongoose.isValidObjectId(activityId);
      if (!isValidActivityId) {
        throw new BadRequestException('Invalid activity ID');
      }

      const ratings = await this.ratingModel
        .find({
          activityId: new mongoose.Types.ObjectId(activityId),
          deleted_at: null,
        })
        .populate('memberId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      const totalRatings = ratings.length;
      const averageRating =
        totalRatings > 0
          ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
          : 0;

      return {
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        totalRatings,
        ratings,
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async getMemberRatings(memberId: string): Promise<Rating[]> {
    try {
      const isValidMemberId = mongoose.isValidObjectId(memberId);
      if (!isValidMemberId) {
        throw new BadRequestException('Invalid member ID');
      }

      const ratings = await this.ratingModel
        .find({
          memberId: new mongoose.Types.ObjectId(memberId),
          deleted_at: null,
        })
        .populate('activityId', 'title')
        .populate('hostId', 'name email')
        .sort({ created_at: -1 });

      return ratings;
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async getMemberReviewsDashboard(memberId: string): Promise<{
    ratingHistory: {
      averageRating: number;
      totalReviews: number;
      ratingDistribution: {
        '5': number;
        '4': number;
        '3': number;
        '2': number;
        '1': number;
      };
    };
    activitiesToReview: any[]; // Past confirmed bookings without ratings
    pastReviews: any[]; // Already submitted reviews
  }> {
    try {
      const isValidMemberId = mongoose.isValidObjectId(memberId);
      if (!isValidMemberId) {
        throw new BadRequestException('Invalid member ID');
      }

      // Get all ratings by this member
      const allRatings = await this.ratingModel
        .find({
          memberId: new mongoose.Types.ObjectId(memberId),
          deleted_at: null,
        })
        .populate('activityId', 'title picture date location')
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      // Calculate rating history
      const totalReviews = allRatings.length;
      const averageRating =
        totalReviews > 0
          ? allRatings.reduce((sum, r) => sum + r.rating, 0) / totalReviews
          : 0;

      // Calculate rating distribution
      const ratingDistribution = {
        '5': 0,
        '4': 0,
        '3': 0,
        '2': 0,
        '1': 0,
      };

      allRatings.forEach((rating) => {
        const ratingKey = rating.rating.toString() as '1' | '2' | '3' | '4' | '5';
        if (ratingDistribution[ratingKey] !== undefined) {
          ratingDistribution[ratingKey]++;
        }
      });

      // Get all past confirmed bookings
      const now = new Date();
      const pastBookings = await this.bookingModel
        .find({
          memberId: new mongoose.Types.ObjectId(memberId),
          status: BookingStatus.CONFIRMED,
          deleted_at: null,
        })
        .populate('activityId', 'title picture date location')
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      // Filter past bookings (activity date has passed)
      const pastConfirmedBookings = pastBookings.filter((booking) => {
        const activity = booking.activityId as any;
        if (!activity || !activity.date) return false;
        const activityDate = new Date(activity.date);
        return activityDate < now;
      });

      // Get booking IDs that have been rated
      const ratedBookingIds = new Set(
        allRatings.map((rating) => rating.bookingId.toString()),
      );

      // Find activities to review (past bookings without ratings)
      const activitiesToReview = pastConfirmedBookings
        .filter((booking) => {
          const bookingIdStr = (booking._id as any).toString();
          return !ratedBookingIds.has(bookingIdStr);
        })
        .map((booking) => {
          const activity = booking.activityId as any;
          const host = booking.hostId as any;
          return {
            bookingId: booking._id,
            activity: {
              _id: activity?._id,
              title: activity?.title,
              picture: activity?.picture,
              date: activity?.date,
              location: activity?.location,
            },
            host: {
              _id: host?._id,
              name: host?.name,
              email: host?.email,
              profilePhoto: host?.profilePhoto,
            },
            completedDate: activity?.date,
          };
        });

      // Format past reviews
      const pastReviews = allRatings.map((rating) => {
        const activity = rating.activityId as any;
        const host = rating.hostId as any;
        return {
          _id: rating._id,
          rating: rating.rating,
          review: rating.review,
          activity: {
            _id: activity?._id,
            title: activity?.title,
            picture: activity?.picture,
            date: activity?.date,
            location: activity?.location,
          },
          host: {
            _id: host?._id,
            name: host?.name,
            email: host?.email,
            profilePhoto: host?.profilePhoto,
          },
          reviewedAt: rating.created_at,
        };
      });

      return {
        ratingHistory: {
          averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
          totalReviews,
          ratingDistribution,
        },
        activitiesToReview,
        pastReviews,
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async getHostReviewsDashboard(hostId: string): Promise<{
    averageRating: number;
    totalReviews: number;
    ratingDistribution: {
      '5': number;
      '4': number;
      '3': number;
      '2': number;
      '1': number;
    };
    responseRate: number; // Percentage of reviews with replies
    pendingResponses: number; // Reviews without replies
  }> {
    try {
      const isValidHostId = mongoose.isValidObjectId(hostId);
      if (!isValidHostId) {
        throw new BadRequestException('Invalid host ID');
      }

      const ratings = await this.ratingModel.find({
        hostId: new mongoose.Types.ObjectId(hostId),
        deleted_at: null,
      });

      const totalReviews = ratings.length;
      const averageRating =
        totalReviews > 0
          ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalReviews
          : 0;

      // Calculate rating distribution
      const ratingDistribution = {
        '5': 0,
        '4': 0,
        '3': 0,
        '2': 0,
        '1': 0,
      };

      ratings.forEach((rating) => {
        const ratingKey = rating.rating.toString() as '1' | '2' | '3' | '4' | '5';
        if (ratingDistribution[ratingKey] !== undefined) {
          ratingDistribution[ratingKey]++;
        }
      });

      // Calculate response rate
      const reviewsWithReplies = ratings.filter((r) => r.hostReply).length;
      const responseRate =
        totalReviews > 0 ? Math.round((reviewsWithReplies / totalReviews) * 100) : 0;
      const pendingResponses = totalReviews - reviewsWithReplies;

      return {
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        totalReviews,
        ratingDistribution,
        responseRate,
        pendingResponses,
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async getHostReviews(
    hostId: string,
    activityId?: string,
  ): Promise<{
    averageRating: number;
    totalReviews: number;
    reviews: any[];
  }> {
    try {
      const isValidHostId = mongoose.isValidObjectId(hostId);
      if (!isValidHostId) {
        throw new BadRequestException('Invalid host ID');
      }

      const query: any = {
        hostId: new mongoose.Types.ObjectId(hostId),
        deleted_at: null,
      };

      if (activityId) {
        const isValidActivityId = mongoose.isValidObjectId(activityId);
        if (!isValidActivityId) {
          throw new BadRequestException('Invalid activity ID');
        }
        query.activityId = new mongoose.Types.ObjectId(activityId);
      }

      const ratings = await this.ratingModel
        .find(query)
        .populate('memberId', 'name email profilePhoto')
        .populate('activityId', 'title picture date location')
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      const totalReviews = ratings.length;
      const averageRating =
        totalReviews > 0
          ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalReviews
          : 0;

      // Format reviews with member, activity, and host details
      const reviews = ratings.map((rating) => {
        const member = rating.memberId as any;
        const activity = rating.activityId as any;
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
          activity: {
            _id: activity?._id || activity,
            title: activity?.title || '',
            picture: activity?.picture || null,
            date: activity?.date || null,
            location: activity?.location || null,
          },
          createdAt: rating.created_at,
        };
      });

      return {
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        totalReviews,
        reviews,
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async replyToReview(
    replyDto: ReplyToReviewDto,
    hostId: string,
  ): Promise<Rating> {
    try {
      const isValidRatingId = mongoose.isValidObjectId(replyDto.ratingId);
      const isValidHostId = mongoose.isValidObjectId(hostId);

      if (!isValidRatingId) {
        throw new BadRequestException('Invalid rating ID');
      }
      if (!isValidHostId) {
        throw new BadRequestException('Invalid host ID');
      }

      // Find the rating
      const rating = await this.ratingModel.findById(replyDto.ratingId);

      if (!rating) {
        throw new NotFoundException('Rating not found');
      }

      // Check if rating belongs to this host
      const ratingHostId = (rating.hostId as any).toString();
      if (ratingHostId !== hostId) {
        throw new ForbiddenException(
          'You can only reply to reviews for your own activities',
        );
      }

      // Check if already replied
      if (rating.hostReply) {
        throw new ConflictException('You have already replied to this review');
      }

      // Update rating with reply
      rating.hostReply = replyDto.reply;
      rating.hostReplyDate = new Date();
      rating.updated_at = new Date();

      await rating.save();

      // Populate and return
      await rating.populate('memberId', 'name email profilePhoto');
      await rating.populate('activityId', 'title picture date location');

      return rating;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException ||
        err instanceof ForbiddenException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }
}

