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
import mongoose, { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { ContactUsDto } from './dto/contact-us.dto';
import { MailerService } from '@nestjs-modules/mailer';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly mailerService: MailerService,
    private readonly jwtService: JwtService,
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
    try {
      await this.mailerService.sendMail({
        to: 'marsad11223@gmail.com',
        subject: subject,
        html: `<p>Name: ${name}</p>
        <p>Email: ${email}</p>
        <p>Subject: ${subject}</p>
        <p>Message: ${body}</p>`,
      });

      return {
        message: 'Email has been sent to the team',
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
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
}
