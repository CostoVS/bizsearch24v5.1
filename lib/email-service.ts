import nodemailer from 'nodemailer';
import crypto from 'crypto';

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

  const host = cleanStr(process.env.SMTP_HOST, 'mail.searchbiz.co.za');
  const rawPort = cleanStr(process.env.SMTP_PORT, '465');
  const port = parseInt(rawPort, 10) || 465;
  const user = cleanStr(process.env.SMTP_USER, 'admin@searchbiz.co.za');

  const rawPass = process.env.SMTP_PASS || '';
  const pass = String(rawPass).replace(/["'\r\n]/g, '').trim();

  const fromEmail = cleanStr(process.env.FROM_EMAIL, user);
  const secure = port === 465;

  return { host, port, user, pass, fromEmail, secure };
}

/**
 * Ensure SPF/DKIM/DMARC alignment:
 * When relaying through Gmail SMTP (smtp.gmail.com) with a @gmail.com user,
 * sending with an unaligned custom domain in the From header triggers spam filters.
 * Align From to the authenticated SMTP account and put custom domain in Reply-To.
 */
function resolveAlignedSender(
  config: SmtpConfig,
  displayName = 'SearchBiz.co.za',
  requestedFrom?: string
): { from: string; replyTo: string; address: string } {
  const userDomain = config.user.split('@')[1]?.toLowerCase() || '';
  const fromDomain = config.fromEmail.split('@')[1]?.toLowerCase() || '';
  const isGmailRelay =
    config.host.toLowerCase().includes('gmail.com') ||
    userDomain === 'gmail.com' ||
    userDomain === 'googlemail.com';

  const domainMismatchOnGmail = isGmailRelay && fromDomain !== userDomain;
  const alignedEmail = domainMismatchOnGmail
    ? config.user
    : config.fromEmail || config.user;

  let finalFrom = `"${displayName}" <${alignedEmail}>`;
  let finalAddress = alignedEmail;

  if (requestedFrom) {
    const match = requestedFrom.match(/<([^>]+)>/);
    const reqAddr = (match ? match[1] : requestedFrom).trim().toLowerCase();
    const reqDomain = reqAddr.split('@')[1] || '';
    if (!isGmailRelay || reqDomain === userDomain) {
      finalFrom = requestedFrom;
      finalAddress = reqAddr;
    } else {
      const customNameMatch = requestedFrom.match(/^"?([^"<]+)"?\s*</);
      const customName = customNameMatch ? customNameMatch[1].trim() : displayName;
      finalFrom = `"${customName}" <${config.user}>`;
      finalAddress = config.user;
    }
  }

  // Keep Reply-To aligned with the Gmail sender when relaying through Gmail to avoid FREEMAIL_FORGED_REPLYTO spam penalties
  const alignedReplyTo = domainMismatchOnGmail
    ? config.user
    : config.fromEmail || config.user;

  return {
    from: finalFrom,
    replyTo: alignedReplyTo,
    address: finalAddress,
  };
}

let cachedTransporter: nodemailer.Transporter | null = null;
let lastConfigHash = '';

export function getEmailTransporter(): nodemailer.Transporter {
  const config = getSmtpConfig();
  const hash = `${config.host}_${config.port}_${config.user}_${config.pass.slice(0, 4)}`;

  if (cachedTransporter && lastConfigHash === hash) {
    return cachedTransporter;
  }

  const hostLower = config.host.toLowerCase();
  const isLocalBridge =
    hostLower === '127.0.0.1' ||
    hostLower === 'localhost' ||
    hostLower === 'host.docker.internal';

  const tlsServername = process.env.SMTP_TLS_SERVERNAME?.trim() || 'mail.searchbiz.co.za';
  const rejectUnauthorized =
    process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false'
      ? false
      : !isLocalBridge;

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure && config.port === 587,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      rejectUnauthorized,
      ...(isLocalBridge ? { servername: tlsServername } : {}),
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

export async function verifySmtpConnection(): Promise<{
  success: boolean;
  message: string;
  config: Partial<SmtpConfig>;
}> {
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
      },
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
      },
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

