import { NextResponse } from 'next/server';
import { sendPasswordResetEmail } from '@/lib/email-service';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const host = req.headers.get('host');
    const protocol = host?.includes('localhost') || host?.includes('127.0.0.1') ? 'http' : 'https';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (host ? `${protocol}://${host}` : 'https://searchbiz.co.za');
    const mockResetToken = 'xyz123-reset-token';
    const resetLink = `${baseUrl}/reset-password?email=${encodeURIComponent(email)}&token=${mockResetToken}`;

    const sent = await sendPasswordResetEmail(email, resetLink);
    if (!sent) {
      return NextResponse.json({
        success: false,
        error: 'Failed to dispatch reset email via SMTP. Please try again or check SMTP configuration.'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset link has been sent to your email address successfully!'
    });
  } catch (error: any) {
    console.error('Password reset error:', error);
    return NextResponse.json({ error: 'An error occurred while processing your request.' }, { status: 500 });
  }
}
