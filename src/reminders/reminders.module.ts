import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { Activity, ActivitySchema } from 'src/schemas/activity.schema';
import { Booking, BookingSchema } from 'src/schemas/booking.schema';
import {
  NotificationToken,
  NotificationTokenSchema,
} from 'src/schemas/notifications.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { RemindersService } from './reminders.service';

@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Activity.name, schema: ActivitySchema },
      { name: Booking.name, schema: BookingSchema },
      { name: NotificationToken.name, schema: NotificationTokenSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [RemindersService],
})
export class RemindersModule {}
