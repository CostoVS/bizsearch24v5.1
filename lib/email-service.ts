import nodemailer from 'nodemailer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type EmailRole = 'noreply' | 'ai' | 'admin' | 'help';

export interface SmtpConfig {
  role: EmailRole;
  server: 'mox';
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  displayName: string;
  secure: boolean;
  legacyGmailBlocked?: boolean;
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

const ROLE_META: Record<
  EmailRole,
  {
    defaultEmail: string;
    displayName: string;
    purpose: string;
    userEnvKeys: string[];
    passEnvKeys: string[];
    fromEnvKeys: string[];
  }
> = {
  noreply: {
    defaultEmail: 'noreply@searchbiz.co.za',
    displayName: 'SearchBiz Auth',
    purpose: '2FA & Login Verification',
    userEnvKeys: ['SMTP_NOREPLY_USER', 'NOREPLY_EMAIL'],
    passEnvKeys: ['SMTP_NOREPLY_PASS', 'NOREPLY_PASS'],
    fromEnvKeys: ['NOREPLY_EMAIL', 'SMTP_NOREPLY_USER'],
  },
  ai: {
    defaultEmail: 'ai@searchbiz.co.za',
    displayName: 'SearchBiz AI',
    purpose: 'AI Assistant & Automation',
    userEnvKeys: ['SMTP_AI_USER', 'AI_EMAIL'],
    passEnvKeys: ['SMTP_AI_PASS', 'AI_PASS'],
    fromEnvKeys: ['AI_EMAIL', 'SMTP_AI_USER'],
  },
  admin: {
    defaultEmail: 'admin@searchbiz.co.za',
    displayName: 'SearchBiz Administration',
    purpose: 'Admin & Broadcasts',
    userEnvKeys: ['SMTP_ADMIN_USER', 'ADMIN_MAILBOX'],
    passEnvKeys: ['SMTP_ADMIN_PASS', 'ADMIN_SMTP_PASS'],
    fromEnvKeys: ['ADMIN_MAILBOX', 'SMTP_ADMIN_USER'],
  },
  help: {
    defaultEmail: 'help@searchbiz.co.za',
    displayName: 'SearchBiz Support',
    purpose: 'Customer Support & Help Desk',
    userEnvKeys: ['SMTP_HELP_USER', 'HELP_EMAIL'],
    passEnvKeys: ['SMTP_HELP_PASS', 'HELP_PASS'],
    fromEnvKeys: ['HELP_EMAIL', 'SMTP_HELP_USER'],
  },
};

function isBlockedLegacyEmailOrHost(val: string | undefined): boolean {
  if (!val) return false;
  const lower = val.toLowerCase().trim();
  return (
    lower.includes('gmail.com') ||
    lower.includes('googlemail.com') ||
    lower === 'mail@searchbiz.co.za' ||
    lower === 'support@searchbiz.co.za' ||
    lower === 'admin@bizsearch.co.za'
  );
}

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

function resolveEnvVar(fileEnv: Record<string, string>, key: string): string {
  const envVal = cleanEnvValue(process.env[key]);
  if (envVal && !PLACEHOLDER_PASSWORDS.has(envVal)) {
    return envVal;
  }
  const diskVal = cleanEnvValue(fileEnv[key]);
  if (diskVal && !PLACEHOLDER_PASSWORDS.has(diskVal)) {
    return diskVal;
  }
  return envVal || diskVal || '';
}

export function getMailboxAddress(role: EmailRole): string {
  const fileEnv = readEnvFileFallback();
  const meta = ROLE_META[role];
  for (const key of meta.fromEnvKeys) {
    const val = resolveEnvVar(fileEnv, key);
    if (val && val.includes('@') && !isBlockedLegacyEmailOrHost(val)) {
      return val.toLowerCase();
    }
  }
  return meta.defaultEmail;
}

/**
 * Resolve Mox Mail Server SMTP configuration for a specific SearchBiz email role.
 * Legacy Gmail SMTP hosts/accounts are explicitly rejected so all mail routes through Mox.
 */
export function getSmtpConfig(role: EmailRole = 'admin'): SmtpConfig {
  const fileEnv = readEnvFileFallback();
  const meta = ROLE_META[role];

  const rawGlobalHost = resolveEnvVar(fileEnv, 'SMTP_HOST');
  const rawGlobalUser = resolveEnvVar(fileEnv, 'SMTP_USER');
  const rawGlobalFrom = resolveEnvVar(fileEnv, 'FROM_EMAIL');
  const legacyGmailBlocked =
    isBlockedLegacyEmailOrHost(rawGlobalHost) ||
    isBlockedLegacyEmailOrHost(rawGlobalUser) ||
    isBlockedLegacyEmailOrHost(rawGlobalFrom);

  const host =
    rawGlobalHost && !isBlockedLegacyEmailOrHost(rawGlobalHost)
      ? rawGlobalHost
      : 'mail.searchbiz.co.za';

  const rawPort = resolveEnvVar(fileEnv, 'SMTP_PORT') || '465';
  const port = parseInt(rawPort, 10) || 465;

  let user = '';
  for (const key of meta.userEnvKeys) {
    const val = resolveEnvVar(fileEnv, key);
    if (val && !isBlockedLegacyEmailOrHost(val)) {
      user = val.toLowerCase();
      break;
    }
  }
  if (!user && role === 'admin' && rawGlobalUser && !isBlockedLegacyEmailOrHost(rawGlobalUser)) {
    user = rawGlobalUser.toLowerCase();
  }
  if (!user) {
    user = meta.defaultEmail;
  }

  let fromEmail = '';
  for (const key of meta.fromEnvKeys) {
    const val = resolveEnvVar(fileEnv, key);
    if (val && !isBlockedLegacyEmailOrHost(val)) {
      fromEmail = val.toLowerCase();
      break;
    }
  }
  if (!fromEmail) {
    fromEmail = user;
  }

  let pass = '';
  for (const key of meta.passEnvKeys) {
    const val = resolveEnvVar(fileEnv, key);
    if (val && !PLACEHOLDER_PASSWORDS.has(val)) {
      pass = val;
      break;
    }
  }
  if (!pass && !legacyGmailBlocked) {
    const globalPass = resolveEnvVar(fileEnv, 'SMTP_PASS');
    if (globalPass && !PLACEHOLDER_PASSWORDS.has(globalPass)) {
      pass = globalPass;
    }
  }

  const secure = port === 465;

  return {
    role,
    server: 'mox',
    host,
    port,
    user,
    pass,
    fromEmail,
    displayName: meta.displayName,
    secure,
    legacyGmailBlocked,
  };
}

export function getAllMoxMailboxesSummary() {
  const roles: EmailRole[] = ['noreply', 'ai', 'admin', 'help'];
  return roles.map((role) => {
    const cfg = getSmtpConfig(role);
    return {
      role,
      purpose: ROLE_META[role].purpose,
      email: cfg.fromEmail,
      user: cfg.user,
      host: cfg.host,
      port: cfg.port,
      server: 'mox',
      configured: Boolean(cfg.pass && !PLACEHOLDER_PASSWORDS.has(cfg.pass)),
      legacyGmailBlocked: Boolean(cfg.legacyGmailBlocked),
    };
  });
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
 * Build an ordered list of Mox SMTP host/port candidates so Docker containers on a VPS
 * can always reach Mox (via host.docker.internal, 172.17.0.1, or mail.searchbiz.co.za)
 * on either port 465 (SMTPS) or port 587 (STARTTLS).
 */
function buildTransportCandidates(config: SmtpConfig): TransportCandidate[] {
  const inDocker = isRunningInsideDocker();
  const primaryHost = config.host.trim() || 'mail.searchbiz.co.za';
  const primaryLower = primaryHost.toLowerCase();
  const altPort = config.port === 465 ? 587 : 465;

  const rawList: Array<{ host: string; port: number }> = [];

  if (inDocker && (primaryLower === '127.0.0.1' || primaryLower === 'localhost' || primaryLower === '::1')) {
    rawList.push({ host: 'host.docker.internal', port: config.port });
    rawList.push({ host: 'host.docker.internal', port: altPort });
    rawList.push({ host: '172.17.0.1', port: config.port });
    rawList.push({ host: '172.17.0.1', port: altPort });
    rawList.push({ host: 'mail.searchbiz.co.za', port: config.port });
    rawList.push({ host: 'mail.searchbiz.co.za', port: altPort });
  } else {
    rawList.push({ host: primaryHost, port: config.port });
    rawList.push({ host: primaryHost, port: altPort });

    if (inDocker) {
      rawList.push({ host: 'host.docker.internal', port: config.port });
      rawList.push({ host: 'host.docker.internal', port: altPort });
      rawList.push({ host: '172.17.0.1', port: config.port });
      rawList.push({ host: '172.17.0.1', port: altPort });
    }
    if (primaryLower !== 'mail.searchbiz.co.za') {
      rawList.push({ host: 'mail.searchbiz.co.za', port: 465 });
      rawList.push({ host: 'mail.searchbiz.co.za', port: 587 });
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

function resolveMoxSender(
  config: SmtpConfig,
  requestedFrom?: string,
  forceUserAsFrom = false
): { from: string; replyTo: string; address: string } {
  const alignedEmail = forceUserAsFrom ? config.user : config.fromEmail || config.user;
  let finalFrom = `"${config.displayName}" <${alignedEmail}>`;
  let finalAddress = alignedEmail;

  if (requestedFrom && !forceUserAsFrom) {
    const match = requestedFrom.match(/<([^>]+)>/);
    const reqAddr = (match ? match[1] : requestedFrom).trim().toLowerCase();
    if (reqAddr && !isBlockedLegacyEmailOrHost(reqAddr)) {
      finalFrom = requestedFrom;
      finalAddress = reqAddr;
    }
  }

  return {
    from: finalFrom,
    replyTo: config.fromEmail || config.user,
    address: finalAddress,
  };
}

const workingCandidateByRole = new Map<string, TransportCandidate>();

export function getEmailTransporter(role: EmailRole = 'admin'): nodemailer.Transporter {
  const config = getSmtpConfig(role);
  const candidates = buildTransportCandidates(config);
  const key = `${role}_${config.host}_${config.port}_${config.user}_${config.pass.slice(0, 4)}`;
  const active = workingCandidateByRole.get(key) || candidates[0];
  return createNodemailerTransporter(config, active);
}

export async function verifySmtpConnection(role: EmailRole = 'admin'): Promise<{
  success: boolean;
  message: string;
  config: Partial<SmtpConfig>;
}> {
  const config = getSmtpConfig(role);
  if (!config.pass || PLACEHOLDER_PASSWORDS.has(config.pass)) {
    const hint = config.legacyGmailBlocked
      ? `Legacy Gmail SMTP settings detected in .env and blocked. Update .env with Mox Mail Server credentials for ${config.user}.`
      : `Mox SMTP password for ${config.user} is not configured in .env.`;
    return {
      success: false,
      message: hint,
      config: {
        role: config.role,
        server: 'mox',
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
      const cacheKey = `${role}_${config.host}_${config.port}_${config.user}_${config.pass.slice(0, 4)}`;
      workingCandidateByRole.set(cacheKey, candidate);
      transporter.close();
      return {
        success: true,
        message: `Mox SMTP connection established to ${candidate.host}:${candidate.port} as ${config.user}`,
        config: {
          role: config.role,
          server: 'mox',
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
      if (isAuthError(err)) {
        break;
      }
    }
  }

  return {
    success: false,
    message: errors.join(' | ') || 'Mox SMTP verification failed.',
    config: {
      role: config.role,
      server: 'mox',
      host: config.host,
      port: config.port,
      user: config.user,
      fromEmail: config.fromEmail,
      secure: config.secure,
    },
  };
}

export interface SendEmailOptions {
  role?: EmailRole;
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
  return code === 534 || code === 535 || msg.includes('invalid login') || msg.includes('authentication failed');
}

async function dispatchWithConfig(
  config: SmtpConfig,
  opts: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string; authFailed?: boolean }> {
  const cacheKey = `${config.role}_${config.host}_${config.port}_${config.user}_${config.pass.slice(0, 4)}`;
  const candidates = buildTransportCandidates(config);
  const cached = workingCandidateByRole.get(cacheKey);
  if (cached) {
    const idx = candidates.findIndex(
      (c) => c.host === cached.host && c.port === cached.port
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
      const aligned = resolveMoxSender(config, opts.from, false);
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
        workingCandidateByRole.set(cacheKey, candidate);
        transporter.close();
        console.log(
          `[EmailService/Mox:${config.role}] Dispatched email via ${candidate.host}:${candidate.port} to ${JSON.stringify(opts.to)}, From: ${aligned.from}, MessageId: ${info.messageId}`
        );
        return { success: true, messageId: info.messageId };
      } catch (sendErr: any) {
        if (
          isSenderRejectedError(sendErr) &&
          aligned.address.toLowerCase() !== config.user.toLowerCase()
        ) {
          const strictAligned = resolveMoxSender(config, opts.from, true);
          const info = await transporter.sendMail({
            ...mailOptions,
            from: strictAligned.from,
            sender: strictAligned.address,
            replyTo: opts.replyTo || aligned.address,
          });
          workingCandidateByRole.set(cacheKey, candidate);
          transporter.close();
          console.log(
            `[EmailService/Mox:${config.role}] Dispatched email (aligned sender ${strictAligned.address}) via ${candidate.host}:${candidate.port} to ${JSON.stringify(opts.to)}, MessageId: ${info.messageId}`
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
        console.error(`[EmailService/Mox:${config.role}] SMTP authentication failed for ${config.user}:`, errMsg);
        workingCandidateByRole.delete(cacheKey);
        return { success: false, error: errMsg, authFailed: true };
      }
    }
  }

  workingCandidateByRole.delete(cacheKey);
  return { success: false, error: attemptErrors.join(' | ') };
}

export async function sendEmail(
  opts: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const role: EmailRole = opts.role || 'admin';
  const config = getSmtpConfig(role);

  if (!config.pass || PLACEHOLDER_PASSWORDS.has(config.pass)) {
    const errMsg = config.legacyGmailBlocked
      ? `Legacy Gmail SMTP settings detected in .env and blocked. Please configure Mox SMTP credentials for ${config.user}.`
      : `Mox SMTP_PASS for ${config.user} is missing or not configured in .env.`;
    console.error(`[EmailService/Mox:${role}] Cannot send email to ${JSON.stringify(opts.to)}: ${errMsg}`);
    return { success: false, error: errMsg };
  }

  const primaryRes = await dispatchWithConfig(config, opts);
  if (primaryRes.success) {
    return { success: true, messageId: primaryRes.messageId };
  }

  // If a secondary mailbox (noreply / help / ai) isn't a standalone Mox login yet
  // (e.g. configured as an alias on admin@searchbiz.co.za), try authenticating as admin@searchbiz.co.za.
  if (primaryRes.authFailed && role !== 'admin') {
    const adminConfig = getSmtpConfig('admin');
    if (
      adminConfig.pass &&
      !PLACEHOLDER_PASSWORDS.has(adminConfig.pass) &&
      (adminConfig.user !== config.user || adminConfig.pass !== config.pass)
    ) {
      const roleFrom = opts.from || `"${config.displayName}" <${config.fromEmail}>`;
      const fallbackRes = await dispatchWithConfig(adminConfig, {
        ...opts,
        from: roleFrom,
        replyTo: opts.replyTo || config.fromEmail,
      });
      if (fallbackRes.success) {
        return { success: true, messageId: fallbackRes.messageId };
      }
    }
  }

  const combinedError = primaryRes.error || 'Mox SMTP dispatch failed.';
  console.error(`[EmailService/Mox:${role}] Failed to send email to ${JSON.stringify(opts.to)}: ${combinedError}`);
  return { success: false, error: combinedError };
}

export async function sendOtpEmailDetailed(
  toEmail: string,
  otpCode: string,
  type: 'register' | 'login' | 'resend' = 'register'
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const normalizedEmail = toEmail.trim().toLowerCase();
  const noreplyEmail = getMailboxAddress('noreply');
  const helpEmail = getMailboxAddress('help');

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
    `Need help? Contact ${helpEmail}`,
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
      <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0 0 8px 0;">
        If you did not request this sign-in, you can safely ignore this message.
      </p>
      <p style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin: 12px 0 0 0; border-top: 1px solid #e2e8f0; padding-top: 10px;">
        Automated security notice from ${noreplyEmail} &bull; Support: <a href="mailto:${helpEmail}" style="color: #059669;">${helpEmail}</a>
      </p>
    </div>
  `;

  return await sendEmail({
    role: 'noreply',
    to: normalizedEmail,
    subject,
    html,
    text,
    from: `"SearchBiz Auth" <${noreplyEmail}>`,
    replyTo: noreplyEmail,
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
  const noreplyEmail = getMailboxAddress('noreply');
  const helpEmail = getMailboxAddress('help');

  const text = [
    'SearchBiz.co.za - Password Reset Request',
    '',
    'Hello,',
    '',
    'You requested a password reset for your SearchBiz account. Use the link below to set a new password (valid for 1 hour):',
    resetLink,
    '',
    'If you did not request this reset, you can safely ignore this email.',
    `Support: ${helpEmail}`,
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
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} SearchBiz.co.za &bull; Sent via ${noreplyEmail} &bull; Support: <a href="mailto:${helpEmail}" style="color: #059669;">${helpEmail}</a></p>
      </div>
    </div>
  `;

  return await sendEmail({
    role: 'noreply',
    to: normalizedEmail,
    subject: 'SearchBiz Password Reset Request',
    html,
    text,
    from: `"SearchBiz Auth" <${noreplyEmail}>`,
    replyTo: noreplyEmail,
  });
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetLink: string
): Promise<boolean> {
  const res = await sendPasswordResetEmailDetailed(toEmail, resetLink);
  return res.success;
}
