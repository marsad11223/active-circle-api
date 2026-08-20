/**
 * Centralized Email Templates
 * All email HTML templates are defined here as functions
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const LOGIN_URL = `${FRONTEND_URL}/login`;
const INSTAGRAM_URL =
  'https://www.instagram.com/theactivecirclegroup?igsh=MTJoNjlycnpyMnVmMQ%3D%3D&utm_source=qr';
const FACEBOOK_URL =
  'https://www.facebook.com/share/1CAUZeWhda/?mibextid=wwXIfr';
const TIKTOK_URL =
  'https://www.tiktok.com/@theactivecircle?_r=1&_t=ZN-98xGEesIwit';

const SOCIAL_ICON_INSTAGRAM =
  'https://img.icons8.com/ios-filled/50/ffffff/instagram-new.png';
const SOCIAL_ICON_FACEBOOK =
  'https://img.icons8.com/ios-filled/50/ffffff/facebook-new.png';
const SOCIAL_ICON_TIKTOK =
  'https://img.icons8.com/ios-filled/50/ffffff/tiktok.png';

const LOGO_URL =
  process.env.EMAIL_LOGO_URL || 'https://www.theactivecircle.com/logo.svg';
const BRAND_NAVY = '#032b4e';
const BRAND_ORANGE = '#F98C01';
const BRAND_CREAM = '#faf6f0';

/**
 * Branded email header — logo + wordmark row, tagline aligned below.
 */
function emailBrandedHeader(options?: { compact?: boolean }): string {
  const compact = options?.compact ?? false;
  const logoSize = compact ? 40 : 48;
  const wordmarkSize = compact ? 14 : 16;
  const taglineSize = compact ? 16 : 20;
  const headerPadding = compact ? '22px 32px 14px 32px' : '26px 40px 18px 40px';
  const dividerPadding = compact ? '0 32px 16px 32px' : '0 40px 20px 40px';

  return `
              <!-- Branded Header -->
              <tr>
                <td align="center" style="padding: ${headerPadding}; background-color: ${BRAND_CREAM};">
                  <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
                    <tr>
                      <td align="center">
                        <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
                          <tr>
                            <td align="center" valign="middle" style="padding-right: 12px;">
                              <img
                                src="${LOGO_URL}"
                                alt="The Active Circle"
                                width="${logoSize}"
                                height="${logoSize}"
                                style="display: block; border: 0; outline: none; text-decoration: none;"
                              />
                            </td>
                            <td align="left" valign="middle">
                              <p style="margin: 0; color: ${BRAND_NAVY}; font-size: ${wordmarkSize}px; font-weight: bold; line-height: 1.15; letter-spacing: 0.2px;">The Active</p>
                              <p style="margin: 0; color: ${BRAND_NAVY}; font-size: ${wordmarkSize}px; font-weight: bold; line-height: 1.15; letter-spacing: 0.2px;">Circle</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top: 14px;">
                        <p style="margin: 0; line-height: 1.3; text-align: center; white-space: nowrap;">
                          <span style="color: ${BRAND_NAVY}; font-size: ${taglineSize}px; font-weight: bold; letter-spacing: 1px;">MEET.</span><span style="color: ${BRAND_ORANGE}; font-size: ${taglineSize}px; font-weight: bold; letter-spacing: 1px;"> MOVE.</span><span style="color: ${BRAND_NAVY}; font-size: ${taglineSize}px; font-weight: bold; letter-spacing: 1px;"> CONNECT.</span>
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: ${dividerPadding}; background-color: #ffffff;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center">
                        <div style="height: 3px; background-color: ${BRAND_ORANGE}; width: 72%; max-width: 340px; margin: 0 auto; border-radius: 2px;"></div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;
}

/** Escape HTML in user-generated email content */
function escapeEmailHtml(s: string): string {
  if (!s || typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}

/** Styled callout for decline/cancel reasons */
function emailReasonBlock(reason?: string): string {
  if (!reason?.trim()) return '';
  const safeReason = escapeEmailHtml(reason);
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px 0; border-radius: 8px; overflow: hidden; border-left: 4px solid ${BRAND_ORANGE}; background-color: #fff7ed;">
      <tr>
        <td style="padding: 14px 16px;">
          <p style="margin: 0 0 6px 0; color: ${BRAND_ORANGE}; font-size: 11px; font-weight: bold; letter-spacing: 0.8px; text-transform: uppercase;">Reason</p>
          <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6; font-weight: normal; font-style: italic;">${safeReason}</p>
        </td>
      </tr>
    </table>`;
}

