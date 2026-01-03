import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PayoutController } from './payout.controller';
import { PayoutService } from './payout.service';
import { Payout, PayoutSchema } from 'src/schemas/payout.schema';
import { Booking, BookingSchema } from 'src/schemas/booking.schema';
import { Activity, ActivitySchema } from 'src/schemas/activity.schema';
import { User, UserSchema } from 'src/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payout.name, schema: PayoutSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PayoutController],
  providers: [PayoutService],
  exports: [PayoutService],
})
export class PayoutModule {}

