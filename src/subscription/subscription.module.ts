import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { WebhooksController } from './webhooks.controller';
import { SubscriptionService } from './subscription.service';
import { IapSubscriptionService } from './iap-subscription.service';
import { AppleIapService } from './apple-iap.service';
import { GoogleIapService } from './google-iap.service';
import {
  Subscription,
  SubscriptionSchema,
} from '../schemas/subscription.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => UsersModule),
  ],
  controllers: [
    SubscriptionController,
    SubscriptionsController,
    WebhooksController,
  ],
  providers: [
    SubscriptionService,
    IapSubscriptionService,
    AppleIapService,
    GoogleIapService,
  ],
  exports: [SubscriptionService, IapSubscriptionService],
})
export class SubscriptionModule {}
