import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Payout, PayoutStatus } from 'src/schemas/payout.schema';
import { Booking, BookingStatus, PaymentStatus } from 'src/schemas/booking.schema';
import { User, Role } from 'src/schemas/user.schema';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { CreateWithdrawalRequestDto } from './dto/create-withdrawal-request.dto';
import { ApprovePayoutDto } from './dto/approve-payout.dto';
import { AddPaymentMethodDto } from './dto/add-payment-method.dto';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class PayoutService {
  private stripe: Stripe;

  constructor(
    @InjectModel(Payout.name)
    private readonly payoutModel: Model<Payout>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private configService: ConfigService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is not defined in environment variables',
      );
    }
    this.stripe = new Stripe(stripeSecretKey);
  }

  /**
   * Get host earnings summary
   * Calculates total earnings, pending payouts, and total paid out
   */
  async getHostEarningsSummary(hostId: string): Promise<{
    totalEarnings: number;
    pendingPayouts: number;
    totalPaidOut: number;
    availableBalance: number;
  }> {
    // Get all completed bookings for this host where payment was transferred
    const completedBookings = await this.bookingModel.find({
      hostId: new mongoose.Types.ObjectId(hostId),
      status: BookingStatus.CONFIRMED,
      paymentStatus: { $in: [PaymentStatus.PAID, PaymentStatus.TRANSFERRED] },
      deleted_at: null,
    });

    // Calculate total earnings (all confirmed paid bookings)
    const totalEarnings = completedBookings.reduce(
      (sum, booking) => sum + (booking.amount || 0),
      0,
    );

    // Get pending payout requests
    const pendingPayouts = await this.payoutModel.find({
      hostId: new mongoose.Types.ObjectId(hostId),
      status: { $in: [PayoutStatus.PENDING, PayoutStatus.APPROVED] },
      deleted_at: null,
    });

    const pendingPayoutsAmount = pendingPayouts.reduce(
      (sum, payout) => sum + (payout.requestedAmount || 0),
      0,
    );

    // Get completed payouts
    const completedPayouts = await this.payoutModel.find({
      hostId: new mongoose.Types.ObjectId(hostId),
      status: PayoutStatus.COMPLETED,
      deleted_at: null,
    });

    const totalPaidOut = completedPayouts.reduce(
      (sum, payout) => sum + (payout.netAmount || payout.requestedAmount || 0),
      0,
    );

    // Available balance = total earnings - pending payouts - total paid out
    const availableBalance = totalEarnings - pendingPayoutsAmount - totalPaidOut;

    return {
      totalEarnings,
      pendingPayouts: pendingPayoutsAmount,
      totalPaidOut,
      availableBalance: Math.max(0, availableBalance), // Ensure non-negative
    };
  }

  /**
   * Get host transaction history (bookings that generated earnings)
   */
  async getHostTransactions(
    hostId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    transactions: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    // Get all bookings that generated earnings
    const query = {
      hostId: new mongoose.Types.ObjectId(hostId),
      status: BookingStatus.CONFIRMED,
      paymentStatus: { $in: [PaymentStatus.PAID, PaymentStatus.TRANSFERRED] },
      deleted_at: null,
    };

    const total = await this.bookingModel.countDocuments(query);

    const bookings = await this.bookingModel
      .find(query)
      .populate('activityId', 'title picture date')
      .populate('memberId', 'name email profilePhoto')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    const transactions = bookings.map((booking) => {
      const bookingObj = booking.toObject();
      return {
        _id: bookingObj._id,
        activity: bookingObj.activityId,
        member: bookingObj.memberId,
        amount: bookingObj.amount,
        earnings: bookingObj.amount, // Full amount is earnings (no platform fee for now)
        paymentStatus: bookingObj.paymentStatus,
        attendanceStatus: bookingObj.attendanceStatus,
        createdAt: bookingObj.created_at,
        bookingDate: bookingObj.created_at,
      };
    });

    return {
      transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Create withdrawal request
   */
  async createWithdrawalRequest(
    hostId: string,
    createWithdrawalRequestDto: CreateWithdrawalRequestDto,
  ): Promise<Payout> {
    const host = await this.userModel.findById(hostId);
    if (!host) {
      throw new NotFoundException('Host not found');
    }

    if (host.role !== Role.host) {
      throw new ForbiddenException('Only hosts can create withdrawal requests');
    }

    // Check if host has a payment method
    const hasPaymentMethod =
      host.paymentMethods && host.paymentMethods.length > 0;
    if (!hasPaymentMethod) {
      throw new BadRequestException(
        'Please add a payment method before requesting withdrawal',
      );
    }

    // Get available balance
    const earningsSummary = await this.getHostEarningsSummary(hostId);

    if (createWithdrawalRequestDto.amount > earningsSummary.availableBalance) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${earningsSummary.availableBalance.toFixed(2)}`,
      );
    }

    if (createWithdrawalRequestDto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Check for existing pending requests
    const existingPending = await this.payoutModel.findOne({
      hostId: new mongoose.Types.ObjectId(hostId),
      status: { $in: [PayoutStatus.PENDING, PayoutStatus.APPROVED] },
      deleted_at: null,
    });

    if (existingPending) {
      throw new BadRequestException(
        'You already have a pending withdrawal request. Please wait for it to be processed.',
      );
    }

    // Get default payment method
    const defaultPaymentMethod = host.paymentMethods?.find(
      (pm) => pm.isDefault,
    ) || host.paymentMethods?.[0];

    if (!defaultPaymentMethod) {
      throw new BadRequestException('No payment method found');
    }

    // Create withdrawal request
    const payout = await this.payoutModel.create({
      hostId: new mongoose.Types.ObjectId(hostId),
      requestedAmount: createWithdrawalRequestDto.amount,
      status: PayoutStatus.PENDING,
      paymentMethodId: defaultPaymentMethod.stripePaymentMethodId,
      requestedAt: new Date(),
    });

    return payout;
  }

  /**
   * Get host withdrawal requests
   */
  async getHostWithdrawalRequests(hostId: string): Promise<Payout[]> {
    return this.payoutModel
      .find({
        hostId: new mongoose.Types.ObjectId(hostId),
        deleted_at: null,
      })
      .sort({ created_at: -1 });
  }

  /**
   * Get all withdrawal requests (Admin only)
   */
  async getAllWithdrawalRequests(
    page: number = 1,
    limit: number = 10,
    status?: PayoutStatus,
  ): Promise<{
    payouts: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const query: any = {
      deleted_at: null,
    };

    if (status) {
      query.status = status;
    }

    const total = await this.payoutModel.countDocuments(query);

    const payouts = await this.payoutModel
      .find(query)
      .populate('hostId', 'name email profilePhoto')
      .populate('approvedBy', 'name email')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    return {
      payouts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Approve withdrawal request (Admin only)
   */
  async approveWithdrawalRequest(
    payoutId: string,
    adminId: string,
    approvePayoutDto: ApprovePayoutDto,
  ): Promise<Payout> {
    const payout = await this.payoutModel.findById(payoutId);
    if (!payout) {
      throw new NotFoundException('Withdrawal request not found');
    }

    if (payout.status !== PayoutStatus.PENDING) {
      throw new BadRequestException(
        `Cannot approve payout with status: ${payout.status}`,
      );
    }

    // Get host details
    const host = await this.userModel.findById(payout.hostId);
    if (!host) {
      throw new NotFoundException('Host not found');
    }

    // Get payment method
    const paymentMethod = host.paymentMethods?.find(
      (pm) => pm.stripePaymentMethodId === payout.paymentMethodId,
    );

    if (!paymentMethod || !paymentMethod.stripePaymentMethodId) {
      throw new BadRequestException('Host payment method not found');
    }

    try {
      // Calculate Stripe fee (typically 2.9% + 30 cents for card payments)
      // For bank transfers, fee is usually lower, but we'll use a standard fee
      const stripeFeePercentage = 0.029; // 2.9%
      const stripeFeeFixed = 0.3; // 30 cents
      const stripeFee =
        payout.requestedAmount * stripeFeePercentage + stripeFeeFixed;
      const netAmount = payout.requestedAmount - stripeFee;

      // Update payout status to approved first
      payout.status = PayoutStatus.APPROVED;
      payout.stripeFee = Math.round(stripeFee * 100) / 100; // Round to 2 decimals
      payout.netAmount = Math.round(netAmount * 100) / 100;
      payout.approvedBy = new mongoose.Types.ObjectId(adminId);
      payout.approvedAt = new Date();
      await payout.save();

      // Process Stripe transfer
      // Note: This assumes you're using Stripe Connect or have the host's Stripe account ID
      // For now, we'll create a transfer to the payment method
      // In production, you might need to use Stripe Connect for proper payouts

      let stripeTransferId: string | undefined;

      try {
        // If host has a Stripe account ID (from Stripe Connect), use that
        // Otherwise, we'll need to create a payment intent or use a different method
        // For this implementation, we'll assume you're transferring to a connected account

        // Option 1: If using Stripe Connect (recommended for production)
        // const transfer = await this.stripe.transfers.create({
        //   amount: Math.round(netAmount * 100), // Convert to cents
        //   currency: 'gbp',
        //   destination: host.stripeAccountId, // Host's Stripe Connect account ID
        // });

        // Option 2: Create a payment to the payment method (simpler but less ideal)
        // For now, we'll mark it as completed and store a placeholder
        // In production, implement proper Stripe Connect or payment method transfer

        stripeTransferId = `transfer_${Date.now()}`; // Placeholder - replace with actual Stripe transfer ID

        // Update payout as completed
        payout.status = PayoutStatus.COMPLETED;
        payout.stripeTransferId = stripeTransferId;
        payout.completedAt = new Date();
        await payout.save();
      } catch (stripeError: any) {
        // If Stripe transfer fails, mark payout as failed
        payout.status = PayoutStatus.FAILED;
        payout.failureReason = stripeError.message || 'Stripe transfer failed';
        await payout.save();
        throw new BadRequestException(
          `Payment transfer failed: ${stripeError.message}`,
        );
      }

      return payout;
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(`Error approving payout: ${error.message}`);
    }
  }

  /**
   * Reject withdrawal request (Admin only)
   */
  async rejectWithdrawalRequest(
    payoutId: string,
    adminId: string,
    approvePayoutDto: ApprovePayoutDto,
  ): Promise<Payout> {
    const payout = await this.payoutModel.findById(payoutId);
    if (!payout) {
      throw new NotFoundException('Withdrawal request not found');
    }

    if (payout.status !== PayoutStatus.PENDING) {
      throw new BadRequestException(
        `Cannot reject payout with status: ${payout.status}`,
      );
    }

    if (!approvePayoutDto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    payout.status = PayoutStatus.REJECTED;
    payout.rejectionReason = approvePayoutDto.rejectionReason;
    payout.approvedBy = new mongoose.Types.ObjectId(adminId);
    payout.approvedAt = new Date();
    await payout.save();

    return payout;
  }

  /**
   * Get payout history for host
   */
  async getHostPayoutHistory(hostId: string): Promise<Payout[]> {
    return this.payoutModel
      .find({
        hostId: new mongoose.Types.ObjectId(hostId),
        deleted_at: null,
      })
      .populate('approvedBy', 'name email')
      .sort({ created_at: -1 });
  }

  /**
   * Add payment method for host
   */
  async addPaymentMethod(
    hostId: string,
    addPaymentMethodDto: AddPaymentMethodDto,
  ): Promise<User> {
    const host = await this.userModel.findById(hostId);
    if (!host) {
      throw new NotFoundException('Host not found');
    }

    if (host.role !== Role.host) {
      throw new ForbiddenException('Only hosts can add payment methods');
    }

    try {
      // Retrieve payment method from Stripe to get details
      const paymentMethod = await this.stripe.paymentMethods.retrieve(
        addPaymentMethodDto.paymentMethodId,
      );

      if (!paymentMethod) {
        throw new BadRequestException('Invalid payment method');
      }

      // Extract payment method details
      const paymentMethodData: any = {
        id: paymentMethod.id,
        type: paymentMethod.type,
        stripePaymentMethodId: paymentMethod.id,
        createdAt: new Date(),
        isVerified: true, // Assuming Stripe payment methods are verified
      };

      // Get last4 and brand based on type
      if (paymentMethod.type === 'card' && paymentMethod.card) {
        paymentMethodData.last4 = paymentMethod.card.last4;
        paymentMethodData.brand = paymentMethod.card.brand;
      } else if (paymentMethod.type === 'us_bank_account' && paymentMethod.us_bank_account) {
        paymentMethodData.last4 = paymentMethod.us_bank_account.last4;
        paymentMethodData.brand = paymentMethod.us_bank_account.bank_name || 'Bank Account';
      }

      // Initialize paymentMethods array if it doesn't exist
      if (!host.paymentMethods) {
        host.paymentMethods = [];
      }

      // Set as default if it's the first payment method
      if (host.paymentMethods.length === 0) {
        paymentMethodData.isDefault = true;
      } else {
        paymentMethodData.isDefault = false;
      }

      // Add payment method - ensure all fields are properly set
      const newPaymentMethod = {
        id: paymentMethodData.id || paymentMethod.id,
        type: paymentMethodData.type || paymentMethod.type,
        last4: paymentMethodData.last4 || '',
        brand: paymentMethodData.brand || '',
        isDefault: paymentMethodData.isDefault || false,
        isVerified: paymentMethodData.isVerified || true,
        stripePaymentMethodId: paymentMethodData.stripePaymentMethodId || paymentMethod.id,
        createdAt: paymentMethodData.createdAt || new Date(),
      };

      host.paymentMethods.push(newPaymentMethod);
      host.markModified('paymentMethods'); // Mark the array as modified
      await host.save();

      return host;
    } catch (error: any) {
      if (error.code === 'resource_missing') {
        throw new BadRequestException('Payment method not found in Stripe');
      }
      throw new BadRequestException(
        `Error adding payment method: ${error.message}`,
      );
    }
  }

  /**
   * Delete payment method
   */
  async deletePaymentMethod(
    hostId: string,
    paymentMethodId: string,
  ): Promise<User> {
    const host = await this.userModel.findById(hostId);
    if (!host) {
      throw new NotFoundException('Host not found');
    }

    if (host.role !== Role.host) {
      throw new ForbiddenException('Only hosts can delete payment methods');
    }

    if (!host.paymentMethods || host.paymentMethods.length === 0) {
      throw new BadRequestException('No payment methods found');
    }

    // Remove payment method
    host.paymentMethods = host.paymentMethods.filter(
      (pm) => pm.stripePaymentMethodId !== paymentMethodId,
    );

    // If we deleted the default, set the first one as default
    if (host.paymentMethods.length > 0) {
      const hadDefault = host.paymentMethods.some((pm) => pm.isDefault);
      if (!hadDefault) {
        host.paymentMethods[0].isDefault = true;
      }
    }

    await host.save();

    return host;
  }

  /**
   * Get payment methods for host
   */
  async getPaymentMethods(hostId: string): Promise<any[]> {
    const host = await this.userModel.findById(hostId);
    if (!host) {
      throw new NotFoundException('Host not found');
    }

    return host.paymentMethods || [];
  }
}

