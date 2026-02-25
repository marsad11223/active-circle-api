/**
 * Email service utility function
 * Compatible with EmailService (Resend)
 * @param mailservice - The email service instance (EmailService)
 * @param email - Recipient email address
 * @param content - HTML email content
 * @param title - Email subject
 */
export function emailService(mailservice, email, content, title) {
  mailservice
    .sendMail({
      to: email, // list of receivers
      from: `"Active Circle" <${process.env.EMAIL_USERNAME}>`, // sender address
      subject: title, // Subject line
      html: content, // HTML body content
    })
    .then((success) => {
      console.log('success email', success);
    })
    .catch((err) => {
      console.log('err email', err);
    });
}
