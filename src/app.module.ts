import { Module, ValidationPipe } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SubscriptionModule } from './subscription/subscription.module';

import { MailerModule } from '@nestjs-modules/mailer';
import { APP_PIPE } from '@nestjs/core';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    SubscriptionModule,

    ConfigModule.forRoot({ isGlobal: true }),
    MailerModule.forRoot({
      transport: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD,
        },
        // Increased timeouts for production (Gmail SMTP can be slow)
        connectionTimeout: 30000, // 30 seconds
        greetingTimeout: 10000, // 10 seconds
        socketTimeout: 30000, // 30 seconds
        pool: true, // Use connection pooling for better performance
        maxConnections: 5,
        maxMessages: 100,
        // Retry configuration
        retry: {
          attempts: 3,
          delay: 2000,
        },
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
