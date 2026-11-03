import { withClient } from './db';
import type { Queryable } from './deletionLedger';
import { runRetentionSteps, runStatus, type StepsOutcome } from './retentionJob';
import { allRetentionDays, RETENTION_CHECK_INTERVAL_MS, RETENTION_MIN_INTERVAL_MS } from './retentionRules';
import { ensureUserSchema } from './users';

// The daily retention job: enforces src/lib/retentionRules.ts by running the steps in src/lib/retentionJob.ts, and
// records every run in "RetentionRuns" (shown on the Admin page's Data Retention section).
//
// Triggers:
//   - 'cron': a Render Cron Job calling POST /api/cron/retention with the RETENTION_CRON_SECRET (the primary
//     trigger; see docs/privacy.md for its setup). It runs even when no one is using the site.
//   - 'scheduler': this server, every 6 hours, if the last successful run is more than 20 hours old (the fallback).
//     Only in production, or when RETENTION_SCHEDULER=on, so `npm run dev` against a shared database never runs it.
//   - 'admin': the Admin page's Run Now.
// A session-level advisory lock means only one run happens at a time across every instance; a run that can't get
// the lock is skipped (the other run is doing the work).

const LOCK_KEY = "hashtext('talkninja_retention_job')";

export type RetentionTrigger = 'cron' | 'scheduler' | 'admin';

export type RetentionRunResult =
  | { skipped: true; reason: 'locked' | 'recent' }
  | ({ skipped: false; runId: number; status: 'ok' | 'partial' | 'failed' } & StepsOutcome);

export async function runRetention(trigger: RetentionTrigger, options: { onlyIfStale?: boolean } = {}): Promise<RetentionRunResult> {
  await ensureUserSchema();
  return withClient(async (client) => {
    const { rows: lock } = await client.query(`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS ok`);
    if (!lock[0]?.ok) return { skipped: true, reason: 'locked' } as const;
    try {
      if (options.onlyIfStale) {
        const { rows } = await client.query(
          `SELECT 1 FROM "RetentionRuns" WHERE status IN ('ok', 'partial') AND started_at > now() - make_interval(secs => $1)`,
          [RETENTION_MIN_INTERVAL_MS / 1000]
        );
        if (rows.length > 0) return { skipped: true, reason: 'recent' } as const;
      }
      const { rows: started } = await client.query(
        `INSERT INTO "RetentionRuns" (trigger, status) VALUES ($1, 'running') RETURNING id`,
        [trigger]
      );
      const runId = Number(started[0].id);
      const now = new Date();
      const outcome = await runRetentionSteps(client as unknown as Queryable, now, allRetentionDays(process.env));
      const status = runStatus(outcome);
      await client.query(
        `UPDATE "RetentionRuns" SET finished_at = now(), status = $2, results = $3, errors = $4 WHERE id = $1`,
        [runId, status, JSON.stringify(outcome.results), JSON.stringify(outcome.errors)]
      );
      const changed = Object.entries(outcome.results).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(' ');
      const log = `Retention run ${runId} (${trigger}): ${status}${changed ? `; ${changed}` : ''}`;
      if (status === 'ok') console.log(log);
      else console.error(`${log}; errors: ${JSON.stringify(outcome.errors)}`);
      return { skipped: false, runId, status, ...outcome };
    } finally {
      await client.query(`SELECT pg_advisory_unlock(${LOCK_KEY})`).catch(() => {});
    }
  });
}

export type RetentionRunRow = {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  trigger: string;
  status: string;
  results: Record<string, number>;
  errors: Record<string, string>;
};

export async function listRetentionRuns(limit = 10): Promise<RetentionRunRow[]> {
  await ensureUserSchema();
  return withClient(async (client) => {
    const { rows } = await client.query(
      `SELECT id, started_at, finished_at, trigger, status, results, errors FROM "RetentionRuns"
       ORDER BY started_at DESC, id DESC LIMIT $1`,
      [limit]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      startedAt: new Date(r.started_at).toISOString(),
      finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
      trigger: r.trigger,
      status: r.status,
      results: r.results ?? {},
      errors: r.errors ?? {},
    }));
  });
}

// A run that was interrupted (the server stopped mid-run) stays 'running'; mark it failed so the Admin page says so
async function markAbandonedRuns(): Promise<void> {
  await withClient((client) =>
    client.query(
      `UPDATE "RetentionRuns" SET status = 'failed', finished_at = now(), errors = '{"run":"Interrupted before it finished"}'
       WHERE status = 'running' AND started_at < now() - interval '1 hour'`
    )
  );
}

let started = false;

// Started by src/instrumentation.ts
export function startRetentionScheduler(): void {
  if (started) return;
  const enabled = process.env.RETENTION_SCHEDULER === 'on' || (process.env.NODE_ENV === 'production' && process.env.RETENTION_SCHEDULER !== 'off');
  if (!enabled || !process.env.DATABASE_URL) return;
  started = true;
  const tick = () => {
    void markAbandonedRuns()
      .then(() => runRetention('scheduler', { onlyIfStale: true }))
      .catch((error) => console.error('Retention scheduler error:', error instanceof Error ? error.message : error));
  };
  // A few minutes after start, so a deploy's first requests aren't slowed, then every 6 hours
  setTimeout(() => {
    tick();
    setInterval(tick, RETENTION_CHECK_INTERVAL_MS).unref();
  }, 5 * 60 * 1000).unref();
}
