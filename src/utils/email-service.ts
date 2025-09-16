export function emailService(mailservice, email, content, title) {
  mailservice
    .sendMail({
      to: email, // list of receivers
      from: `"Sofa and Rattan" <${process.env.EMAIL_USERNAME}>`, // sender address
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
