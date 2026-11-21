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
    displayName: 'SearchBiz 2FA (No-Reply)',
    purpose: '2FA & Login Verification (Send-Only)',
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
): { from: string; replyTo?: string; address: string } {
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
    replyTo: config.role === 'noreply' ? undefined : config.fromEmail || config.user,
    address: finalAddress,
  };
}

function escapeHtmlBasic(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveEmailLogoPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'public', 'email-logo.png'),
    '/app/public/email-logo.png',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

export interface BrandedEmailTemplateOptions {
  role?: EmailRole;
  badgeText?: string;
  heroTitle: string;
  heroAccent?: string;
  heroSubtitle?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  compact?: boolean;
}

/**
 * Render a SearchBiz.co.za branded HTML email matching the live website's
 * white header + emerald magnifying-glass logo lockup + #052e22 hero banner.
 */
export function renderSearchBizEmailHtml(opts: BrandedEmailTemplateOptions): string {
  const role: EmailRole = opts.role || 'admin';
  const noreplyEmail = getMailboxAddress('noreply');
  const helpEmail = getMailboxAddress('help');
  const aiEmail = getMailboxAddress('ai');
  const adminEmail = getMailboxAddress('admin');

  const roleBadgeMap: Record<EmailRole, { label: string; bg: string; border: string; color: string; heroBadge: string }> = {
    noreply: {
      label: '2FA NO-REPLY',
      bg: '#fffbeb',
      border: '#fde68a',
      color: '#92400e',
      heroBadge: 'South Africa Directory &bull; 2FA Security',
    },
    ai: {
      label: 'AI ASSISTANT',
      bg: '#ecfdf5',
      border: '#a7f3d0',
      color: '#047857',
      heroBadge: 'South Africa Directory &bull; AI Desk',
    },
    help: {
      label: 'SUPPORT DESK',
      bg: '#ecfdf5',
      border: '#a7f3d0',
      color: '#047857',
      heroBadge: 'South Africa Directory &bull; Support Desk',
    },
    admin: {
      label: 'ADMINISTRATION',
      bg: '#ecfdf5',
      border: '#a7f3d0',
      color: '#047857',
      heroBadge: 'South Africa Directory &bull; Official Notice',
    },
  };

  const theme = roleBadgeMap[role];
  const heroBadge = opts.badgeText || theme.heroBadge;
  const year = new Date().getFullYear();

  const noReplyBannerHtml =
    role === 'noreply'
      ? `
        <div style="margin-top: 20px; background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px 14px;">
          <p style="margin: 0; font-size: 12px; line-height: 1.55; color: #92400e;">
            <strong>Do Not Reply (2FA Only):</strong> <strong>${noreplyEmail}</strong> is a send-only security address and rejects all replies. Need help? Contact <a href="mailto:${helpEmail}" style="color: #059669; font-weight: 700; text-decoration: none;">${helpEmail}</a>.
          </p>
        </div>`
      : '';

  const ctaHtml =
    opts.ctaLabel && opts.ctaUrl
      ? `
        <div style="text-align: center; margin: 24px 0 8px 0;">
          <a href="${opts.ctaUrl}" style="display: inline-block; background-color: #059669; color: #ffffff; padding: 13px 26px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 14px; letter-spacing: 0.01em;">${opts.ctaLabel}</a>
        </div>`
      : '';

  const footerRoleLine =
    role === 'noreply'
      ? `Automated 2FA Security Gateway (${noreplyEmail} &bull; No-Reply Only) &bull; Support: <a href="mailto:${helpEmail}" style="color: #059669; text-decoration: none; font-weight: 600;">${helpEmail}</a>`
      : role === 'ai'
        ? `Dispatched by SearchBiz AI (<a href="mailto:${aiEmail}" style="color: #059669; text-decoration: none; font-weight: 600;">${aiEmail}</a>) &bull; <a href="https://searchbiz.co.za" style="color: #059669; text-decoration: none; font-weight: 600;">searchbiz.co.za</a>`
        : role === 'help'
          ? `SearchBiz Support Desk (<a href="mailto:${helpEmail}" style="color: #059669; text-decoration: none; font-weight: 600;">${helpEmail}</a>) &bull; Reply directly to this email for help`
          : `SearchBiz Administration (<a href="mailto:${adminEmail}" style="color: #059669; text-decoration: none; font-weight: 600;">${adminEmail}</a>) &bull; POPIA &amp; Direct Marketing Compliance`;

  const headerPad = opts.compact ? '12px 16px' : '16px 20px';
  const heroPad = opts.compact ? '16px 18px' : '22px 22px';
  const bodyPad = opts.compact ? '18px 18px' : '22px 22px';
  const heroSize = opts.compact ? '20px' : '23px';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SearchBiz.co.za</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f8fafc; padding: 14px 8px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 560px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
          <!-- Website Header Lockup -->
          <tr>
            <td style="background-color: #ffffff; padding: ${headerPad}; border-bottom: 1px solid #e2e8f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="38" valign="middle">
                    <a href="https://searchbiz.co.za" style="text-decoration: none;">
                      <img src="cid:searchbiz-logo" width="38" height="38" alt="SearchBiz" style="display: block; width: 38px; height: 38px; border-radius: 9px; border: 0;" />
                    </a>
                  </td>
                  <td valign="middle" style="padding-left: 10px; padding-right: 10px;">
                    <a href="https://searchbiz.co.za" style="text-decoration: none;">
                      <div style="font-size: 17px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; color: #0f172a; white-space: nowrap;">Search<span style="color: #059669;">Biz</span>.co.za</div>
                      <div style="font-size: 8.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; margin-top: 2px;">SOUTH AFRICA</div>
                    </a>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display: inline-block; background-color: ${theme.bg}; border: 1px solid ${theme.border}; color: ${theme.color}; font-size: 9px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 8px; border-radius: 9999px; white-space: nowrap;">${theme.label}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Deep Forest-Emerald Website Hero Banner -->
          <tr>
            <td style="background-color: #052e22; background-image: linear-gradient(135deg, #052e22 0%, #0a4233 100%); padding: ${heroPad}; color: #ffffff;">
              <div style="display: inline-block; background-color: #064e3b; border: 1px solid #047857; color: #34d399; font-size: 10.5px; font-weight: 700; letter-spacing: 0.03em; padding: 4px 10px; border-radius: 9999px; margin-bottom: 8px;">
                &#10022; ${heroBadge}
              </div>
              <h1 style="margin: 0; font-size: ${heroSize}; line-height: 1.25; font-weight: 800; letter-spacing: -0.02em; color: #ffffff;">
                ${opts.heroTitle}${opts.heroAccent ? ` <span style="color: #34d399;">${opts.heroAccent}</span>` : ''}
              </h1>
              ${opts.heroSubtitle ? `<p style="margin: 5px 0 0 0; font-size: 13px; line-height: 1.45; color: #cbd5e1;">${opts.heroSubtitle}</p>` : ''}
            </td>
          </tr>

          <!-- Email Body -->
          <tr>
            <td style="background-color: #ffffff; padding: ${bodyPad}; color: #1e293b; font-size: 14px; line-height: 1.6;">
              ${opts.bodyHtml}
              ${ctaHtml}
              ${noReplyBannerHtml}
            </td>
          </tr>

          <!-- Website Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 20px; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #0f172a;">
                Search<span style="color: #059669;">Biz</span>.co.za &bull; South Africa Business Directory
              </p>
              <p style="margin: 0; font-size: 11px; line-height: 1.55; color: #64748b;">
                ${footerRoleLine}
              </p>
              <p style="margin: 4px 0 0 0; font-size: 10.5px; color: #94a3b8;">
                &copy; ${year} SearchBiz.co.za &bull; All Rights Reserved
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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

  const isNoReplyRole = config.role === 'noreply' || opts.role === 'noreply';
  const effectiveHtml = opts.html || '';
  const attachments = Array.isArray(opts.attachments) ? [...opts.attachments] : [];
  if (effectiveHtml.includes('cid:searchbiz-logo')) {
    const hasLogo = attachments.some((att) => att && att.cid === 'searchbiz-logo');
    const logoPath = resolveEmailLogoPath();
    if (!hasLogo && logoPath) {
      attachments.push({
        filename: 'searchbiz-logo.png',
        path: logoPath,
        cid: 'searchbiz-logo',
        contentType: 'image/png',
        contentDisposition: 'inline',
      });
    }
  }

  const attemptErrors: string[] = [];

  for (const candidate of candidates) {
    const transporter = createNodemailerTransporter(config, candidate);
    try {
      const aligned = resolveMoxSender(config, opts.from, false);
      const resolvedReplyTo = isNoReplyRole
        ? undefined
        : opts.replyTo || aligned.replyTo;

      const mailOptions: nodemailer.SendMailOptions = {
        from: aligned.from,
        sender: aligned.address,
        to: opts.to,
        ...(resolvedReplyTo ? { replyTo: resolvedReplyTo } : {}),
        subject: opts.subject,
        html: opts.html,
        text: opts.text || (opts.html ? htmlToCleanText(opts.html) : ''),
        bcc: opts.bcc,
        attachments: attachments.length > 0 ? attachments : undefined,
        headers: {
          'X-Entity-Ref-ID': crypto.randomUUID(),
          ...(isNoReplyRole
            ? {
                'Auto-Submitted': 'auto-generated',
                Precedence: 'bulk',
                'X-Auto-Response-Suppress': 'All',
                'X-SearchBiz-NoReply': '2fa-only',
              }
            : {
                'X-Auto-Response-Suppress': 'OOF, AutoReply',
              }),
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
          const strictReplyTo = isNoReplyRole
            ? undefined
            : opts.replyTo || aligned.address;
          const info = await transporter.sendMail({
            ...mailOptions,
            from: strictAligned.from,
            sender: strictAligned.address,
            ...(strictReplyTo ? { replyTo: strictReplyTo } : { replyTo: undefined }),
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

  // Ensure even plain-text calls (e.g., Telegram /send_email) carry the branded website layout & logo
  const preparedOpts: SendEmailOptions = opts.html
    ? opts
    : {
        ...opts,
        html: renderSearchBizEmailHtml({
          role,
          heroTitle: escapeHtmlBasic(opts.subject || 'SearchBiz Notification'),
          bodyHtml: `<div style="white-space: pre-wrap; color: #334155;">${escapeHtmlBasic(opts.text || '')}</div>`,
        }),
      };

  const primaryRes = await dispatchWithConfig(config, preparedOpts);
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
      const roleFrom = preparedOpts.from || `"${config.displayName}" <${config.fromEmail}>`;
      const fallbackRes = await dispatchWithConfig(adminConfig, {
        ...preparedOpts,
        role,
        from: roleFrom,
        replyTo: role === 'noreply' ? undefined : preparedOpts.replyTo || config.fromEmail,
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

  const heroTitle =
    type === 'login'
      ? 'Your SearchBiz'
      : type === 'resend'
        ? 'Your Verification'
        : 'Confirm Your';

  const heroAccent =
    type === 'login'
      ? 'Login Code'
      : type === 'resend'
        ? 'Security Code'
        : 'SearchBiz Email';

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

  const cleanOtp = String(otpCode || '').replace(/\s+/g, '').trim();
  const copyUrl = `https://searchbiz.co.za/copy-code?code=${encodeURIComponent(cleanOtp)}`;

  const text = [
    `${heroTitle} ${heroAccent}`,
    '',
    `Your SearchBiz verification code is: ${cleanOtp}`,
    '',
    introText,
    `Auto-copy link: ${copyUrl}`,
    '',
    'This code expires in 10 minutes.',
    'If you did not request this sign-in, you can safely ignore this message.',
    `Do not reply to ${noreplyEmail} (send-only 2FA address). Support: ${helpEmail}`,
    '',
    'SearchBiz.co.za',
  ].join('\n');

  const bodyHtml = `
    <p style="margin: 0 0 12px 0; font-size: 13.5px; line-height: 1.55; color: #334155;">${introText}</p>
    <div style="background-color: #052e22; border: 1.5px solid #10b981; border-radius: 12px; padding: 14px 12px; text-align: center; margin: 12px 0;">
      <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #34d399; margin-bottom: 6px;">6-Digit Verification Code</div>
      <div style="margin: 0 auto 10px auto;">
        <span style="display: inline-block; font-size: 26px; line-height: 1.2; letter-spacing: 5px; color: #ffffff; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 800; white-space: nowrap; -webkit-user-select: all; user-select: all;">${cleanOtp}</span>
      </div>
      <a href="${copyUrl}" style="display: inline-block; background-color: #059669; color: #ffffff; font-size: 12px; font-weight: 700; text-decoration: none; padding: 7px 14px; border-radius: 8px; white-space: nowrap;">Tap to Auto-Copy ${cleanOtp}</a>
    </div>
    <p style="font-size: 12px; color: #475569; line-height: 1.5; margin: 10px 0 0 0;">
      Expires in <strong>10 minutes</strong>. Ignore if you did not request this sign-in.
    </p>
  `;

  const html = renderSearchBizEmailHtml({
    role: 'noreply',
    compact: true,
    badgeText: 'South Africa Directory &bull; 2FA Verification',
    heroTitle,
    heroAccent,
    heroSubtitle: `Your SearchBiz verification code is ${cleanOtp}`,
    bodyHtml,
  });

  return await sendEmail({
    role: 'noreply',
    to: normalizedEmail,
    subject,
    html,
    text,
    from: `"SearchBiz 2FA (No-Reply)" <${noreplyEmail}>`,
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
    `Do not reply to ${noreplyEmail} (send-only 2FA address). Support: ${helpEmail}`,
  ].join('\n');

  const bodyHtml = `
    <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: 700; color: #0f172a;">Hello,</p>
    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.65; color: #334155;">
      You requested a password reset for your SearchBiz account. Click the button below to choose a new password. This link is valid for <strong>1 hour</strong>.
    </p>
    <p style="margin: 18px 0 0 0; font-size: 12.5px; color: #64748b; line-height: 1.55; border-top: 1px solid #e2e8f0; padding-top: 16px;">
      If you did not request this reset, you can safely ignore this email. Your password will remain unchanged.
    </p>
  `;

  const html = renderSearchBizEmailHtml({
    role: 'noreply',
    badgeText: 'South Africa Directory &bull; Security Reset',
    heroTitle: 'Password Reset',
    heroAccent: 'Request',
    heroSubtitle: 'Secure account recovery for your SearchBiz.co.za profile',
    bodyHtml,
    ctaLabel: 'Reset Password &rarr;',
    ctaUrl: resetLink,
  });

  return await sendEmail({
    role: 'noreply',
    to: normalizedEmail,
    subject: 'SearchBiz Password Reset Request',
    html,
    text,
    from: `"SearchBiz 2FA (No-Reply)" <${noreplyEmail}>`,
  });
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetLink: string
): Promise<boolean> {
  const res = await sendPasswordResetEmailDetailed(toEmail, resetLink);
  return res.success;
}
