import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, getMailboxAddress } from '@/lib/email-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      senderName = 'SearchBiz User',
      senderEmail = '',
      senderPhone = '',
      senderWhatsapp = '',
      senderAddress = '',
      details = '',
      chatTranscript = '',
      isGuest = false,
    } = body;

    if (!details || !String(details).trim()) {
      return NextResponse.json(
        { error: 'Please describe what you need help with.' },
        { status: 400 }
      );
    }

    const helpEmail = getMailboxAddress('help');
    const adminEmail = getMailboxAddress('admin');
    const cleanSenderEmail = String(senderEmail || '').trim().toLowerCase();

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #ffffff; color: #0f172a;">
        <div style="border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 16px;">
          <h2 style="margin: 0; font-size: 18px; color: #052e22;">New SearchBiz Support Escalation</h2>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Routed via SearchBiz Help Desk (${helpEmail})</p>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 13px; line-height: 1.7;">
          <div><strong>Account Type:</strong> ${isGuest ? 'Unregistered Guest' : 'Registered Member'}</div>
          <div><strong>Name:</strong> ${senderName}</div>
          <div><strong>Email:</strong> ${cleanSenderEmail || 'Not provided'}</div>
          ${senderPhone ? `<div><strong>Phone:</strong> ${senderPhone}</div>` : ''}
          ${senderWhatsapp ? `<div><strong>WhatsApp:</strong> ${senderWhatsapp}</div>` : ''}
          ${senderAddress ? `<div><strong>Address:</strong> ${senderAddress}</div>` : ''}
        </div>
        <h3 style="font-size: 14px; color: #0f172a; margin: 0 0 8px 0;">Support Inquiry Details</h3>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; font-size: 13px; color: #1e293b; white-space: pre-wrap;">${String(details).trim()}</div>
        ${
          chatTranscript
            ? `<h3 style="font-size: 13px; color: #475569; margin: 18px 0 8px 0;">AI Chat Context</h3>
               <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 12px; color: #475569; white-space: pre-wrap;">${String(chatTranscript).trim()}</div>`
            : ''
        }
      </div>
    `;

    const dispatchRes = await sendEmail({
      role: 'help',
      from: `"SearchBiz Support" <${helpEmail}>`,
      to: helpEmail,
      bcc: adminEmail !== helpEmail ? adminEmail : undefined,
      replyTo: cleanSenderEmail && cleanSenderEmail.includes('@') ? cleanSenderEmail : helpEmail,
      subject: `[Support Desk] Help request from ${senderName}`,
      html,
    });

    if (cleanSenderEmail && cleanSenderEmail.includes('@')) {
      sendEmail({
        role: 'help',
        from: `"SearchBiz Support" <${helpEmail}>`,
        to: cleanSenderEmail,
        replyTo: helpEmail,
        subject: 'We received your SearchBiz support request',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #ffffff; color: #0f172a;">
            <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #052e22;">SearchBiz Support Confirmation</h2>
            <p style="font-size: 14px; color: #334155; line-height: 1.6;">Hello ${senderName},</p>
            <p style="font-size: 14px; color: #334155; line-height: 1.6;">Thank you for contacting SearchBiz Support. Our team at <strong>${helpEmail}</strong> has received your request and will reply shortly.</p>
            <p style="font-size: 12px; color: #64748b; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 12px;">SearchBiz South Africa &bull; <a href="mailto:${helpEmail}" style="color: #059669;">${helpEmail}</a></p>
          </div>
        `,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      emailSent: dispatchRes.success,
      supportEmail: helpEmail,
      ...(dispatchRes.error ? { emailWarning: dispatchRes.error } : {}),
    });
  } catch (error: any) {
    console.error('[SupportEscalate] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to submit support request.' },
      { status: 500 }
    );
  }
}
