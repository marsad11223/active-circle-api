import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
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
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import {
  passwordResetRequest,
  passwordResetSuccessful,
  passwordChangedSuccessfully,
  welcomeEmailMember,
  welcomeEmailHost,
  emailVerificationOtp,
} from 'src/utils/email-templates';
import { normalizeEmail } from 'src/utils/helper';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private userModel: mongoose.Model<User>,
    @InjectModel(Subscription.name)
    private subscriptionModel: mongoose.Model<Subscription>,
    private jwtService: JwtService,
    private readonly emailService: EmailService,
    private configService: ConfigService,
  ) {}

  private readonly OTP_EXPIRY_MINUTES = 10;
  private readonly OTP_MAX_ATTEMPTS = 5;
  private readonly RESEND_COOLDOWN_SECONDS = 60;

  private generateOtp(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  async register(createUserDto: CreateUserDto) {
    const emailNormalized = normalizeEmail(createUserDto.email);
    const existing = await this.userModel.findOne({ email: emailNormalized });
    if (existing) {
      throw new ConflictException('User already Exist');
    }

    try {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

      const otp = this.generateOtp();
      const otpHash = await bcrypt.hash(otp, 10);
      const expiresAt = new Date(
        Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000,
      );

      // Check if email verification should be skipped
      const skipEmailVerification =
        this.configService.get<string>('SKIP_EMAIL_VERIFICATION') === 'true';

      const userData: any = {
        ...createUserDto,
        email: emailNormalized,
        password: hashedPassword,
        role: createUserDto.role ?? Role.member,
        grantRole: GrantRole.member,
        emailVerified: skipEmailVerification ? true : false, // Auto-verify if skipping
        verificationOtpHash: skipEmailVerification ? null : otpHash,
        verificationOtpExpiresAt: skipEmailVerification ? null : expiresAt,
        verificationOtpAttempts: 0,
        verificationOtpLastSentAt: skipEmailVerification ? null : new Date(),
        radius: createUserDto.radius ?? 10,
        interests: createUserDto.interests ?? [],
      };

      if (createUserDto.dateOfBirth) {
        userData.dateOfBirth = new Date(createUserDto.dateOfBirth);
      }

      const newUser = await this.userModel.create(userData);

      // Only send OTP email if verification is not skipped
      const emailsEnabled =
        this.configService.get<string>('EMAILS_ENABLED') === 'true';
      if (emailsEnabled && !skipEmailVerification) {
        setImmediate(() => {
          const html = emailVerificationOtp({
            recipientName: newUser.name,
            otp,
            expiresInMinutes: this.OTP_EXPIRY_MINUTES,
          });
          this.emailService
            .sendMail({
              to: newUser.email,
              subject: 'Verify your email – Active Circle',
              html,
            })
            .then(() => {
              console.log('[REGISTER] OTP email sent to:', newUser.email);
            })
            .catch((err) => {
              console.error('[REGISTER] OTP email failed:', err.message);
            });
        });
      }

      const data = newUser.toObject ? newUser.toObject() : { ...newUser };
      delete (data as any).password;
      delete (data as any).verificationOtpHash;

      return {
        data,
        requiresEmailVerification: !skipEmailVerification, // Don't require verification if skipped
        email: newUser.email,
      };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  async verifyEmail(email: string, otp: string) {
    const emailNormalized = normalizeEmail(email);
    const user = await this.userModel
      .findOne({ email: emailNormalized })
      .select('+verificationOtpHash');
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if ((user as any).emailVerified) {
      throw new BadRequestException(
        'Email is already verified. You can log in.',
      );
    }
    const now = new Date();
    const expiresAt = (user as any).verificationOtpExpiresAt;
    if (!expiresAt || new Date(expiresAt) < now) {
      throw new BadRequestException(
        'OTP has expired. Please request a new code.',
      );
    }
    const attempts = (user as any).verificationOtpAttempts ?? 0;
    if (attempts >= this.OTP_MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Too many attempts. Please request a new code.',
      );
    }
    const hash = (user as any).verificationOtpHash;
    if (!hash) {
      throw new BadRequestException(
        'No verification pending. Please request a new code.',
      );
    }
    const valid = await bcrypt.compare(otp, hash);
    if (!valid) {
      await this.userModel.findByIdAndUpdate(user._id, {
        $inc: { verificationOtpAttempts: 1 },
        updated_at: now,
      });
      throw new BadRequestException('Invalid OTP. Please try again.');
    }

    await this.userModel.findByIdAndUpdate(user._id, {
      emailVerified: true,
      emailVerifiedAt: now,
      verificationOtpHash: null,
      verificationOtpExpiresAt: null,
      verificationOtpAttempts: 0,
      verificationOtpLastSentAt: null,
      updated_at: now,
    });

    const updatedUser = await this.userModel
      .findById(user._id)
      .select('-password');
    const payload = { id: updatedUser!._id, email: updatedUser!.email };
    const accessToken = this.jwtService.sign(payload);

    const emailsEnabled =
      this.configService.get<string>('EMAILS_ENABLED') === 'true';
    if (emailsEnabled) {
      setImmediate(() => {
        const isHost =
          (updatedUser as any).role === Role.premiumMember ||
          (updatedUser as any).role === Role.standardMember;
        const welcomeHtml = isHost
          ? welcomeEmailHost({
              userName: (updatedUser as any).name,
              userEmail: (updatedUser as any).email,
            })
          : welcomeEmailMember({
              userName: (updatedUser as any).name,
              userEmail: (updatedUser as any).email,
            });
        this.emailService
          .sendMail({
            to: (updatedUser as any).email,
            subject: 'Welcome to Active Circle!',
            html: welcomeHtml,
          })
          .catch((err) =>
            console.error('[VERIFY] Welcome email failed:', err.message),
          );
      });
    }

    return {
      data: updatedUser,
      accessToken,
    };
  }

  async resendVerificationOtp(email: string) {
    const emailNormalized = normalizeEmail(email);
    const user = await this.userModel.findOne({ email: emailNormalized });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if ((user as any).emailVerified) {
      throw new BadRequestException(
        'Email is already verified. You can log in.',
      );
    }
    const lastSent = (user as any).verificationOtpLastSentAt;
    if (lastSent) {
      const elapsed = (Date.now() - new Date(lastSent).getTime()) / 1000;
      if (elapsed < this.RESEND_COOLDOWN_SECONDS) {
        throw new BadRequestException(
          `Please wait ${Math.ceil(this.RESEND_COOLDOWN_SECONDS - elapsed)} seconds before requesting a new code.`,
        );
      }
    }

    const otp = this.generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(
      Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    await this.userModel.findByIdAndUpdate(user._id, {
      verificationOtpHash: otpHash,
      verificationOtpExpiresAt: expiresAt,
      verificationOtpAttempts: 0,
      verificationOtpLastSentAt: new Date(),
      updated_at: new Date(),
    });

    const emailsEnabled =
      this.configService.get<string>('EMAILS_ENABLED') === 'true';
    if (emailsEnabled) {
      const html = emailVerificationOtp({
        recipientName: (user as any).name,
        otp,
        expiresInMinutes: this.OTP_EXPIRY_MINUTES,
      });
      await this.emailService.sendMail({
        to: user.email,
        subject: 'Verify your email – Active Circle',
        html,
      });
    }

    return { message: 'Verification code sent. Check your email.' };
  }

  async login(loginUserDto: LoginUserDto): Promise<any> {
    const { email, password } = loginUserDto;
    const emailNormalized = normalizeEmail(email);
    const user = await this.userModel.findOne({ email: emailNormalized });
    if (user) {
      // Prevent login for soft-deleted users
      if ((user as any).isDeleted || (user as any).deleted_at) {
        throw new UnauthorizedException('Account not found');
      }
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        throw new UnauthorizedException('Incorrect Email or Password');
      }

      // Skip email verification check if disabled for testing
      const skipEmailVerification =
        this.configService.get<string>('SKIP_EMAIL_VERIFICATION') === 'true';
      if (!skipEmailVerification && (user as any).emailVerified === false) {
        throw new ForbiddenException({
          message: 'Please verify your email before logging in.',
          code: 'EMAIL_NOT_VERIFIED',
          email: user.email,
        });
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
      const emailNormalized = normalizeEmail(email);
      console.log('[FORGOT_PASSWORD] Step 1: Looking up user in database...');
      const user = await this.userModel.findOne({ email: emailNormalized });
      if (!user) {
        console.log(
          '[FORGOT_PASSWORD] ERROR: User not found for email:',
          emailNormalized,
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
      const result: any = await this.emailService.sendMail(emailOptions);
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
    const emailNormalized = normalizeEmail(email);

    // 1. Check if passwords match
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // 2. Find user by email
    const user = await this.userModel.findOne({ email: emailNormalized });
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
          await this.emailService.sendMail({
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
          await this.emailService.sendMail({
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
