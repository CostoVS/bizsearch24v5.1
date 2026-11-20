import nodemailer from 'nodemailer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  secure: boolean;
}

interface TransportCandidate {
  host: string;
  port: number;
  secure: boolean;
  isLocalBridge: boolean;
}

const PLACEHOLDER_PASSWORDS = new Set([
  '',
  'your_mox_mailbox_password',
  'your_smtp_password',
  'changeme',
]);

/**
 * Strip surrounding matching quotes and linebreaks WITHOUT deleting quote characters inside passwords.
 */
function cleanEnvValue(val: string | undefined, fallback = ''): string {
  if (val === undefined || val === null) return fallback;
  let s = String(val).replace(/[\r\n]/g, '').trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s || fallback;
}

/**
 * Read a fallback .env file directly if process.env was not populated (e.g. Next.js standalone).
 */
function readEnvFileFallback(): Record<string, string> {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    '/app/.env',
  ];
  const parsed: Record<string, string> = {};

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, 'utf-8');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = cleanEnvValue(trimmed.slice(eqIdx + 1));
        if (key && !(key in parsed)) {
          parsed[key] = val;
        }
      }
      if (Object.keys(parsed).length > 0) break;
    } catch {
      // Ignore unreadable env files
    }
  }
  return parsed;
}

function isRunningInsideDocker(): boolean {
  try {
    if (fs.existsSync('/.dockerenv')) return true;
  } catch {
    // ignore
  }
  return process.env.HOSTNAME === '0.0.0.0';
}

/**
 * Robust extraction of SMTP config from process.env with .env file fallback.
 */
export function getSmtpConfig(): SmtpConfig {
  const fileEnv = readEnvFileFallback();
  const getVal = (key: string, fallback: string): string => {
    const envVal = cleanEnvValue(process.env[key]);
    if (envVal && !PLACEHOLDER_PASSWORDS.has(envVal)) {
      return envVal;
    }
    const diskVal = cleanEnvValue(fileEnv[key]);
    if (diskVal && !PLACEHOLDER_PASSWORDS.has(diskVal)) {
      return diskVal;
    }
    return envVal || diskVal || fallback;
  };

  const host = getVal('SMTP_HOST', 'mail.searchbiz.co.za');
  const rawPort = getVal('SMTP_PORT', '465');
  const port = parseInt(rawPort, 10) || 465;
  const user = getVal('SMTP_USER', 'admin@searchbiz.co.za');
  const pass = getVal('SMTP_PASS', '');
  const fromEmail = getVal('FROM_EMAIL', user);
  const secure = port === 465;

  return { host, port, user, pass, fromEmail, secure };
}

function isLocalBridgeHost(host: string): boolean {
  const h = host.toLowerCase().trim();
  return (
    h === '127.0.0.1' ||
    h === 'localhost' ||
    h === '::1' ||
    h === 'host.docker.internal' ||
    h === '172.17.0.1'
  );
}

/**
 * Build an ordered list of SMTP host/port candidates so Docker containers on a VPS
 * can always reach Mox (via host.docker.internal, 172.17.0.1, or mail.searchbiz.co.za)
 * on either port 587 (STARTTLS) or port 465 (SMTPS).
 */
