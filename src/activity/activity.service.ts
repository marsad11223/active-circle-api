import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Activity } from 'src/schemas/activity.schema';
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

  async findAll(): Promise<Activity[]> {
    try {
      const activities = await this.activityModel
        .find({ deleted_at: null })
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });
      return activities;
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async browseActivities(
    filters: BrowseActivitiesDto,
    memberId?: string,
  ): Promise<{ activities: Activity[]; total: number }> {
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

      // Note: Host rating filtering would require a rating system
      // For now, we'll return all activities
      // In future, you can add ratings to User schema and filter here

      return {
        activities,
        total,
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async findOne(id: string): Promise<Activity> {
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

      return activity;
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

  async findByHost(hostId: string): Promise<Activity[]> {
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

      return activities;
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
        activityHostId = (activity.hostId as any)._id.toString();
      } else {
        // hostId is just ObjectId
        activityHostId = (activity.hostId as any).toString();
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
        activityHostId = (activity.hostId as any)._id.toString();
      } else {
        // hostId is just ObjectId
        activityHostId = (activity.hostId as any).toString();
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