/** Reusable social media icon row for email footers */
function emailFooterSocialLinks(): string {
  const iconLink = (url: string, iconSrc: string, label: string) => `
                    <td style="padding: 0 8px;">
                      <a href="${url}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;">
                        <table cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%); border-radius: 50%; width: 44px; height: 44px;">
                          <tr>
                            <td align="center" valign="middle" style="width: 44px; height: 44px; line-height: 0;">
                              <img src="${iconSrc}" width="22" height="22" alt="${label}" style="display: block; border: 0; outline: none; text-decoration: none;" />
                            </td>
                          </tr>
                        </table>
                      </a>
                    </td>`;

  return `
                  <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 20px auto 0 auto;">
                    <tr>
                      <td align="center" style="padding-bottom: 12px;">
                        <p style="color: #6b7280; font-size: 13px; font-weight: normal; margin: 0; letter-spacing: 0.4px; text-transform: uppercase;">
                          Follow us
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td align="center">
                        <table cellpadding="0" cellspacing="0" border="0" align="center">
                          <tr>
                            ${iconLink(INSTAGRAM_URL, SOCIAL_ICON_INSTAGRAM, 'Instagram')}
                            ${iconLink(FACEBOOK_URL, SOCIAL_ICON_FACEBOOK, 'Facebook')}
                            ${iconLink(TIKTOK_URL, SOCIAL_ICON_TIKTOK, 'TikTok')}
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>`;
}

/**
 * Reusable email wrapper that adds branded header, CTA button, and footer
 * to any email body content.
 */
