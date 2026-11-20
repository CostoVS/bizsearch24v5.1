import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/session';
import {
  getTwoFaResetRequests,
  resolveTwoFaResetRequestsForUser,
} from '@/lib/twofa-reset-requests';
import { getUsersList, saveUser } from '@/lib/auth-service';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function generateRandomBase32Secret(length = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

export async function GET(req: Request) {
  const adminUser = await requireAdminSession(req);
  if (!adminUser) {
    return NextResponse.json(
      { error: 'Admin authentication required.' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    requests: getTwoFaResetRequests(),
  });
}

export async function POST(req: Request) {
  try {
    const adminUser = await requireAdminSession(req);
    if (!adminUser) {
      return NextResponse.json(
        { error: 'Forbidden: Only the SearchBiz Administrator can approve or dismiss 2FA reset requests.' },
        { status: 403 }
      );
    }

    const { requestId, action, regenerateSecret } = await req.json();
    if (!requestId || (action !== 'approve' && action !== 'dismiss')) {
      return NextResponse.json(
        { error: 'requestId and valid action ("approve" or "dismiss") are required.' },
        { status: 400 }
      );
    }

    const allRequests = getTwoFaResetRequests();
    const targetReq = allRequests.find((r) => r.id === requestId);
    if (!targetReq) {
      return NextResponse.json({ error: '2FA reset request not found.' }, { status: 404 });
    }

    if (action === 'approve') {
      const users = await getUsersList();
      const user = users.find(
        (u) => u.email.trim().toLowerCase() === targetReq.email.trim().toLowerCase()
      );
      if (!user) {
        return NextResponse.json({ error: 'Target user account no longer exists.' }, { status: 404 });
      }
      user.hasSetup2FA = false;
      if (regenerateSecret) {
        user.secretKey = generateRandomBase32Secret(16);
      }
      await saveUser(user);
    }

    const resolved = resolveTwoFaResetRequestsForUser(
      targetReq.id,
      action === 'approve' ? 'APPROVED' : 'DISMISSED',
      adminUser.email
    );

    return NextResponse.json({
      success: true,
      request: resolved,
      requests: getTwoFaResetRequests(),
    });
  } catch (error: any) {
    console.error('Admin 2FA requests action error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process 2FA reset request.' },
      { status: 500 }
    );
  }
}
