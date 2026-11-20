import { NextResponse } from 'next/server';
import { verifyOtp, deleteOtp } from '@/lib/otp-service';
import { getUserByEmail } from '@/lib/auth-service';
import { createEmailVerifiedToken, EMAIL_VERIFIED_COOKIE_NAME } from '@/lib/session';

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and verification code are required.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await getUserByEmail(normalizedEmail);
    const targetEmail = user ? user.email.trim().toLowerCase() : normalizedEmail;
    const cleanCode = code.trim();

    const isValid = verifyOtp(targetEmail, cleanCode);

    if (!isValid) {
      return NextResponse.json({ error: 'Incorrect or expired verification code. Please request a new code or try again.' }, { status: 400 });
    }

    // Success! Delete OTP so it cannot be reused
    deleteOtp(targetEmail);

    const res = NextResponse.json({
      success: true,
      email: targetEmail,
      message: 'Email successfully verified!'
    });

    res.cookies.set(EMAIL_VERIFIED_COOKIE_NAME, createEmailVerifiedToken(targetEmail), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 15 * 60,
    });

    return res;

  } catch (error: any) {
    console.error('Email OTP Verification Route Error:', error);
    return NextResponse.json({ error: 'An unexpected internal server error occurred.' }, { status: 500 });
  }
}
