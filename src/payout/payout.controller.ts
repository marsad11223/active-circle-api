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
  async getHostEarningsSummary(
    @GetUser() user: User,
    @Query('hostId') hostId?: string,
  ) {
    if (user.role !== Role.premiumMember && user.role !== Role.standardMember && user.role !== Role.superAdmin) {
      throw new ForbiddenException(
        'Only hosts or admins can access this endpoint',
      );
    }

    const tokenUserId = (user as any)._id.toString();
    if ((user.role === Role.premiumMember || user.role === Role.standardMember) && hostId && hostId !== tokenUserId) {
      throw new ForbiddenException('Hosts cannot access other hosts data');
    }

    const targetHostId = hostId ?? tokenUserId;
    return this.payoutService.getHostEarningsSummary(targetHostId);
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
    @Query('hostId') hostId?: string,
  ) {
    if (user.role !== Role.premiumMember && user.role !== Role.standardMember && user.role !== Role.superAdmin) {
      throw new ForbiddenException(
        'Only hosts or admins can access this endpoint',
      );
    }

    const tokenUserId = (user as any)._id.toString();
    if ((user.role === Role.premiumMember || user.role === Role.standardMember) && hostId && hostId !== tokenUserId) {
      throw new ForbiddenException('Hosts cannot access other hosts data');
    }

    const targetHostId = hostId ?? tokenUserId;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.payoutService.getHostTransactions(
      targetHostId,
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
  async getWithdrawalRequestPreparation(
    @GetUser() user: User,
    @Query('hostId') hostId?: string,
  ) {
    if (user.role !== Role.premiumMember && user.role !== Role.standardMember && user.role !== Role.superAdmin) {
      throw new ForbiddenException(
        'Only hosts or admins can access this endpoint',
      );
    }

    const tokenUserId = (user as any)._id.toString();
    if ((user.role === Role.premiumMember || user.role === Role.standardMember) && hostId && hostId !== tokenUserId) {
      throw new ForbiddenException('Hosts cannot access other hosts data');
    }

    const targetHostId = hostId ?? tokenUserId;
    return await this.payoutService.getWithdrawalRequestPreparation(
      targetHostId,
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
    @Query('hostId') hostId?: string,
  ) {
    if (user.role !== Role.premiumMember && user.role !== Role.standardMember && user.role !== Role.superAdmin) {
      throw new ForbiddenException(
        'Only hosts or admins can create withdrawal requests',
      );
    }

    const tokenUserId = (user as any)._id.toString();
    if ((user.role === Role.premiumMember || user.role === Role.standardMember) && hostId && hostId !== tokenUserId) {
      throw new ForbiddenException(
        'Hosts cannot create withdrawal requests for other hosts',
      );
    }

    const targetHostId = hostId ?? tokenUserId;
    return this.payoutService.createWithdrawalRequest(
      targetHostId,
      createWithdrawalRequestDto,
    );
  }

  /**
   * Get host withdrawal requests
   * GET /payouts/host/withdrawal-requests
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('host/withdrawal-requests')
  async getHostWithdrawalRequests(
    @GetUser() user: User,
    @Query('hostId') hostId?: string,
  ) {
    if (user.role !== Role.premiumMember && user.role !== Role.standardMember && user.role !== Role.superAdmin) {
      throw new ForbiddenException(
        'Only hosts or admins can access this endpoint',
      );
    }

    const tokenUserId = (user as any)._id.toString();
    if ((user.role === Role.premiumMember || user.role === Role.standardMember) && hostId && hostId !== tokenUserId) {
      throw new ForbiddenException('Hosts cannot access other hosts data');
    }

    const targetHostId = hostId ?? tokenUserId;
    return this.payoutService.getHostWithdrawalRequests(targetHostId);
  }

  /**
   * Get host payout history
   * GET /payouts/host/payout-history
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('host/payout-history')
  async getHostPayoutHistory(
    @GetUser() user: User,
    @Query('hostId') hostId?: string,
  ) {
    if (user.role !== Role.premiumMember && user.role !== Role.standardMember && user.role !== Role.superAdmin) {
      throw new ForbiddenException(
        'Only hosts or admins can access this endpoint',
      );
    }

    const tokenUserId = (user as any)._id.toString();
    if ((user.role === Role.premiumMember || user.role === Role.standardMember) && hostId && hostId !== tokenUserId) {
      throw new ForbiddenException('Hosts cannot access other hosts data');
    }

    const targetHostId = hostId ?? tokenUserId;
    return this.payoutService.getHostPayoutHistory(targetHostId);
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
    @Query('hostId') hostId?: string,
  ) {
    if (user.role !== Role.premiumMember && user.role !== Role.standardMember && user.role !== Role.superAdmin) {
      throw new ForbiddenException(
        'Only hosts or admins can add bank accounts',
      );
    }

    const tokenUserId = (user as any)._id.toString();
    if ((user.role === Role.premiumMember || user.role === Role.standardMember) && hostId && hostId !== tokenUserId) {
      throw new ForbiddenException(
        'Hosts cannot add bank accounts for other hosts',
      );
    }

    const targetHostId = hostId ?? tokenUserId;
    return await this.payoutService.addBankAccount(
      targetHostId,
      addBankAccountDto,
    );
  }

  /**
   * Get bank accounts
   * GET /payouts/host/bank-accounts
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('host/bank-accounts')
  async getBankAccounts(
    @GetUser() user: User,
    @Query('hostId') hostId?: string,
  ) {
    if (user.role !== Role.premiumMember && user.role !== Role.standardMember && user.role !== Role.superAdmin) {
      throw new ForbiddenException(
        'Only hosts or admins can access this endpoint',
      );
    }

    const tokenUserId = (user as any)._id.toString();
    if ((user.role === Role.premiumMember || user.role === Role.standardMember) && hostId && hostId !== tokenUserId) {
      throw new ForbiddenException('Hosts cannot access other hosts data');
    }

    const targetHostId = hostId ?? tokenUserId;
    return await this.payoutService.getBankAccounts(targetHostId);
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
    @Query('hostId') hostId?: string,
  ) {
    if (user.role !== Role.premiumMember && user.role !== Role.standardMember && user.role !== Role.superAdmin) {
      throw new ForbiddenException(
        'Only hosts or admins can delete bank accounts',
      );
    }

    const tokenUserId = (user as any)._id.toString();
    if ((user.role === Role.premiumMember || user.role === Role.standardMember) && hostId && hostId !== tokenUserId) {
      throw new ForbiddenException(
        'Hosts cannot delete bank accounts for other hosts',
      );
    }

    const targetHostId = hostId ?? tokenUserId;
    return await this.payoutService.deleteBankAccount(
      targetHostId,
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
