import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/schemas/user.schema';
import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto/login-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private userModel: mongoose.Model<User>,
    private jwtService: JwtService,
    private readonly mailerService: MailerService,
  ) {}

  async register(createUserDto: CreateUserDto) {
    const user = await this.userModel.findOne({ email: createUserDto.email });

    if (!user) {
      try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

        const newUser = await this.userModel.create({
          ...createUserDto,
          password: hashedPassword,
        });

        const payload = { id: newUser._id, email: newUser.email };
        const accessToken = this.jwtService.sign(payload);
        return {
          data: newUser,
          accessToken: accessToken,
        };
      } catch (err) {
        throw new BadRequestException(err.message);
      }
    } else {
      throw new ConflictException('User already Exist');
    }
  }

  async login(loginUserDto: LoginUserDto): Promise<any> {
    const { email, password } = loginUserDto;
    const user = await this.userModel.findOne({ email: email });
    if (user) {
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        throw new UnauthorizedException('Incorrect Email or Password');
      }

      const payload = { id: user._id, email: user.email };
      const accessToken = this.jwtService.sign(payload);
      return {
        data: user,
        accessToken: accessToken,
      };
    } else {
      throw new UnauthorizedException('Incorrect Email or Password');
    }
  }

  // forgot password
  async forgotPassword(email: string): Promise<{ message: string }> {
    // 1. Check if user exists
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new NotFoundException('User with this email not found');
    }

    // 2. Prepare payload
    const payload = {
      email: user.email,
      authenticated: true,
    };

    // 3. Encode payload to Base64
    const encodedData = Buffer.from(JSON.stringify(payload)).toString('base64');

    // 4. Create reset link (for now using localhost:3000)
    const resetLink = `http://localhost:3000/resetpassword?token=${encodedData}`;

    try {
      // 5. Send email
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Forgot Password Request',
        html: `
        <p>Hello ${user.email},</p>
        <p>You requested to reset your password. Please click the link below to reset:</p>
        <a href="${resetLink}">Reset Password</a>
        <p>If you did not request this, please ignore this email.</p>
      `,
      });

      // 6. Return confirmation
      return {
        message: `Password reset link has been sent to ${user.email}`,
      };
    } catch (error) {
      throw new BadRequestException('Error while sending reset email', error);
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<any> {
    const { email, password, confirmPassword } = resetPasswordDto;

    // 1. Check if passwords match
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // 2. Find user by email
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new NotFoundException('Email not found');
    }

    try {
      // 3. Hash new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // 4. Update user record
      await this.userModel.findByIdAndUpdate(
        { _id: user._id },
        { password: hashedPassword, updated_at: Date.now() },
        { new: true },
      );

      // 5. Send confirmation email
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Password Reset Successful',
        text: `Your password for WieFührerschein has been successfully reset.`,
      });

      return {
        message: 'Your password has been reset successfully.',
      };
    } catch (error) {
      throw new BadRequestException('Error while resetting password', error);
    }
  }
}
