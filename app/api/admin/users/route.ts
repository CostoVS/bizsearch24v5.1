import { NextResponse } from 'next/server';
import { deleteUserById, getUsersList, saveUser } from '@/lib/auth-service';
import { requireAdminSession } from '@/lib/session';
import { resolveTwoFaResetRequestsForUser } from '@/lib/twofa-reset-requests';
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

function sanitizeUser(u: any) {
  const { password, secretKey, ...safe } = u;
  return safe;
}

export async function GET(req: Request) {
  const adminUser = await requireAdminSession(req);
  if (!adminUser) {
    return NextResponse.json(
      { error: 'Admin authentication required. Please sign in again with your Admin 2FA session.' },
      { status: 401 }
    );
  }

  const users = await getUsersList();
  return NextResponse.json({ success: true, users: users.map(sanitizeUser) });
}

export async function PUT(req: Request) {
  try {
    const adminUser = await requireAdminSession(req);
    if (!adminUser) {
      return NextResponse.json(
        { error: 'Forbidden: Only an authenticated SearchBiz Administrator can modify users or reset 2FA.' },
        { status: 403 }
      );
    }

    const { id, plan, role, reset2FA, regenerateSecret, isLocked } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    const allUsers = await getUsersList();
    const userIndex = allUsers.findIndex((u) => u.id === id);
    if (userIndex === -1) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const targetUser = allUsers[userIndex];

    if (plan !== undefined) targetUser.plan = plan;
    if (role !== undefined) targetUser.role = role;
    if (typeof isLocked === 'boolean') {
      targetUser.isLocked = isLocked;
      if (!isLocked) {
        targetUser.failedAttempts = 0;
      }
    }

    if (reset2FA === true) {
      targetUser.hasSetup2FA = false;
      if (regenerateSecret === true) {
        targetUser.secretKey = generateRandomBase32Secret(16);
      }
      resolveTwoFaResetRequestsForUser(targetUser.email, 'APPROVED', adminUser.email);
    }

    await saveUser(targetUser);

    return NextResponse.json({ success: true, user: sanitizeUser(targetUser) });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: error.message || 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const adminUser = await requireAdminSession(req);
  if (!adminUser) {
    return NextResponse.json(
      { error: 'Forbidden: Only an authenticated SearchBiz Administrator can delete users.' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'No ID provided' }, { status: 400 });

  if (id === adminUser.id) {
    return NextResponse.json({ error: 'Cannot delete your own active administrator account.' }, { status: 400 });
  }

  try {
    const deleted = await deleteUserById(id);
    if (!deleted) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('DELETE user error:', e);
    return NextResponse.json({ error: e.message || 'Failed to delete user' }, { status: 500 });
  }
}
