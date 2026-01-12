import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User, Role } from 'src/schemas/user.schema';
import { Activity } from 'src/schemas/activity.schema';
import { Rating } from 'src/schemas/rating.schema';
import { Booking } from 'src/schemas/booking.schema';
import mongoose, { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { ContactUsDto } from './dto/contact-us.dto';
import { MailerService } from '@nestjs-modules/mailer';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { contactUsToAdmin } from 'src/utils/email-templates';
import {
  AdminListUsersDto,
  UserSortBy,
  SortOrder,
  HasSubscription,
} from './dto/admin-list-users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
    @InjectModel(Rating.name) private readonly ratingModel: Model<Rating>,
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    private readonly mailerService: MailerService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string) {
    const user: User | null = await this.userModel.findOne({ email });
    if (user) {
      return user;
    } else {
      throw new UnauthorizedException('Please check your login credentials');
    }
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = await this.userModel.findOne({ email: createUserDto.email });

    if (!user) {
      try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

        const userData: any = {
          ...createUserDto,
          password: hashedPassword,
        };

        if (createUserDto.dateOfBirth) {
          userData.dateOfBirth = new Date(createUserDto.dateOfBirth);
        }

        const newUser = await this.userModel.create(userData);

        return newUser;
      } catch (err) {
        throw new BadRequestException(err.message);
      }
    } else {
      throw new ConflictException('User already Exist');
    }
  }

  async contactUs(contactUsDto: ContactUsDto): Promise<any> {
    const { subject, body, email, name } = contactUsDto;
    const emailsEnabled =
      this.configService.get<string>('EMAILS_ENABLED') === 'true';

    if (emailsEnabled) {
      try {
        await this.mailerService.sendMail({
          to: 'marsad11223@gmail.com',
          subject: subject,
          html: contactUsToAdmin({
            name,
            email,
            subject,
            body,
          }),
        });
      } catch (err) {
        throw new BadRequestException(err.message);
      }
    }

    return {
      message: 'Email has been sent to the team',
    };
  }

  async findAll(): Promise<User[]> {
    try {
      const users = await this.userModel.find().select('-password');
      return users;
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async findOne(
    id: string,
    options?: { includeRatings?: boolean; includePaymentHistory?: boolean },
  ): Promise<any> {
    try {
      const user = await this.findUser(id);
      if (!user) {
        throw new NotFoundException('User not found!');
      }
      const includeRatings = options?.includeRatings === true;
      const includePaymentHistory = options?.includePaymentHistory === true;

      const userObj = (user as any).toObject ? (user as any).toObject() : user;

      const result: any = { ...userObj };

      if (includeRatings) {
        // Fetch ratings made by this member (if any)
        let ratings: any[] = [];
        try {
          ratings = await this.ratingModel
            .find({
              memberId: new mongoose.Types.ObjectId(id),
              deleted_at: null,
            })
            .populate('activityId', 'title picture date')
            .populate('hostId', 'name email profilePhoto')
            .sort({ created_at: -1 });
        } catch (ratingErr: any) {
          console.error(
            'Error fetching member ratings:',
            ratingErr.message || ratingErr,
          );
        }

        result.ratings = ratings.map((r) => {
          const activity = r.activityId || null;
          const host = r.hostId || null;
          return {
            _id: r._id,
            activity: activity
              ? {
                  _id: activity._id || activity,
                  title: activity.title || '',
                  picture: activity.picture || null,
                  date: activity.date || null,
                }
              : null,
            host: host
              ? {
                  _id: host._id || host,
                  name: host.name || '',
                  email: host.email || '',
                  profilePhoto: host.profilePhoto || null,
                }
              : null,
            rating: r.rating,
            review: r.review || null,
            hostReply: r.hostReply || null,
            created_at: r.created_at,
          };
        });
      }

      if (includePaymentHistory) {
        // Payment history: recent bookings for this member
        let bookings: any[] = [];
        try {
          bookings = await this.bookingModel
            .find({
              memberId: new mongoose.Types.ObjectId(id),
              deleted_at: null,
            })
            .populate('activityId')
            .populate('hostId', 'name email profilePhoto')
            .sort({ created_at: -1 });
        } catch (bookingErr: any) {
          console.error(
            'Error fetching member bookings for payment history:',
            bookingErr.message || bookingErr,
          );
        }

        result.paymentHistory = bookings.map((booking) => {
          const activity = booking.activityId;
          const host = booking.hostId;

          // Determine display status
          let displayStatus = 'Completed';
          if (booking.status === 'pending') displayStatus = 'Pending';
          else if (booking.status === 'cancelled') displayStatus = 'Cancelled';
          else if (booking.status === 'confirmed') {
            if (activity && activity.date) {
              const activityDate = new Date(activity.date);
              const now = new Date();
              displayStatus = activityDate > now ? 'Upcoming' : 'Completed';
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
            activityDate: (activity && activity.date) || null,
            type: booking.amount > 0 ? 'Paid Activity' : 'Free Activity',
            amount: booking.amount,
            status: displayStatus,
            paymentStatus: booking.paymentStatus || null,
            invoiceNumber: booking.invoiceNumber || null,
            paymentIntentId: booking.paymentIntentId || null,
          };
        });
      }

      return result;
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    currentUser: User,
  ): Promise<User | null> {
    try {
      const user = await this.findUser(id);
      if (!user) {
        throw new NotFoundException('User not found!');
      }

      // Prepare update data
      const updateData: any = {
        ...updateUserDto,
        updated_at: Date.now(),
      };

      // Only hash password if it's being updated
      if (updateUserDto.password) {
        const salt = await bcrypt.genSalt(10);
        updateData.password = await bcrypt.hash(updateUserDto.password, salt);
      }

      // Remove password from updateData if not provided (to avoid undefined)
      if (!updateUserDto.password) {
        delete updateData.password;
      }

      const updatedUser = await this.userModel
        .findByIdAndUpdate({ _id: id }, updateData, { new: true })
        .select('-password');

      if (!updatedUser) {
        throw new NotFoundException('User not found after update');
      }

      return updatedUser;
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    try {
      const user = await this.findUser(id);
      if (!user) {
        throw new NotFoundException('User not found!');
      } else {
        // Soft delete: set deleted_at timestamp instead of removing the document
        await this.userModel.findByIdAndUpdate(id, {
          isDeleted: true,
          deleted_at: new Date(),
          updated_at: new Date(),
        });
        return {
          message: 'Successfully deleted (soft)'.toString(),
        };
      }
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  /**
   * Suspend or unsuspend a user (admin only) — soft suspension
   */
  async suspendUser(
    id: string,
    suspend: boolean,
    reason?: string,
  ): Promise<User | null> {
    try {
      const user = await this.findUser(id);
      if (!user) throw new NotFoundException('User not found!');

      const update: any = {
        suspended: suspend,
        suspendedReason: suspend ? reason || null : null,
        suspended_at: suspend ? new Date() : null,
        updated_at: new Date(),
      };

      const updated = await this.userModel
        .findByIdAndUpdate(id, update, { new: true })
        .select('-password');

      if (!updated) throw new NotFoundException('User not found after update');

      return updated;
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

  async findUser(id: string) {
    const isValidID = mongoose.isValidObjectId(id);
    if (!isValidID) {
      throw new BadRequestException('Invalid ID');
    }
    const user = await this.userModel.findById(id).select('-password');
    return user;
  }

  async toggleRole(
    userId: string,
  ): Promise<{ data: User; accessToken: string }> {
    try {
      const user = await this.findUser(userId);
      if (!user) {
        throw new NotFoundException('User not found!');
      }

      // Get current grantRole or default to member
      const currentGrantRole = user.grantRole || Role.member;
      let newGrantRole: Role;

      // Toggle between member and host
      // Users can freely toggle between member and host roles
      if (currentGrantRole === Role.member) {
        newGrantRole = Role.host;
      } else {
        // Switching from host to member
        newGrantRole = Role.member;
      }

      // Update grantRole, lastLogin, and updated_at
      // grantRole serves as both the current active role and the "last role" for restoration
      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          userId,
          {
            grantRole: newGrantRole,
            lastLogin: new Date(),
            updated_at: Date.now(),
          },
          { new: true },
        )
        .select('-password');

      if (!updatedUser) {
        throw new NotFoundException('User not found after update');
      }

      // Generate new JWT token with updated user data
      const payload = { id: updatedUser._id, email: updatedUser.email };
      const accessToken = this.jwtService.sign(payload);

      return {
        data: updatedUser as User,
        accessToken: accessToken,
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

  async toggleFavoriteActivity(
    userId: string,
    activityId: string,
  ): Promise<{ message: string; isFavorite: boolean }> {
    try {
      const isValidUserId = mongoose.isValidObjectId(userId);
      const isValidActivityId = mongoose.isValidObjectId(activityId);

      if (!isValidUserId) {
        throw new BadRequestException('Invalid user ID');
      }
      if (!isValidActivityId) {
        throw new BadRequestException('Invalid activity ID');
      }

      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Get current favorites
      const currentFavorites = user.favoriteActivities || [];
      const activityObjectId = new mongoose.Types.ObjectId(activityId);

      // Check if activity is already in favorites
      const isFavorite = currentFavorites.some(
        (favId) => favId.toString() === activityId,
      );

      let updatedFavorites: mongoose.Types.ObjectId[];
      let isFavoriteNow: boolean;

      if (isFavorite) {
        // Remove from favorites
        updatedFavorites = currentFavorites.filter(
          (favId) => favId.toString() !== activityId,
        );
        isFavoriteNow = false;
      } else {
        // Add to favorites
        updatedFavorites = [...currentFavorites, activityObjectId];
        isFavoriteNow = true;
      }

      // Update user
      await this.userModel.findByIdAndUpdate(userId, {
        favoriteActivities: updatedFavorites,
        updated_at: Date.now(),
      });

      return {
        message: isFavoriteNow
          ? 'Activity added to favorites'
          : 'Activity removed from favorites',
        isFavorite: isFavoriteNow,
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

  async getFavoriteActivities(userId: string): Promise<any[]> {
    try {
      const isValidUserId = mongoose.isValidObjectId(userId);
      if (!isValidUserId) {
        throw new BadRequestException('Invalid user ID');
      }

      const user = await this.userModel
        .findById(userId)
        .populate('favoriteActivities')
        .select('favoriteActivities');

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const favoriteActivityIds = user.favoriteActivities || [];

      // Fetch activities with full details
      const activities = await this.activityModel
        .find({
          _id: { $in: favoriteActivityIds },
          deleted_at: null,
        })
        .populate('hostId', 'name email profilePhoto')
        .sort({ created_at: -1 });

      return activities;
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

  /**
   * Get paginated list of all members (users except admins)
   * Admin only
   */
  async getAllMembers(filters: AdminListUsersDto): Promise<{
    users: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const skip = (page - 1) * limit;

      // Build query - exclude superAdmin
      const query: any = {
        role: { $ne: Role.superAdmin },
        deleted_at: null,
      };

      // Subscription filter
      const hasSubscriptionFilter =
        filters.hasSubscription || HasSubscription.ALL;
      if (hasSubscriptionFilter !== HasSubscription.ALL) {
        query.hasActiveSubscription =
          hasSubscriptionFilter === HasSubscription.TRUE;
      }

      // Search filter (name or email)
      if (filters.search) {
        query.$or = [
          { name: { $regex: filters.search, $options: 'i' } },
          { email: { $regex: filters.search, $options: 'i' } },
        ];
      }

      // Build sort
      const sortBy = filters.sortBy || UserSortBy.CREATED_AT;
      const sortOrder = filters.sortOrder === SortOrder.ASC ? 1 : -1;
      const sort: any = {};
      sort[sortBy] = sortOrder;

      // Get total count
      const total = await this.userModel.countDocuments(query);

      // Get paginated users
      const users = await this.userModel
        .find(query)
        .select('-password')
        .sort(sort)
        .skip(skip)
        .limit(limit);

      // Format response
      const formattedUsers = users.map((user) => {
        const userObj = user.toObject();
        return {
          _id: userObj._id,
          name: userObj.name,
          email: userObj.email,
          role: userObj.role,
          grantRole: userObj.grantRole,
          address: userObj.address,
          phoneNumber: userObj.phoneNumber,
          profilePhoto: userObj.profilePhoto,
          hasActiveSubscription: userObj.hasActiveSubscription || false,
          interests: userObj.interests || [],
          radius: userObj.radius || 10,
          created_at: userObj.created_at,
          updated_at: userObj.updated_at,
          lastLogin: userObj.lastLogin,
        };
      });

      return {
        users: formattedUsers,
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
   * Get paginated list of all hosts (users with role = host, subscription true or false)
   * Admin only
   */
  async getAllHosts(filters: AdminListUsersDto): Promise<{
    users: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const skip = (page - 1) * limit;

      // Build query - only hosts
      const query: any = {
        role: Role.host,
        deleted_at: null,
      };

      // Subscription filter
      const hasSubscriptionFilter =
        filters.hasSubscription || HasSubscription.ALL;
      if (hasSubscriptionFilter !== HasSubscription.ALL) {
        query.hasActiveSubscription =
          hasSubscriptionFilter === HasSubscription.TRUE;
      }

      // Search filter (name or email)
      if (filters.search) {
        query.$or = [
          { name: { $regex: filters.search, $options: 'i' } },
          { email: { $regex: filters.search, $options: 'i' } },
        ];
      }

      // Build sort
      const sortBy = filters.sortBy || UserSortBy.CREATED_AT;
      const sortOrder = filters.sortOrder === SortOrder.ASC ? 1 : -1;
      const sort: any = {};
      sort[sortBy] = sortOrder;

      // Get total count
      const total = await this.userModel.countDocuments(query);

      // Get paginated hosts
      const users = await this.userModel
        .find(query)
        .select('-password')
        .sort(sort)
        .skip(skip)
        .limit(limit);

      // Format response
      const formattedUsers = users.map((user) => {
        const userObj = user.toObject();
        return {
          _id: userObj._id,
          name: userObj.name,
          email: userObj.email,
          role: userObj.role,
          grantRole: userObj.grantRole,
          address: userObj.address,
          phoneNumber: userObj.phoneNumber,
          profilePhoto: userObj.profilePhoto,
          hasActiveSubscription: userObj.hasActiveSubscription || false,
          stripeCustomerId: userObj.stripeCustomerId || null,
          created_at: userObj.created_at,
          updated_at: userObj.updated_at,
          lastLogin: userObj.lastLogin,
        };
      });

      return {
        users: formattedUsers,
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
   * Get quick notification flags for a user
   * Returns only the boolean flags used for fast polling
   */
  async getNotifications(userId: string): Promise<{
    hasNewBookings: boolean;
    hasNewMessages: boolean;
    hasNewPayoutRequests: boolean;
  }> {
    try {
      const user = await this.findUser(userId);
      if (!user) throw new NotFoundException('User not found');

      const userObj: any = (user as any).toObject
        ? (user as any).toObject()
        : user;

      return {
        hasNewBookings: !!userObj.hasNewBookings,
        hasNewMessages: !!userObj.hasNewMessages,
        hasNewPayoutRequests: !!userObj.hasNewPayoutRequests,
      };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException(err.message);
    }
  }
}
