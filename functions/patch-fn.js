const fs = require('fs');
let content = fs.readFileSync('index.js', 'utf8');

if (!content.includes('nodemailer')) {
  content = 'const nodemailer = require("nodemailer");\n' + content;
}

if (!content.includes('sendEmailReport')) {
  content += `

exports.sendEmailReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Unauthorized");

  const { to, subject, htmlBody, attachmentUrl, attachmentName } = data;
  if (!to || !subject || !htmlBody) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required email fields");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: functions.config().email?.user || process.env.EMAIL_USER || "your-email@gmail.com",
      pass: functions.config().email?.pass || process.env.EMAIL_PASS || "your-app-password"
    }
  });

  const mailOptions = {
    from: '"DigitalBotSolutions Dashboard" <noreply@digitalbotsolutions.com>',
    to: to,
    subject: subject,
    html: htmlBody,
    attachments: attachmentUrl ? [
      {
        filename: attachmentName || "Report.pdf",
        path: attachmentUrl
      }
    ] : []
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true, message: "Email sent successfully" };
  } catch (error) {
    console.error("Error sending email:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
`;
}

fs.writeFileSync('index.js', content, 'utf8');
console.log('Patched index.js with sendEmailReport');
