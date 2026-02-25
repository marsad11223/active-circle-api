import { Module } from '@nestjs/common';
import { SendGridService } from './sendgrid.service';
import { SendGridController } from './sendgrid.controller';

@Module({
  controllers: [SendGridController],
  providers: [SendGridService],
  exports: [SendGridService],
})
export class SendGridModule {}