function buildTransportCandidates(config: SmtpConfig): TransportCandidate[] {
  const inDocker = isRunningInsideDocker();
  const primaryHost = config.host.trim() || 'mail.searchbiz.co.za';
  const primaryLower = primaryHost.toLowerCase();
  const altPort = config.port === 465 ? 587 : 465;
  const isCustomExternal =
    !isLocalBridgeHost(primaryLower) &&
    primaryLower !== 'mail.searchbiz.co.za' &&
    !primaryLower.endsWith('.searchbiz.co.za');

  const rawList: Array<{ host: string; port: number }> = [];

  if (inDocker && (primaryLower === '127.0.0.1' || primaryLower === 'localhost' || primaryLower === '::1')) {
    // Inside Docker, 127.0.0.1 is the container itself; try host gateway first.
    rawList.push({ host: 'host.docker.internal', port: config.port });
    rawList.push({ host: 'host.docker.internal', port: altPort });
    rawList.push({ host: '172.17.0.1', port: config.port });
    rawList.push({ host: '172.17.0.1', port: altPort });
    rawList.push({ host: 'mail.searchbiz.co.za', port: config.port });
    rawList.push({ host: 'mail.searchbiz.co.za', port: altPort });
    rawList.push({ host: primaryHost, port: config.port });
  } else {
    rawList.push({ host: primaryHost, port: config.port });
    rawList.push({ host: primaryHost, port: altPort });

    if (!isCustomExternal) {
      if (inDocker) {
        rawList.push({ host: 'host.docker.internal', port: config.port });
        rawList.push({ host: 'host.docker.internal', port: altPort });
        rawList.push({ host: '172.17.0.1', port: config.port });
        rawList.push({ host: '172.17.0.1', port: altPort });
      }
      if (primaryLower !== 'mail.searchbiz.co.za') {
        rawList.push({ host: 'mail.searchbiz.co.za', port: 587 });
        rawList.push({ host: 'mail.searchbiz.co.za', port: 465 });
      }
    }
  }

  const seen = new Set<string>();
  const deduped: TransportCandidate[] = [];
  for (const item of rawList) {
    const key = `${item.host.toLowerCase()}:${item.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      host: item.host,
      port: item.port,
      secure: item.port === 465,
      isLocalBridge: isLocalBridgeHost(item.host),
    });
  }
  return deduped;
}

function createNodemailerTransporter(
  config: SmtpConfig,
  candidate: TransportCandidate
): nodemailer.Transporter {
  const tlsServername = process.env.SMTP_TLS_SERVERNAME?.trim() || 'mail.searchbiz.co.za';
  const rejectUnauthorized =
    process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false'
      ? false
      : !candidate.isLocalBridge;

  return nodemailer.createTransport({
    host: candidate.host,
    port: candidate.port,
    secure: candidate.secure,
    requireTLS: !candidate.secure && candidate.port === 587,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      rejectUnauthorized,
      ...(candidate.isLocalBridge ? { servername: tlsServername } : {}),
    },
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 10000,
  });
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
  requestedFrom?: string,
  forceUserAsFrom = false
): { from: string; replyTo: string; address: string } {
  const userDomain = config.user.split('@')[1]?.toLowerCase() || '';
  const fromDomain = config.fromEmail.split('@')[1]?.toLowerCase() || '';
  const isGmailRelay =
    config.host.toLowerCase().includes('gmail.com') ||
    userDomain === 'gmail.com' ||
    userDomain === 'googlemail.com';

  const domainMismatchOnGmail = isGmailRelay && fromDomain !== userDomain;
  const alignedEmail =
    forceUserAsFrom || domainMismatchOnGmail
      ? config.user
      : config.fromEmail || config.user;

  let finalFrom = `"${displayName}" <${alignedEmail}>`;
  let finalAddress = alignedEmail;

  if (requestedFrom && !forceUserAsFrom) {
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

  const alignedReplyTo = domainMismatchOnGmail
    ? config.user
    : config.fromEmail || config.user;

  return {
    from: finalFrom,
    replyTo: alignedReplyTo,
    address: finalAddress,
  };
}

let lastWorkingCandidate: TransportCandidate | null = null;
let lastWorkingConfigHash = '';

export function getEmailTransporter(): nodemailer.Transporter {
  const config = getSmtpConfig();
  const candidates = buildTransportCandidates(config);
  const hash = `${config.host}_${config.port}_${config.user}_${config.pass.slice(0, 4)}`;
  const active =
    lastWorkingCandidate && lastWorkingConfigHash === hash
      ? lastWorkingCandidate
      : candidates[0];
  return createNodemailerTransporter(config, active);
}

export async function verifySmtpConnection(): Promise<{
  success: boolean;
  message: string;
  config: Partial<SmtpConfig>;
}> {
  const config = getSmtpConfig();
  if (!config.pass || PLACEHOLDER_PASSWORDS.has(config.pass)) {
    return {
      success: false,
      message: 'SMTP_PASS is not configured (empty or still placeholder in .env).',
      config: {
        host: config.host,
        port: config.port,
        user: config.user,
        fromEmail: config.fromEmail,
        secure: config.secure,
      },
    };
  }

  const candidates = buildTransportCandidates(config);
  const errors: string[] = [];

  for (const candidate of candidates) {
    const transporter = createNodemailerTransporter(config, candidate);
    try {
      await transporter.verify();
      lastWorkingCandidate = candidate;
      lastWorkingConfigHash = `${config.host}_${config.port}_${config.user}_${config.pass.slice(0, 4)}`;
      transporter.close();
      return {
        success: true,
        message: `SMTP connection established successfully to ${candidate.host}:${candidate.port} as ${config.user}`,
        config: {
          host: candidate.host,
          port: candidate.port,
          user: config.user,
          fromEmail: config.fromEmail,
          secure: candidate.secure,
        },
      };
    } catch (err: any) {
      transporter.close();
      errors.push(`${candidate.host}:${candidate.port} -> ${err?.message || String(err)}`);
    }
  }

  return {
    success: false,
    message: errors.join(' | ') || 'SMTP verification failed.',
    config: {
      host: config.host,
      port: config.port,
      user: config.user,
      fromEmail: config.fromEmail,
      secure: config.secure,
    },
  };
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

function isSenderRejectedError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = Number(err?.responseCode || 0);
  return (
    code === 550 ||
    code === 551 ||
    code === 553 ||
    code === 554 ||
    msg.includes('sender') ||
    msg.includes('not authorized') ||
    msg.includes('owned by') ||
    msg.includes('send as') ||
    msg.includes('authenticated user') ||
    msg.includes('mismatch') ||
    msg.includes('from address') ||
    msg.includes('mail from')
  );
}

function isAuthError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = Number(err?.responseCode || 0);
  return code === 535 || msg.includes('invalid login') || msg.includes('authentication failed');
}

export async function sendEmail(
  opts: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const config = getSmtpConfig();

  if (!config.pass || PLACEHOLDER_PASSWORDS.has(config.pass)) {
    const errMsg = 'SMTP_PASS is missing or not configured in .env.';
    console.error(`[EmailService] Cannot send email to ${JSON.stringify(opts.to)}: ${errMsg}`);
    return { success: false, error: errMsg };
  }

  const configHash = `${config.host}_${config.port}_${config.user}_${config.pass.slice(0, 4)}`;
  const candidates = buildTransportCandidates(config);
  if (lastWorkingCandidate && lastWorkingConfigHash === configHash) {
    const idx = candidates.findIndex(
      (c) => c.host === lastWorkingCandidate!.host && c.port === lastWorkingCandidate!.port
    );
    if (idx > 0) {
      const [preferred] = candidates.splice(idx, 1);
      candidates.unshift(preferred);
    }
  }

  const attemptErrors: string[] = [];

  for (const candidate of candidates) {
    const transporter = createNodemailerTransporter(config, candidate);
    try {
      const aligned = resolveAlignedSender(config, 'SearchBiz.co.za', opts.from, false);
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

      try {
        const info = await transporter.sendMail(mailOptions);
        lastWorkingCandidate = candidate;
        lastWorkingConfigHash = configHash;
        transporter.close();
        console.log(
          `[EmailService] Dispatched email via ${candidate.host}:${candidate.port} to ${JSON.stringify(opts.to)}, From: ${aligned.from}, MessageId: ${info.messageId}`
        );
        return { success: true, messageId: info.messageId };
      } catch (sendErr: any) {
        // Mox strictly validates MAIL FROM / From against the authenticated user.
        // If sender was rejected and differed from config.user, immediately retry with config.user.
        if (
          isSenderRejectedError(sendErr) &&
          aligned.address.toLowerCase() !== config.user.toLowerCase()
        ) {
          const strictAligned = resolveAlignedSender(config, 'SearchBiz.co.za', opts.from, true);
          const info = await transporter.sendMail({
            ...mailOptions,
            from: strictAligned.from,
            sender: strictAligned.address,
            replyTo: opts.replyTo || aligned.address,
          });
          lastWorkingCandidate = candidate;
          lastWorkingConfigHash = configHash;
          transporter.close();
          console.log(
            `[EmailService] Dispatched email (aligned sender ${strictAligned.address}) via ${candidate.host}:${candidate.port} to ${JSON.stringify(opts.to)}, MessageId: ${info.messageId}`
          );
          return { success: true, messageId: info.messageId };
        }
        throw sendErr;
      }
    } catch (err: any) {
      transporter.close();
      const errMsg = err?.message || String(err);
      attemptErrors.push(`${candidate.host}:${candidate.port} -> ${errMsg}`);
      if (isAuthError(err)) {
        // Wrong credentials won't succeed on another port on the same server, stop early.
        console.error(`[EmailService] SMTP authentication failed for ${config.user}:`, errMsg);
        lastWorkingCandidate = null;
        return { success: false, error: errMsg };
      }
    }
  }

  lastWorkingCandidate = null;
  const combinedError = attemptErrors.join(' | ');
  console.error(`[EmailService] Failed to send email to ${JSON.stringify(opts.to)}: ${combinedError}`);
  return { success: false, error: combinedError };
}

export async function sendOtpEmailDetailed(
  toEmail: string,
  otpCode: string,
  type: 'register' | 'login' | 'resend' = 'register'
): Promise<{ success: boolean; messageId?: string; error?: string }> {
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

  return await sendEmail({
    to: normalizedEmail,
    subject,
    html,
    text,
    from: aligned.from,
    replyTo: aligned.replyTo,
  });
}

export async function sendOtpEmail(
  toEmail: string,
  otpCode: string,
  type: 'register' | 'login' | 'resend' = 'register'
): Promise<boolean> {
  const res = await sendOtpEmailDetailed(toEmail, otpCode, type);
  return res.success;
}

export async function sendPasswordResetEmailDetailed(
  toEmail: string,
  resetLink: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
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

  return await sendEmail({
    to: normalizedEmail,
    subject: 'SearchBiz Password Reset Request',
    html,
    text,
    from: aligned.from,
    replyTo: aligned.replyTo,
  });
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetLink: string
): Promise<boolean> {
  const res = await sendPasswordResetEmailDetailed(toEmail, resetLink);
  return res.success;
}
