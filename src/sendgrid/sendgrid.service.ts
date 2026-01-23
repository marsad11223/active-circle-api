import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';

@Injectable()
export class SendGridService {
  private defaultFrom: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('SEND_GRID_API_KEY');
    if (!apiKey) {
      throw new Error('SEND_GRID_API_KEY is not set in environment variables');
    }
    sgMail.setApiKey(apiKey);

    // Set default from email (use EMAIL_USERNAME if available, otherwise use a default)
    const emailUsername = this.configService.get<string>('EMAIL_USERNAME');
    this.defaultFrom = emailUsername || 'noreply@activecircle.com';
  }

  /**
   * Send email using SendGrid
   * Compatible with MailerService.sendMail() interface
   */
  async sendMail(options: {
    to: string | string[];
    from?: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<any> {
    const emailsEnabled =
      this.configService.get<string>('EMAILS_ENABLED') === 'true';
    if (!emailsEnabled) {
      console.log('[SendGrid] Emails disabled, skipping email send');
      return;
    }

    try {
      const msg = {
        to: options.to,
        from: options.from || `"Active Circle" <${this.defaultFrom}>`,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
      };

      const result = await sgMail.send(msg);
      console.log('[SendGrid] Email sent successfully to:', options.to);
      return result;
    } catch (error: any) {
      console.error('[SendGrid] Error sending email:', error);
      if (error.response) {
        console.error('[SendGrid] Error details:', error.response.body);
      }
      throw error;
    }
  }
}