function htmlToCleanText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function sendEmail(
  opts: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const config = getSmtpConfig();
    const transporter = getEmailTransporter();
    const aligned = resolveAlignedSender(config, 'SearchBiz.co.za', opts.from);

    const mailOptions: nodemailer.SendMailOptions = {
      from: aligned.from,
      sender: aligned.address,
      to: opts.to,
      replyTo: opts.replyTo || aligned.replyTo,
      subject: opts.subject,
      html: opts.html,
      text: opts.text || (opts.html ? htmlToCleanText(opts.html) : ''),
      bcc: opts.bcc,
      attachments: opts.attachments,
      headers: {
        'X-Entity-Ref-ID': crypto.randomUUID(),
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
      },
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `[EmailService] Dispatched email to ${JSON.stringify(opts.to)}, From: ${aligned.from}, MessageId: ${info.messageId}`
    );
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[EmailService] Failed to send email to ${JSON.stringify(opts.to)}:`, err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function sendOtpEmail(
  toEmail: string,
  otpCode: string,
  type: 'register' | 'login' | 'resend' = 'register'
): Promise<boolean> {
  const normalizedEmail = toEmail.trim().toLowerCase();
  const config = getSmtpConfig();
  const aligned = resolveAlignedSender(config, 'SearchBiz Account');

  const title =
    type === 'login'
      ? 'Your SearchBiz Login Code'
      : type === 'resend'
        ? 'Your SearchBiz Verification Code'
        : 'Confirm Your SearchBiz Email';

  const introText =
    type === 'login'
      ? 'Enter the 6-digit code below on the SearchBiz login page to complete signing in to your account.'
      : 'Enter the 6-digit code below to confirm your email address for your SearchBiz account.';

  const subject =
    type === 'login'
      ? 'Your SearchBiz login code'
      : type === 'resend'
        ? 'Your SearchBiz verification code'
        : 'Confirm your SearchBiz email';

  const text = [
    title,
    '',
    'Hello,',
    '',
    introText,
    '',
    `Code: ${otpCode}`,
    '',
    'This code is valid for 10 minutes.',
    'If you did not request this sign-in, you can ignore this email.',
    '',
    'SearchBiz.co.za',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; color: #1e293b; margin: 0 auto; background: #ffffff;">
      <p style="color: #052e22; font-size: 18px; font-weight: 700; margin: 0 0 16px 0;">SearchBiz.co.za</p>
      <p style="font-size: 15px; font-weight: 600; color: #0f172a; margin: 0 0 10px 0;">${title}</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">Hello,</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 18px 0;">${introText}</p>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; text-align: center; margin: 18px 0;">
        <p style="margin: 0; font-size: 28px; letter-spacing: 6px; color: #047857; font-family: monospace; font-weight: 700;">${otpCode}</p>
      </div>
      <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0 0 8px 0;">
        This code expires in 10 minutes.
      </p>
      <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
        If you did not request this sign-in, you can safely ignore this message.
      </p>
    </div>
  `;

  const res = await sendEmail({
    to: normalizedEmail,
    subject,
    html,
    text,
    from: aligned.from,
    replyTo: aligned.replyTo,
  });

  return res.success;
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetLink: string
): Promise<boolean> {
  const normalizedEmail = toEmail.trim().toLowerCase();
  const config = getSmtpConfig();
  const aligned = resolveAlignedSender(config, 'SearchBiz Security');

  const text = [
    'SearchBiz.co.za - Password Reset Request',
    '',
    'Hello,',
    '',
    'You requested a password reset for your SearchBiz account. Use the link below to set a new password (valid for 1 hour):',
    resetLink,
    '',
    'If you did not request this reset, you can safely ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f8fafc;">
      <div style="background-color: #ffffff; padding: 24px; text-align: center; border-radius: 12px 12px 0 0; border-bottom: 3px solid #059669;">
         <h1 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: -0.5px;">SearchBiz.co.za</h1>
         <p style="color: #059669; margin: 4px 0 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">South Africa Business Directory</p>
      </div>
      <div style="background-color: #ffffff; padding: 32px 24px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
        <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 20px;">Password Reset Request</h2>
        <p style="color: #334155; font-size: 16px; line-height: 24px; margin-bottom: 16px;">Hello,</p>
        <p style="color: #334155; font-size: 16px; line-height: 24px; margin-bottom: 24px;">You requested a password reset for your SearchBiz account. Please click the button below to reset your password. This link is valid for 1 hour.</p>
        <div style="text-align: center; margin-bottom: 32px; margin-top: 32px;">
          <a href="${resetLink}" style="background-color: #059669; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #64748b; font-size: 14px; line-height: 20px; border-top: 1px solid #e2e8f0; padding-top: 24px;">If you did not request this reset, you can safely ignore this email. Your password will remain unchanged.</p>
      </div>
      <div style="padding: 24px; text-align: center;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} SearchBiz.co.za &bull; South Africa</p>
      </div>
    </div>
  `;

  const res = await sendEmail({
    to: normalizedEmail,
    subject: 'SearchBiz Password Reset Request',
    html,
    text,
    from: aligned.from,
    replyTo: aligned.replyTo,
  });

  return res.success;
}
