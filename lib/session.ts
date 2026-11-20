import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { getUserByEmail, type ServerUser } from './auth-service';

export const SESSION_COOKIE_NAME = 'sb_session';
export const EMAIL_VERIFIED_COOKIE_NAME = 'sb_email_verified';

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.OTP_SECRET ||
  'searchbiz_session_hmac_secret_2026_v1';

export interface SessionPayload {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  iat: number;
  exp: number;
}

export interface EmailVerifiedPayload {
  email: string;
  purpose: 'email_verified';
  iat: number;
  exp: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf-8');
}

export function signPayload<T extends object>(payload: T): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encoded}.${sig}`;
}

export function verifySignedPayload<T extends { exp?: number }>(token: string | undefined | null): T | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const bufA = Buffer.from(providedSig);
  const bufB = Buffer.from(expectedSig);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as T;
    if (parsed.exp && Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createSessionToken(user: Pick<ServerUser, 'id' | 'email' | 'role'>, ttlMs = 7 * 24 * 60 * 60 * 1000): string {
  const now = Date.now();
  return signPayload<SessionPayload>({
    id: user.id,
    email: user.email.trim().toLowerCase(),
    role: user.role,
    iat: now,
    exp: now + ttlMs,
  });
}

export function createEmailVerifiedToken(email: string, ttlMs = 15 * 60 * 1000): string {
  const now = Date.now();
  return signPayload<EmailVerifiedPayload>({
    email: email.trim().toLowerCase(),
    purpose: 'email_verified',
    iat: now,
    exp: now + ttlMs,
  });
}

export function verifyEmailVerifiedToken(token: string | undefined | null, expectedEmail: string): boolean {
  const parsed = verifySignedPayload<EmailVerifiedPayload>(token);
  if (!parsed || parsed.purpose !== 'email_verified') return false;
  return parsed.email.trim().toLowerCase() === expectedEmail.trim().toLowerCase();
}

function parseCookieHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  return undefined;
}

export function getCookieValue(req: NextRequest | Request, name: string): string | undefined {
  const nextReq = req as NextRequest;
  if (nextReq.cookies && typeof nextReq.cookies.get === 'function') {
    const val = nextReq.cookies.get(name)?.value;
    if (val) return val;
  }
  return parseCookieHeader(req.headers.get('cookie'), name);
}

export async function getAuthenticatedUser(req: NextRequest | Request): Promise<ServerUser | null> {
  const rawToken = getCookieValue(req, SESSION_COOKIE_NAME);
  const payload = verifySignedPayload<SessionPayload>(rawToken);
  if (!payload || !payload.email) return null;

  const user = await getUserByEmail(payload.email);
  if (!user || user.isLocked) return null;
  return user;
}

export function isOwnerAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return lower === 'nicholauscostochetty@gmail.com' || lower === 'admin';
}

export async function requireAdminSession(req: NextRequest | Request): Promise<ServerUser | null> {
  const user = await getAuthenticatedUser(req);
  if (!user) return null;
  if (user.role === 'ADMIN' || isOwnerAdminEmail(user.email)) {
    return user;
  }
  return null;
}
