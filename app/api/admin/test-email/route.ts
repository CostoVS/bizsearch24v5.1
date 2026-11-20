import { NextRequest, NextResponse } from 'next/server';
import {
  verifySmtpConnection,
  sendEmail,
  getSmtpConfig,
  getAllMoxMailboxesSummary,
  type EmailRole,
} from '@/lib/email-service';

export const dynamic = 'force-dynamic';

function parseRole(raw: unknown): EmailRole {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'noreply' || val === 'ai' || val === 'admin' || val === 'help') {
    return val;
  }
  return 'admin';
}

export async function GET(req: NextRequest) {
  const roleParam = req.nextUrl.searchParams.get('role');
  const role = parseRole(roleParam);
  const check = await verifySmtpConnection(role);
  return NextResponse.json({
    ...check,
    server: 'mox',
    mailboxes: getAllMoxMailboxesSummary(),
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const role = parseRole(body.role);
    const config = getSmtpConfig(role);
    const targetEmail = body.to ? String(body.to).trim() : config.fromEmail;

    const verifyResult = await verifySmtpConnection(role);
    if (!verifyResult.success) {
      return NextResponse.json(
        {
          success: false,
          server: 'mox',
          role,
          error: `Mox SMTP Verification Failed (${config.user}): ${verifyResult.message}`,
          config: verifyResult.config,
          mailboxes: getAllMoxMailboxesSummary(),
        },
        { status: 500 }
      );
    }

    const testResult = await sendEmail({
      role,
      to: targetEmail,
      subject: `SearchBiz Mox SMTP Verification [${role}] (${new Date().toLocaleTimeString()})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 24px; border: 1px solid #10b981; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #052e22; margin-top: 0;">SearchBiz Mox Mail Test Successful</h2>
          <p style="color: #334155; line-height: 1.6;">Your SearchBiz Mox Mail Server connection for the <strong>${role}</strong> mailbox is connected, authenticated, and operating normally.</p>
          <ul style="color: #475569; font-size: 13px; line-height: 1.8;">
            <li><strong>Mail Server:</strong> Mox (${config.host}:${config.port}, ${config.secure ? 'SSL/465' : 'TLS/587'})</li>
            <li><strong>Role:</strong> ${role}</li>
            <li><strong>Authenticated Account:</strong> ${config.user}</li>
            <li><strong>Sender Identity:</strong> ${config.fromEmail}</li>
            <li><strong>Test Target:</strong> ${targetEmail}</li>
            <li><strong>Timestamp:</strong> ${new Date().toLocaleString()}</li>
          </ul>
          <p style="color: #10b981; font-weight: bold; margin-bottom: 0;">Mox email subsystem is operational.</p>
        </div>
      `,
      text: `SearchBiz Mox Mail Test Successful [${role}]. Server: ${config.host}:${config.port}. Authenticated as: ${config.user}. Timestamp: ${new Date().toLocaleString()}`,
    });

    if (!testResult.success) {
      return NextResponse.json(
        {
          success: false,
          server: 'mox',
          role,
          error: `Mox send test failed (${config.user}): ${testResult.error}`,
          config: verifyResult.config,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      server: 'mox',
      role,
      message: `Test email dispatched via Mox (${config.fromEmail}) to ${targetEmail}! Message ID: ${testResult.messageId}`,
      messageId: testResult.messageId,
      recipient: targetEmail,
      config: verifyResult.config,
      mailboxes: getAllMoxMailboxesSummary(),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        server: 'mox',
        error: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
