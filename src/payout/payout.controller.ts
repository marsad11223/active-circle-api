import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PayoutService } from './payout.service';
import { CreateWithdrawalRequestDto } from './dto/create-withdrawal-request.dto';
import { ApprovePayoutDto } from './dto/approve-payout.dto';
import { RejectPayoutDto } from './dto/reject-payout.dto';
import { AddBankAccountDto } from './dto/add-bank-account.dto';
import { GetUser } from 'src/auth/GetUser.Decorator';
import { User, Role } from 'src/schemas/user.schema';
import { IsAdmin } from 'src/utils/helper';
import { PayoutStatus } from 'src/schemas/payout.schema';

@Controller('payouts')
export class PayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  // ==================== HOST ENDPOINTS ====================

  /**
   * Get host earnings summary
   * GET /payouts/host/earnings-summary
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('host/earnings-summary')
  async getHostEarningsSummary(@GetUser() user: User) {
    if (user.role !== Role.host) {
      throw new ForbiddenException('Only hosts can access this endpoint');
    }
    return this.payoutService.getHostEarningsSummary(
      (user as any)._id.toString(),
    );
  }

  /**
   * Get host transaction history
   * GET /payouts/host/transactions
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('host/transactions')
  async getHostTransactions(
    @GetUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (user.role !== Role.host) {
      throw new ForbiddenException('Only hosts can access this endpoint');
    }
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.payoutService.getHostTransactions(
      (user as any)._id.toString(),
      pageNum,
      limitNum,
    );
  }

  /**
   * Get withdrawal request preparation data
   * GET /payouts/host/withdrawal-request/prepare
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('host/withdrawal-request/prepare')
  async getWithdrawalRequestPreparation(@GetUser() user: User) {
    if (user.role !== Role.host) {
      throw new ForbiddenException('Only hosts can access this endpoint');
    }
    return await this.payoutService.getWithdrawalRequestPreparation(
      (user as any)._id.toString(),
    );
  }

  /**
   * Create withdrawal request
   * POST /payouts/host/withdrawal-request
   */
  @UseGuards(AuthGuard('jwt'))
  @Post('host/withdrawal-request')
  async createWithdrawalRequest(
    @GetUser() user: User,
    @Body() createWithdrawalRequestDto: CreateWithdrawalRequestDto,
  ) {
    if (user.role !== Role.host) {
      throw new ForbiddenException('Only hosts can create withdrawal requests');
    }
    return this.payoutService.createWithdrawalRequest(
      (user as any)._id.toString(),
      createWithdrawalRequestDto,
    );
  }

  /**
   * Get host withdrawal requests
   * GET /payouts/host/withdrawal-requests
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('host/withdrawal-requests')
  async getHostWithdrawalRequests(@GetUser() user: User) {
    if (user.role !== Role.host) {
      throw new ForbiddenException('Only hosts can access this endpoint');
    }
    return this.payoutService.getHostWithdrawalRequests(
      (user as any)._id.toString(),
    );
  }

  /**
   * Get host payout history
   * GET /payouts/host/payout-history
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('host/payout-history')
  async getHostPayoutHistory(@GetUser() user: User) {
    if (user.role !== Role.host) {
      throw new ForbiddenException('Only hosts can access this endpoint');
    }
    return this.payoutService.getHostPayoutHistory(
      (user as any)._id.toString(),
    );
  }

  /**
   * Add bank account
   * POST /payouts/host/bank-accounts
   */
  @UseGuards(AuthGuard('jwt'))
  @Post('host/bank-accounts')
  async addBankAccount(
    @GetUser() user: User,
    @Body() addBankAccountDto: AddBankAccountDto,
  ) {
    if (user.role !== Role.host) {
      throw new ForbiddenException('Only hosts can add bank accounts');
    }
    return await this.payoutService.addBankAccount(
      (user as any)._id.toString(),
      addBankAccountDto,
    );
  }

  /**
   * Get bank accounts
   * GET /payouts/host/bank-accounts
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('host/bank-accounts')
  async getBankAccounts(@GetUser() user: User) {
    if (user.role !== Role.host) {
      throw new ForbiddenException('Only hosts can access this endpoint');
    }
    return await this.payoutService.getBankAccounts(
      (user as any)._id.toString(),
    );
  }

  /**
   * Delete bank account
   * DELETE /payouts/host/bank-accounts/:bankAccountId
   */
  @UseGuards(AuthGuard('jwt'))
  @Delete('host/bank-accounts/:bankAccountId')
  async deleteBankAccount(
    @GetUser() user: User,
    @Param('bankAccountId') bankAccountId: string,
  ) {
    if (user.role !== Role.host) {
      throw new ForbiddenException('Only hosts can delete bank accounts');
    }
    return await this.payoutService.deleteBankAccount(
      (user as any)._id.toString(),
      bankAccountId,
    );
  }

  // ==================== ADMIN ENDPOINTS ====================

  /**
   * Get all withdrawal requests (Admin only)
   * GET /payouts/admin/withdrawal-requests
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('admin/withdrawal-requests')
  async getAllWithdrawalRequests(
    @GetUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: PayoutStatus,
  ) {
    IsAdmin(user);
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.payoutService.getAllWithdrawalRequests(
      pageNum,
      limitNum,
      status,
    );
  }

  /**
   * Approve withdrawal request (Admin only)
   * PUT /payouts/admin/withdrawal-requests/:payoutId/approve
   */
  @UseGuards(AuthGuard('jwt'))
  @Put('admin/withdrawal-requests/:payoutId/approve')
  async approveWithdrawalRequest(
    @GetUser() user: User,
    @Param('payoutId') payoutId: string,
    @Body() approvePayoutDto: ApprovePayoutDto,
  ) {
    IsAdmin(user);
    return this.payoutService.approveWithdrawalRequest(
      payoutId,
      (user as any)._id.toString(),
      approvePayoutDto,
    );
  }

  /**
   * Reject withdrawal request (Admin only)
   * PUT /payouts/admin/withdrawal-requests/:payoutId/reject
   */
  @UseGuards(AuthGuard('jwt'))
  @Put('admin/withdrawal-requests/:payoutId/reject')
  async rejectWithdrawalRequest(
    @GetUser() user: User,
    @Param('payoutId') payoutId: string,
    @Body() rejectPayoutDto: RejectPayoutDto,
  ) {
    IsAdmin(user);
    return this.payoutService.rejectWithdrawalRequest(
      payoutId,
      (user as any)._id.toString(),
      rejectPayoutDto,
    );
  }
}
