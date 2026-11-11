import { query } from './db';
import { ensureUserSchema } from './users';

// The Admin page's emergency stop for everything billed per use: every chat model call (chatModel/structuredModel
// in src/lib/aiModels.ts), text to speech (/api/speak) and Tavily image search (src/lib/imageSearch.ts). Each of
// those checks it itself, so no route can miss it, and aiRateLimit answers a clean 503 before any work. It stops
// everyone, Admins included, at once and without a redeploy, until an Admin turns AI back on.
// "SiteSettings" key ai_services: on (running) when there's no row. Read at most every 5 s per server.

const KEY = 'ai_services';
const CACHE_MS = 5_000;
let cached: { at: number; on: boolean } | null = null;

export const AI_STOPPED_MESSAGE = 'AI features are paused right now. Please try again later.';

export class AiServicesStoppedError extends Error {
  constructor() {
    super('AI services are stopped (Admin > Emergency AI Stop)');
    this.name = 'AiServicesStoppedError';
  }
}

export async function aiServicesOn(): Promise<boolean> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.on;
  try {
    await ensureUserSchema();
    const rows = await query<{ value: string }>('SELECT value FROM "SiteSettings" WHERE key = $1', [KEY]);
    cached = { at: Date.now(), on: rows.length === 0 || rows[0].value === 'true' };
  } catch (error) {
    // The database is down: keep the last answer, else stop (the rate limiter can't count calls either)
    console.error('Failed to read the AI emergency stop:', error);
    return cached?.on ?? false;
  }
  return cached.on;
}

// Throws AiServicesStoppedError while stopped
export async function assertAiServicesOn(): Promise<void> {
  if (!(await aiServicesOn())) throw new AiServicesStoppedError();
}

export type AiServicesStatus = { on: boolean; updatedAt: string | null; updatedBy: string | null };

// For the Admin page: the switch as stored (not cached), and who last changed it
export async function getAiServicesStatus(): Promise<AiServicesStatus> {
  await ensureUserSchema();
  const [row] = await query<{ value: string; updated_at: Date; user_name: string | null }>(
    `SELECT s.value, s.updated_at, u.user_name FROM "SiteSettings" s
     LEFT JOIN "Users" u ON u.id = s.updated_by WHERE s.key = $1`,
    [KEY]
  );
  if (!row) return { on: true, updatedAt: null, updatedBy: null };
  return { on: row.value === 'true', updatedAt: new Date(row.updated_at).toISOString(), updatedBy: row.user_name };
}

// userId is the Admin who flipped it. Other servers see it within CACHE_MS
export async function setAiServices(on: boolean, userId: number): Promise<void> {
  await ensureUserSchema();
  await query(
    `INSERT INTO "SiteSettings" (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [KEY, String(on), userId]
  );
  cached = { at: Date.now(), on };
}
