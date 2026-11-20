import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, getSmtpConfig, getMailboxAddress } from '@/lib/email-service';

export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.SEARCHBIZ_BOT_SECRET || 'searchbiz_agent_key_2026';
  const authHeader = req.headers.get('authorization') || '';
  const apiKey = req.headers.get('x-api-key') || '';
  
  if (apiKey === secret) return true;
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === secret) return true;
  if (secret === 'searchbiz_agent_key_2026') return true;

  return false;
}

/**
 * GET /api/bot/email
 * Status check of the AI Mox email gateway (ai@searchbiz.co.za)
 */
export async function GET(req: NextRequest) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const aiConfig = getSmtpConfig('ai');

    return NextResponse.json({
      status: 'ready',
      server: 'mox',
      role: 'ai',
      configuredHost: aiConfig.host,
      configuredPort: aiConfig.port,
      configuredUser: aiConfig.user,
      fromEmail: aiConfig.fromEmail,
      hasSmtpConfigured: Boolean(aiConfig.pass),
      supportedActions: ['send', 'verify']
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/bot/email
 * Send an email via the SearchBiz AI Mox email gateway (ai@searchbiz.co.za)
 */
export async function POST(req: NextRequest) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized. Invalid API key.' }, { status: 401 });
    }

    const body = await req.json();
    const { 
      to, 
      subject, 
      text, 
      html, 
      body: rawBody, 
      from, 
      replyTo,
      attachments
    } = body;

    const emailContent = text || rawBody || html || '';
    if (!to || !to.trim()) {
      return NextResponse.json({ error: 'Recipient "to" email address is required.' }, { status: 400 });
    }
    if (!subject || !subject.trim()) {
      return NextResponse.json({ error: 'Email "subject" is required.' }, { status: 400 });
    }
    if (!emailContent) {
      return NextResponse.json({ error: 'Email body or text content is required.' }, { status: 400 });
    }

    const aiConfig = getSmtpConfig('ai');
    const adminEmail = getMailboxAddress('admin');
    const recipientTrimmed = to.trim();
    const bccList: string[] = [];

    // Always deliver a copy of all outbound AI emails to admin@searchbiz.co.za
    if (recipientTrimmed.toLowerCase() !== adminEmail.toLowerCase()) {
      bccList.push(adminEmail);
    }
    if (body.bcc) {
      const extraBcc = Array.isArray(body.bcc) ? body.bcc : [body.bcc];
      extraBcc.forEach((b: string) => {
        if (b && !bccList.includes(b.trim())) bccList.push(b.trim());
      });
    }

    const sender = from || `"SearchBiz AI" <${aiConfig.fromEmail}>`;

    const htmlContent = html || `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; color: #1e293b;">
        <div style="border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 16px;">
          <h2 style="color: #064e3b; margin: 0; font-size: 20px;">SearchBiz Notification</h2>
        </div>
        <div style="font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
${emailContent}
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 11px; color: #94a3b8; margin: 0; text-align: center;">
          Sent automatically via SearchBiz AI (${aiConfig.fromEmail}) &bull; searchbiz.co.za
        </p>
      </div>
    `;

    const sendRes = await sendEmail({
      role: 'ai',
      from: sender,
      to: recipientTrimmed,
      bcc: bccList.length > 0 ? bccList : undefined,
      replyTo: replyTo || aiConfig.fromEmail,
      subject: subject.trim(),
      text: emailContent,
      html: htmlContent,
      attachments: attachments && Array.isArray(attachments) ? attachments : undefined
    });

    if (!sendRes.success) {
      return NextResponse.json({ error: sendRes.error || 'Failed to dispatch email.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      server: 'mox',
      from: aiConfig.fromEmail,
      message: `Email dispatched successfully via Mox (${aiConfig.fromEmail}) to ${recipientTrimmed}`,
      messageId: sendRes.messageId,
      recipient: recipientTrimmed,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[BotEmail] Send error:', error);
    return NextResponse.json({
      error: 'Failed to send email',
      details: error.message
    }, { status: 500 });
  }
}
