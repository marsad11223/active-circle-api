import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;
  private defaultFrom: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set in environment variables');
    }
    this.resend = new Resend(apiKey);

    // Set default from email (use EMAIL_USERNAME if available, otherwise use a default)
    const emailUsername = this.configService.get<string>('EMAIL_USERNAME');
    this.defaultFrom = emailUsername || 'noreply@mail.theactivecircle.com';
  }

  /**
   * Send email using Resend
   */
  async sendMail(options: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    attachments?: { filename: string; content: Buffer }[];
  }): Promise<any> {
    const emailsEnabled =
      this.configService.get<string>('EMAILS_ENABLED') === 'true';
    if (!emailsEnabled) {
      console.log('[Resend] Emails disabled, skipping email send');
      return;
    }

    try {
      // Ensure 'to' is always an array for Resend
      const toAddresses = Array.isArray(options.to) ? options.to : [options.to];

      const result = await this.resend.emails.send({
        from: this.defaultFrom,
        to: toAddresses,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''),
        ...(options.attachments?.length
          ? { attachments: options.attachments }
          : {}),
      });

      console.log('[Resend] Email sent successfully to:', options.to);
      return result;
    } catch (error: any) {
      console.error('[Resend] Error sending email:', error);
      if (error.message) {
        console.error('[Resend] Error details:', error.message);
      }
      throw error;
    }
  }
}
