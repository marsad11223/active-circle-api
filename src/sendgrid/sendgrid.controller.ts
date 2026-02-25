import { Controller, Get, Query } from '@nestjs/common';
import { SendGridService } from './sendgrid.service';
import {
  bookingRequestSentToMember,
  newBookingRequestToHost,
  bookingConfirmedToMember,
  bookingDeclinedToMember,
  bookingCancelledFreeToMember,
  bookingCancelledWithRefundToMember,
  newMessageToHost,
  replyToMessageToMember,
  broadcastMessageToMember,
  passwordResetRequest,
  passwordResetSuccessful,
  passwordChangedSuccessfully,
  activityCancelledFreeToMember,
  activityCancelledWithRefundToMember,
  sessionReminderEmail,
  welcomeEmailMember,
  welcomeEmailHost,
  marketingBroadcastEmail,
  emailVerificationOtp,
} from '../utils/email-templates';

@Controller('test-email')
export class SendGridController {
  constructor(private readonly sendGridService: SendGridService) {}

  @Get()
  async sendTestEmail(@Query('to') to: string) {
    if (!to) {
      return {
        success: false,
        message:
          'Please provide a "to" query parameter, e.g. /test-email?to=your@email.com',
      };
    }

    try {
      const html = bookingConfirmedToMember({
        memberName: 'Test User',
        memberEmail: to,
        activityTitle: 'Morning Yoga Session',
      });

      const result = await this.sendGridService.sendMail({
        to,
        subject: '✅ Active Circle - Test Email',
        html,
      });

      return {
        success: true,
        message: `Test email sent to ${to}`,
        result,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to send email: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * Send ALL email templates with dummy data to a single email address
   * GET /test-email/all?to=your@email.com
   */
  @Get('all')
  async sendAllTestEmails(@Query('to') to: string) {
    if (!to) {
      return {
        success: false,
        message:
          'Please provide a "to" query parameter, e.g. /test-email/all?to=your@email.com',
      };
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // All templates with dummy data
    const templates = [
      {
        name: 'Booking Request Sent (Member)',
        subject: '📩 Booking Request Sent',
        html: bookingRequestSentToMember({
          memberName: 'Marsad',
          memberEmail: to,
          activityTitle: 'Morning Yoga in Hyde Park',
          activityPrice: 15,
        }),
      },
      {
        name: 'New Booking Request (Host)',
        subject: '📩 New Booking Request',
        html: newBookingRequestToHost({
          hostName: 'Marsad',
          hostEmail: to,
          activityTitle: 'Morning Yoga in Hyde Park',
          memberName: 'Sarah Johnson',
          memberEmail: 'sarah@example.com',
          activityPrice: 15,
        }),
      },
      {
        name: 'Booking Confirmed (Member)',
        subject: '✅ Booking Confirmed',
        html: bookingConfirmedToMember({
          memberName: 'Marsad',
          memberEmail: to,
          activityTitle: 'Morning Yoga in Hyde Park',
        }),
      },
      {
        name: 'Booking Declined (Member)',
        subject: '❌ Booking Declined',
        html: bookingDeclinedToMember({
          memberName: 'Marsad',
          memberEmail: to,
          activityTitle: 'Morning Yoga in Hyde Park',
          declineReason: 'Session is already full',
          isPaid: true,
        }),
      },
      {
        name: 'Booking Cancelled Free (Member)',
        subject: '🚫 Booking Cancelled (Free)',
        html: bookingCancelledFreeToMember({
          memberName: 'Marsad',
          memberEmail: to,
          activityTitle: 'Evening Run Club',
          cancelReason: 'Weather conditions',
        }),
      },
      {
        name: 'Booking Cancelled with Refund (Member)',
        subject: '💰 Booking Cancelled - Refund',
        html: bookingCancelledWithRefundToMember({
          memberName: 'Marsad',
          memberEmail: to,
          activityTitle: 'Morning Yoga in Hyde Park',
          cancelReason: 'Personal emergency',
          originalAmount: 15,
          refundAmount: 1500,
          refundPercentage: 100,
          refundId: 're_test_123456789',
        }),
      },
      {
        name: 'New Message (Host)',
        subject: '💬 New Message',
        html: newMessageToHost({
          memberName: 'Sarah Johnson',
          memberEmail: 'sarah@example.com',
          activityTitle: 'Morning Yoga in Hyde Park',
          subject: 'Question about the session',
          content:
            'Hi! I was wondering if I need to bring my own yoga mat, or will one be provided?\n\nAlso, is the session suitable for beginners?\n\nThanks!',
        }),
      },
      {
        name: 'Reply to Message (Member)',
        subject: '💬 Reply from Host',
        html: replyToMessageToMember({
          hostName: 'Marsad',
          hostEmail: to,
          activityTitle: 'Morning Yoga in Hyde Park',
          originalMessage: 'Hi! Do I need to bring my own yoga mat?',
          replyContent:
            'Hi Sarah! Yes, please bring your own mat. The session is beginner-friendly, so no worries!',
        }),
      },
      {
        name: 'Broadcast Message (Member)',
        subject: '📢 Broadcast Message',
        html: broadcastMessageToMember({
          hostName: 'Marsad',
          hostEmail: to,
          activityTitle: 'Morning Yoga in Hyde Park',
          broadcastType: 'announcement',
          subject: 'Location Change',
          content:
            "Hi everyone! Just a quick heads up — tomorrow's session will be at the south entrance of the park instead of the usual spot. See you there!",
        }),
      },
      {
        name: 'Password Reset Request',
        subject: '🔑 Password Reset Request',
        html: passwordResetRequest({
          userName: 'Marsad',
          userEmail: to,
          resetLink: `${frontendUrl}/reset-password?token=dummyTokenBase64`,
        }),
      },
      {
        name: 'Password Reset Successful',
        subject: '✅ Password Reset Successful',
        html: passwordResetSuccessful({
          userName: 'Marsad',
          userEmail: to,
        }),
      },
      {
        name: 'Password Changed Successfully',
        subject: '✅ Password Changed',
        html: passwordChangedSuccessfully({
          userName: 'Marsad',
          userEmail: to,
        }),
      },
      {
        name: 'Activity Cancelled Free (Member)',
        subject: '🚫 Activity Cancelled',
        html: activityCancelledFreeToMember({
          memberName: 'Marsad',
          memberEmail: to,
          activityTitle: 'Evening Run Club',
          activityDate: '15 March 2026',
          cancelReason: 'Host is unwell',
        }),
      },
      {
        name: 'Activity Cancelled with Refund (Member)',
        subject: '💰 Activity Cancelled - Refund',
        html: activityCancelledWithRefundToMember({
          memberName: 'Marsad',
          memberEmail: to,
          activityTitle: 'Morning Yoga in Hyde Park',
          activityDate: '15 March 2026',
          cancelReason: 'Insufficient participants',
          originalAmount: 15,
          refundAmount: 1500,
          refundId: 're_test_987654321',
        }),
      },
      {
        name: 'Session Reminder',
        subject: '⏰ Session Reminder',
        html: sessionReminderEmail({
          memberName: 'Marsad',
          memberEmail: to,
          activityTitle: 'Morning Yoga in Hyde Park',
          activityDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
          location: 'Hyde Park, South Entrance',
          hoursUntil: 2,
        }),
      },
      {
        name: 'Welcome Email (Member)',
        subject: '🎉 Welcome to Active Circle (Member)',
        html: welcomeEmailMember({
          userName: 'Marsad',
          userEmail: to,
        }),
      },
      {
        name: 'Welcome Email (Host)',
        subject: '🎉 Welcome to Active Circle (Host)',
        html: welcomeEmailHost({
          userName: 'Marsad',
          userEmail: to,
        }),
      },
      {
        name: 'Marketing Broadcast',
        subject: '📣 New Activities Near You!',
        html: marketingBroadcastEmail({
          recipientName: 'Marsad',
          subject: 'New Activities Near You!',
          message:
            'We have exciting new activities happening near you this week!\n\nCheck out the latest yoga, running, and cycling sessions in your area.',
        }),
      },
      {
        name: 'Email Verification OTP',
        subject: '🔐 Verify Your Email',
        html: emailVerificationOtp({
          recipientName: 'Marsad',
          otp: '482917',
          expiresInMinutes: 10,
        }),
      },
    ];

    const results: { name: string; status: string; error?: string }[] = [];

    // Send each template with a small delay to avoid rate limiting
    for (const template of templates) {
      try {
        await this.sendGridService.sendMail({
          to,
          subject: `[TEST] ${template.subject}`,
          html: template.html,
        });
        results.push({ name: template.name, status: '✅ sent' });
      } catch (error: any) {
        results.push({
          name: template.name,
          status: '❌ failed',
          error: error.message,
        });
      }

      // 500ms delay between sends
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const sent = results.filter((r) => r.status.includes('✅')).length;
    const failed = results.filter((r) => r.status.includes('❌')).length;

    return {
      success: failed === 0,
      message: `Sent ${sent}/${templates.length} emails to ${to}. ${failed > 0 ? `${failed} failed.` : ''}`,
      results,
    };
  }
}
