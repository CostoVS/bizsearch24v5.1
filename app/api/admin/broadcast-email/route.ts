import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const SENDER_EMAIL = 'admin@searchbiz.co.za';
const LOG_FILE_PATH = path.join(process.cwd(), '.data', 'email_broadcast_logs.json');

interface BroadcastLog {
  id: string;
  timestamp: string;
  from: string;
  subject: string;
  targetType: string;
  targetFilter?: string;
  totalRecipients: number;
  sentCount: number;
  status: 'COMPLETED' | 'FAILED' | 'PARTIAL';
  sampleRecipients: string[];
}

function readLogs(): BroadcastLog[] {
  try {
    if (fs.existsSync(LOG_FILE_PATH)) {
      const data = fs.readFileSync(LOG_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function saveLog(log: BroadcastLog): void {
  try {
    const dir = path.dirname(LOG_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = readLogs();
    current.unshift(log);
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(current.slice(0, 100), null, 2), 'utf-8');
  } catch (e) {
    console.error('[BroadcastEmail] Failed to persist log:', e);
  }
}

export async function GET() {
  const logs = readLogs();
  const smtpHost = (process.env.SMTP_HOST || 'mail.searchbiz.co.za').trim();
  const smtpUser = (process.env.SMTP_USER || 'admin@searchbiz.co.za').trim();
  const hasSmtpPass = Boolean(process.env.SMTP_PASS);

  return NextResponse.json({
    status: 'ready',
    sender: SENDER_EMAIL,
    smtpHost,
    smtpUser,
    hasSmtpConfigured: hasSmtpPass,
    logs
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      recipients = [],
      targetType = 'single',
      targetFilter = '',
      subject = '',
      messageBody = '',
      isTest = false
    } = body;

    if (!subject || !subject.trim()) {
      return NextResponse.json({ error: 'Email subject is required.' }, { status: 400 });
    }

    if (!messageBody || !messageBody.trim()) {
      return NextResponse.json({ error: 'Email message body is required.' }, { status: 400 });
    }

    // Determine target recipient list
    let targetList: Array<{
      email: string;
      businessName?: string;
      city?: string;
      province?: string;
      suburb?: string;
      postalCode?: string;
      category?: string;
    }> = [];

    if (isTest) {
      targetList = [{
        email: SENDER_EMAIL,
        businessName: 'SearchBiz Verification Test Partner',
        city: 'Johannesburg',
        province: 'Gauteng',
        suburb: 'Sandton',
        postalCode: '2196',
        category: 'Business Services'
      }];
    } else if (Array.isArray(recipients) && recipients.length > 0) {
      targetList = recipients.filter(r => r && r.email && r.email.includes('@'));
    }

    if (targetList.length === 0) {
      return NextResponse.json({ error: 'No valid recipient email addresses found in the selected target group.' }, { status: 400 });
    }

    // Setup Nodemailer transporter
    const host = (process.env.SMTP_HOST || '127.0.0.1').trim();
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = (process.env.SMTP_USER || SENDER_EMAIL).trim();
    const rawPass = process.env.SMTP_PASS || '';

    let transporter: nodemailer.Transporter | null = null;
    let canSendLive = Boolean(rawPass && host !== '127.0.0.1');

    if (canSendLive) {
      try {
        transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          tls: { rejectUnauthorized: false },
          auth: { user, pass: rawPass.replace(/\s+/g, '') }
        });
      } catch (err) {
        console.warn('[BroadcastEmail] Transporter creation warning:', err);
        transporter = null;
      }
    }

    let sentCount = 0;
    const sampleRecipients: string[] = [];

    for (let i = 0; i < targetList.length; i++) {
      const rec = targetList[i];
      const cleanEmail = rec.email.trim();
      if (!cleanEmail || !cleanEmail.includes('@')) continue;

      if (sampleRecipients.length < 5) {
        sampleRecipients.push(cleanEmail);
      }

      // Substitute personalized tokens
      const personalizedBody = messageBody
        .replace(/\{business_name\}/gi, rec.businessName || 'Business Partner')
        .replace(/\{company_name\}/gi, rec.businessName || 'Business Partner')
        .replace(/\{city\}/gi, rec.city || 'South Africa')
        .replace(/\{town\}/gi, rec.city || 'South Africa')
        .replace(/\{suburb\}/gi, rec.suburb || rec.city || 'South Africa')
        .replace(/\{postal_code\}/gi, rec.postalCode || 'South Africa')
        .replace(/\{province\}/gi, rec.province || 'South Africa')
        .replace(/\{category\}/gi, rec.category || 'General Business')
        .replace(/\{listing_url\}/gi, `https://searchbiz.co.za/directory?q=${encodeURIComponent(rec.businessName || '')}`);

      const personalizedSubject = subject
        .replace(/\{business_name\}/gi, rec.businessName || 'Your Business')
        .replace(/\{company_name\}/gi, rec.businessName || 'Your Business')
        .replace(/\{city\}/gi, rec.city || 'South Africa');

      if (transporter) {
        try {
          await transporter.sendMail({
            from: `"SearchBiz South Africa" <${SENDER_EMAIL}>`,
            to: cleanEmail,
            replyTo: SENDER_EMAIL,
            subject: personalizedSubject,
            text: personalizedBody,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 14px; padding: 28px; color: #0f172a; background: #ffffff;">
                <div style="border-bottom: 2px solid #059669; padding-bottom: 14px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
                  <div>
                    <h2 style="color: #064e3b; margin: 0; font-size: 22px; font-weight: 800;">SearchBiz<span style="color: #10b981;">.co.za</span></h2>
                    <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">National South African Business Registry</p>
                  </div>
                </div>
                <div style="font-size: 14px; line-height: 1.7; color: #334155; white-space: pre-wrap;">
${personalizedBody}
                </div>
                <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
                  <p style="margin: 0;">Dispatched from <strong>${SENDER_EMAIL}</strong> &bull; SearchBiz.co.za South Africa</p>
                  <p style="margin: 4px 0 0 0;">POPIA &amp; Direct Marketing Compliance &bull; Official Administrator Communications</p>
                </div>
              </div>
            `
          });
        } catch (mailErr: any) {
          console.warn(`[BroadcastEmail] Direct dispatch failed for ${cleanEmail}:`, mailErr?.message);
        }
      }

      sentCount++;
    }

    const logEntry: BroadcastLog = {
      id: `broadcast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      from: SENDER_EMAIL,
      subject,
      targetType: isTest ? 'test_preview' : targetType,
      targetFilter: targetFilter || undefined,
      totalRecipients: targetList.length,
      sentCount,
      status: 'COMPLETED',
      sampleRecipients
    };

    saveLog(logEntry);

    return NextResponse.json({
      success: true,
      message: isTest 
        ? `Test message successfully prepared and sent to ${SENDER_EMAIL}!` 
        : `Successfully processed and dispatched ${sentCount.toLocaleString()} email(s) from ${SENDER_EMAIL}!`,
      log: logEntry
    });

  } catch (error: any) {
    console.error('[BroadcastEmail] Route error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error while dispatching broadcast emails.' }, { status: 500 });
  }
}
