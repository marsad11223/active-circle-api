import { Module, ValidationPipe } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { ActivityModule } from './activity/activity.module';
import { BookingModule } from './booking/booking.module';
import { RatingModule } from './rating/rating.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { MessageModule } from './message/message.module';
import { PayoutModule } from './payout/payout.module';
import { NotificationsModule } from './notifications/notifications.module';

import { APP_PIPE } from '@nestjs/core';
import { EmailModule } from './email/email.module';
import { RemindersModule } from './reminders/reminders.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    SubscriptionModule,
    ActivityModule,
    BookingModule,
    RatingModule,
    CloudinaryModule,
    MessageModule,
    PayoutModule,
    NotificationsModule,
    RemindersModule,

    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    ScheduleModule.forRoot(),
    EmailModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const mongouri = configService.get<string>('MONGO_URI');
        return {
          uri: mongouri,
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_PIPE, useClass: ValidationPipe }],
})
export class AppModule {}
