import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Put,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MessageService } from './message.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ReplyMessageDto } from './dto/reply-message.dto';
import { BroadcastMessageDto } from './dto/broadcast-message.dto';
import { GetBroadcastsDto } from './dto/get-broadcasts.dto';
import { GetUser } from 'src/auth/GetUser.Decorator';

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('send')
  sendMessage(@Body() sendMessageDto: SendMessageDto, @GetUser() user: any) {
    // Member can send message to host
    return this.messageService.sendMessage(sendMessageDto, user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('reply')
  replyToMessage(@Body() replyDto: ReplyMessageDto, @GetUser() user: any) {
    // Host can reply to member's message
    return this.messageService.replyToMessage(replyDto, user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('broadcast')
  broadcastMessage(
    @Body() broadcastDto: BroadcastMessageDto,
    @GetUser() user: any,
  ) {
    // Host can broadcast message to all booked members of an activity
    return this.messageService.broadcastMessage(
      broadcastDto,
      user._id.toString(),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('inbox')
  getInbox(@GetUser() user: any) {
    // Get all messages received by the current user (inbox)
    // For host: shows messages from members
    // For member: shows messages from host (replies and broadcasts)
    return this.messageService.getInbox(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('sent')
  getSentMessages(@GetUser() user: any) {
    // Get all messages sent by the current user
    return this.messageService.getSentMessages(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id/seen')
  markAsSeen(@Param('id') id: string, @GetUser() user: any) {
    // Mark message as seen
    return this.messageService.markAsSeen(id, user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('unread-count')
  getUnreadCount(@GetUser() user: any) {
    // Get count of unread messages
    return this.messageService.getUnreadCount(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('host/broadcasts')
  getBroadcastMessages(
    @Query() filters: GetBroadcastsDto,
    @GetUser() user: any,
  ) {
    // Get all broadcast messages sent by the host
    // Optionally filter by activityId
    return this.messageService.getBroadcastMessages(
      user._id.toString(),
      filters.activityId,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('conversations')
  getConversations(@GetUser() user: any) {
    // Get all conversations (grouped messages) for the current user
    // Shows both sent and received messages grouped by activity and partner
    return this.messageService.getConversations(user._id.toString());
  }
}
