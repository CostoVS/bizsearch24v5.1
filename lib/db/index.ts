import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dns from 'dns/promises';
import * as schema from './schema';

interface DbRuntimeState {
  pool: Pool | null;
  db: ReturnType<typeof drizzle> | null;
  dbReadyPromise: Promise<boolean> | null;
  isDbOffline: boolean;
  lastOfflineCheck: number;
  offlineBackoffMs: number;
  hasRunMigrations: boolean;
  hasLoggedFallback: boolean;
}

const globalForDb = globalThis as typeof globalThis & {
  __searchbizDbState?: DbRuntimeState;
};

const state: DbRuntimeState = globalForDb.__searchbizDbState ??= {
  pool: null,
  db: null,
  dbReadyPromise: null,
  isDbOffline: false,
  lastOfflineCheck: 0,
  offlineBackoffMs: 60000,
  hasRunMigrations: false,
  hasLoggedFallback: false,
};

export let db: ReturnType<typeof drizzle> | null = state.db;
export let dbReadyPromise: Promise<boolean> | null = state.dbReadyPromise;

function syncExports() {
  db = state.db;
  dbReadyPromise = state.dbReadyPromise;
}

function getDbHost(connectionString: string): string {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return '';
  }
}

function isExpectedOfflineError(err: any): boolean {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  return (
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ECONNREFUSED' ||
    msg.includes('ENOTFOUND') ||
    msg.includes('EAI_AGAIN') ||
    msg.includes('ECONNREFUSED')
  );
}

export const markDbOffline = (backoffMs = 60000) => {
  state.isDbOffline = true;
  state.lastOfflineCheck = Date.now();
  state.offlineBackoffMs = backoffMs;
  const oldPool = state.pool;
  state.pool = null;
  state.db = null;
  state.dbReadyPromise = null;
  syncExports();
  if (oldPool) {
    oldPool.end().catch(() => {});
  }
};

export const isDbCurrentlyOffline = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return true;
  }
  if (state.isDbOffline) {
    if (Date.now() - state.lastOfflineCheck < state.offlineBackoffMs) {
      return true;
    }
    // Backoff expired, allow retry
    state.isDbOffline = false;
    markDbOfflineCleanupOnly();
  }
  return false;
};

function markDbOfflineCleanupOnly() {
  if (state.pool) {
    state.pool.end().catch(() => {});
  }
  state.pool = null;
  state.db = null;
  state.dbReadyPromise = null;
  syncExports();
}

