import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Message, MessageType } from 'src/schemas/message.schema';
import { Booking, BookingStatus } from 'src/schemas/booking.schema';
import { Activity } from 'src/schemas/activity.schema';
import { User } from 'src/schemas/user.schema';
import mongoose, { Model } from 'mongoose';
import { SendMessageDto } from './dto/send-message.dto';
import { ReplyMessageDto } from './dto/reply-message.dto';
import { BroadcastMessageDto } from './dto/broadcast-message.dto';
import { SendGridService } from '../sendgrid/sendgrid.service';
import { ConfigService } from '@nestjs/config';
import {
  newMessageToHost,
  replyToMessageToMember,
  broadcastMessageToMember,
} from 'src/utils/email-templates';

@Injectable()
export class MessageService {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<Message>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly sendGridService: SendGridService,
    private readonly configService: ConfigService,
  ) {}

  async sendMessage(
    sendMessageDto: SendMessageDto,
    memberId: string,
  ): Promise<Message> {
    try {
      const isValidActivityId = mongoose.isValidObjectId(
        sendMessageDto.activityId,
      );
      const isValidMemberId = mongoose.isValidObjectId(memberId);

      if (!isValidActivityId) {
        throw new BadRequestException('Invalid activity ID');
      }
      if (!isValidMemberId) {
        throw new BadRequestException('Invalid member ID');
      }

      // Get activity and verify it exists
      const activity = await this.activityModel
        .findById(sendMessageDto.activityId)
        .populate('hostId');

      if (!activity) {
        throw new NotFoundException('Activity not found');
      }

      // Get host ID
      let hostId: string;
      if (
        activity.hostId &&
        typeof activity.hostId === 'object' &&
        '_id' in activity.hostId
      ) {
        hostId = (activity.hostId as any)._id.toString();
      } else {
        hostId = (activity.hostId as any).toString();
      }

      // Get member details
      const member = await this.userModel.findById(memberId);
      if (!member) {
        throw new NotFoundException('Member not found');
      }

      // Get host details
      const host = await this.userModel.findById(hostId);
      if (!host) {
        throw new NotFoundException('Host not found');
      }

      // Create message
      const message = await this.messageModel.create({
        senderId: new mongoose.Types.ObjectId(memberId),
        receiverId: new mongoose.Types.ObjectId(hostId),
        activityId: new mongoose.Types.ObjectId(sendMessageDto.activityId),
        messageType: MessageType.INQUIRY,
        subject: sendMessageDto.subject,
        content: sendMessageDto.content,
        isSeen: false,
        isEmailSent: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      console.log(
        `[Send Message] Created message: ${message._id}, Sender: ${memberId}, Receiver: ${hostId}`,
      );

      // Send email to host
      const emailsEnabled =
        this.configService.get<string>('EMAILS_ENABLED') === 'true';
      if (emailsEnabled) {
        try {
          await this.sendGridService.sendMail({
            to: host.email,
            subject: `New Message: ${sendMessageDto.subject}`,
            html: newMessageToHost({
              memberName: member.name,
              memberEmail: member.email,
              activityTitle: activity.title,
              subject: sendMessageDto.subject,
              content: sendMessageDto.content,
            }),
          });

          // Update message to mark email as sent
          message.isEmailSent = true;
          await message.save();
        } catch (emailError: any) {
          console.error('Error sending email:', emailError);
          // Don't throw error - message is still saved
        }
      } else {
        // Mark as sent even if emails are disabled
        message.isEmailSent = true;
        await message.save();
      }

      // Mark host as having new messages
      try {
        await this.userModel.findByIdAndUpdate(hostId, {
          $set: { hasNewMessages: true, updated_at: new Date() },
        });
      } catch (err) {
        console.error('Failed to set host hasNewMessages flag:', err);
      }

      // Populate for response
      await message.populate('senderId', 'name email profilePhoto');
      await message.populate('receiverId', 'name email profilePhoto');
      await message.populate('activityId', 'title picture');

      return message;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async replyToMessage(
    replyDto: ReplyMessageDto,
    hostId: string,
  ): Promise<Message> {
    try {
      const isValidMessageId = mongoose.isValidObjectId(replyDto.messageId);
      const isValidHostId = mongoose.isValidObjectId(hostId);

      if (!isValidMessageId) {
        throw new BadRequestException('Invalid message ID');
      }
      if (!isValidHostId) {
        throw new BadRequestException('Invalid host ID');
      }

      // Get original message
      const originalMessage = await this.messageModel
        .findById(replyDto.messageId)
        .populate('senderId')
        .populate('activityId');

      if (!originalMessage) {
        throw new NotFoundException('Message not found');
      }

      // Verify this is a message to this host
      const originalReceiverId = (originalMessage.receiverId as any).toString();
      if (originalReceiverId !== hostId) {
        throw new ForbiddenException(
          'You can only reply to messages sent to you',
        );
      }

      // Verify original message is an inquiry
      if (originalMessage.messageType !== MessageType.INQUIRY) {
        throw new BadRequestException('Can only reply to inquiry messages');
      }

      // Get member (original sender) and host details
      const member = originalMessage.senderId as any;

      // Get member ID properly (handle both populated and non-populated cases)
      let memberId: string;
      if (member && typeof member === 'object' && '_id' in member) {
        memberId = member._id.toString();
      } else {
        memberId = (originalMessage.senderId as any).toString();
      }

      const host = await this.userModel.findById(hostId);
      if (!host) {
        throw new NotFoundException('Host not found');
      }

      // Get member details for email
      const memberDetails = await this.userModel.findById(memberId);
      if (!memberDetails) {
        throw new NotFoundException('Member not found');
      }

      const activity = originalMessage.activityId as any;

      // Create reply message
      const reply = await this.messageModel.create({
        senderId: new mongoose.Types.ObjectId(hostId),
        receiverId: new mongoose.Types.ObjectId(memberId),
        activityId: originalMessage.activityId
          ? new mongoose.Types.ObjectId(
              (originalMessage.activityId as any)._id?.toString() ||
                (originalMessage.activityId as any).toString(),
            )
          : undefined,
        parentMessageId: originalMessage._id,
        messageType: MessageType.REPLY,
        subject: `Re: ${originalMessage.subject}`,
        content: replyDto.content,
        isSeen: false,
        isEmailSent: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      console.log(
        `[Reply Message] Created reply: ${reply._id}, Sender (Host): ${hostId}, Receiver (Member): ${memberId}`,
      );

      // Send email to member
      try {
        await this.sendGridService.sendMail({
          to: memberDetails.email,
          subject: `Reply: ${originalMessage.subject}`,
          html: replyToMessageToMember({
            hostName: host.name,
            hostEmail: host.email,
            activityTitle: activity?.title,
            originalMessage: originalMessage.content,
            replyContent: replyDto.content,
          }),
        });

        reply.isEmailSent = true;
        await reply.save();
      } catch (emailError: any) {
        console.error('Error sending email:', emailError);
      }

      // Mark member as having new messages
      try {
        await this.userModel.findByIdAndUpdate(memberId, {
          $set: { hasNewMessages: true, updated_at: new Date() },
        });
      } catch (err) {
        console.error('Failed to set member hasNewMessages flag:', err);
      }

      // Populate for response
      await reply.populate('senderId', 'name email profilePhoto');
      await reply.populate('receiverId', 'name email profilePhoto');
      await reply.populate('activityId', 'title picture');

      return reply;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async broadcastMessage(
    broadcastDto: BroadcastMessageDto,
    hostId: string,
  ): Promise<{ message: string; sentTo: number }> {
    try {
      const isValidActivityId = mongoose.isValidObjectId(
        broadcastDto.activityId,
      );
      const isValidHostId = mongoose.isValidObjectId(hostId);

      if (!isValidActivityId) {
        throw new BadRequestException('Invalid activity ID');
      }
      if (!isValidHostId) {
        throw new BadRequestException('Invalid host ID');
      }

      // Get activity and verify host owns it
      const activity = await this.activityModel.findById(
        broadcastDto.activityId,
      );
      if (!activity) {
        throw new NotFoundException('Activity not found');
      }

      // Verify host owns the activity
      const activityHostId = (activity.hostId as any).toString();
      if (activityHostId !== hostId) {
        throw new ForbiddenException(
          'You can only broadcast messages for your own activities',
        );
      }

      // Get all confirmed and pending bookings for this activity
      const bookings = await this.bookingModel
        .find({
          activityId: new mongoose.Types.ObjectId(broadcastDto.activityId),
          status: { $in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
          deleted_at: null,
        })
        .populate('memberId');

      if (bookings.length === 0) {
        throw new BadRequestException(
          'No confirmed or pending bookings found for this activity',
        );
      }

      // Get host details
      const host = await this.userModel.findById(hostId);
      if (!host) {
        throw new NotFoundException('Host not found');
      }

      // Create broadcast messages for each member
      const messages: Message[] = [];
      const emailPromises: Promise<any>[] = [];

      for (const booking of bookings) {
        const member = booking.memberId as any;
        const memberId = (member._id || member).toString();

        // Create message
        const message = await this.messageModel.create({
          senderId: new mongoose.Types.ObjectId(hostId),
          receiverId: new mongoose.Types.ObjectId(memberId),
          activityId: new mongoose.Types.ObjectId(broadcastDto.activityId),
          messageType: MessageType.BROADCAST,
          broadcastType: broadcastDto.broadcastType,
          subject: broadcastDto.subject,
          content: broadcastDto.content,
          isSeen: false,
          isEmailSent: false,
          created_at: new Date(),
          updated_at: new Date(),
        });

        messages.push(message);

        // Mark member as having new messages
        try {
          await this.userModel.findByIdAndUpdate(memberId, {
            $set: { hasNewMessages: true, updated_at: new Date() },
          });
        } catch (err) {
          console.error(
            'Failed to set member hasNewMessages flag for broadcast:',
            err,
          );
        }

        // Send email to member
        const emailsEnabled =
          this.configService.get<string>('EMAILS_ENABLED') === 'true';
        if (emailsEnabled) {
          const emailPromise = this.sendGridService
            .sendMail({
              to: member.email,
              subject: `[${broadcastDto.broadcastType.toUpperCase()}] ${broadcastDto.subject}`,
              html: broadcastMessageToMember({
                hostName: host.name,
                hostEmail: host.email,
                activityTitle: activity.title,
                broadcastType: broadcastDto.broadcastType,
                subject: broadcastDto.subject,
                content: broadcastDto.content,
              }),
            })
            .then(() => {
              message.isEmailSent = true;
              return message.save();
            })
            .catch((error) => {
              console.error(`Error sending email to ${member.email}:`, error);
              return message;
            });

          emailPromises.push(emailPromise);
        } else {
          // Mark as sent even if emails are disabled
          message.isEmailSent = true;
          const savedMessage = await message.save();
          emailPromises.push(Promise.resolve(savedMessage));
        }
      }

      // Wait for all emails to be sent (or fail)
      await Promise.all(emailPromises);

      return {
        message: 'Broadcast message sent successfully',
        sentTo: messages.length,
      };
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async getInbox(userId: string): Promise<any[]> {
    try {
      const isValidUserId = mongoose.isValidObjectId(userId);
      if (!isValidUserId) {
        throw new BadRequestException('Invalid user ID');
      }

      // Get all messages where user is receiver
      const query = {
        receiverId: new mongoose.Types.ObjectId(userId),
        deleted_at: null,
      };

      const messages = await this.messageModel
        .find(query)
        .populate('senderId', 'name email profilePhoto')
        .populate('receiverId', 'name email profilePhoto')
        .populate('activityId', 'title picture date location')
        .populate('parentMessageId', 'subject content')
        .sort({ created_at: -1 });

      console.log(
        `[Inbox] User ID: ${userId}, Query: ${JSON.stringify(query)}, Messages found: ${messages.length}`,
      );

      // Debug: Log first few messages
      if (messages.length > 0) {
        console.log(
          `[Inbox] First message receiverId: ${(messages[0].receiverId as any)?._id || (messages[0].receiverId as any)}`,
        );
      }

      // Format messages
      return messages.map((message) => {
        const sender = message.senderId as any;
        const receiver = message.receiverId as any;
        const activity = message.activityId as any;
        const parent = message.parentMessageId as any;

        return {
          _id: message._id,
          sender: {
            _id: sender?._id || sender,
            name: sender?.name || '',
            email: sender?.email || '',
            profilePhoto: sender?.profilePhoto || null,
          },
          receiver: {
            _id: receiver?._id || receiver,
            name: receiver?.name || '',
            email: receiver?.email || '',
            profilePhoto: receiver?.profilePhoto || null,
          },
          activity: activity
            ? {
                _id: activity?._id || activity,
                title: activity?.title || '',
                picture: activity?.picture || null,
                date: activity?.date || null,
                location: activity?.location || null,
              }
            : null,
          messageType: message.messageType,
          broadcastType: message.broadcastType || null,
          subject: message.subject,
          content: message.content,
          isSeen: message.isSeen,
          seenAt: message.seenAt || null,
          parentMessage: parent
            ? {
                _id: parent?._id || parent,
                subject: parent?.subject || '',
                content: parent?.content || '',
              }
            : null,
          createdAt: message.created_at,
        };
      });
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async getConversations(userId: string): Promise<any[]> {
    try {
      const isValidUserId = mongoose.isValidObjectId(userId);
      if (!isValidUserId) {
        throw new BadRequestException('Invalid user ID');
      }

      // Get all messages where user is either sender or receiver
      const messages = await this.messageModel
        .find({
          $or: [
            { senderId: new mongoose.Types.ObjectId(userId) },
            { receiverId: new mongoose.Types.ObjectId(userId) },
          ],
          deleted_at: null,
        })
        .populate('senderId', 'name email profilePhoto')
        .populate('receiverId', 'name email profilePhoto')
        .populate('activityId', 'title picture date location')
        .populate('parentMessageId', 'subject content')
        .sort({ created_at: -1 });

      // Group messages by activity and other user (conversation partner)
      const conversationMap = new Map<string, any>();

      messages.forEach((message) => {
        const sender = message.senderId as any;
        const receiver = message.receiverId as any;
        const activity = message.activityId as any;

        // Determine conversation partner
        const senderId = sender?._id?.toString() || sender?.toString();
        const receiverId = receiver?._id?.toString() || receiver?.toString();
        const partnerId = senderId === userId ? receiverId : senderId;

        // Create conversation key: activityId_partnerId or just partnerId if no activity
        const activityId = activity
          ? activity._id?.toString() || activity?.toString()
          : 'no-activity';
        const conversationKey = `${activityId}_${partnerId}`;

        if (!conversationMap.has(conversationKey)) {
          conversationMap.set(conversationKey, {
            activity: activity
              ? {
                  _id: activity?._id || activity,
                  title: activity?.title || '',
                  picture: activity?.picture || null,
                  date: activity?.date || null,
                  location: activity?.location || null,
                }
              : null,
            partner: {
              _id: partnerId,
              name:
                senderId === userId ? receiver?.name || '' : sender?.name || '',
              email:
                senderId === userId
                  ? receiver?.email || ''
                  : sender?.email || '',
              profilePhoto:
                senderId === userId
                  ? receiver?.profilePhoto || null
                  : sender?.profilePhoto || null,
            },
            messages: [],
            unreadCount: 0,
            lastMessageAt: null,
          });
        }

        const conversation = conversationMap.get(conversationKey);
        const parent = message.parentMessageId as any;

        conversation.messages.push({
          _id: message._id,
          sender: {
            _id: sender?._id || sender,
            name: sender?.name || '',
            email: sender?.email || '',
            profilePhoto: sender?.profilePhoto || null,
          },
          receiver: {
            _id: receiver?._id || receiver,
            name: receiver?.name || '',
            email: receiver?.email || '',
            profilePhoto: receiver?.profilePhoto || null,
          },
          messageType: message.messageType,
          broadcastType: message.broadcastType || null,
          subject: message.subject,
          content: message.content,
          isSeen: message.isSeen,
          seenAt: message.seenAt || null,
          parentMessage: parent
            ? {
                _id: parent?._id || parent,
                subject: parent?.subject || '',
                content: parent?.content || '',
              }
            : null,
          createdAt: message.created_at,
        });

        // Count unread messages (where user is receiver and not seen)
        if (
          receiverId === userId &&
          !message.isSeen &&
          message.messageType !== MessageType.BROADCAST
        ) {
          conversation.unreadCount++;
        }

        // Track last message time
        if (
          !conversation.lastMessageAt ||
          message.created_at > conversation.lastMessageAt
        ) {
          conversation.lastMessageAt = message.created_at;
        }
      });

      // Convert map to array and sort by last message time
      const conversations = Array.from(conversationMap.values()).sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime(),
      );

      return conversations;
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async markAsSeen(messageId: string, userId: string): Promise<Message> {
    try {
      const isValidMessageId = mongoose.isValidObjectId(messageId);
      const isValidUserId = mongoose.isValidObjectId(userId);

      if (!isValidMessageId) {
        throw new BadRequestException('Invalid message ID');
      }
      if (!isValidUserId) {
        throw new BadRequestException('Invalid user ID');
      }

      // Get message
      const message = await this.messageModel.findById(messageId);

      if (!message) {
        throw new NotFoundException('Message not found');
      }

      // Verify user is the receiver
      const receiverId = (message.receiverId as any).toString();
      if (receiverId !== userId) {
        throw new ForbiddenException(
          'You can only mark your own messages as seen',
        );
      }

      // Mark as seen
      message.isSeen = true;
      message.seenAt = new Date();
      message.updated_at = new Date();
      await message.save();

      // If user has no more unread messages, clear hasNewMessages flag
      try {
        const unreadCount = await this.messageModel.countDocuments({
          receiverId: message.receiverId,
          isSeen: false,
          deleted_at: null,
        });

        if (unreadCount === 0) {
          const receiverIdStr = (message.receiverId as any).toString();
          await this.userModel.findByIdAndUpdate(receiverIdStr, {
            $set: { hasNewMessages: false, updated_at: new Date() },
          });
        }
      } catch (err) {
        console.error(
          'Failed to clear hasNewMessages flag after markAsSeen:',
          err,
        );
      }
      // Populate for response
      await message.populate('senderId', 'name email profilePhoto');
      await message.populate('receiverId', 'name email profilePhoto');
      await message.populate('activityId', 'title picture');

      return message;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }
      throw new BadRequestException(err.message);
    }
  }

  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    try {
      const isValidUserId = mongoose.isValidObjectId(userId);
      if (!isValidUserId) {
        throw new BadRequestException('Invalid user ID');
      }

      const unreadCount = await this.messageModel.countDocuments({
        receiverId: new mongoose.Types.ObjectId(userId),
        isSeen: false,
        deleted_at: null,
      });

      return { unreadCount };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async getBroadcastMessages(
    hostId: string,
    activityId?: string,
  ): Promise<any[]> {
    try {
      const isValidHostId = mongoose.isValidObjectId(hostId);
      if (!isValidHostId) {
        throw new BadRequestException('Invalid host ID');
      }

      const query: any = {
        senderId: new mongoose.Types.ObjectId(hostId),
        messageType: MessageType.BROADCAST,
        deleted_at: null,
      };

      if (activityId) {
        const isValidActivityId = mongoose.isValidObjectId(activityId);
        if (!isValidActivityId) {
          throw new BadRequestException('Invalid activity ID');
        }
        query.activityId = new mongoose.Types.ObjectId(activityId);
      }

      // Get broadcast messages and group by unique broadcasts
      // Use aggregation to get unique broadcasts with count
      const broadcasts = await this.messageModel.aggregate([
        {
          $match: query,
        },
        {
          $group: {
            _id: {
              activityId: '$activityId',
              subject: '$subject',
              broadcastType: '$broadcastType',
              content: '$content',
              createdAt: {
                $dateToString: {
                  format: '%Y-%m-%dT%H:%M:%S.%LZ',
                  date: '$created_at',
                },
              },
            },
            messageId: { $first: '$_id' },
            sentTo: { $sum: 1 },
          },
        },
        {
          $sort: { '_id.createdAt': -1 },
        },
      ]);

      // Get activity IDs to populate
      const activityIds = [
        ...new Set(
          broadcasts
            .map((b) => b._id.activityId)
            .filter((id) => id)
            .map((id) => new mongoose.Types.ObjectId(id)),
        ),
      ];

      // Populate activities
      const activities = await this.activityModel.find({
        _id: { $in: activityIds },
      });

      const activityMap = new Map();
      activities.forEach((activity) => {
        const activityId = (activity._id as any).toString();
        activityMap.set(activityId, activity);
      });

      // Format response
      return broadcasts.map((broadcast) => {
        const activityId = broadcast._id.activityId?.toString();
        const activity = activityId ? activityMap.get(activityId) : null;

        return {
          _id: broadcast.messageId,
          activityId: activityId,
          activity: activity
            ? {
                _id: activity._id,
                title: activity.title || '',
                picture: activity.picture || null,
                date: activity.date || null,
                location: activity.location || null,
              }
            : null,
          broadcastType: broadcast._id.broadcastType,
          subject: broadcast._id.subject,
          content: broadcast._id.content,
          createdAt: new Date(broadcast._id.createdAt),
          sentTo: broadcast.sentTo,
        };
      });
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async getSentMessages(userId: string): Promise<any[]> {
    try {
      const isValidUserId = mongoose.isValidObjectId(userId);
      if (!isValidUserId) {
        throw new BadRequestException('Invalid user ID');
      }

      // Get all messages where user is sender
      const messages = await this.messageModel
        .find({
          senderId: new mongoose.Types.ObjectId(userId),
          deleted_at: null,
        })
        .populate('senderId', 'name email profilePhoto')
        .populate('receiverId', 'name email profilePhoto')
        .populate('activityId', 'title picture date location')
        .populate('parentMessageId', 'subject content')
        .sort({ created_at: -1 });

      // Format messages
      return messages.map((message) => {
        const sender = message.senderId as any;
        const receiver = message.receiverId as any;
        const activity = message.activityId as any;
        const parent = message.parentMessageId as any;

        return {
          _id: message._id,
          sender: {
            _id: sender?._id || sender,
            name: sender?.name || '',
            email: sender?.email || '',
            profilePhoto: sender?.profilePhoto || null,
          },
          receiver: {
            _id: receiver?._id || receiver,
            name: receiver?.name || '',
            email: receiver?.email || '',
            profilePhoto: receiver?.profilePhoto || null,
          },
          activity: activity
            ? {
                _id: activity?._id || activity,
                title: activity?.title || '',
                picture: activity?.picture || null,
                date: activity?.date || null,
                location: activity?.location || null,
              }
            : null,
          messageType: message.messageType,
          broadcastType: message.broadcastType || null,
          subject: message.subject,
          content: message.content,
          isSeen: message.isSeen,
          seenAt: message.seenAt || null,
          parentMessage: parent
            ? {
                _id: parent?._id || parent,
                subject: parent?.subject || '',
                content: parent?.content || '',
              }
            : null,
          createdAt: message.created_at,
        };
      });
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }
}
