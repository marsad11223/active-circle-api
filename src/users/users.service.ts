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
} from './dto/admin-list-users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
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

        const newUser = await this.userModel.create({
          ...createUserDto,
          password: hashedPassword,
        });

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

  async findOne(id: string): Promise<any> {
    try {
      const user = await this.findUser(id);
      if (!user) {
        throw new NotFoundException('User not found!');
      } else {
        return user;
      }
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
        await this.userModel.deleteOne({ _id: id });
        return {
          message: 'Successfully deleted',
        };
      }
    } catch (err) {
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
}