export async function withDbTimeout<T>(promise: Promise<T>, timeoutMs = 800): Promise<T> {
  if (isDbCurrentlyOffline()) {
    throw new Error("DB currently flagged as offline");
  }

  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      markDbOffline(60000);
      reject(new Error(`DB Query timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

export const initDb = () => {
  if (isDbCurrentlyOffline()) {
    syncExports();
    return null;
  }
  if (state.db && state.pool) {
    syncExports();
    return state.db;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    markDbOffline(3600000);
    return null;
  }

  const dbHost = getDbHost(connectionString);

  try {
    state.pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 800,
      idleTimeoutMillis: 5000,
      max: 3,
    });

    state.pool.on('error', (err) => {
      if (isExpectedOfflineError(err)) {
        markDbOffline(err && (err as any).code === 'ENOTFOUND' ? 3600000 : 60000);
        return;
      }
      console.warn('SQL pool connection issue (falling back to JSON store):', err?.message || err);
      markDbOffline(60000);
    });

    // Run table setup ONLY ONCE per process lifetime
    if (!state.hasRunMigrations && !state.dbReadyPromise) {
      state.dbReadyPromise = (async () => {
        if (!state.pool) return false;

        try {
          if (dbHost && dbHost !== 'localhost' && dbHost !== '127.0.0.1' && dbHost !== '::1') {
            await dns.lookup(dbHost);
          }
        } catch (dnsErr: any) {
          if (!state.hasLoggedFallback) {
            state.hasLoggedFallback = true;
            console.info(`[DB] Host "${dbHost}" unavailable (${dnsErr?.code || 'ENOTFOUND'}) — using JSON store.`);
          }
          markDbOffline(3600000);
          return false;
        }

        const runMigrations = async (activePool: Pool) => {
          await activePool.query(`
            CREATE TABLE IF NOT EXISTS storage (
              key VARCHAR(255) PRIMARY KEY,
              data TEXT NOT NULL
            );
          `);
          await activePool.query(`
            CREATE TABLE IF NOT EXISTS users (
              id SERIAL PRIMARY KEY,
              email VARCHAR(255) NOT NULL UNIQUE,
              role VARCHAR(50) NOT NULL DEFAULT 'USER',
              plan VARCHAR(50) NOT NULL DEFAULT 'FREE',
              password_hash VARCHAR(255),
              password TEXT,
              secret_key VARCHAR(255),
              has_setup_2fa BOOLEAN DEFAULT FALSE,
              last_login_ip VARCHAR(45),
              device_info TEXT,
              location VARCHAR(255),
              phone VARCHAR(50),
              failed_attempts INT DEFAULT 0,
              is_locked BOOLEAN DEFAULT FALSE,
              full_name VARCHAR(255),
              address TEXT,
              business_name VARCHAR(255),
              business_category VARCHAR(255),
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);

          const columnsToAdd = [
            'phone VARCHAR(50)',
            'failed_attempts INT DEFAULT 0',
            'is_locked BOOLEAN DEFAULT FALSE',
            'full_name VARCHAR(255)',
            'address TEXT',
            'business_name VARCHAR(255)',
            'business_category VARCHAR(255)'
          ];

          for (const col of columnsToAdd) {
            try {
              await activePool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col};`);
            } catch {
              // Ignore
            }
          }

          await activePool.query(`
            CREATE TABLE IF NOT EXISTS ads (
              id SERIAL PRIMARY KEY,
              user_id INT NOT NULL,
              title VARCHAR(255) NOT NULL,
              category VARCHAR(100) NOT NULL,
              province VARCHAR(100) NOT NULL,
              location VARCHAR(255) NOT NULL,
              description TEXT NOT NULL,
              is_premium BOOLEAN DEFAULT FALSE,
              is_sponsor BOOLEAN DEFAULT FALSE,
              is_verified BOOLEAN DEFAULT FALSE,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);

          await activePool.query(`
            CREATE TABLE IF NOT EXISTS matomo_events (
              id VARCHAR(255) PRIMARY KEY,
              type VARCHAR(100) NOT NULL,
              path TEXT,
              title TEXT,
              referrer TEXT,
              query TEXT,
              ad_id TEXT,
              target_url TEXT,
              action TEXT,
              ip VARCHAR(100),
              city VARCHAR(100),
              region VARCHAR(100),
              country VARCHAR(100),
              browser VARCHAR(100),
              device VARCHAR(100),
              property_id VARCHAR(255) DEFAULT 'internal',
              timestamp VARCHAR(255),
              raw_json TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);

          await activePool.query(`
            CREATE TABLE IF NOT EXISTS matomo_properties (
              id VARCHAR(255) PRIMARY KEY,
              domain VARCHAR(255) NOT NULL UNIQUE,
              added VARCHAR(255),
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);
        };

        try {
          await withDbTimeout(runMigrations(state.pool), 1000);
          state.hasRunMigrations = true;
          console.log("Postgres tables checked/created successfully.");
          return true;
        } catch (err: any) {
          if (isExpectedOfflineError(err)) {
            if (!state.hasLoggedFallback) {
              state.hasLoggedFallback = true;
              console.info(`[DB] Postgres unavailable (${err?.code || err?.message}) — using JSON store.`);
            }
            markDbOffline(err?.code === 'ENOTFOUND' ? 3600000 : 60000);
          } else {
            console.warn("Primary DB connection check failed (falling back to JSON store):", err?.message || err);
            markDbOffline(60000);
          }
          return false;
        }
      })();
    }

    state.db = drizzle(state.pool, { schema });
    syncExports();
    return state.db;
  } catch (err: any) {
    if (!isExpectedOfflineError(err)) {
      console.warn("Failed to initialize pool (falling back to JSON store):", err?.message || err);
    }
    markDbOffline(60000);
    return null;
  }
};
