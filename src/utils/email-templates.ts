/**
 * Centralized Email Templates
 * All email HTML templates are defined here as functions
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

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
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${activityPrice > 0 ? 'Booking Request Sent' : 'Free Activity Booking Request'}</h2>
      <p>Hello ${memberName || memberEmail},</p>
      <p>Your booking request for <strong>${activityTitle}</strong> has been sent.</p>
      <p>Status: <strong>Pending Host Approval</strong></p>
      ${activityPrice > 0 ? `<p>Amount: $${activityPrice}</p>` : '<p>This is a free activity.</p>'}
      <p>We'll notify you once the host responds.</p>
    </div>
  `;
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
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>New Booking Request</h2>
      <p>Hello ${hostName || hostEmail},</p>
      <p>You have a new booking request for <strong>${activityTitle}</strong>.</p>
      <p>Member: <strong>${memberName || memberEmail}</strong></p>
      ${activityPrice > 0 ? `<p>Amount: $${activityPrice}</p>` : '<p>This is a free activity.</p>'}
      <p>Please review and approve or decline the booking.</p>
    </div>
  `;
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
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Booking Confirmed!</h2>
      <p>Hello ${memberName || memberEmail},</p>
      <p>Great news! Your booking for <strong>${activityTitle}</strong> has been confirmed by the host.</p>
      <p>We look forward to seeing you at the activity!</p>
    </div>
  `;
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
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Booking Declined</h2>
      <p>Hello ${memberName || memberEmail},</p>
      <p>Unfortunately, your booking for <strong>${activityTitle}</strong> has been declined by the host.</p>
      ${declineReason ? `<p>Reason: ${declineReason}</p>` : ''}
      ${isPaid ? '<p>Your payment has been refunded to your original payment method.</p>' : ''}
    </div>
  `;
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
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Booking Cancelled</h2>
      <p>Hello ${memberName || memberEmail},</p>
      <p>Your booking for <strong>${activityTitle}</strong> has been cancelled.</p>
      ${cancelReason ? `<p>Reason: ${cancelReason}</p>` : ''}
    </div>
  `;
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
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Booking Cancelled</h2>
      <p>Hello ${memberName || memberEmail},</p>
      <p>Your booking for <strong>${activityTitle}</strong> has been cancelled.</p>
      ${cancelReason ? `<p>Reason: ${cancelReason}</p>` : ''}
      <p><strong>Refund Details:</strong></p>
      <p>Original Amount: $${originalAmount}</p>
      <p>Refund Amount: $${(refundAmount / 100).toFixed(2)} (${refundPercentage}%)</p>
      <p>Refund will be processed to your original payment method within 5-10 business days.</p>
      <p>Refund ID: ${refundId}</p>
    </div>
  `;
}

/**
 * New Message (to Host)
 */
export function newMessageToHost(data: {
  memberName: string;
  memberEmail: string;
  activityTitle: string;
  subject: string;
  content: string;
}): string {
  const { memberName, memberEmail, activityTitle, subject, content } = data;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>New Message from ${memberName || memberEmail}</h2>
      <p><strong>Activity:</strong> ${activityTitle}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong></p>
      <p style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
        ${content.replace(/\n/g, '<br>')}
      </p>
      <p style="margin-top: 20px;">
        <a href="${FRONTEND_URL}/messages" 
           style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          View Message
        </a>
      </p>
    </div>
  `;
}

/**
 * Reply to Message (to Member)
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
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Reply from ${hostName || hostEmail}</h2>
      <p><strong>Activity:</strong> ${activityTitle || 'N/A'}</p>
      <p><strong>Original Message:</strong></p>
      <p style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; border-left: 3px solid #007bff;">
        ${originalMessage.replace(/\n/g, '<br>')}
      </p>
      <p><strong>Reply:</strong></p>
      <p style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; border-left: 3px solid #28a745;">
        ${replyContent.replace(/\n/g, '<br>')}
      </p>
      <p style="margin-top: 20px;">
        <a href="${FRONTEND_URL}/messages" 
           style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          View Message
        </a>
      </p>
    </div>
  `;
}

/**
 * Broadcast Message (to Member)
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
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Message from ${hostName || hostEmail}</h2>
      <p><strong>Activity:</strong> ${activityTitle}</p>
      <p><strong>Type:</strong> ${broadcastType.replace('_', ' ').toUpperCase()}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong></p>
      <p style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
        ${content.replace(/\n/g, '<br>')}
      </p>
      <p style="margin-top: 20px;">
        <a href="${FRONTEND_URL}/messages" 
           style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          View Message
        </a>
      </p>
    </div>
  `;
}

/**
 * Contact Us (to Admin)
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

/**
 * Password Reset Request
 */
export function passwordResetRequest(data: {
  userName: string;
  userEmail: string;
  resetLink: string;
}): string {
  const { userName, userEmail, resetLink } = data;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>Hello ${userName || userEmail},</p>
      <p>You requested to reset your password. Please click the link below to reset your password:</p>
      <p style="margin: 20px 0;">
        <a href="${resetLink}" style="background-color: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #666;">${resetLink}</p>
      <p style="color: #999; font-size: 12px; margin-top: 30px;">
        If you did not request this password reset, please ignore this email. This link will expire in 24 hours.
      </p>
    </div>
  `;
}

/**
 * Password Reset Successful
 */
export function passwordResetSuccessful(data: {
  userName: string;
  userEmail: string;
}): string {
  const { userName, userEmail } = data;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Successful</h2>
      <p>Hello ${userName || userEmail},</p>
      <p>Your password has been successfully reset.</p>
      <p>If you did not make this change, please contact support immediately.</p>
    </div>
  `;
}

