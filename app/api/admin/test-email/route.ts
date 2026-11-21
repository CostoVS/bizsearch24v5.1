import { NextRequest, NextResponse } from 'next/server';
import {
  verifySmtpConnection,
  sendEmail,
  getSmtpConfig,
  getMailboxAddress,
  getAllMoxMailboxesSummary,
  renderSearchBizEmailHtml,
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
    const defaultTarget = role === 'noreply' ? getMailboxAddress('admin') : config.fromEmail;
    const targetEmail = body.to ? String(body.to).trim() : defaultTarget;

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

    const testHtml = renderSearchBizEmailHtml({
      role,
      heroTitle: 'SearchBiz Mox Mail',
      heroAccent: 'Verified Active',
      heroSubtitle: `Live verification test for the ${role} mailbox (${config.fromEmail})`,
      bodyHtml: `
        <p style="margin: 0 0 14px 0; color: #334155;">
          Your SearchBiz Mox Mail Server connection for the <strong>${role}</strong> mailbox is connected, authenticated, and operating normally.
        </p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; font-size: 13px; line-height: 1.8; color: #1e293b;">
          <div><strong>Mail Server:</strong> Mox (${config.host}:${config.port}, ${config.secure ? 'SSL/465' : 'TLS/587'})</div>
          <div><strong>Role:</strong> ${role}</div>
          <div><strong>Authenticated Account:</strong> ${config.user}</div>
          <div><strong>Sender Identity:</strong> ${config.fromEmail}</div>
          <div><strong>Reply Policy:</strong> ${role === 'noreply' ? 'Send-Only (No Replies Accepted)' : 'Replies Enabled'}</div>
          <div><strong>Test Target:</strong> ${targetEmail}</div>
          <div><strong>Timestamp:</strong> ${new Date().toLocaleString()}</div>
        </div>
      `,
      ctaLabel: 'Open SearchBiz.co.za &rarr;',
      ctaUrl: 'https://searchbiz.co.za',
    });

    const testResult = await sendEmail({
      role,
      to: targetEmail,
      subject: `SearchBiz Mox SMTP Verification [${role}] (${new Date().toLocaleTimeString()})`,
      html: testHtml,
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
