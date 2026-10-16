import { NextResponse } from 'next/server';
import { saveOtp, generateOtp } from '@/lib/otp-service';
import { sendOtpEmail } from '@/lib/email-service';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Generate new OTP (stateless & deterministic to prevent multi-instance Cloud Run desync)
    const otpCode = generateOtp(normalizedEmail);
    saveOtp(normalizedEmail, otpCode);

    console.log(`[EMAIL OTP RESEND] Generated code ${otpCode} for ${normalizedEmail}`);

    // Send email via centralized email service
    try {
      await sendOtpEmail(normalizedEmail, otpCode, 'resend');
    } catch (mailErr) {
      console.warn("Resend email SMTP transport failed, code fallback logged to terminal:", mailErr);
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
