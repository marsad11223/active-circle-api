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
import { GrantRole, User, Role } from 'src/schemas/user.schema';
import {
  Subscription,
  SubscriptionSchema,
} from 'src/schemas/subscription.schema';
import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto/login-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SendGridService } from '../sendgrid/sendgrid.service';
import { ConfigService } from '@nestjs/config';
import {
  passwordResetRequest,
  passwordResetSuccessful,
  passwordChangedSuccessfully,
  welcomeEmailMember,
  welcomeEmailHost,
} from 'src/utils/email-templates';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private userModel: mongoose.Model<User>,
    @InjectModel(Subscription.name)
    private subscriptionModel: mongoose.Model<Subscription>,
    private jwtService: JwtService,
    private readonly sendGridService: SendGridService,
    private configService: ConfigService,
  ) {}

  async register(createUserDto: CreateUserDto) {
    const user = await this.userModel.findOne({ email: createUserDto.email });

    if (!user) {
      try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

        const userData: any = {
          ...createUserDto,
          password: hashedPassword,
          role: createUserDto.role ?? Role.member,
          grantRole: GrantRole.member,
          // Set default radius to 10km if not provided (member profile specific)
          radius: createUserDto.radius ?? 10,
          // Set default empty interests array if not provided (member profile specific)
          interests: createUserDto.interests ?? [],
        };

        // Convert dateOfBirth string to Date if provided
        if (createUserDto.dateOfBirth) {
          userData.dateOfBirth = new Date(createUserDto.dateOfBirth);
        }

        const newUser = await this.userModel.create(userData);

        const payload = { id: newUser._id, email: newUser.email };
        const accessToken = this.jwtService.sign(payload);

        // Send welcome email asynchronously (non-blocking)
        const emailsEnabled =
          this.configService.get<string>('EMAILS_ENABLED') === 'true';
        if (emailsEnabled) {
          setImmediate(() => {
            const isHost =
              newUser.role === Role.premiumMember ||
              newUser.role === Role.standardMember;
            const welcomeHtml = isHost
              ? welcomeEmailHost({
                  userName: newUser.name,
                  userEmail: newUser.email,
                })
              : welcomeEmailMember({
                  userName: newUser.name,
                  userEmail: newUser.email,
                });
            this.sendGridService
              .sendMail({
                to: newUser.email,
                subject: 'Welcome to Active Circle!',
                html: welcomeHtml,
              })
              .then(() => {
                console.log('[REGISTER] Welcome email sent to:', newUser.email);
              })
              .catch((err) => {
                console.error(
                  '[REGISTER] Error sending welcome email:',
                  err.message,
                );
                // Don't throw error - registration was successful
              });
          });
        }

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
      // Prevent login for soft-deleted users
      if ((user as any).isDeleted || (user as any).deleted_at) {
        throw new UnauthorizedException('Account not found');
      }
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        throw new UnauthorizedException('Incorrect Email or Password');
      }

      // Set role to 'host' if user has active subscription (permanent role)
      // Set grantRole (current selected role) based on lastRole or default
      let updatedUser = user;
      const updateData: any = {
        lastLogin: new Date(),
        updated_at: Date.now(),
      };

      // Set permanent role to premiumMember or standardMember if user has active subscription
      if (
        user.hasActiveSubscription &&
        user.role !== Role.premiumMember &&
        user.role !== Role.standardMember &&
        user.role !== Role.superAdmin
      ) {
        const sub = await this.subscriptionModel
          .findOne({
            userId: user._id,
            status: { $in: ['active', 'trialing'] },
          })
          .select('plan')
          .lean();
        updateData.role =
          sub?.plan === 'standard' ? Role.standardMember : Role.premiumMember;
      }

      // Update user with new grantRole and lastLogin
      const updated = await this.userModel.findByIdAndUpdate(
        user._id,
        updateData,
        { new: true },
      );
      if (updated) {
        updatedUser = updated;
      }

      const payload = { id: updatedUser._id, email: updatedUser.email };
      const accessToken = this.jwtService.sign(payload);
      return {
        data: updatedUser,
        accessToken: accessToken,
      };
    } else {
      throw new UnauthorizedException('Incorrect Email or Password');
    }
  }

  // forgot password
  async forgotPassword(email: string): Promise<{ message: string }> {
    console.log(
      '[FORGOT_PASSWORD] Starting forgot password request for:',
      email,
    );
    const startTime = Date.now();

    try {
      // 1. Check if user exists
      console.log('[FORGOT_PASSWORD] Step 1: Looking up user in database...');
      const user = await this.userModel.findOne({ email });
      if (!user) {
        console.log(
          '[FORGOT_PASSWORD] ERROR: User not found for email:',
          email,
        );
        throw new NotFoundException('User with this email not found');
      }

      // Do not allow password reset for soft-deleted users
      if ((user as any).isDeleted || (user as any).deleted_at) {
        console.log(
          '[FORGOT_PASSWORD] ERROR: Attempt to reset password for deleted user:',
          email,
        );
        throw new NotFoundException('User with this email not found');
      }
      console.log(
        '[FORGOT_PASSWORD] Step 1: User found - ID:',
        user._id,
        'Email:',
        user.email,
      );

      // 2. Prepare payload
      console.log('[FORGOT_PASSWORD] Step 2: Preparing reset token payload...');
      const payload = {
        email: user.email,
        authenticated: true,
      };
      console.log(
        '[FORGOT_PASSWORD] Step 2: Payload created:',
        JSON.stringify(payload),
      );

      // 3. Encode payload to Base64
      console.log('[FORGOT_PASSWORD] Step 3: Encoding payload to Base64...');
      const encodedData = Buffer.from(JSON.stringify(payload)).toString(
        'base64',
      );
      console.log(
        '[FORGOT_PASSWORD] Step 3: Encoded data length:',
        encodedData.length,
        'chars',
      );

      // 4. Create reset link using environment variable or default to localhost
      console.log('[FORGOT_PASSWORD] Step 4: Building reset link...');
      const frontendUrlEnv = this.configService.get<string>('FRONTEND_URL');
      console.log(
        '[FORGOT_PASSWORD] Step 4: FRONTEND_URL from env:',
        frontendUrlEnv || 'NOT SET',
      );
      const frontendUrl = frontendUrlEnv || 'http://localhost:3000';
      console.log('[FORGOT_PASSWORD] Step 4: Using frontend URL:', frontendUrl);

      const resetLink = `${frontendUrl}/reset-password?token=${encodedData}`;
      console.log(
        '[FORGOT_PASSWORD] Step 4: Reset link created (length:',
        resetLink.length,
        'chars)',
      );
      console.log(
        '[FORGOT_PASSWORD] Step 4: Reset link preview:',
        resetLink.substring(0, 100) + '...',
      );

      // 5. Send email asynchronously (fire-and-forget, no timeout blocking)
      // Return response immediately, don't wait for email to complete
      // This prevents API timeout in production where SMTP might be slower
      console.log(
        '[FORGOT_PASSWORD] Step 5: Scheduling email send (async, non-blocking)...',
      );
      const emailStartTime = Date.now();

      setImmediate(() => {
        console.log(
          '[FORGOT_PASSWORD] Step 5: Executing email send in background...',
        );
        console.log(
          '[FORGOT_PASSWORD] Email config - To:',
          user.email,
          'Subject: Forgot Password Request',
        );

        // Retry email sending with exponential backoff
        this.sendEmailWithRetry(
          {
            to: user.email,
            subject: 'Forgot Password Request',
            html: passwordResetRequest({
              userName: user.name,
              userEmail: user.email,
              resetLink: resetLink,
            }),
          },
          emailStartTime,
        );
      });

      // 6. Return confirmation immediately
      const totalDuration = Date.now() - startTime;
      console.log('[FORGOT_PASSWORD] Step 6: Returning response immediately');
      console.log(
        '[FORGOT_PASSWORD] Total API response time:',
        totalDuration,
        'ms',
      );
      console.log(
        '[FORGOT_PASSWORD] Request completed successfully (email sent async)',
      );

      return {
        message: `Password reset link has been sent to ${user.email}`,
      };
    } catch (error: any) {
      const totalDuration = Date.now() - startTime;
      console.error('[FORGOT_PASSWORD] FATAL ERROR in forgot password flow');
      console.error('[FORGOT_PASSWORD] Error after:', totalDuration, 'ms');
      console.error(
        '[FORGOT_PASSWORD] Error type:',
        error?.constructor?.name || typeof error,
      );
      console.error(
        '[FORGOT_PASSWORD] Error message:',
        error?.message || 'No error message',
      );
      console.error(
        '[FORGOT_PASSWORD] Error stack:',
        error?.stack || 'No stack trace',
      );
      throw error;
    }
  }

  /**
   * Send email with retry logic and exponential backoff
   * Retries up to 3 times if connection timeout occurs
   */
  private async sendEmailWithRetry(
    emailOptions: {
      to: string;
      subject: string;
      html: string;
    },
    startTime: number,
    attempt: number = 1,
    maxAttempts: number = 3,
  ): Promise<void> {
    const attemptStartTime = Date.now();
    console.log(
      `[FORGOT_PASSWORD] Email send attempt ${attempt}/${maxAttempts}...`,
    );

    const emailsEnabled =
      this.configService.get<string>('EMAILS_ENABLED') === 'true';
    if (!emailsEnabled) {
      console.log('[FORGOT_PASSWORD] Emails disabled, skipping email send');
      return;
    }

    try {
      const result: any = await this.sendGridService.sendMail(emailOptions);
      const emailDuration = Date.now() - startTime;
      const attemptDuration = Date.now() - attemptStartTime;

      console.log(
        '[FORGOT_PASSWORD] SUCCESS: Password reset email sent successfully',
      );
      console.log('[FORGOT_PASSWORD] Email sent to:', emailOptions.to);
      console.log(
        '[FORGOT_PASSWORD] Total email send duration:',
        emailDuration,
        'ms',
      );
      console.log(
        '[FORGOT_PASSWORD] This attempt duration:',
        attemptDuration,
        'ms',
      );
      console.log('[FORGOT_PASSWORD] Email result:', JSON.stringify(result));
    } catch (error: any) {
      const attemptDuration = Date.now() - attemptStartTime;
      const totalDuration = Date.now() - startTime;

      console.error(
        `[FORGOT_PASSWORD] ERROR: Email send attempt ${attempt} failed`,
      );
      console.error(
        '[FORGOT_PASSWORD] Attempt duration:',
        attemptDuration,
        'ms',
      );
      console.error(
        '[FORGOT_PASSWORD] Total time elapsed:',
        totalDuration,
        'ms',
      );
      console.error(
        '[FORGOT_PASSWORD] Error type:',
        error?.constructor?.name || typeof error,
      );
      console.error(
        '[FORGOT_PASSWORD] Error message:',
        error?.message || 'No error message',
      );
      console.error(
        '[FORGOT_PASSWORD] Error code:',
        error?.code || 'No error code',
      );

      // Check if it's a connection timeout and we have retries left
      const isConnectionError =
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'ETIMEDOUT' ||
        error?.message?.includes('timeout') ||
        error?.message?.includes('Connection timeout');

      if (isConnectionError && attempt < maxAttempts) {
        // Exponential backoff: 5s, 10s, 20s
        const delay = Math.pow(2, attempt) * 5000;
        console.log(
          `[FORGOT_PASSWORD] Retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})...`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));

        // Retry
        return this.sendEmailWithRetry(
          emailOptions,
          startTime,
          attempt + 1,
          maxAttempts,
        );
      } else {
        // Final failure - log all details
        console.error(
          '[FORGOT_PASSWORD] FATAL: All email send attempts failed',
        );
        console.error(
          '[FORGOT_PASSWORD] Error stack:',
          error?.stack || 'No stack trace',
        );
        console.error(
          '[FORGOT_PASSWORD] Full error object:',
          JSON.stringify(error, Object.getOwnPropertyNames(error)),
        );
        // Don't throw - email is sent async, we don't want to crash the app
      }
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
      const emailsEnabled =
        this.configService.get<string>('EMAILS_ENABLED') === 'true';
      if (emailsEnabled) {
        try {
          await this.sendGridService.sendMail({
            to: user.email,
            subject: 'Password Reset Successful',
            html: passwordResetSuccessful({
              userName: user.name,
              userEmail: user.email,
            }),
          });
        } catch (emailError: any) {
          console.error('Error sending reset confirmation email:', emailError);
          // Don't throw error, password was reset successfully
        }
      }

      return {
        message: 'Your password has been reset successfully.',
      };
    } catch (error) {
      throw new BadRequestException('Error while resetting password', error);
    }
  }

  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const { oldPassword, newPassword, confirmPassword } = changePasswordDto;

    // 1. Check if passwords match
    if (newPassword !== confirmPassword) {
      throw new BadRequestException(
        'New password and confirm password do not match',
      );
    }

    // 2. Find user by ID
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 3. Verify old password
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      throw new UnauthorizedException('Old password is incorrect');
    }

    // 4. Check if new password is different from old password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from old password',
      );
    }

    try {
      // 5. Hash new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      // 6. Update user password
      await this.userModel.findByIdAndUpdate(
        userId,
        { password: hashedPassword, updated_at: Date.now() },
        { new: true },
      );

      // 7. Send confirmation email
      const emailsEnabled =
        this.configService.get<string>('EMAILS_ENABLED') === 'true';
      if (emailsEnabled) {
        try {
          await this.sendGridService.sendMail({
            to: user.email,
            subject: 'Password Changed Successfully',
            html: passwordChangedSuccessfully({
              userName: user.name,
              userEmail: user.email,
            }),
          });
        } catch (emailError: any) {
          console.error(
            'Error sending password change confirmation email:',
            emailError,
          );
          // Don't throw error, password was changed successfully
        }
      }

      return {
        message: 'Your password has been changed successfully.',
      };
    } catch (error) {
      throw new BadRequestException('Error while changing password', error);
    }
  }
}
