import { NextRequest, NextResponse } from 'next/server';
import { verifySmtpConnection, sendEmail, getSmtpConfig } from '@/lib/email-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const check = await verifySmtpConnection();
  return NextResponse.json({
    ...check,
    timestamp: new Date().toISOString()
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const config = getSmtpConfig();
    const targetEmail = body.to ? String(body.to).trim() : config.user;

    const verifyResult = await verifySmtpConnection();
    if (!verifyResult.success) {
      return NextResponse.json({
        success: false,
        error: `SMTP Verification Failed: ${verifyResult.message}`,
        config: verifyResult.config
      }, { status: 500 });
    }

    const testResult = await sendEmail({
      to: targetEmail,
      subject: `✅ [SearchBiz Live Test] Email Dispatch Verification (${new Date().toLocaleTimeString()})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 24px; border: 1px solid #10b981; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #052e22; margin-top: 0;">🎉 SearchBiz Email Test Successful!</h2>
          <p style="color: #334155; line-height: 1.6;">Your SearchBiz Nodemailer SMTP service is connected, authenticated, and operating normally.</p>
          <ul style="color: #475569; font-size: 13px; line-height: 1.8;">
            <li><strong>SMTP Server:</strong> ${config.host}:${config.port} (Secure: ${config.secure ? 'SSL/465' : 'TLS/587'})</li>
            <li><strong>Authenticated Account:</strong> ${config.user}</li>
            <li><strong>Sender Identity:</strong> ${config.fromEmail}</li>
            <li><strong>Test Target:</strong> ${targetEmail}</li>
            <li><strong>Timestamp:</strong> ${new Date().toLocaleString()}</li>
          </ul>
          <p style="color: #10b981; font-weight: bold; margin-bottom: 0;">Your email subsystem is 100% operational!</p>
        </div>
      `,
      text: `SearchBiz Email Dispatch Verification Successful! SMTP host: ${config.host}:${config.port}. Authenticated as: ${config.user}. Timestamp: ${new Date().toLocaleString()}`
    });

    if (!testResult.success) {
      return NextResponse.json({
        success: false,
        error: `Send test failed: ${testResult.error}`,
        config: verifyResult.config
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Test email successfully dispatched to ${targetEmail}! Message ID: ${testResult.messageId}`,
      messageId: testResult.messageId,
      recipient: targetEmail,
      config: verifyResult.config,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message || String(err)
    }, { status: 500 });
  }
}
