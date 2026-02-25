import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/schemas/user.schema';
import { Activity, ActivitySchema } from 'src/schemas/activity.schema';
import { Rating, RatingSchema } from 'src/schemas/rating.schema';
import { Booking, BookingSchema } from 'src/schemas/booking.schema';
import {
  Subscription,
  SubscriptionSchema,
} from 'src/schemas/subscription.schema';
import { AuthModule } from 'src/auth/auth.module';

import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: Rating.name, schema: RatingSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    forwardRef(() => AuthModule),
    EmailModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
