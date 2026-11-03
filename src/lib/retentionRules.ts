// How long each kind of data is kept, enforced by the daily retention job (src/lib/retention.ts). Pure (no imports),
// so the job, the Privacy Policy (src/lib/legal.ts), the Admin page and the Node tests share one set of numbers.
// Approved by the owner on 2026-11-03. Each period can be changed on the server with its environment variable
// (RETENTION_<KEY>_DAYS, e.g. RETENTION_AI_USAGE_IP_DAYS=60), but never below its minimum; an invalid value keeps
// the default. Changing a period changes what the Privacy Policy promises: update its text and version too.

export type RetentionRule = {
  // What the job does when the period has passed
  action: 'delete' | 'anonymize';
  days: number;
  // The shortest period the environment may set (protects against a typo deleting live data)
  minDays: number;
  env: string;
  // For the Admin page and the docs
  description: string;
};

export const RETENTION_RULES = {
  // Sessions and reset links stop working at expires_at; the rows are deleted a week later
  expiredSessions: {
    action: 'delete',
    days: 7,
    minDays: 0,
    env: 'RETENTION_EXPIRED_SESSIONS_DAYS',
    description: 'Sign-in sessions, deleted this many days after they expire',
  },
  expiredPasswordResets: {
    action: 'delete',
    days: 7,
    minDays: 0,
    env: 'RETENTION_EXPIRED_PASSWORD_RESETS_DAYS',
    description: 'Password reset links, deleted this many days after they expire',
  },
  // IP addresses are only needed for the AI limits of visitors who aren't signed in (windows of a month at most)
  // and for abuse investigation
  aiUsageIp: {
    action: 'anonymize',
    days: 90,
    minDays: 35,
    env: 'RETENTION_AI_USAGE_IP_DAYS',
    description: 'IP addresses in AI usage records, removed after this many days',
  },
  aiUsageRows: {
    action: 'delete',
    days: 400,
    minDays: 35,
    env: 'RETENTION_AI_USAGE_DAYS',
    description: 'AI usage records (feature, model, tokens), deleted after this many days',
  },
  // The reason is kept for product statistics; who cancelled, and their free-text notes, are removed
  cancellationContact: {
    action: 'anonymize',
    days: 730,
    minDays: 30,
    env: 'RETENTION_CANCELLATION_CONTACT_DAYS',
    description: 'Name, email address and notes on cancellation reasons, removed after this many days',
  },
  consentRecords: {
    action: 'delete',
    days: 1095,
    minDays: 365,
    env: 'RETENTION_CONSENT_RECORDS_DAYS',
    description: 'Cookie choice records, deleted after this many days',
  },
  deletionLedger: {
    action: 'delete',
    days: 1095,
    minDays: 365,
    env: 'RETENTION_DELETION_LEDGER_DAYS',
    description: 'Account deletion ledger entries (account ID and dates only), deleted after this many days',
  },
  retentionRuns: {
    action: 'delete',
    days: 365,
    minDays: 30,
    env: 'RETENTION_RUNS_DAYS',
    description: 'Records of retention job runs, deleted after this many days',
  },
} as const satisfies Record<string, RetentionRule>;

export type RetentionKey = keyof typeof RETENTION_RULES;
export const RETENTION_KEYS = Object.keys(RETENTION_RULES) as RetentionKey[];

// The period in force for a rule: the environment's value when it's a whole number at or above the minimum (and at
// most 10 years), otherwise the default
export function retentionDays(key: RetentionKey, env: Record<string, string | undefined> = {}): number {
  const rule: RetentionRule = RETENTION_RULES[key];
  const raw = env[rule.env];
  if (raw === undefined || raw.trim() === '') return rule.days;
  const days = Number(raw);
  return Number.isInteger(days) && days >= rule.minDays && days <= 3650 ? days : rule.days;
}

export function allRetentionDays(env: Record<string, string | undefined> = {}): Record<RetentionKey, number> {
  return Object.fromEntries(RETENTION_KEYS.map((key) => [key, retentionDays(key, env)])) as Record<RetentionKey, number>;
}

// The cutoff instant for a rule: anything older than this (ms since 1970, UTC) is past its period
export function cutoff(now: number, days: number): number {
  return now - days * 24 * 60 * 60 * 1000;
}

// How often the in-process scheduler checks, and how old the last successful run must be before it runs again.
// The Render Cron Job (POST /api/cron/retention) is the primary trigger; this is the fallback.
export const RETENTION_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const RETENTION_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;

// Data kept for the life of the account (deleted with it), for the Privacy Policy and the data summary
export const KEPT_FOR_ACCOUNT_LIFETIME = [
  'Account details (name, email address, password hash, languages, role, subscription status)',
  'Belts and learning progress',
  'Training and test results (scores, dates, levels)',
  'Custom training instructions',
  'Terms of Service acceptances',
] as const;
