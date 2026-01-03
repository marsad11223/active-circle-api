import { Module, ValidationPipe } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { ActivityModule } from './activity/activity.module';
import { BookingModule } from './booking/booking.module';
import { RatingModule } from './rating/rating.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { MessageModule } from './message/message.module';
import { PayoutModule } from './payout/payout.module';

import { MailerModule } from '@nestjs-modules/mailer';
import { APP_PIPE } from '@nestjs/core';

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

    ConfigModule.forRoot({ isGlobal: true }),
    MailerModule.forRoot({
      transport: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD,
        },
        // Significantly increased timeouts for production (Gmail SMTP can be very slow)
        connectionTimeout: 60000, // 60 seconds (increased from 30)
        greetingTimeout: 30000, // 30 seconds (increased from 10)
        socketTimeout: 60000, // 60 seconds (increased from 30)
        // Disable pool in production to avoid connection issues
        pool: false, // Set to false to avoid connection pool issues
        // Additional options for better reliability
        tls: {
          rejectUnauthorized: false, // Accept self-signed certificates if needed
        },
        debug: process.env.NODE_ENV === 'development', // Enable debug in dev
        logger: process.env.NODE_ENV === 'development', // Enable logger in dev
      },
      defaults: {
        from: `"Active Circle" <${process.env.EMAIL_USERNAME}>`,
      },
    }),
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