/**
 * Password Changed Successfully
 */
export function passwordChangedSuccessfully(data: {
  userName: string;
  userEmail: string;
}): string {
  const { userName, userEmail } = data;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Changed Successfully</h2>
      <p>Hello ${userName || userEmail},</p>
      <p>Your password has been successfully changed.</p>
      <p>If you did not make this change, please contact support immediately.</p>
    </div>
  `;
}

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
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Activity Cancelled</h2>
      <p>Hello ${memberName || memberEmail},</p>
      <p>We regret to inform you that the activity <strong>${activityTitle}</strong> scheduled for ${activityDate} has been cancelled by the host.</p>
      ${cancelReason ? `<p><strong>Reason:</strong> ${cancelReason}</p>` : ''}
      <p>We apologize for any inconvenience this may cause.</p>
    </div>
  `;
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
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Activity Cancelled</h2>
      <p>Hello ${memberName || memberEmail},</p>
      <p>We regret to inform you that the activity <strong>${activityTitle}</strong> scheduled for ${activityDate} has been cancelled by the host.</p>
      ${cancelReason ? `<p><strong>Reason:</strong> ${cancelReason}</p>` : ''}
      <p><strong>Refund Details:</strong></p>
      <p>Original Amount: $${originalAmount.toFixed(2)}</p>
      <p>Refund Amount: $${(refundAmount / 100).toFixed(2)}</p>
      <p>Refund will be processed to your original payment method within 5-10 business days.</p>
      <p>Refund ID: ${refundId}</p>
      <p>We apologize for any inconvenience this may cause.</p>
    </div>
  `;
}

/**
 * Welcome Email (on Sign Up)
 */
export function welcomeEmail(data: {
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
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
              
              <!-- Header -->
              <tr>
                <td style="padding: 30px 40px 20px 40px; background-color: #ffffff;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <div style="display: inline-block; vertical-align: middle;">
                          <div style="width: 50px; height: 50px; border: 2px solid #1a365d; border-radius: 50%; display: inline-block; vertical-align: middle; margin-right: 15px;">
                            <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #ff6b35; font-size: 28px; font-weight: bold;">A</div>
                          </div>
                        </div>
                        <div style="display: inline-block; vertical-align: middle;">
                          <div style="color: #1a365d; font-size: 18px; font-weight: bold; line-height: 1.2;">
                            THE ACTIVE<br>CIRCLE
                          </div>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Welcome Heading -->
              <tr>
                <td style="padding: 0 40px 30px 40px;">
                  <h1 style="color: #1a365d; font-size: 28px; font-weight: bold; margin: 0; line-height: 1.3;">
                    WELCOME TO THE ACTIVE CIRCLE
                  </h1>
                </td>
              </tr>

              <!-- Main Content -->
              <tr>
                <td style="padding: 0 40px 40px 40px; background-color: #ffffff;">
                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
                    Hello ${userName || userEmail},<br>
                    You're in 🎉
                  </p>
                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                    We're pleased to have you.
                  </p>
                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                    Active Circle is a curated space for people who value health, movement, and meaningful connection. It's about staying active with purpose — and meeting others who share the same mindset.
                  </p>
                  
                  <div style="margin: 30px 0;">
                    <p style="color: #333333; font-size: 16px; line-height: 1.8; margin: 0 0 10px 0;">
                      <strong>Thoughtfully designed.</strong>
                    </p>
                    <p style="color: #333333; font-size: 16px; line-height: 1.8; margin: 0 0 10px 0;">
                      <strong>Health-focused.</strong>
                    </p>
                    <p style="color: #333333; font-size: 16px; line-height: 1.8; margin: 0;">
                      <strong>Connection-driven.</strong>
                    </p>
                  </div>

                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 30px 0 0 0;">
                    Explore the Circle, discover what's on, and begin building a more active, connected lifestyle.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #1a365d; padding: 40px; color: #ffffff;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <div style="margin-bottom: 20px;">
                          <div style="display: inline-block; vertical-align: middle;">
                            <div style="width: 40px; height: 40px; border: 2px solid #ffffff; border-radius: 50%; display: inline-block; vertical-align: middle; margin-right: 12px;">
                              <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #ff6b35; font-size: 22px; font-weight: bold;">A</div>
                            </div>
                          </div>
                          <div style="display: inline-block; vertical-align: middle;">
                            <div style="color: #ffffff; font-size: 16px; font-weight: bold; line-height: 1.2;">
                              THE ACTIVE<br>CIRCLE
                            </div>
                          </div>
                        </div>
                        <p style="color: #ffffff; font-size: 14px; line-height: 1.6; margin: 0 0 30px 0;">
                          Connecting people through movement, shared interests, and local experiences.
                        </p>
                        <div style="margin-top: 20px;">
                          <a href="https://instagram.com" style="display: inline-block; margin-right: 15px; text-decoration: none;">
                            <span style="color: #ffffff; font-size: 20px;">📷</span>
                          </a>
                          <a href="https://tiktok.com" style="display: inline-block; margin-right: 15px; text-decoration: none;">
                            <span style="color: #ffffff; font-size: 20px;">🎵</span>
                          </a>
                          <a href="https://facebook.com" style="display: inline-block; text-decoration: none;">
                            <span style="color: #ffffff; font-size: 20px;">f</span>
                          </a>
                        </div>
                      </td>
                      <td align="right" valign="bottom">
                        <a href="#top" style="color: #ffffff; text-decoration: none; font-size: 20px;">^</a>
                      </td>
                    </tr>
                  </table>
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
