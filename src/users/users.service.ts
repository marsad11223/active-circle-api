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
import { GrantRole, User, Role } from 'src/schemas/user.schema';
import { Activity } from 'src/schemas/activity.schema';
import { Rating } from 'src/schemas/rating.schema';
import { Booking, BookingStatus } from 'src/schemas/booking.schema';
import {
  Subscription,
  SubscriptionStatus,
} from 'src/schemas/subscription.schema';
import mongoose, { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { ContactUsDto } from './dto/contact-us.dto';
import { SendMarketingEmailDto } from './dto/send-marketing-email.dto';
import { EmailService } from '../email/email.service';
import {
  marketingBroadcastEmail,
  sessionReminderEmail,
  adminEmailJobReport,
  contactUsToAdmin,
} from 'src/utils/email-templates';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  AdminListUsersDto,
  UserSortBy,
  SortOrder,
  HasSubscription,
} from './dto/admin-list-users.dto';
import { normalizeEmail } from 'src/utils/helper';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
    @InjectModel(Rating.name) private readonly ratingModel: Model<Rating>,
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<Subscription>,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string) {
    const emailNormalized = normalizeEmail(email);
    const user: User | null = await this.userModel.findOne({
      email: emailNormalized,
    });
    if (user) {
      return user;
    } else {
      throw new UnauthorizedException('Please check your login credentials');
    }
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const emailNormalized = normalizeEmail(createUserDto.email);
    const user = await this.userModel.findOne({ email: emailNormalized });

    if (!user) {
      try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

        const userData: any = {
          ...createUserDto,
          email: emailNormalized,
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
        await this.emailService.sendMail({
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

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User | null> {
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

      // Get current grantRole or default to member (GrantRole is member | host only)
      const currentGrantRole = user.grantRole || GrantRole.member;
      let newGrantRole: GrantRole;

      if (currentGrantRole === GrantRole.member) {
        const canBeCreator =
          user.role === Role.premiumMember ||
          user.role === Role.standardMember ||
          user.isLifetimeHost === true;
        if (!canBeCreator) {
          throw new BadRequestException(
            'Subscribe to a plan to switch to host mode',
          );
        }
        newGrantRole = GrantRole.host;
      } else {
        newGrantRole = GrantRole.member;
      }

      // Update grantRole, lastLogin, and updated_at
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

      // Build query - hosts and standard hosts
      const query: any = {
        role: { $in: [Role.premiumMember, Role.standardMember] },
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

  /**
   * Get admin dashboard overview statistics
   * Admin only
   */
  async getAdminOverview(): Promise<{
    totalMembers: number;
    totalHosts: number;
    totalActivities: number;
    upcomingActivities: number;
    totalBookings: number;
    recentRevenue: number;
    activeSubscriptions: number;
    activityStatus: {
      upcoming: number;
      completed: number;
    };
  }> {
    try {
      const now = new Date();

      // Get total members (exclude superAdmin)
      const totalMembers = await this.userModel.countDocuments({
        role: { $ne: Role.superAdmin },
        deleted_at: null,
      });

      // Get total hosts (full host + standard host)
      const totalHosts = await this.userModel.countDocuments({
        role: { $in: [Role.premiumMember, Role.standardMember] },
        deleted_at: null,
      });

      // Get total activities
      const totalActivities = await this.activityModel.countDocuments({
        deleted_at: null,
      });

      // Get upcoming activities (activities with date > now)
      const upcomingActivities = await this.activityModel.countDocuments({
        date: { $gt: now },
        deleted_at: null,
      });

      // Get total bookings
      const totalBookings = await this.bookingModel.countDocuments({
        deleted_at: null,
      });

      // Get active subscriptions count
      const activeSubscriptions = await this.subscriptionModel.countDocuments({
        status: SubscriptionStatus.ACTIVE,
      });

      // Calculate recent revenue (last 30 days from paid bookings)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentBookings = await this.bookingModel.find({
        created_at: { $gte: thirtyDaysAgo },
        amount: { $gt: 0 },
        paymentStatus: 'paid',
        deleted_at: null,
      });

      const recentRevenue = recentBookings.reduce((total, booking) => {
        return total + (booking.amount || 0);
      }, 0);

      // Get activity status counts
      const completedActivities = await this.activityModel.countDocuments({
        date: { $lt: now },
        deleted_at: null,
      });

      return {
        totalMembers,
        totalHosts,
        totalActivities,
        upcomingActivities,
        totalBookings,
        recentRevenue: Math.round(recentRevenue * 100) / 100, // Round to 2 decimal places
        activeSubscriptions,
        activityStatus: {
          upcoming: upcomingActivities,
          completed: completedActivities,
        },
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  /**
   * Send marketing email to all members (admin only).
   * Optionally respects marketingEmails preference (default true).
   * If testMode is true, sends only to TEST_EMAIL synchronously.
   * Otherwise, returns immediately and sends emails in the background.
   */
  async sendMarketingEmailToAll(dto: SendMarketingEmailDto): Promise<{
    sent?: number;
    failed?: number;
    total: number;
    message: string;
    queued?: boolean;
  }> {
    const testEmail =
      this.configService.get<string>('TEST_EMAIL') || 'marsad11223@gmail.com';

    // ── Test mode: synchronous (only 1 email) ──
    if (dto.testMode) {
      try {
        const html = marketingBroadcastEmail({
          recipientName: 'Test Recipient',
          subject: dto.subject,
          message: dto.message,
        });
        await this.emailService.sendMail({
          to: testEmail,
          subject: `[TEST] ${dto.subject}`,
          html,
        });
        return {
          sent: 1,
          failed: 0,
          total: 1,
          message: `Test mode: email sent to ${testEmail} only. No members were emailed.`,
        };
      } catch (err) {
        console.error('[sendMarketingEmailToAll] Test send failed', err);
        return {
          sent: 0,
          failed: 1,
          total: 1,
          message: `Test mode: failed to send to ${testEmail}. ${(err as Error).message}`,
        };
      }
    }

    // ── Production mode: query users, then fire-and-forget ──
    const respect = dto.respectMarketingPreference !== false;
    const query: any = { role: { $ne: Role.superAdmin }, deleted_at: null };
    if (respect) {
      query.marketingEmails = true;
    }
    const users = await this.userModel.find(query).select('email name').lean();

    if (users.length === 0) {
      return {
        sent: 0,
        failed: 0,
        total: 0,
        message: 'No eligible members found to send marketing email to.',
      };
    }

    // Fire-and-forget: kick off background sending without awaiting
    this._sendMarketingEmailsInBackground(
      users,
      dto.subject,
      dto.message ?? '',
    );

    return {
      queued: true,
      total: users.length,
      message: `Marketing email sending started in the background for ${users.length} member(s). Check server logs for progress.`,
    };
  }

  /**
   * Private helper — sends marketing emails in the background.
   * Runs detached (not awaited by the caller) and logs results to console.
   */
  private async _sendMarketingEmailsInBackground(
    users: any[],
    subject: string,
    message: string,
  ): Promise<void> {
    let sent = 0;
    let failed = 0;
    const results: {
      email: string;
      name: string;
      status: string;
      error: string;
      sentAt: string;
    }[] = [];

    console.log(
      `[MarketingEmail] Background send started — ${users.length} recipient(s)`,
    );

    for (const u of users) {
      const email = (u as any).email;
      const name = (u as any).name || '';
      if (!email) {
        failed++;
        results.push({
          email: 'N/A',
          name,
          status: 'failed',
          error: 'No email address',
          sentAt: new Date().toISOString(),
        });
        continue;
      }
      try {
        const html = marketingBroadcastEmail({
          recipientName: name,
          subject,
          message,
        });
        await this.emailService.sendMail({
          to: email,
          subject,
          html,
        });
        sent++;
        results.push({
          email,
          name,
          status: 'success',
          error: '',
          sentAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[MarketingEmail] Failed to send to', email, err);
        failed++;
        results.push({
          email,
          name,
          status: 'failed',
          error: (err as Error).message || 'Unknown error',
          sentAt: new Date().toISOString(),
        });
      }
    }

    console.log(
      `[MarketingEmail] Background send complete — sent: ${sent}, failed: ${failed}, total: ${users.length}`,
    );

    // Build CSV and send admin report
    const csvHeader = 'Email,Name,Status,Error,Sent At';
    const csvRows = results.map(
      (r) =>
        `"${r.email}","${r.name}","${r.status}","${r.error}","${r.sentAt}"`,
    );
    const csv = [csvHeader, ...csvRows].join('\n');

    await this._sendAdminReport(
      'Marketing Email',
      { sent, failed, total: users.length },
      csv,
    );
  }

  /**
   * Send session reminders to members with confirmed bookings in the next X hours (admin only).
   * Default 24 hours. If testMode is true, all reminders go to TEST_EMAIL only.
   * Returns immediately (fire-and-forget). Admin receives a report email with CSV when done.
   */
  async sendSessionReminders(
    hoursAhead: number = 24,
    testMode: boolean = false,
  ): Promise<{
    queued: boolean;
    total: number;
    message: string;
  }> {
    const now = new Date();
    const cutoff = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const bookings = await this.bookingModel
      .find({
        status: BookingStatus.CONFIRMED,
        deleted_at: null,
      })
      .populate('activityId', 'title date location')
      .populate('memberId', 'name email')
      .lean();

    const inRange: Array<{
      memberId: any;
      memberName: string;
      memberEmail: string;
      activityTitle: string;
      activityDate: Date;
      location?: string;
      hoursUntil: number;
    }> = [];

    for (const b of bookings) {
      const activity = (b as any).activityId;
      const member = (b as any).memberId;
      if (!activity || !member) continue;
      const activityDate = new Date(activity.date);
      if (activityDate < now || activityDate > cutoff) continue;
      const hoursUntil = Math.round(
        (activityDate.getTime() - now.getTime()) / (60 * 60 * 1000),
      );
      inRange.push({
        memberId: (b as any).memberId?._id,
        memberName: member.name || member.email,
        memberEmail: member.email,
        activityTitle: activity.title,
        activityDate,
        location: activity.location,
        hoursUntil,
      });
    }

    if (inRange.length === 0) {
      return {
        queued: false,
        total: 0,
        message: 'No upcoming sessions found in the specified time range.',
      };
    }

    // Fire-and-forget: kick off background sending without awaiting
    this._sendSessionRemindersInBackground(inRange, testMode);

    return {
      queued: true,
      total: inRange.length,
      message: `Session reminder sending started in the background for ${inRange.length} booking(s). You will receive a report email when complete.`,
    };
  }

  /**
   * Private helper — sends session reminders in the background.
   * After completion, sends an admin report email with CSV attachment.
   */
  private async _sendSessionRemindersInBackground(
    items: Array<{
      memberId: any;
      memberName: string;
      memberEmail: string;
      activityTitle: string;
      activityDate: Date;
      location?: string;
      hoursUntil: number;
    }>,
    testMode: boolean,
  ): Promise<void> {
    const testEmail =
      this.configService.get<string>('TEST_EMAIL') || 'marsad11223@gmail.com';
    const sendTo = testMode ? testEmail : null;

    let sent = 0;
    let failed = 0;
    const results: {
      email: string;
      name: string;
      activityTitle: string;
      activityDate: string;
      location: string;
      hoursUntil: number;
      status: string;
      error: string;
      sentAt: string;
    }[] = [];

    console.log(
      `[SessionReminders] Background send started — ${items.length} recipient(s)`,
    );

    for (const item of items) {
      const toEmail = sendTo || item.memberEmail;
      if (!toEmail) {
        failed++;
        results.push({
          email: 'N/A',
          name: item.memberName,
          activityTitle: item.activityTitle,
          activityDate: item.activityDate.toISOString(),
          location: item.location || '',
          hoursUntil: item.hoursUntil,
          status: 'failed',
          error: 'No email address',
          sentAt: new Date().toISOString(),
        });
        continue;
      }
      try {
        const html = sessionReminderEmail({
          memberName: item.memberName,
          memberEmail: item.memberEmail,
          activityTitle: item.activityTitle,
          activityDate: item.activityDate,
          location: item.location,
          hoursUntil: item.hoursUntil,
        });
        await this.emailService.sendMail({
          to: toEmail,
          subject: testMode
            ? `[TEST] Reminder: ${item.activityTitle} – ${new Date(item.activityDate).toLocaleString()}`
            : `Reminder: ${item.activityTitle} – ${new Date(item.activityDate).toLocaleString()}`,
          html,
        });
        sent++;
        results.push({
          email: toEmail,
          name: item.memberName,
          activityTitle: item.activityTitle,
          activityDate: item.activityDate.toISOString(),
          location: item.location || '',
          hoursUntil: item.hoursUntil,
          status: 'success',
          error: '',
          sentAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[SessionReminders] Failed to send to', toEmail, err);
        failed++;
        results.push({
          email: toEmail,
          name: item.memberName,
          activityTitle: item.activityTitle,
          activityDate: item.activityDate.toISOString(),
          location: item.location || '',
          hoursUntil: item.hoursUntil,
          status: 'failed',
          error: (err as Error).message || 'Unknown error',
          sentAt: new Date().toISOString(),
        });
      }
    }

    console.log(
      `[SessionReminders] Background send complete — sent: ${sent}, failed: ${failed}, total: ${items.length}`,
    );

    // Build CSV and send admin report
    const csvHeader =
      'Email,Name,Activity Title,Activity Date,Location,Hours Until,Status,Error,Sent At';
    const csvRows = results.map(
      (r) =>
        `"${r.email}","${r.name}","${r.activityTitle}","${r.activityDate}","${r.location}","${r.hoursUntil}","${r.status}","${r.error}","${r.sentAt}"`,
    );
    const csv = [csvHeader, ...csvRows].join('\n');

    await this._sendAdminReport(
      'Session Reminders',
      { sent, failed, total: items.length },
      csv,
    );
  }

  /**
   * Shared helper — sends a summary report email to the admin with a CSV attachment.
   */
  private async _sendAdminReport(
    jobType: string,
    stats: { sent: number; failed: number; total: number },
    csvContent: string,
  ): Promise<void> {
    try {
      const adminEmail =
        this.configService.get<string>('ADMIN_EMAIL') ||
        this.configService.get<string>('TEST_EMAIL') ||
        'marsad11223@gmail.com';

      const html = adminEmailJobReport({
        jobType,
        completedAt: new Date(),
        total: stats.total,
        sent: stats.sent,
        failed: stats.failed,
      });

      const dateStamp = new Date().toISOString().split('T')[0];
      const filename = `${jobType.toLowerCase().replace(/\s+/g, '-')}-report-${dateStamp}.csv`;

      await this.emailService.sendMail({
        to: adminEmail,
        subject: `${jobType} — Job Report (${stats.sent}/${stats.total} sent)`,
        html,
        attachments: [
          {
            filename,
            content: Buffer.from(csvContent, 'utf-8'),
          },
        ],
      });

      console.log(`[AdminReport] ${jobType} report sent to ${adminEmail}`);
    } catch (err) {
      console.error(`[AdminReport] Failed to send ${jobType} report`, err);
    }
  }
}
