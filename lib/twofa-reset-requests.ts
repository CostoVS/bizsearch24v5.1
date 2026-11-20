import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const PRIMARY_PATH = path.join(process.cwd(), '.data', '2fa-reset-requests.json');
const MIRROR_PATH = path.join(process.cwd(), 'data', '2fa-reset-requests.json');

export interface TwoFaResetRequest {
  id: string;
  userId: string;
  email: string;
  fullName?: string;
  businessName?: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'DISMISSED';
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

const globalRef = globalThis as unknown as {
  __searchbiz2faRequests?: TwoFaResetRequest[];
};

function readRequestsFromDisk(): TwoFaResetRequest[] {
  if (Array.isArray(globalRef.__searchbiz2faRequests)) {
    return globalRef.__searchbiz2faRequests;
  }
  for (const filePath of [PRIMARY_PATH, MIRROR_PATH]) {
    try {
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (Array.isArray(parsed)) {
          globalRef.__searchbiz2faRequests = parsed;
          return parsed;
        }
      }
    } catch {
      // Try next file
    }
  }
  globalRef.__searchbiz2faRequests = [];
  return [];
}

function writeRequestsToDisk(requests: TwoFaResetRequest[]): void {
  globalRef.__searchbiz2faRequests = requests;
  const serialized = JSON.stringify(requests, null, 2);
  for (const filePath of [PRIMARY_PATH, MIRROR_PATH]) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, serialized, 'utf-8');
    } catch (err) {
      console.warn(`Failed to write 2FA reset requests to ${filePath}:`, err);
    }
  }
}

export function getTwoFaResetRequests(): TwoFaResetRequest[] {
  return readRequestsFromDisk();
}

export function getPendingTwoFaResetRequest(email: string): TwoFaResetRequest | null {
  const normalized = email.trim().toLowerCase();
  const list = readRequestsFromDisk();
  return (
    list.find(
      (r) => r.email.trim().toLowerCase() === normalized && r.status === 'PENDING'
    ) || null
  );
}

export function createTwoFaResetRequest(input: {
  userId: string;
  email: string;
  fullName?: string;
  businessName?: string;
  reason?: string;
}): TwoFaResetRequest {
  const list = [...readRequestsFromDisk()];
  const normalizedEmail = input.email.trim().toLowerCase();
  const cleanReason =
    (input.reason || '').trim() ||
    'User lost access to their Google Authenticator app and requested an admin reset.';

  const existingIdx = list.findIndex(
    (r) => r.email.trim().toLowerCase() === normalizedEmail && r.status === 'PENDING'
  );

  if (existingIdx !== -1) {
    const updated: TwoFaResetRequest = {
      ...list[existingIdx],
      reason: cleanReason,
      requestedAt: new Date().toISOString(),
    };
    list[existingIdx] = updated;
    writeRequestsToDisk(list);
    return updated;
  }

  const created: TwoFaResetRequest = {
    id: `2fa-req-${crypto.randomUUID().slice(0, 8)}`,
    userId: input.userId,
    email: normalizedEmail,
    fullName: input.fullName || '',
    businessName: input.businessName || '',
    reason: cleanReason,
    status: 'PENDING',
    requestedAt: new Date().toISOString(),
  };

  list.unshift(created);
  writeRequestsToDisk(list.slice(0, 200));
  return created;
}

export function resolveTwoFaResetRequestsForUser(
  emailOrRequestId: string,
  status: 'APPROVED' | 'DISMISSED',
  adminEmail: string
): TwoFaResetRequest | null {
  const list = [...readRequestsFromDisk()];
  const needle = emailOrRequestId.trim().toLowerCase();
  let matched: TwoFaResetRequest | null = null;

  const updatedList = list.map((r) => {
    if (
      r.status === 'PENDING' &&
      (r.id.toLowerCase() === needle || r.email.trim().toLowerCase() === needle)
    ) {
      const next: TwoFaResetRequest = {
        ...r,
        status,
        resolvedAt: new Date().toISOString(),
        resolvedBy: adminEmail,
      };
      if (!matched) matched = next;
      return next;
    }
    return r;
  });

  if (matched) {
    writeRequestsToDisk(updatedList);
  }
  return matched;
}
