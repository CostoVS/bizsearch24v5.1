import { NextResponse } from 'next/server';
import { EMAIL_VERIFIED_COOKIE_NAME, isHttpsRequest, SESSION_COOKIE_NAME } from '@/lib/session';

export async function POST(req: Request) {
  const res = NextResponse.json({ success: true });
  const secureCookie = isHttpsRequest(req);

  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    path: '/',
    maxAge: 0,
  });

  res.cookies.set(EMAIL_VERIFIED_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    path: '/',
    maxAge: 0,
  });

  return res;
}
