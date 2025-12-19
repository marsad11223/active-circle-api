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
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private userModel: mongoose.Model<User>,
    private jwtService: JwtService,
    private readonly mailerService: MailerService,
    private configService: ConfigService,
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

    // 4. Create reset link using environment variable or default to localhost
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${encodedData}`;

    try {
      // 5. Send email
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Forgot Password Request',
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>Hello ${user.name || user.email},</p>
          <p>You requested to reset your password. Please click the link below to reset your password:</p>
          <p style="margin: 20px 0;">
            <a href="${resetLink}" style="background-color: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
          </p>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetLink}</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            If you did not request this password reset, please ignore this email. This link will expire in 24 hours.
          </p>
        </div>
      `,
      });

      // 6. Return confirmation
      return {
        message: `Password reset link has been sent to ${user.email}`,
      };
    } catch (error: any) {
      console.error('Error sending forgot password email:', error);
      throw new BadRequestException(
        `Error while sending reset email: ${error.message || 'Email service error'}`,
      );
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
      try {
        await this.mailerService.sendMail({
          to: user.email,
          subject: 'Password Reset Successful',
          html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset Successful</h2>
            <p>Hello ${user.name || user.email},</p>
            <p>Your password has been successfully reset.</p>
            <p>If you did not make this change, please contact support immediately.</p>
          </div>
        `,
        });
      } catch (emailError: any) {
        console.error('Error sending reset confirmation email:', emailError);
        // Don't throw error, password was reset successfully
      }

      return {
        message: 'Your password has been reset successfully.',
      };
    } catch (error) {
      throw new BadRequestException('Error while resetting password', error);
    }
  }
}
