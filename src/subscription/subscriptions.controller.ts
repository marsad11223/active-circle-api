import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/GetUser.Decorator';
import { IapSubscriptionService } from './iap-subscription.service';
import { VerifySubscriptionDto } from './dto/verify-subscription.dto';
import { RestoreSubscriptionsDto } from './dto/restore-subscriptions.dto';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly iapSubscriptionService: IapSubscriptionService,
  ) {}

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  async verify(
    @GetUser() user: { _id: string },
    @Body() dto: VerifySubscriptionDto,
  ) {
    return this.iapSubscriptionService.verify(user._id.toString(), dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyEntitlement(@GetUser() user: { _id: string }) {
    return this.iapSubscriptionService.getMyEntitlement(user._id.toString());
  }

  @Post('restore')
  @UseGuards(JwtAuthGuard)
  async restore(
    @GetUser() user: { _id: string },
    @Body() dto: RestoreSubscriptionsDto,
  ) {
    return this.iapSubscriptionService.restore(user._id.toString(), dto);
  }
}
