import { Module, forwardRef } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Activity, ActivitySchema } from 'src/schemas/activity.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { Rating, RatingSchema } from 'src/schemas/rating.schema';
import { Booking, BookingSchema } from 'src/schemas/booking.schema';
import {
  Subscription,
  SubscriptionSchema,
} from 'src/schemas/subscription.schema';
import { AuthModule } from 'src/auth/auth.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Activity.name, schema: ActivitySchema },
      { name: User.name, schema: UserSchema },
      { name: Rating.name, schema: RatingSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    forwardRef(() => AuthModule),
    EmailModule,
    NotificationsModule,
  ],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
