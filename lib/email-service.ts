import nodemailer from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  secure: boolean;
}

/**
 * Robust extraction of SMTP config from process.env,
 * stripping accidental enclosing quotes, linebreaks, and internal whitespace from passwords.
 */
export function getSmtpConfig(): SmtpConfig {
  const cleanStr = (val: string | undefined, fallback: string): string => {
    if (!val) return fallback;
    return String(val)
      .replace(/["'\r\n]/g, '')
      .trim();
  };

  const host = cleanStr(process.env.SMTP_HOST, 'smtp.gmail.com');
  const rawPort = cleanStr(process.env.SMTP_PORT, '465');
  const port = parseInt(rawPort, 10) || 465;
  const user = cleanStr(process.env.SMTP_USER, 'mailsearchbiz@gmail.com');
  
  // App passwords (e.g. Gmail 16-character keys) often contain spaces like "ygrv hhqi hdhi bxwt". Strip them.
  const rawPass = process.env.SMTP_PASS || 'ygrv hhqi hdhi bxwt';
  const pass = String(rawPass)
    .replace(/["'\r\n\s]/g, '');

  const fromEmail = cleanStr(process.env.FROM_EMAIL, 'mail@searchbiz.co.za');
  const secure = port === 465;

  return { host, port, user, pass, fromEmail, secure };
}

let cachedTransporter: nodemailer.Transporter | null = null;
let lastConfigHash = '';

export function getEmailTransporter(): nodemailer.Transporter {
  const config = getSmtpConfig();
  const hash = `${config.host}_${config.port}_${config.user}_${config.pass.slice(0, 4)}`;

  if (cachedTransporter && lastConfigHash === hash) {
    return cachedTransporter;
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      rejectUnauthorized: false
    },
    // Useful connection pool settings for fast dispatch
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  cachedTransporter = transporter;
  lastConfigHash = hash;
  return transporter;
}

export async function verifySmtpConnection(): Promise<{ success: boolean; message: string; config: Partial<SmtpConfig> }> {
  try {
    const config = getSmtpConfig();
    const transporter = getEmailTransporter();
    await transporter.verify();
    return {
      success: true,
      message: `SMTP connection established successfully to ${config.host}:${config.port} as ${config.user}`,
      config: {
        host: config.host,
        port: config.port,
        user: config.user,
        fromEmail: config.fromEmail,
        secure: config.secure,
      }
    };
  } catch (err: any) {
    const config = getSmtpConfig();
    return {
      success: false,
      message: err?.message || String(err),
      config: {
        host: config.host,
        port: config.port,
        user: config.user,
        fromEmail: config.fromEmail,
        secure: config.secure,
      }
    };
  }
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  bcc?: string | string[];
  attachments?: any[];
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const config = getSmtpConfig();
    const transporter = getEmailTransporter();

    const fromAddress = opts.from || `"SearchBiz.co.za" <${config.fromEmail}>`;
    const replyToAddress = opts.replyTo || config.user || config.fromEmail;

    const mailOptions = {
      from: fromAddress,
      to: opts.to,
      replyTo: replyToAddress,
      subject: opts.subject,
      html: opts.html,
      text: opts.text || (opts.html ? opts.html.replace(/<[^>]+>/g, ' ').trim() : ''),
      bcc: opts.bcc,
      attachments: opts.attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] Dispatched email to ${JSON.stringify(opts.to)}, MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[EmailService] Failed to send email to ${JSON.stringify(opts.to)}:`, err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function sendOtpEmail(toEmail: string, otpCode: string, type: 'register' | 'login' | 'resend' = 'register'): Promise<boolean> {
  const normalizedEmail = toEmail.trim().toLowerCase();
  const config = getSmtpConfig();

  const title = type === 'login' 
    ? 'Login Security Verification Code' 
    : type === 'resend'
      ? 'Email Verification (Resent)'
      : 'Email Verification Required';

  const introText = type === 'login'
    ? 'To keep your account safe and prevent unauthorized access, please enter the following email verification code in your login screen.'
    : 'Thank you for using SearchBiz.co.za! Please verify your email address to secure your account and complete your verification setup.';

  const subject = type === 'login'
    ? `🔒 [SearchBiz] Login Security Code: ${otpCode}`
    : `🔑 [SearchBiz] Email Verification Code: ${otpCode}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; color: #1e293b; margin: 0 auto; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #052e22; font-size: 22px; font-weight: 800; margin: 0 0 6px 0;">SearchBiz<span style="color: #10b981;">.co.za</span></h2>
        <p style="color: #64748b; font-size: 12px; margin: 0; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">South Africa Business Directory</p>
      </div>

      <div style="border-top: 2px solid #10b981; padding-top: 18px;">
        <h3 style="color: #052e22; font-size: 18px; margin: 0 0 10px 0;">${title}</h3>
        <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">Hello,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">${introText}</p>
        
        <div style="background-color: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px; padding: 22px; text-align: center; margin: 24px 0;">
          <p style="margin: 0; font-size: 12px; color: #15803d; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">Your 6-Digit Verification Code</p>
          <h1 style="margin: 10px 0 0 0; font-size: 38px; letter-spacing: 8px; color: #047857; font-family: monospace; font-weight: 900;">${otpCode}</h1>
        </div>
        
        <p style="font-size: 12px; color: #64748b; line-height: 1.6; margin: 0 0 12px 0;">
          ⏱️ This code is valid for <strong>10 minutes</strong>. If you did not request this code, please ignore this email or change your password if you suspect unauthorized activity.
        </p>
        <p style="font-size: 12px; color: #64748b; line-height: 1.6; margin: 0 0 20px 0;">
          🛡️ <em>Security reminder: Never share your verification codes or passwords with anyone. SearchBiz staff will never ask for your code.</em>
        </p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;" />
        <p style="font-size: 11px; text-align: center; color: #94a3b8; margin: 0;">&copy; ${new Date().getFullYear()} SearchBiz.co.za. All rights reserved. Connecting South Africa.</p>
      </div>
    </div>
  `;

  const res = await sendEmail({
    to: normalizedEmail,
    subject,
    html,
    from: `"SearchBiz Security" <${config.fromEmail}>`,
    replyTo: config.user,
  });

  return res.success;
}

export async function sendPasswordResetEmail(toEmail: string, resetLink: string): Promise<boolean> {
  const normalizedEmail = toEmail.trim().toLowerCase();
  const config = getSmtpConfig();

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f8fafc;">
      <div style="background-color: #ffffff; padding: 24px; text-align: center; border-radius: 12px 12px 0 0; border-bottom: 3px solid #059669;">
         <h1 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: -0.5px;">SearchBiz.co.za</h1>
         <p style="color: #059669; margin: 4px 0 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">South Africa Premier Directory</p>
      </div>
      <div style="background-color: #ffffff; padding: 32px 24px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
        <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 20px;">Password Reset Request</h2>
        <p style="color: #334155; font-size: 16px; line-height: 24px; margin-bottom: 16px;">Hello,</p>
        <p style="color: #334155; font-size: 16px; line-height: 24px; margin-bottom: 24px;">You requested a password reset for your SearchBiz account. Please click the button below to reset your password. This link is valid for 1 hour.</p>
        <div style="text-align: center; margin-bottom: 32px; margin-top: 32px;">
          <a href="${resetLink}" style="background-color: #059669; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">Reset Password</a>
        </div>
        <p style="color: #64748b; font-size: 14px; line-height: 20px; border-top: 1px solid #e2e8f0; padding-top: 24px;">If you did not request this reset, you can safely ignore this email. Your password will remain unchanged.</p>
      </div>
      <div style="padding: 24px; text-align: center;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} SearchBiz.co.za • South Africa</p>
      </div>
    </div>
  `;

  const res = await sendEmail({
    to: normalizedEmail,
    subject: 'Password Reset Request - SearchBiz.co.za',
    html,
    from: `"SearchBiz Security" <${config.fromEmail}>`,
    replyTo: config.user,
  });

  return res.success;
}
