import { NextResponse } from 'next/server';
import { getUsersList } from '@/lib/auth-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const users = await getUsersList();
  const partners = users
    .filter((u) => u.plan === 'PREMIUM' || u.role === 'ADMIN')
    .map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      plan: u.plan,
      businessName: u.businessName || '',
      location: u.address || 'South Africa',
    }));

  return NextResponse.json({ success: true, users: partners });
}
