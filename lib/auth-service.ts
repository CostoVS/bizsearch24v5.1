import fs from 'fs';
import path from 'path';
import { db, initDb, dbReadyPromise, withDbTimeout, isDbCurrentlyOffline } from './db';
import { users } from './db/schema';
import { eq, sql } from 'drizzle-orm';

// Define structural backup files inside .data/ and data/ directories for durable persistence
const FILE_PATH = path.join(process.cwd(), '.data', 'users-db.json');
const MIRROR_FILE_PATH = path.join(process.cwd(), 'data', 'users-db.json');

const globalUsersRef = globalThis as unknown as {
  __searchbizUsersCache?: ServerUser[];
};

export interface ServerUser {
  id: string;
  email: string;
  password?: string;
  role: 'ADMIN' | 'USER';
  plan: 'FREE' | 'PREMIUM' | 'ESSENTIAL' | 'PRO' | 'SPONSOR';
  secretKey: string;
  hasSetup2FA: boolean;
  phone?: string;
  createdAt?: string;
  failedAttempts?: number;
  isLocked?: boolean;
  fullName?: string;
  address?: string;
  businessName?: string;
  businessCategory?: string;
  idNumber?: string;
  memberId?: string;
}

// Deterministic member ID generator per User Email (yields SB-XXXXXX reference format)
export function generateMemberId(email: string): string {
  const normalized = email.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const code = Math.abs(hash % 900000) + 100000; // 6 digit number
  return `SB-${code}`;
}

