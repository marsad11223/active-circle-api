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
import { RejectPayoutDto } from './dto/reject-payout.dto';
import { AddBankAccountDto } from './dto/add-bank-account.dto';
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
   * Get withdrawal request preparation data
   * Returns available balance and bank accounts for selection
   */
  async getWithdrawalRequestPreparation(hostId: string): Promise<{
    availableBalance: number;
    bankAccounts: any[];
    hasPendingRequest: boolean;
  }> {
    const host = await this.userModel.findById(hostId);
    if (!host) {
      throw new NotFoundException('Host not found');
    }

    if (host.role !== Role.host) {
      throw new ForbiddenException('Only hosts can access this endpoint');
    }

    // Get available balance
    const earningsSummary = await this.getHostEarningsSummary(hostId);

    // Get bank accounts
    const bankAccounts = host.bankAccounts || [];

    // Check for existing pending requests
    const existingPending = await this.payoutModel.findOne({
      hostId: new mongoose.Types.ObjectId(hostId),
      status: { $in: [PayoutStatus.PENDING, PayoutStatus.APPROVED] },
      deleted_at: null,
    });

    return {
      availableBalance: earningsSummary.availableBalance,
      bankAccounts: bankAccounts,
      hasPendingRequest: !!existingPending,
    };
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

    // Total paid out should use requestedAmount (what host requested), not netAmount
    // Fees are deducted from the payout, but the host's balance reflects what they requested
    const totalPaidOut = completedPayouts.reduce(
      (sum, payout) => sum + (payout.requestedAmount || 0),
      0,
    );

    // Available balance = total earnings - pending payouts - total paid out
    // We use requestedAmount for both pending and completed to correctly reflect available balance
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

    // Check if host has bank accounts
    const hasBankAccounts =
      host.bankAccounts && host.bankAccounts.length > 0;
    if (!hasBankAccounts) {
      throw new BadRequestException(
        'Please add a bank account before requesting withdrawal',
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

    // Get selected bank account
    const selectedBankAccount = host.bankAccounts?.find(
      (ba) => ba.id === createWithdrawalRequestDto.bankAccountId,
    );

    if (!selectedBankAccount) {
      throw new BadRequestException('Bank account not found');
    }

    // Create withdrawal request
    const payout = await this.payoutModel.create({
      hostId: new mongoose.Types.ObjectId(hostId),
      requestedAmount: createWithdrawalRequestDto.amount,
      status: PayoutStatus.PENDING,
      bankAccountId: createWithdrawalRequestDto.bankAccountId,
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
      .populate('hostId', 'name email profilePhoto bankAccounts')
      .populate('approvedBy', 'name email')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    // Add bank account details to each payout
    const payoutsWithBankDetails = payouts.map((payout) => {
      const payoutObj = payout.toObject();
      const host = payoutObj.hostId as any;
      
      // Find the bank account used for this withdrawal
      let bankAccount = null;
      if (host?.bankAccounts && payoutObj.bankAccountId) {
        bankAccount = host.bankAccounts.find(
          (ba: any) => ba.id === payoutObj.bankAccountId,
        );
      }

      return {
        ...payoutObj,
        bankAccount: bankAccount || null,
      };
    });

    return {
      payouts: payoutsWithBankDetails,
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

      // Get bank account
      const bankAccount = host.bankAccounts?.find(
        (ba) => ba.id === payout.bankAccountId,
      );

      if (!bankAccount) {
        throw new BadRequestException('Host bank account not found');
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
      payout.approvalScreenshot = approvePayoutDto.screenshot; // Required screenshot
      payout.approvalReason = approvePayoutDto.reason || undefined; // Optional reason
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
    rejectPayoutDto: RejectPayoutDto,
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

    payout.status = PayoutStatus.REJECTED;
    payout.rejectionReason = rejectPayoutDto.reason; // Required reason
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
   * Add bank account for host
   */
  async addBankAccount(
    hostId: string,
    addBankAccountDto: AddBankAccountDto,
  ): Promise<User> {
    const host = await this.userModel.findById(hostId);
    if (!host) {
      throw new NotFoundException('Host not found');
    }

    if (host.role !== Role.host) {
      throw new ForbiddenException('Only hosts can add bank accounts');
    }

    try {
      // Initialize bankAccounts array if it doesn't exist
      if (!host.bankAccounts) {
        host.bankAccounts = [];
      }

      // Generate unique ID for bank account
      const bankAccountId = `bank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Set as default if it's the first bank account
      const isDefault = host.bankAccounts.length === 0;

      // Add bank account
      const newBankAccount = {
        id: bankAccountId,
        iban: addBankAccountDto.iban,
        bankName: addBankAccountDto.bankName,
        accountHolderName: addBankAccountDto.accountHolderName,
        accountNumber: addBankAccountDto.accountNumber || undefined,
        swiftCode: addBankAccountDto.swiftCode || undefined,
        routingNumber: addBankAccountDto.routingNumber || undefined,
        address: addBankAccountDto.address || undefined,
        city: addBankAccountDto.city || undefined,
        country: addBankAccountDto.country || undefined,
        postalCode: addBankAccountDto.postalCode || undefined,
        isDefault: isDefault,
        createdAt: new Date(),
      };

      host.bankAccounts.push(newBankAccount);
      host.markModified('bankAccounts'); // Mark the array as modified
      await host.save();

      return host;
    } catch (error: any) {
      throw new BadRequestException(
        `Error adding bank account: ${error.message}`,
      );
    }
  }

  /**
   * Delete bank account
   */
  async deleteBankAccount(
    hostId: string,
    bankAccountId: string,
  ): Promise<User> {
    const host = await this.userModel.findById(hostId);
    if (!host) {
      throw new NotFoundException('Host not found');
    }

    if (host.role !== Role.host) {
      throw new ForbiddenException('Only hosts can delete bank accounts');
    }

    if (!host.bankAccounts || host.bankAccounts.length === 0) {
      throw new BadRequestException('No bank accounts found');
    }

    // Remove bank account
    host.bankAccounts = host.bankAccounts.filter(
      (ba) => ba.id !== bankAccountId,
    );

    // If we deleted the default, set the first one as default
    if (host.bankAccounts.length > 0) {
      const hadDefault = host.bankAccounts.some((ba) => ba.isDefault);
      if (!hadDefault) {
        host.bankAccounts[0].isDefault = true;
      }
    }

    await host.save();

    return host;
  }

  /**
   * Get bank accounts for host
   */
  async getBankAccounts(hostId: string): Promise<any[]> {
    const host = await this.userModel.findById(hostId);
    if (!host) {
      throw new NotFoundException('Host not found');
    }

    return host.bankAccounts || [];
  }
}

