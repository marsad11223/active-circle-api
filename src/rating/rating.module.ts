import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RatingController } from './rating.controller';
import { RatingService } from './rating.service';
import { RatingSchema } from 'src/schemas/rating.schema';
import { BookingSchema } from 'src/schemas/booking.schema';
import { ActivitySchema } from 'src/schemas/activity.schema';
import { UserSchema } from 'src/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Rating', schema: RatingSchema },
      { name: 'Booking', schema: BookingSchema },
      { name: 'Activity', schema: ActivitySchema },
      { name: 'User', schema: UserSchema },
    ]),
  ],
  controllers: [RatingController],
  providers: [RatingService],
  exports: [RatingService],
})
export class RatingModule {}