// Deterministic Base32 Secret Key Generator per User Email
export function getDeterministicSecretKey(email: string): string {
  const normalized = email.toLowerCase().trim();
  if (normalized === 'nicholauscostochetty@gmail.com') {
    return 'BS24KPGQY567ABCD'; // Keep original admin setup intact
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  let secret = 'BS24';
  for (let i = 0; i < 12; i++) {
    const val = Math.abs((hash + i * 31) % chars.length);
    secret += chars.charAt(val);
  }
  return secret;
}

// Initial Admin User Template
const DEFAULT_ADMIN: ServerUser = {
  id: 'admin-1',
  email: 'nicholauscostochetty@gmail.com',
  password: 'Nic6604211989!?',
  role: 'ADMIN',
  plan: 'PREMIUM',
  secretKey: 'BS24KPGQY567ABCD',
  hasSetup2FA: false,
  failedAttempts: 0,
  isLocked: false,
};

function normalizeUserList(parsed: ServerUser[]): { list: ServerUser[]; changed: boolean } {
  const adminWithId = { ...DEFAULT_ADMIN, memberId: generateMemberId(DEFAULT_ADMIN.email) };
  let changed = false;

  const normalized = parsed.map((u: ServerUser) => {
    const next = { ...u };
    if (!next.memberId) {
      next.memberId = generateMemberId(next.email);
      changed = true;
    }
    if (!next.secretKey) {
      next.secretKey = getDeterministicSecretKey(next.email);
      changed = true;
    }
    next.hasSetup2FA = Boolean(next.hasSetup2FA);
    return next;
  });

  if (
    !normalized.some(
      (u: ServerUser) =>
        u.email.trim().toLowerCase() === DEFAULT_ADMIN.email.trim().toLowerCase()
    )
  ) {
    normalized.push(adminWithId);
    changed = true;
  }

  return { list: normalized, changed };
}

// Direct File Operations (Fallback + Durable Cache)
function readUsersBackup(): ServerUser[] {
  if (Array.isArray(globalUsersRef.__searchbizUsersCache) && globalUsersRef.__searchbizUsersCache.length > 0) {
    return globalUsersRef.__searchbizUsersCache;
  }

  const adminWithId = { ...DEFAULT_ADMIN, memberId: generateMemberId(DEFAULT_ADMIN.email) };

  for (const candidatePath of [FILE_PATH, MIRROR_FILE_PATH]) {
    try {
      if (fs.existsSync(candidatePath)) {
        const data = fs.readFileSync(candidatePath, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const { list, changed } = normalizeUserList(parsed);
          globalUsersRef.__searchbizUsersCache = list;
          if (changed || candidatePath !== FILE_PATH) {
            writeUsersBackup(list);
          }
          return list;
        }
      }
    } catch (error) {
      console.error(`Failed to read users JSON backup from ${candidatePath}:`, error);
    }
  }

  const initial = [adminWithId];
  writeUsersBackup(initial);
  return initial;
}

function writeUsersBackup(usersList: ServerUser[]) {
  globalUsersRef.__searchbizUsersCache = usersList;
  const serialized = JSON.stringify(usersList, null, 2);

  for (const targetPath of [FILE_PATH, MIRROR_FILE_PATH]) {
    try {
      const fileDir = path.dirname(targetPath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }
      fs.writeFileSync(targetPath, serialized, 'utf-8');
    } catch (error) {
      console.error(`Failed to write users JSON backup to ${targetPath}:`, error);
    }
  }
}

// Unified Service API
export async function getUsersList(): Promise<ServerUser[]> {
  const backupUsers = readUsersBackup();

  try {
    const dClient = initDb();
    if (dClient) {
      if (dbReadyPromise) {
        await withDbTimeout(dbReadyPromise, 600).catch(() => {});
      }
      if (isDbCurrentlyOffline() || !db) {
        return backupUsers;
      }
      const dbUsers = await withDbTimeout(dClient.select().from(users), 1000);

      const list: ServerUser[] = [];
      if (dbUsers) {
        dbUsers.forEach((u: any) => {
          const backupU = backupUsers.find(
            (bu) => bu.email.trim().toLowerCase() === u.email.trim().toLowerCase()
          );
          list.push({
            id: backupU?.id || String(u.id),
            email: u.email,
            password: u.password || backupU?.password || '',
            role: (u.role as 'ADMIN' | 'USER') || 'USER',
            plan: (u.plan as 'FREE' | 'PREMIUM' | 'ESSENTIAL' | 'PRO' | 'SPONSOR') || 'FREE',
            secretKey: backupU?.secretKey || u.secretKey || getDeterministicSecretKey(u.email),
            // Never allow a stale DB false row to overwrite an already-verified backup user
            hasSetup2FA: Boolean(u.hasSetup2FA || backupU?.hasSetup2FA),
            phone: u.phone || backupU?.phone || undefined,
            failedAttempts: u.failedAttempts ?? backupU?.failedAttempts ?? 0,
            isLocked: Boolean(u.isLocked ?? backupU?.isLocked),
            fullName: u.fullName || backupU?.fullName || undefined,
            address: u.address || backupU?.address || undefined,
            businessName: u.businessName || backupU?.businessName || undefined,
            businessCategory: u.businessCategory || backupU?.businessCategory || undefined,
            idNumber: backupU?.idNumber || undefined,
            memberId: backupU?.memberId || generateMemberId(u.email),
          });
        });
      }

      // Add any users that exist in the backup but are not yet synced to the database
      backupUsers.forEach((backupUser) => {
        if (!list.some((u) => u.email.trim().toLowerCase() === backupUser.email.trim().toLowerCase())) {
          list.push(backupUser);
        }
      });

      writeUsersBackup(list);
      return list;
    }
  } catch (err) {
    // Database check failed or timed out - silently fall back to local JSON file / RAM cache
  }

  return backupUsers;
}

export async function saveUser(newUser: ServerUser): Promise<boolean> {
  const fileUsers = [...readUsersBackup()];
  const normalizedTarget = newUser.email.trim().toLowerCase();
  const existingIndex = fileUsers.findIndex(
    (u: any) => u.email.trim().toLowerCase() === normalizedTarget
  );

  const updatedUser: ServerUser = {
    ...newUser,
    email: normalizedTarget,
    secretKey: newUser.secretKey || getDeterministicSecretKey(normalizedTarget),
    hasSetup2FA: Boolean(newUser.hasSetup2FA),
    memberId: newUser.memberId || generateMemberId(normalizedTarget),
  };

  if (existingIndex !== -1) {
    fileUsers[existingIndex] = { ...fileUsers[existingIndex], ...updatedUser };
  } else {
    fileUsers.push(updatedUser);
  }
  writeUsersBackup(fileUsers);

  // Sync to database if available
  try {
    const dClient = initDb();
    if (dClient) {
      if (dbReadyPromise) {
        await withDbTimeout(dbReadyPromise, 600).catch(() => {});
      }
      if (isDbCurrentlyOffline() || !db) {
        return true;
      }
      const existingDb = await withDbTimeout(
        dClient
          .select()
          .from(users)
          .where(sql`LOWER(${users.email}) = ${normalizedTarget}`),
        1500
      );
      if (existingDb && existingDb.length > 0) {
        await withDbTimeout(
          dClient
            .update(users)
            .set({
              email: normalizedTarget,
              password: updatedUser.password,
              role: updatedUser.role,
              plan: updatedUser.plan,
              secretKey: updatedUser.secretKey,
              hasSetup2FA: updatedUser.hasSetup2FA,
              phone: updatedUser.phone,
              failedAttempts: updatedUser.failedAttempts,
              isLocked: updatedUser.isLocked,
              fullName: updatedUser.fullName,
              address: updatedUser.address,
              businessName: updatedUser.businessName,
              businessCategory: updatedUser.businessCategory,
            })
            .where(eq(users.id, existingDb[0].id)),
          1500
        );
      } else {
        await withDbTimeout(
          dClient.insert(users).values({
            email: normalizedTarget,
            password: updatedUser.password,
            role: updatedUser.role,
            plan: updatedUser.plan,
            secretKey: updatedUser.secretKey,
            hasSetup2FA: updatedUser.hasSetup2FA,
            phone: updatedUser.phone,
            failedAttempts: updatedUser.failedAttempts,
            isLocked: updatedUser.isLocked,
            fullName: updatedUser.fullName,
            address: updatedUser.address,
            businessName: updatedUser.businessName,
            businessCategory: updatedUser.businessCategory,
          }),
          1500
        );
      }
      return true;
    }
  } catch (dbErr) {
    console.warn('Failed to sync saved user on PostgreSQL, file backup is safe:', (dbErr as any).message);
  }

  return true;
}

export async function deleteUserById(id: string): Promise<boolean> {
  const fileUsers = [...readUsersBackup()];
  const userToDelete = fileUsers.find((u) => u.id === id);
  if (!userToDelete) return false;

  const updatedUsers = fileUsers.filter((u) => u.id !== id);
  writeUsersBackup(updatedUsers);

  try {
    const dClient = initDb();
    if (dClient) {
      if (dbReadyPromise) {
        await withDbTimeout(dbReadyPromise, 600).catch(() => {});
      }
      if (!isDbCurrentlyOffline() && db) {
        await withDbTimeout(
          dClient
            .delete(users)
            .where(sql`LOWER(${users.email}) = ${userToDelete.email.trim().toLowerCase()}`),
          1500
        );
      }
    }
  } catch (dbErr) {
    if (!isDbCurrentlyOffline()) {
      console.warn('Failed to delete user on PostgreSQL:', (dbErr as any).message);
    }
  }

  return true;
}

export async function getUserByEmail(email: string): Promise<ServerUser | null> {
  const usersList = await getUsersList();
  let lowerEmail = email.trim().toLowerCase();
  if (lowerEmail === 'admin') {
    lowerEmail = 'nicholauscostochetty@gmail.com';
  }
  const user = usersList.find((u: any) => u.email.trim().toLowerCase() === lowerEmail);
  return user || null;
}

const IP_BIND_FILE = path.join(process.cwd(), '.data', 'ip-bindings-db.json');

export function getIpBindings(): Record<string, string> {
  try {
    if (fs.existsSync(IP_BIND_FILE)) {
      return JSON.parse(fs.readFileSync(IP_BIND_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error("Failed to read IP bindings file, returning empty map:", e);
  }
  return {};
}

export function saveIpBinding(ip: string, email: string) {
  try {
    const fileDir = path.dirname(IP_BIND_FILE);
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }
    const binds = getIpBindings();
    binds[ip] = email;
    fs.writeFileSync(IP_BIND_FILE, JSON.stringify(binds, null, 2), 'utf-8');
  } catch (e) {
    console.error("Failed to write IP binding:", e);
  }
}
