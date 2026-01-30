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
          .container {
            width: 100% !important;
            max-width: 100% !important;
          }
          .content {
            padding: 30px 20px !important;
          }
          .heading-large {
            font-size: 36px !important;
            line-height: 1.2 !important;
          }
          .heading-medium {
            font-size: 24px !important;
            line-height: 1.3 !important;
          }
          .text-small {
            font-size: 14px !important;
          }
          .text-medium {
            font-size: 18px !important;
            line-height: 1.5 !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #ffffff;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table class="container" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; max-width: 600px;">
              
              <!-- Top Section: MEET. MOVE. CONNECT. -->
              <tr>
                <td class="content" style="padding: 40px 40px 20px 40px; text-align: center;">
                  <div style="margin-bottom: 10px;">
                    <span style="color: #1a365d; font-size: 42px; font-weight: bold; letter-spacing: 1px; line-height: 1.2;">MEET.</span>
                    <span style="color: #F98C01; font-size: 42px; font-weight: bold; letter-spacing: 1px; line-height: 1.2;"> MOVE.</span>
                  </div>
                  <div style="margin-top: 5px;">
                    <span style="color: #1a365d; font-size: 42px; font-weight: bold; letter-spacing: 1px; line-height: 1.2;">CONNECT.</span>
                  </div>
                </td>
              </tr>

              <!-- Separator Line -->
              <tr>
                <td style="padding: 0 40px 30px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center">
                        <div style="height: 4px; background-color: #1a365d; width: 80%; max-width: 400px; margin: 0 auto;"></div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

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
                    You’re one step closer to building meaningful connections through movement
                  </p>
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
          .container {
            width: 100% !important;
            max-width: 100% !important;
          }
          .content {
            padding: 30px 20px !important;
          }
          .heading-large {
            font-size: 36px !important;
            line-height: 1.2 !important;
          }
          .heading-medium {
            font-size: 24px !important;
            line-height: 1.3 !important;
          }
          .text-small {
            font-size: 14px !important;
          }
          .text-medium {
            font-size: 18px !important;
            line-height: 1.5 !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #ffffff;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table class="container" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; max-width: 600px;">
              
              <!-- Top Section: MEET. MOVE. CONNECT. -->
              <tr>
                <td class="content" style="padding: 40px 40px 20px 40px; text-align: center;">
                  <div style="margin-bottom: 10px;">
                    <span style="color: #1a365d; font-size: 42px; font-weight: bold; letter-spacing: 1px; line-height: 1.2;">MEET.</span>
                    <span style="color: #F98C01; font-size: 42px; font-weight: bold; letter-spacing: 1px; line-height: 1.2;"> MOVE.</span>
                  </div>
                  <div style="margin-top: 5px;">
                    <span style="color: #1a365d; font-size: 42px; font-weight: bold; letter-spacing: 1px; line-height: 1.2;">CONNECT.</span>
                  </div>
                </td>
              </tr>

              <!-- Separator Line -->
              <tr>
                <td style="padding: 0 40px 30px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center">
                        <div style="height: 4px; background-color: #1a365d; width: 80%; max-width: 400px; margin: 0 auto;"></div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

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
