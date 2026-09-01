import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;
  private defaultFrom: string;
  private lastSendTime: number = 0;
  private readonly MIN_SEND_INTERVAL_MS = 500; // Resend limit: 2 emails/sec = 500ms apart

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set in environment variables');
    }
    this.resend = new Resend(apiKey);

    // Display name in inbox (e.g. "The Active Circle") + verified sender address
    const emailUsername =
      this.configService.get<string>('EMAIL_USERNAME') ||
      'noreply@mail.theactivecircle.com';
    const fromName =
      this.configService.get<string>('EMAIL_FROM_NAME') || 'The Active Circle';
    this.defaultFrom = `${fromName} <${emailUsername}>`;
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
      // Rate limit: ensure at least 500ms between consecutive sends (Resend allows max 2/sec)
      const now = Date.now();
      const elapsed = now - this.lastSendTime;
      if (elapsed < this.MIN_SEND_INTERVAL_MS) {
        const delay = this.MIN_SEND_INTERVAL_MS - elapsed;
        console.log(
          `[Resend] Rate limiting: waiting ${delay}ms before next send`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      this.lastSendTime = Date.now();

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
