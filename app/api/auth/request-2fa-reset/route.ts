import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/auth-service';
import { createTwoFaResetRequest } from '@/lib/twofa-reset-requests';
import { sendEmail, getMailboxAddress } from '@/lib/email-service';
import {
  EMAIL_VERIFIED_COOKIE_NAME,
  getCookieValue,
  verifyEmailVerifiedToken,
} from '@/lib/session';

export async function POST(req: Request) {
  try {
    const { email, reason } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const user = await getUserByEmail(String(email));
    if (!user) {
      return NextResponse.json({ error: 'User account not found.' }, { status: 404 });
    }

    const targetEmail = user.email.trim().toLowerCase();
    const challengeCookie = getCookieValue(req, EMAIL_VERIFIED_COOKIE_NAME);
    if (!verifyEmailVerifiedToken(challengeCookie, targetEmail)) {
      return NextResponse.json(
        {
          error:
            'Please verify your password and 6-digit email verification code first before requesting a 2FA reset.',
        },
        { status: 401 }
      );
    }

    if (!user.hasSetup2FA) {
      return NextResponse.json(
        { error: '2FA setup is not yet active on this account.' },
        { status: 400 }
      );
    }

    const requestRecord = createTwoFaResetRequest({
      userId: user.id,
      email: targetEmail,
      fullName: user.fullName,
      businessName: user.businessName,
      reason: typeof reason === 'string' ? reason : '',
    });

    // Notify Admin via Mox email (best effort, never blocks request creation)
    const adminEmail = getMailboxAddress('admin');
    sendEmail({
      role: 'noreply',
      to: adminEmail,
      subject: `SearchBiz 2FA Reset Request from ${targetEmail}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #ffffff; color: #0f172a;">
          <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #052e22;">New 2FA Reset Request</h2>
          <p style="font-size: 14px; color: #334155; line-height: 1.6;">A user has verified their password and email OTP and is requesting an Administrator to reset their Google Authenticator 2FA setup:</p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 16px 0; font-size: 13px; line-height: 1.7;">
            <div><strong>Email:</strong> ${targetEmail}</div>
            <div><strong>Name:</strong> ${user.fullName || 'Not provided'}</div>
            <div><strong>Business:</strong> ${user.businessName || 'Not provided'}</div>
            <div><strong>Reason:</strong> ${requestRecord.reason}</div>
            <div><strong>Requested At:</strong> ${new Date(requestRecord.requestedAt).toLocaleString()}</div>
          </div>
          <p style="font-size: 13px; color: #475569; margin: 0;">Go to the Admin Dashboard &rarr; Users &amp; Permissions to review and approve or dismiss this request.</p>
        </div>
      `,
    }).catch((err) => {
      console.warn('Failed to send 2FA reset notification to admin:', err);
    });

    return NextResponse.json({
      success: true,
      request: requestRecord,
      message:
        'Your 2FA reset request has been sent to the SearchBiz Administrator. Only the Admin can approve and reset your authenticator setup.',
    });
  } catch (error: any) {
    console.error('2FA Reset Request Error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while submitting your 2FA reset request.' },
      { status: 500 }
    );
  }
}
