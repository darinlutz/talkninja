import type { Queryable } from './deletionLedger.ts';
import { cutoff, type RetentionKey } from './retentionRules.ts';

// The retention job's steps (src/lib/retention.ts runs them daily). Each enforces one rule in
// src/lib/retentionRules.ts with one idempotent statement: running it again changes nothing more. Steps run one
// after another and each commits on its own, so one failing doesn't undo or stop the others; the failure is
// recorded and the next run tries again. All times are UTC; "now" is passed in, so tests can move the clock.
// Takes a client so the database tests (scripts/privacy-db.test.mjs) run the same code. Imports only plain .ts files.

export type StepName = RetentionKey | 'aiUsageOrphans' | 'expiredRateLimitOverrides';

type Step = { name: StepName; run: (client: Queryable, now: Date, days: Record<RetentionKey, number>) => Promise<number> };

const at = (now: Date, days: number) => new Date(cutoff(now.getTime(), days));

export const RETENTION_STEPS: Step[] = [
  {
    // Sessions' expires_at is ms since 1970 (BIGINT)
    name: 'expiredSessions',
    run: async (c, now, d) =>
      (await c.query('DELETE FROM "Sessions" WHERE expires_at < $1', [cutoff(now.getTime(), d.expiredSessions)])).rowCount ?? 0,
  },
  {
    name: 'expiredPasswordResets',
    run: async (c, now, d) =>
      (await c.query('DELETE FROM "PasswordResets" WHERE expires_at < $1', [cutoff(now.getTime(), d.expiredPasswordResets)]))
        .rowCount ?? 0,
  },
  {
    name: 'aiUsageIp',
    run: async (c, now, d) =>
      (
        await c.query('UPDATE "AiUsage" SET ip_address = NULL WHERE ip_address IS NOT NULL AND created_at < $1', [
          at(now, d.aiUsageIp),
        ])
      ).rowCount ?? 0,
  },
  {
    name: 'aiUsageRows',
    run: async (c, now, d) =>
      (await c.query('DELETE FROM "AiUsage" WHERE created_at < $1', [at(now, d.aiUsageRows)])).rowCount ?? 0,
  },
  {
    // Orphaned records: "AiUsage" has no foreign key, so rows of accounts deleted before the ledger existed (or by
    // hand) still carry their user ID. Deleting an account now unlinks them at once; this is the backstop.
    name: 'aiUsageOrphans',
    run: async (c) =>
      (
        await c.query(
          `UPDATE "AiUsage" a SET user_id = NULL
           WHERE a.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Users" u WHERE u.id = a.user_id)`
        )
      ).rowCount ?? 0,
  },
  {
    name: 'cancellationContact',
    run: async (c, now, d) =>
      (
        await c.query(
          `UPDATE "CancellationReason" SET user_name = NULL, email_address = NULL, notes = NULL, anonymized_at = $2
           WHERE anonymized_at IS NULL AND cancelled_at < $1`,
          [at(now, d.cancellationContact), now]
        )
      ).rowCount ?? 0,
  },
  {
    name: 'consentRecords',
    run: async (c, now, d) =>
      (await c.query('DELETE FROM "CookieConsents" WHERE recorded_at < $1', [at(now, d.consentRecords)])).rowCount ?? 0,
  },
  {
    name: 'deletionLedger',
    run: async (c, now, d) =>
      (await c.query('DELETE FROM "DeletionLedger" WHERE deleted_at < $1', [at(now, d.deletionLedger)])).rowCount ?? 0,
  },
  {
    // Admin overrides that have ended (also removed when the Rate Limiting section loads)
    name: 'expiredRateLimitOverrides',
    run: async (c, now) =>
      (await c.query('DELETE FROM "RateLimitOverrides" WHERE expires_at IS NOT NULL AND expires_at <= $1', [now]))
        .rowCount ?? 0,
  },
  {
    // Never deletes a run that is still going
    name: 'retentionRuns',
    run: async (c, now, d) =>
      (
        await c.query(`DELETE FROM "RetentionRuns" WHERE started_at < $1 AND status <> 'running'`, [
          at(now, d.retentionRuns),
        ])
      ).rowCount ?? 0,
  },
];

export type StepsOutcome = {
  results: Partial<Record<StepName, number>>;
  errors: Partial<Record<StepName, string>>;
};

// Runs every step, catching each one's error (only its message is kept: never data)
export async function runRetentionSteps(
  client: Queryable,
  now: Date,
  days: Record<RetentionKey, number>,
  steps: Step[] = RETENTION_STEPS
): Promise<StepsOutcome> {
  const outcome: StepsOutcome = { results: {}, errors: {} };
  for (const step of steps) {
    try {
      outcome.results[step.name] = await step.run(client, now, days);
    } catch (error) {
      outcome.errors[step.name] = error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
    }
  }
  return outcome;
}

export function runStatus(outcome: StepsOutcome): 'ok' | 'partial' | 'failed' {
  const failed = Object.keys(outcome.errors).length;
  if (failed === 0) return 'ok';
  return Object.keys(outcome.results).length === 0 ? 'failed' : 'partial';
}
