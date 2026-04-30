import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  NotificationToken,
  NotificationTokenSchema,
} from 'src/schemas/notifications.schema';
import {
  OutboxEvent,
  OutboxEventSchema,
} from 'src/schemas/outbox-event.schema';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { OutboxService } from './outbox.service';
import { OutboxWorker } from './outbox.worker';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [
    EmailModule,
    MongooseModule.forFeature([
      { name: NotificationToken.name, schema: NotificationTokenSchema },
      { name: OutboxEvent.name, schema: OutboxEventSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, OutboxService, OutboxWorker],
  exports: [NotificationsService, OutboxService],
})
export class NotificationsModule {}
