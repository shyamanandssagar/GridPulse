

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null; // not configured → console fallback

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465, 
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const tx = getTransporter();
  const from = process.env.SMTP_FROM || 'GridPulse <no-reply@gridpulse.local>';

  if (!tx) {
    // Development fallback — no SMTP configured.
    console.log('\n [DEV] Email not sent (SMTP not configured). Contents below:');
    console.log(`   To:      ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body:    ${text}\n`);
    return { delivered: false, dev: true };
  }

  await tx.sendMail({ from, to, subject, text, html });
  return { delivered: true };
}

// Renders the OTP email
async function sendOtpEmail(to, otp, minutes) {
  const subject = 'Your GridPulse password reset code';
  const text =
    `Your password reset code is ${otp}. ` +
    `It expires in ${minutes} minutes. ` +
    `If you didn't request this, you can safely ignore this email.`;
  const html =
    `<p>Your GridPulse password reset code is:</p>` +
    `<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p>` +
    `<p>It expires in ${minutes} minutes. If you didn't request this, ignore this email.</p>`;
  return sendMail({ to, subject, text, html });
}

// Sent when an admin provisions a new account. Includes the initial credentials
// the admin set, plus the sign-in URL and a nudge to change the password.
async function sendCredentialsEmail(to, { name, email, password, role }) {
  const loginUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const subject = 'Your GridPulse account has been created';
  const roleLabel = role === 'admin' ? 'Operator (admin)' : 'Customer';

  const text =
    `Hi ${name || ''},\n\n` +
    `An account has been created for you on the GridPulse platform.\n\n` +
    `Role: ${roleLabel}\n` +
    `Email: ${email}\n` +
    `Temporary password: ${password}\n\n` +
    `Sign in here: ${loginUrl}\n\n` +
    `For your security, please change your password after your first sign-in.\n`;

  const html =
    `<p>Hi ${name || ''},</p>` +
    `<p>An account has been created for you on the <strong>GridPulse</strong> platform.</p>` +
    `<table cellpadding="6" style="border-collapse:collapse">` +
    `<tr><td><strong>Role</strong></td><td>${roleLabel}</td></tr>` +
    `<tr><td><strong>Email</strong></td><td>${email}</td></tr>` +
    `<tr><td><strong>Temporary password</strong></td>` +
    `<td style="font-family:monospace;font-size:16px">${password}</td></tr>` +
    `</table>` +
    `<p><a href="${loginUrl}">Sign in to GridPulse</a></p>` +
    `<p style="color:#b45309">For your security, please change your password after your first sign-in.</p>`;

  return sendMail({ to, subject, text, html });
}

module.exports = { sendMail, sendOtpEmail, sendCredentialsEmail };
