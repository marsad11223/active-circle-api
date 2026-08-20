import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { EmailService } from './email.service';
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

type TestEmailTemplate = {
  key: string;
  name: string;
  subject: string;
  html: string;
};

function buildTestEmailTemplates(to: string): TestEmailTemplate[] {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  return [
    {
      key: 'booking-request-sent',
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
      key: 'new-booking-request',
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
      key: 'booking-confirmed',
      name: 'Booking Confirmed (Member)',
      subject: '✅ Booking Confirmed',
      html: bookingConfirmedToMember({
        memberName: 'Marsad',
        memberEmail: to,
        activityTitle: 'Morning Yoga in Hyde Park',
      }),
    },
    {
      key: 'booking-declined',
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
      key: 'booking-cancelled-free',
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
      key: 'booking-cancelled-refund',
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
      key: 'new-message-host',
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
      key: 'reply-message-member',
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
      key: 'broadcast-message',
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
      key: 'password-reset-request',
      name: 'Password Reset Request',
      subject: '🔑 Password Reset Request',
      html: passwordResetRequest({
        userName: 'Marsad',
        userEmail: to,
        resetLink: `${frontendUrl}/reset-password?token=dummyTokenBase64`,
      }),
    },
    {
      key: 'password-reset-successful',
      name: 'Password Reset Successful',
      subject: '✅ Password Reset Successful',
      html: passwordResetSuccessful({
        userName: 'Marsad',
        userEmail: to,
      }),
    },
    {
      key: 'password-changed',
      name: 'Password Changed Successfully',
      subject: '✅ Password Changed',
      html: passwordChangedSuccessfully({
        userName: 'Marsad',
        userEmail: to,
      }),
    },
    {
      key: 'activity-cancelled-free',
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
      key: 'activity-cancelled-refund',
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
      key: 'session-reminder',
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
      key: 'welcome-member',
      name: 'Welcome Email (Member)',
      subject: '🎉 Welcome to Active Circle (Member)',
      html: welcomeEmailMember({
        userName: 'Marsad',
        userEmail: to,
      }),
    },
    {
      key: 'welcome-host',
      name: 'Welcome Email (Host)',
      subject: '🎉 Welcome to Active Circle (Host)',
      html: welcomeEmailHost({
        userName: 'Marsad',
        userEmail: to,
      }),
    },
    {
      key: 'marketing-broadcast',
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
      key: 'email-verification-otp',
      name: 'Email Verification OTP',
      subject: '🔐 Verify Your Email',
      html: emailVerificationOtp({
        recipientName: 'Marsad',
        otp: '482917',
        expiresInMinutes: 10,
      }),
    },
  ];
}

function buildPreviewIndexHtml(templates: TestEmailTemplate[]): string {
  const links = templates
    .map(
      (template) =>
        `<li style="margin: 8px 0;"><a href="/test-email/preview/${template.key}" style="color: #1a365d; text-decoration: none; font-size: 16px;">${template.name}</a></li>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Active Circle — Email Template Preview</title>
</head>
<body style="margin: 0; padding: 40px 20px; font-family: Arial, Helvetica, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="color: #1a365d; margin: 0 0 8px 0; font-size: 24px;">Email Template Preview</h1>
    <p style="color: #6b7280; margin: 0 0 24px 0; font-size: 15px;">Click a template to preview it in your browser with dummy data.</p>
    <ul style="list-style: none; padding: 0; margin: 0;">
      ${links}
    </ul>
  </div>
</body>
</html>`;
}

@Controller('test-email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  /**
   * Browse all email templates in the browser
   * GET /test-email/preview
   */
  @Get('preview')
  @Header('Content-Type', 'text/html; charset=utf-8')
  previewIndex(): string {
    const templates = buildTestEmailTemplates('preview@example.com');
    return buildPreviewIndexHtml(templates);
  }

  /**
   * Preview a single email template in the browser
   * GET /test-email/preview/:template
   */
  @Get('preview/:template')
  @Header('Content-Type', 'text/html; charset=utf-8')
  previewTemplate(@Param('template') templateKey: string): string {
    const templates = buildTestEmailTemplates('preview@example.com');
    const template = templates.find((item) => item.key === templateKey);

    if (!template) {
      throw new NotFoundException(
        `Unknown template "${templateKey}". Open /test-email/preview for the full list.`,
      );
    }

    return template.html;
  }

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

      const result = await this.emailService.sendMail({
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

    const templates = buildTestEmailTemplates(to);
    const results: { name: string; status: string; error?: string }[] = [];

    for (const template of templates) {
      try {
        await this.emailService.sendMail({
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
