import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { GetUser } from 'src/auth/GetUser.Decorator';
import { NotificationsService } from './notifications.service';

class RegisterNotificationTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

class SendTestNotificationDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

type AuthenticatedUser = {
  _id: { toString: () => string };
};

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('register')
  async registerToken(
    @Body() body: RegisterNotificationTokenDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    await this.notificationsService.registerToken(
      user._id.toString(),
      body.token,
    );
    return { message: 'Push token registered successfully' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('test')
  async sendTestNotification(
    @Body() body: SendTestNotificationDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    const tickets = await this.notificationsService.sendToUser(
      user._id.toString(),
      body.title,
      body.body,
      body.data,
    );

    return {
      message: 'Test notification sent',
      ticketCount: tickets.length,
      tickets,
    };
  }
}
