import { NextResponse } from 'next/server';
import { saveOtp, generateOtp } from '@/lib/otp-service';
import { sendOtpEmailDetailed } from '@/lib/email-service';
import { getUserByEmail } from '@/lib/auth-service';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await getUserByEmail(normalizedEmail);
    const targetEmail = user ? user.email.trim().toLowerCase() : normalizedEmail;

    // Generate new OTP (stateless & deterministic to prevent multi-instance Cloud Run desync)
    const otpCode = generateOtp(targetEmail);
    saveOtp(targetEmail, otpCode);

    console.log(`[EMAIL OTP RESEND] Generated code ${otpCode} for ${targetEmail}`);

    // Send email via centralized email service
    const emailRes = await sendOtpEmailDetailed(targetEmail, otpCode, 'resend');
    if (!emailRes.success) {
      console.error(`[EMAIL OTP RESEND] SMTP failed for ${targetEmail}:`, emailRes.error);
      return NextResponse.json(
        {
          success: false,
          error: `Could not send verification email: ${emailRes.error || 'SMTP connection failed.'}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'A new 6-digit verification code has been sent to your email.'
    });

  } catch (error: any) {
    console.error('Email OTP Resend Route Error:', error);
    return NextResponse.json({ error: 'An unexpected internal server error occurred.' }, { status: 500 });
  }
}