function wrapEmailTemplate(
  title: string,
  bodyHtml: string,
  options?: { ctaText?: string; ctaUrl?: string; hideButton?: boolean },
): string {
  const ctaText = options?.ctaText || 'Go to Active Circle';
  const ctaUrl = options?.ctaUrl || LOGIN_URL;
  const hideButton = options?.hideButton || false;

  const ctaSection = hideButton
    ? ''
    : `
              <!-- CTA Button -->
              <tr>
                <td style="padding: 0 40px 30px 40px; text-align: center;">
                  <a href="${ctaUrl}" 
                     style="display: inline-block; background-color: #F98C01; color: #ffffff; font-size: 16px; font-weight: bold; padding: 14px 32px; text-decoration: none; border-radius: 6px; letter-spacing: 0.5px;">
                    ${ctaText}
                  </a>
                </td>
              </tr>`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @media only screen and (max-width: 600px) {
          .container { width: 100% !important; max-width: 100% !important; }
          .content { padding: 30px 20px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table class="container" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; max-width: 600px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              
              ${emailBrandedHeader()}

              <!-- Email Title -->
              <tr>
                <td style="padding: 24px 40px 0 40px;">
                  <h1 style="color: #1a365d; font-size: 22px; margin: 0 0 16px 0; font-weight: bold;">${title}</h1>
                </td>
              </tr>

              <!-- Email Body Content -->
              <tr>
                <td class="content" style="padding: 0 40px 24px 40px;">
                  ${bodyHtml}
                </td>
              </tr>

              ${ctaSection}

              <!-- Footer -->
              <tr>
                <td style="padding: 20px 40px 30px 40px; border-top: 1px solid #e5e7eb; text-align: center;">
                  <p style="color: #F98C01; font-size: 14px; font-weight: normal; margin: 0 0 8px 0;">
                    Questions or need support?
                  </p>
                  <p style="margin: 0;">
                    <a href="mailto:contact@theactivecircle.com" style="color: #1a365d; font-size: 14px; text-decoration: none;">
                      contact@theactivecircle.com
                    </a>
                  </p>
                  ${emailFooterSocialLinks()}
                  <p style="color: #9ca3af; font-size: 11px; margin: 16px 0 0 0;">
                    &copy; ${new Date().getFullYear()} Active Circle. All rights reserved.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// ─── BOOKING TEMPLATES ───────────────────────────────────────────

/**
 * Booking Request Sent (to Member)
 */
export function bookingRequestSentToMember(data: {
  memberName: string;
  memberEmail: string;
  activityTitle: string;
  activityPrice: number;
}): string {
  const { memberName, memberEmail, activityTitle, activityPrice } = data;
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 12px 0;">Hello ${memberName || memberEmail},</p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 12px 0;">
      Your booking request for <strong>${activityTitle}</strong> has been sent.
    </p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 12px 0;">
      Status: <strong>Pending Host Approval</strong>
    </p>
    ${
      activityPrice > 0
        ? `<p style="color: #333; font-size: 16px; margin: 0 0 12px 0;">Amount: £${activityPrice}</p>`
        : '<p style="color: #333; font-size: 16px; margin: 0 0 12px 0;">This is a free activity.</p>'
    }
    <p style="color: #6b7280; font-size: 14px; margin: 0;">We'll notify you once the host responds.</p>
  `;
  return wrapEmailTemplate(
    activityPrice > 0
      ? 'Booking Request Sent'
      : 'Free Activity Booking Request',
    body,
  );
}

/**
 * New Booking Request (to Host)
 */
export function newBookingRequestToHost(data: {
  hostName: string;
  hostEmail: string;
  activityTitle: string;
  memberName: string;
  memberEmail: string;
  activityPrice: number;
}): string {
  const {
    hostName,
    hostEmail,
    activityTitle,
    memberName,
    memberEmail,
    activityPrice,
  } = data;
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 12px 0;">Hello ${hostName || hostEmail},</p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 12px 0;">
      You have a new booking request for <strong>${activityTitle}</strong>.
    </p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 12px 0;">
      Member: <strong>${memberName || memberEmail}</strong>
    </p>
    ${
      activityPrice > 0
        ? `<p style="color: #333; font-size: 16px; margin: 0 0 12px 0;">Amount: £${activityPrice}</p>`
        : '<p style="color: #333; font-size: 16px; margin: 0 0 12px 0;">This is a free activity.</p>'
    }
    <p style="color: #6b7280; font-size: 14px; margin: 0;">Please review and approve or decline the booking.</p>
  `;
  return wrapEmailTemplate('New Booking Request', body, {
    ctaText: 'Review Booking',
  });
}

/**
 * Booking Confirmed (to Member)
 */
export function bookingConfirmedToMember(data: {
  memberName: string;
  memberEmail: string;
  activityTitle: string;
}): string {
  const { memberName, memberEmail, activityTitle } = data;
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 12px 0;">Hello ${memberName || memberEmail},</p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 12px 0;">
      Great news! Your booking for <strong>${activityTitle}</strong> has been confirmed by the host.
    </p>
    <p style="color: #6b7280; font-size: 14px; margin: 0;">We look forward to seeing you at the activity!</p>
  `;
  return wrapEmailTemplate('Booking Confirmed! ✅', body);
}

/**
 * Booking Declined (to Member)
 */
export function bookingDeclinedToMember(data: {
  memberName: string;
  memberEmail: string;
  activityTitle: string;
  declineReason?: string;
  isPaid: boolean;
}): string {
  const { memberName, memberEmail, activityTitle, declineReason, isPaid } =
    data;
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 12px 0;">Hello ${memberName || memberEmail},</p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 12px 0;">
      Unfortunately, your booking for <strong>${activityTitle}</strong> has been declined by the host.
    </p>
    ${emailReasonBlock(declineReason)}
    ${isPaid ? '<p style="color: #333; font-size: 16px; margin: 0 0 12px 0;">Your payment has been refunded to your original payment method.</p>' : ''}
  `;
  return wrapEmailTemplate('Booking Declined', body);
}

/**
 * Booking Cancelled (Free Activity - to Member)
 */
export function bookingCancelledFreeToMember(data: {
  memberName: string;
  memberEmail: string;
  activityTitle: string;
  cancelReason?: string;
}): string {
  const { memberName, memberEmail, activityTitle, cancelReason } = data;
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 12px 0;">Hello ${memberName || memberEmail},</p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 12px 0;">
      Your booking for <strong>${activityTitle}</strong> has been cancelled.
    </p>
    ${emailReasonBlock(cancelReason)}
  `;
  return wrapEmailTemplate('Booking Cancelled', body);
}

/**
 * Booking Cancelled with Refund (to Member)
 */
export function bookingCancelledWithRefundToMember(data: {
  memberName: string;
  memberEmail: string;
  activityTitle: string;
  cancelReason?: string;
  originalAmount: number;
  refundAmount: number;
  refundPercentage: number;
  refundId: string;
}): string {
  const {
    memberName,
    memberEmail,
    activityTitle,
    cancelReason,
    originalAmount,
    refundAmount,
    refundPercentage,
    refundId,
  } = data;
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 12px 0;">Hello ${memberName || memberEmail},</p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 12px 0;">
      Your booking for <strong>${activityTitle}</strong> has been cancelled.
    </p>
    ${emailReasonBlock(cancelReason)}
    <div style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <p style="color: #1a365d; font-size: 16px; font-weight: bold; margin: 0 0 8px 0;">Refund Details</p>
      <p style="color: #333; font-size: 14px; margin: 0 0 4px 0;">Original Amount: £${originalAmount}</p>
      <p style="color: #333; font-size: 14px; margin: 0 0 4px 0;">Refund Amount: £${(refundAmount / 100).toFixed(2)} (${refundPercentage}%)</p>
      <p style="color: #6b7280; font-size: 13px; margin: 8px 0 0 0;">Refund ID: ${refundId}</p>
    </div>
    <p style="color: #6b7280; font-size: 14px; margin: 0;">Refund will be processed to your original payment method within 5-10 business days.</p>
  `;
  return wrapEmailTemplate('Booking Cancelled — Refund Issued', body);
}

// ─── MESSAGE TEMPLATES ───────────────────────────────────────────

/** Escape HTML in user-generated message content for safe display in emails */
function escapeMessageHtml(s: string): string {
  return escapeEmailHtml(s);
}

/**
 * New Message (to Host) — member sent a message to the host
 */
export function newMessageToHost(data: {
  memberName: string;
  memberEmail: string;
  activityTitle: string;
  subject: string;
  content: string;
}): string {
  const { memberName, memberEmail, activityTitle, subject, content } = data;
  const safeSubject = escapeMessageHtml(subject);
  const safeContent = escapeMessageHtml(content);
  const safeActivity = escapeMessageHtml(activityTitle);
  const fromLabel = memberName
    ? escapeMessageHtml(memberName)
    : escapeMessageHtml(memberEmail);
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 16px 0;">You have a new message from a member.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px 0; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
      <tr><td style="background: #f9fafb; padding: 12px 16px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Activity</td></tr>
      <tr><td style="padding: 12px 16px; font-size: 16px; color: #1a365d; font-weight: 600;">${safeActivity}</td></tr>
      <tr><td style="background: #f9fafb; padding: 12px 16px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">From</td></tr>
      <tr><td style="padding: 12px 16px; font-size: 16px; color: #374151;">${fromLabel}</td></tr>
      <tr><td style="background: #f9fafb; padding: 12px 16px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Subject</td></tr>
      <tr><td style="padding: 12px 16px; font-size: 16px; color: #1a365d;">${safeSubject}</td></tr>
      <tr><td style="background: #f9fafb; padding: 12px 16px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Message</td></tr>
      <tr><td style="padding: 16px; background: #ffffff; border-top: 1px solid #e5e7eb;"><p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0;">${safeContent}</p></td></tr>
    </table>
  `;
  return wrapEmailTemplate(
    `New message from ${memberName || memberEmail}`,
    body,
    {
      ctaText: 'View & reply in Messages',
      ctaUrl: `${FRONTEND_URL}/messages`,
    },
  );
}

/**
 * Reply to Message (to Member) — host replied to member's inquiry
 */
export function replyToMessageToMember(data: {
  hostName: string;
  hostEmail: string;
  activityTitle?: string;
  originalMessage: string;
  replyContent: string;
}): string {
  const { hostName, hostEmail, activityTitle, originalMessage, replyContent } =
    data;
  const safeActivity = escapeMessageHtml(activityTitle || 'N/A');
  const safeOriginal = escapeMessageHtml(originalMessage);
  const safeReply = escapeMessageHtml(replyContent);
  const fromLabel = hostName
    ? escapeMessageHtml(hostName)
    : escapeMessageHtml(hostEmail);
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 16px 0;">${fromLabel} has replied to your message.</p>
    ${activityTitle ? `<p style="color: #6b7280; font-size: 14px; margin: 0 0 12px 0;"><strong>Activity:</strong> ${safeActivity}</p>` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px 0; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
      <tr><td style="background: #eff6ff; padding: 10px 16px; font-size: 12px; color: #1e40af; font-weight: 600;">Your message</td></tr>
      <tr><td style="padding: 14px 16px; background: #f8fafc; border-bottom: 1px solid #e5e7eb;"><p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0;">${safeOriginal}</p></td></tr>
      <tr><td style="background: #ecfdf5; padding: 10px 16px; font-size: 12px; color: #047857; font-weight: 600;">Reply from host</td></tr>
      <tr><td style="padding: 14px 16px; background: #f0fdf4;"><p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0;">${safeReply}</p></td></tr>
    </table>
  `;
  return wrapEmailTemplate(`Reply from ${hostName || hostEmail}`, body, {
    ctaText: 'View in Messages',
    ctaUrl: `${FRONTEND_URL}/messages`,
  });
}

/**
 * Broadcast Message (to Member) — host sent a broadcast to activity members
 */
export function broadcastMessageToMember(data: {
  hostName: string;
  hostEmail: string;
  activityTitle: string;
  broadcastType: string;
  subject: string;
  content: string;
}): string {
  const {
    hostName,
    hostEmail,
    activityTitle,
    broadcastType,
    subject,
    content,
  } = data;
  const safeActivity = escapeMessageHtml(activityTitle);
  const safeSubject = escapeMessageHtml(subject);
  const safeContent = escapeMessageHtml(content);
  const typeLabel = escapeMessageHtml(broadcastType.replace(/_/g, ' '));
  const typeDisplay = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1);
  const fromLabel = hostName
    ? escapeMessageHtml(hostName)
    : escapeMessageHtml(hostEmail);
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 16px 0;">${fromLabel} sent an update about an activity you're booked for.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px 0; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
      <tr><td style="background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%); padding: 14px 16px;"><p style="margin: 0; color: #ffffff; font-size: 14px; font-weight: 600;">${safeActivity}</p><p style="margin: 4px 0 0 0; color: #F98C01; font-size: 12px;">${typeDisplay}</p></td></tr>
      <tr><td style="background: #f9fafb; padding: 10px 16px; font-size: 12px; color: #6b7280;">Subject</td></tr>
      <tr><td style="padding: 12px 16px; font-size: 16px; color: #1a365d; font-weight: 600;">${safeSubject}</td></tr>
      <tr><td style="background: #f9fafb; padding: 10px 16px; font-size: 12px; color: #6b7280;">Message</td></tr>
      <tr><td style="padding: 16px; background: #ffffff; border-top: 1px solid #e5e7eb;"><p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0;">${safeContent}</p></td></tr>
    </table>
  `;
  return wrapEmailTemplate(`Update from ${hostName || hostEmail}`, body, {
    ctaText: 'View in Messages',
    ctaUrl: `${FRONTEND_URL}/messages`,
  });
}

// ─── CONTACT US ──────────────────────────────────────────────────

/**
 * Contact Us (to Admin) — kept simple, admin-only
 */
export function contactUsToAdmin(data: {
  name: string;
  email: string;
  subject: string;
  body: string;
}): string {
  const { name, email, subject, body } = data;
  return `
    <p>Name: ${name}</p>
    <p>Email: ${email}</p>
    <p>Subject: ${subject}</p>
    <p>Message: ${body}</p>
  `;
}

// ─── PASSWORD TEMPLATES ──────────────────────────────────────────

/**
 * Password Reset Request
 */
export function passwordResetRequest(data: {
  userName: string;
  userEmail: string;
  resetLink: string;
}): string {
  const { userName, userEmail, resetLink } = data;
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 12px 0;">Hello ${userName || userEmail},</p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      You requested to reset your password. Please click the button below to reset your password:
    </p>
    <p style="color: #6b7280; font-size: 13px; margin: 16px 0 0 0;">Or copy and paste this link in your browser:</p>
    <p style="word-break: break-all; color: #666; font-size: 12px; margin: 4px 0 0 0;">${resetLink}</p>
    <p style="color: #9ca3af; font-size: 12px; margin: 16px 0 0 0;">
      If you did not request this password reset, please ignore this email. This link will expire in 24 hours.
    </p>
  `;
  return wrapEmailTemplate('Password Reset Request', body, {
    ctaText: 'Reset Password',
    ctaUrl: resetLink,
  });
}

/**
 * Password Reset Successful
 */
export function passwordResetSuccessful(data: {
  userName: string;
  userEmail: string;
}): string {
  const { userName, userEmail } = data;
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 12px 0;">Hello ${userName || userEmail},</p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 12px 0;">
      Your password has been successfully reset.
    </p>
    <p style="color: #6b7280; font-size: 14px; margin: 0;">
      If you did not make this change, please contact support immediately.
    </p>
  `;
  return wrapEmailTemplate('Password Reset Successful ✅', body);
}

/**
 * Password Changed Successfully
 */
export function passwordChangedSuccessfully(data: {
  userName: string;
  userEmail: string;
}): string {
  const { userName, userEmail } = data;
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 12px 0;">Hello ${userName || userEmail},</p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 12px 0;">
      Your password has been successfully changed.
    </p>
    <p style="color: #6b7280; font-size: 14px; margin: 0;">
      If you did not make this change, please contact support immediately.
    </p>
  `;
  return wrapEmailTemplate('Password Changed Successfully ✅', body);
}

// ─── ACTIVITY TEMPLATES ──────────────────────────────────────────

/**
 * Activity Cancelled by Host (Free Activity - to Member)
 */
export function activityCancelledFreeToMember(data: {
  memberName: string;
  memberEmail: string;
  activityTitle: string;
  activityDate: string;
  cancelReason?: string;
}): string {
  const { memberName, memberEmail, activityTitle, activityDate, cancelReason } =
    data;
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 12px 0;">Hello ${memberName || memberEmail},</p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 12px 0;">
      We regret to inform you that the activity <strong>${activityTitle}</strong> scheduled for ${activityDate} has been cancelled by the host.
    </p>
    ${emailReasonBlock(cancelReason)}
    <p style="color: #6b7280; font-size: 14px; margin: 0;">We apologize for any inconvenience this may cause.</p>
  `;
  return wrapEmailTemplate('Activity Cancelled', body);
}

/**
 * Activity Cancelled by Host (Paid Activity - to Member with Refund)
 */
export function activityCancelledWithRefundToMember(data: {
  memberName: string;
  memberEmail: string;
  activityTitle: string;
  activityDate: string;
  cancelReason?: string;
  originalAmount: number;
  refundAmount: number;
  refundId: string;
}): string {
  const {
    memberName,
    memberEmail,
    activityTitle,
    activityDate,
    cancelReason,
    originalAmount,
    refundAmount,
    refundId,
  } = data;
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 12px 0;">Hello ${memberName || memberEmail},</p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 12px 0;">
      We regret to inform you that the activity <strong>${activityTitle}</strong> scheduled for ${activityDate} has been cancelled by the host.
    </p>
    ${emailReasonBlock(cancelReason)}
    <div style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <p style="color: #1a365d; font-size: 16px; font-weight: bold; margin: 0 0 8px 0;">Refund Details</p>
      <p style="color: #333; font-size: 14px; margin: 0 0 4px 0;">Original Amount: £${originalAmount.toFixed(2)}</p>
      <p style="color: #333; font-size: 14px; margin: 0 0 4px 0;">Refund Amount: £${(refundAmount / 100).toFixed(2)}</p>
      <p style="color: #6b7280; font-size: 13px; margin: 8px 0 0 0;">Refund ID: ${refundId}</p>
    </div>
    <p style="color: #6b7280; font-size: 14px; margin: 0;">Refund will be processed to your original payment method within 5-10 business days.</p>
  `;
  return wrapEmailTemplate('Activity Cancelled — Refund Issued', body);
}

// ─── SESSION REMINDER ────────────────────────────────────────────

/**
 * Session reminder (upcoming activity)
 */
export function sessionReminderEmail(data: {
  memberName: string;
  memberEmail: string;
  activityTitle: string;
  activityDate: Date;
  location?: string;
  hoursUntil?: number;
}): string {
  const {
    memberName,
    memberEmail,
    activityTitle,
    activityDate,
    location,
    hoursUntil,
  } = data;
  const dateStr = new Date(activityDate).toLocaleString(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const when =
    hoursUntil != null
      ? `in ${hoursUntil} hour${hoursUntil !== 1 ? 's' : ''}`
      : 'soon';
  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 12px 0;">Hello ${memberName || memberEmail},</p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      This is a friendly reminder that you have a session coming up ${when}:
    </p>
    <div style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin: 0 0 16px 0;">
      <p style="color: #1a365d; font-size: 18px; font-weight: bold; margin: 0 0 8px 0;">${activityTitle}</p>
      <p style="color: #333; font-size: 14px; margin: 0 0 4px 0;">📅 ${dateStr}</p>
      ${location ? `<p style="color: #333; font-size: 14px; margin: 0;">📍 ${location}</p>` : ''}
    </div>
    <p style="color: #6b7280; font-size: 14px; margin: 0;">We look forward to seeing you!</p>
  `;
  return wrapEmailTemplate('Session Reminder ⏰', body);
}

// ─── WELCOME EMAILS (already branded — kept as-is) ──────────────

/**
 * Welcome Email for Member (on Sign Up)
 */
export function welcomeEmailMember(data: {
  userName: string;
  userEmail: string;
}): string {
  const { userName, userEmail } = data;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @media only screen and (max-width: 600px) {
          .container { width: 100% !important; max-width: 100% !important; }
          .content { padding: 30px 20px !important; }
          .heading-large { font-size: 36px !important; line-height: 1.2 !important; }
          .heading-medium { font-size: 24px !important; line-height: 1.3 !important; }
          .text-small { font-size: 14px !important; }
          .text-medium { font-size: 18px !important; line-height: 1.5 !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #ffffff;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table class="container" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; max-width: 600px;">
              
              ${emailBrandedHeader()}

              <!-- Welcome to the Circle -->
              <tr>
                <td class="content" style="padding: 0 40px 20px 40px; text-align: center;">
                  <p style="color: #333333; font-size: 16px; font-weight: normal; margin: 0; line-height: 1.5;">
                    Hello ${userName || userEmail},<br>Welcome to the Circle
                  </p>
                </td>
              </tr>

              <!-- Main Message -->
              <tr>
                <td class="content" style="padding: 0 40px 30px 40px; text-align: center;">
                  <p class="text-medium" style="color: #333333; font-size: 20px; font-weight: bold; margin: 0; line-height: 1.4;">
                    You're one step closer to building meaningful connections through movement
                  </p>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td style="padding: 0 40px 30px 40px; text-align: center;">
                  <a href="${LOGIN_URL}" 
                     style="display: inline-block; background-color: #F98C01; color: #ffffff; font-size: 16px; font-weight: bold; padding: 14px 32px; text-decoration: none; border-radius: 6px;">
                    Get Started
                  </a>
                </td>
              </tr>

              <!-- Real People / Real connections -->
              <tr>
                <td class="content" style="padding: 0 40px 50px 40px; text-align: center;">
                  <p style="color: #333333; font-size: 16px; font-weight: normal; margin: 0 0 8px 0; line-height: 1.5;">
                    Real People
                  </p>
                  <p style="color: #333333; font-size: 16px; font-weight: normal; margin: 0; line-height: 1.5;">
                    Real connections
                  </p>
                </td>
              </tr>

              <!-- Contact Section -->
              <tr>
                <td class="content" style="padding: 0 40px 40px 40px; text-align: center;">
                  <p style="color: #F98C01; font-size: 16px; font-weight: normal; margin: 0 0 10px 0; line-height: 1.5;">
                    Questions or need support?
                  </p>
                  <p style="margin: 0;">
                    <a href="mailto:contact@theactivecircle.com" style="color: #1a365d; font-size: 16px; font-weight: normal; text-decoration: none; line-height: 1.5;">
                      contact@theactivecircle.com
                    </a>
                  </p>
                  ${emailFooterSocialLinks()}
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Welcome Email for Host (on Sign Up)
 * Same styling as member, different body message
 */
export function welcomeEmailHost(data: {
  userName: string;
  userEmail: string;
}): string {
  const { userName, userEmail } = data;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @media only screen and (max-width: 600px) {
          .container { width: 100% !important; max-width: 100% !important; }
          .content { padding: 30px 20px !important; }
          .heading-large { font-size: 36px !important; line-height: 1.2 !important; }
          .heading-medium { font-size: 24px !important; line-height: 1.3 !important; }
          .text-small { font-size: 14px !important; }
          .text-medium { font-size: 18px !important; line-height: 1.5 !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #ffffff;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table class="container" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; max-width: 600px;">
              
              ${emailBrandedHeader()}

              <!-- Welcome to the Circle (Host) -->
              <tr>
                <td class="content" style="padding: 0 40px 20px 40px; text-align: center;">
                  <p style="color: #333333; font-size: 16px; font-weight: normal; margin: 0; line-height: 1.5;">
                    Hello ${userName || userEmail},<br>Welcome to the Circle
                  </p>
                </td>
              </tr>

              <!-- Main Message (Host) -->
              <tr>
                <td class="content" style="padding: 0 40px 30px 40px; text-align: center;">
                  <p class="text-medium" style="color: #333333; font-size: 20px; font-weight: bold; margin: 0; line-height: 1.4;">
                    You're one step closer to bringing people together through movement
                  </p>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td style="padding: 0 40px 30px 40px; text-align: center;">
                  <a href="${LOGIN_URL}" 
                     style="display: inline-block; background-color: #F98C01; color: #ffffff; font-size: 16px; font-weight: bold; padding: 14px 32px; text-decoration: none; border-radius: 6px;">
                    Get Started
                  </a>
                </td>
              </tr>

              <!-- Real People / Real connections -->
              <tr>
                <td class="content" style="padding: 0 40px 50px 40px; text-align: center;">
                  <p style="color: #333333; font-size: 16px; font-weight: normal; margin: 0 0 8px 0; line-height: 1.5;">
                    Real People
                  </p>
                  <p style="color: #333333; font-size: 16px; font-weight: normal; margin: 0; line-height: 1.5;">
                    Real connections
                  </p>
                </td>
              </tr>

              <!-- Contact Section -->
              <tr>
                <td class="content" style="padding: 0 40px 40px 40px; text-align: center;">
                  <p style="color: #F98C01; font-size: 16px; font-weight: normal; margin: 0 0 10px 0; line-height: 1.5;">
                    Questions or need support?
                  </p>
                  <p style="margin: 0;">
                    <a href="mailto:contact@theactivecircle.com" style="color: #1a365d; font-size: 16px; font-weight: normal; text-decoration: none; line-height: 1.5;">
                      contact@theactivecircle.com
                    </a>
                  </p>
                  ${emailFooterSocialLinks()}
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// ─── MARKETING EMAIL (already branded — kept as-is) ─────────────

/**
 * Marketing / broadcast email (admin to all members)
 * Single template on backend – admin only sends subject (and optional message).
 */
export function marketingBroadcastEmail(data: {
  recipientName?: string;
  subject: string;
  message?: string;
}): string {
  const { recipientName, subject, message } = data;
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const safeMessage =
    message && message.trim() ? escapeHtml(message).replace(/\n/g, '<br>') : '';
  const bodyContent = safeMessage
    ? `<p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">${safeMessage}</p>`
    : `
      <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
        We have new activities and updates for you. Log in to the app to discover what's happening near you.
      </p>
      <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0;">
        Stay active. Stay connected.
      </p>`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; max-width: 600px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              ${emailBrandedHeader({ compact: true })}
              <tr>
                <td style="padding: 24px 40px 16px 40px;">
                  <h1 style="color: #1a365d; font-size: 22px; margin: 0 0 16px 0; font-weight: bold;">${subject}</h1>
                  <p style="color: #374151; font-size: 16px; margin: 0 0 20px 0;">${greeting}</p>
                  ${bodyContent}
                </td>
              </tr>
              <!-- CTA Button -->
              <tr>
                <td style="padding: 0 40px 24px 40px; text-align: center;">
                  <a href="${LOGIN_URL}" 
                     style="display: inline-block; background-color: #F98C01; color: #ffffff; font-size: 16px; font-weight: bold; padding: 14px 32px; text-decoration: none; border-radius: 6px;">
                    Go to Active Circle
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px 40px 30px 40px; border-top: 1px solid #e5e7eb; text-align: center;">
                  <p style="color: #6b7280; font-size: 12px; margin: 0;">
                    You received this email from Active Circle. To manage your preferences, visit your account settings.
                  </p>
                  ${emailFooterSocialLinks()}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// ─── EMAIL VERIFICATION OTP (already branded — kept as-is) ──────

/**
 * Email verification OTP (sent after signup)
 */
export function emailVerificationOtp(data: {
  recipientName?: string;
  otp: string;
  expiresInMinutes: number;
}): string {
  const { recipientName, otp, expiresInMinutes } = data;
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; max-width: 600px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            ${emailBrandedHeader({ compact: true })}
            <tr>
              <td style="padding: 24px 40px 32px 40px;">
                <h1 style="color: #1a365d; font-size: 22px; margin: 0 0 16px 0; font-weight: bold;">Verify your email</h1>
                <p style="color: #374151; font-size: 16px; margin: 0 0 20px 0;">${greeting}</p>
                <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">Use this code to verify your email address:</p>
                <p style="font-size: 28px; font-weight: bold; letter-spacing: 8px; color: #1a365d; margin: 0 0 24px 0;">${otp}</p>
                <p style="color: #6b7280; font-size: 14px; margin: 0;">This code expires in ${expiresInMinutes} minutes. Do not share it with anyone.</p>
                <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                  ${emailFooterSocialLinks()}
                  <p style="color: #9ca3af; font-size: 11px; margin: 16px 0 0 0;">&copy; ${new Date().getFullYear()} Active Circle. All rights reserved.</p>
                </div>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

// ─── ADMIN EMAIL JOB REPORT ─────────────────────────────────────

/**
 * Admin report email sent after a background email job completes.
 * Shows summary stats (total, sent, failed) and instructs admin to
 * check the attached CSV for per-recipient details.
 */
export function adminEmailJobReport(data: {
  jobType: string;
  completedAt: Date;
  total: number;
  sent: number;
  failed: number;
}): string {
  const { jobType, completedAt, total, sent, failed } = data;
  const dateStr = completedAt.toLocaleString(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const body = `
    <p style="color: #374151; font-size: 16px; margin: 0 0 12px 0;">Hello Admin,</p>
    <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Your <strong>${jobType}</strong> job has completed. Here's a quick summary:
    </p>
    <div style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin: 0 0 16px 0;">
      <p style="color: #1a365d; font-size: 16px; font-weight: bold; margin: 0 0 12px 0;">📊 Job Summary</p>
      <table style="width: 100%; font-size: 14px; color: #333;" cellpadding="4" cellspacing="0">
        <tr><td style="font-weight: bold;">Job Type</td><td>${jobType}</td></tr>
        <tr><td style="font-weight: bold;">Completed At</td><td>${dateStr}</td></tr>
        <tr><td style="font-weight: bold;">Total Recipients</td><td>${total}</td></tr>
        <tr><td style="font-weight: bold; color: #16a34a;">Successful</td><td style="color: #16a34a;">${sent}</td></tr>
        <tr><td style="font-weight: bold; color: #dc2626;">Failed</td><td style="color: #dc2626;">${failed}</td></tr>
      </table>
    </div>
    <p style="color: #6b7280; font-size: 14px; margin: 0;">
      Please see the attached CSV file for a detailed per-recipient breakdown.
    </p>
  `;
  return wrapEmailTemplate(`${jobType} — Job Report`, body, {
    hideButton: true,
  });
}

// ─── PAYOUT REQUEST NOTIFICATION (to Admin) ─────────────────────────────────

/**
 * Admin notification when a host submits a payout/withdrawal request.
 */
export function payoutRequestToAdmin(data: {
  hostName: string;
  hostEmail: string;
  amount: number;
  requestedAt: Date;
  payoutId: string;
}): { subject: string; html: string } {
  const { hostName, hostEmail, amount, requestedAt, payoutId } = data;
  const formattedDate = requestedAt.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const subject = `New Withdrawal Request — £${amount.toFixed(2)} from ${hostName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px;">
      <div style="background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
        <h2 style="color: #111827; margin: 0 0 8px 0;">New Withdrawal Request</h2>
        <p style="color: #6b7280; margin: 0 0 24px 0;">A host has submitted a withdrawal request requiring your approval.</p>

        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px; width: 140px;">Host Name</td>
            <td style="padding: 10px 0; color: #111827; font-size: 14px; font-weight: 600;">${hostName}</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Host Email</td>
            <td style="padding: 10px 0; color: #111827; font-size: 14px;">${hostEmail}</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Amount Requested</td>
            <td style="padding: 10px 0; color: #059669; font-size: 18px; font-weight: 700;">£${amount.toFixed(2)}</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Requested At</td>
            <td style="padding: 10px 0; color: #111827; font-size: 14px;">${formattedDate}</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Payout ID</td>
            <td style="padding: 10px 0; color: #6b7280; font-size: 12px; font-family: monospace;">${payoutId}</td>
          </tr>
        </table>

        <p style="color: #374151; font-size: 14px; margin: 24px 0 0 0;">
          Please log in to the admin panel to review and approve or reject this request.
        </p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 16px 0 0 0;">
        Active Circle · This is an automated notification
      </p>
    </div>
  `;

  return { subject, html };
}
