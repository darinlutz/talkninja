// The Admin page's Rate Limiting settings: how many AI calls signed-in users (and visitors who aren't signed in,
// counted by IP address) may make in a period, the options its boxes offer, and their defaults. No imports, so
// client components can use it; src/lib/rateLimits.ts stores the settings in "SiteSettings" (key rate_limits)
// and enforces them.

// Every AI route, one feature each. A new AI route needs a feature here, with a label and a default weight
// below, and calls aiRateLimit (src/lib/rateLimits.ts) with it.
export const RATE_LIMITED_FEATURES = [
  'translate',
  'uiTranslate',
  'friendChat',
  'grammarCheck',
  'wordAlignment',
  'practiceSentence',
  'readingTest',
  'writingTest',
  'speech',
] as const;

export type RateLimitedFeature = (typeof RATE_LIMITED_FEATURES)[number];

export const isRateLimitedFeature = (value: unknown): value is RateLimitedFeature =>
  (RATE_LIMITED_FEATURES as readonly string[]).includes(value as string);

// What the Admin page calls each route's feature
export const RATE_LIMITED_FEATURE_LABELS: Record<RateLimitedFeature, string> = {
  translate: 'Translator (/api/translate)',
  uiTranslate: 'Page translation (/api/ui-translate)',
  friendChat: 'AI Friend (/api/friend)',
  grammarCheck: 'AI Friend grammar check (/api/friend/check)',
  wordAlignment: 'Word alignment (/api/language/align)',
  practiceSentence: 'Practice sentence (/api/language)',
  readingTest: 'Reading Test (/api/language/reading-test)',
  writingTest: 'Training & Writing Test (/api/language/writing-test)',
  speech: 'Text to speech (/api/speak)',
};

// Signed-in users, plus visitors who aren't signed in, whose calls are counted by IP address
export const LIMIT_TIERS = ['Anonymous', 'User'] as const;
export type LimitTier = (typeof LIMIT_TIERS)[number];

export const LIMIT_TIER_LABELS: Record<LimitTier, string> = { Anonymous: 'Not signed in', User: 'User' };

export const PERIODS = ['hour', 'day', 'week', 'month'] as const;
export type Period = (typeof PERIODS)[number];

// How long each period is for a rolling window (a month is 30 days)
export const PERIOD_SECONDS: Record<Period, number> = {
  hour: 3600,
  day: 86400,
  week: 7 * 86400,
  month: 30 * 86400,
};

// Rolling: the last hour/day/week/30 days. Calendar: since the start of the current hour, day, week (Monday)
// or month, in UTC, so everyone's count resets at the same moment
export const RESET_STYLES = ['rolling', 'calendar'] as const;
export type ResetStyle = (typeof RESET_STYLES)[number];

// Roles that are never limited: none, or Admins
export const EXEMPT_ROLES = ['none', 'admins'] as const;
export type ExemptRoles = (typeof EXEMPT_ROLES)[number];

// When the current window began: the last hour/day/week/30 days, or since the start of this hour, day, week
// (Monday) or month in UTC
export function windowStart(period: Period, style: ResetStyle, now = new Date()): Date {
  if (style === 'rolling') return new Date(now.getTime() - PERIOD_SECONDS[period] * 1000);
  const d = new Date(now);
  if (period === 'hour') d.setUTCMinutes(0, 0, 0);
  else {
    d.setUTCHours(0, 0, 0, 0);
    if (period === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    if (period === 'month') d.setUTCDate(1);
  }
  return d;
}

export function calendarWindowEnd(period: Period, start: Date): Date {
  const d = new Date(start);
  if (period === 'hour') d.setUTCHours(d.getUTCHours() + 1);
  else if (period === 'day') d.setUTCDate(d.getUTCDate() + 1);
  else if (period === 'week') d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

// A limit in weighted calls per period: null is unlimited, 0 is no AI at all
export type LimitRule = { limit: number | null; period: Period };

export type RateLimitSettings = {
  // Off: every call is still logged (and shows in the usage report), but nothing is limited
  enabled: boolean;
  resetStyle: ResetStyle;
  exemptRoles: ExemptRoles;
  tiers: Record<LimitTier, LimitRule>;
  // At most this many AI calls in any minute, against scripts and repeated clicks; null is off
  burst: Record<LimitTier, number | null>;
  // A cap on everyone at one IP address together, signed in or not (several accounts on one network)
  ip: LimitRule;
  // What one call of each feature counts against the limit: a route that makes several model calls can count
  // more. 0 means the feature isn't limited (its calls are still logged)
  weights: Record<RateLimitedFeature, number>;
};

// The boxes' choices. Limits and bursts are in weighted calls; null is Unlimited (or Off for a burst)
export const LIMIT_OPTIONS: (number | null)[] = [0, 1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 5000, null];
export const BURST_OPTIONS: (number | null)[] = [null, 1, 2, 3, 5, 10, 20, 30, 60, 120];
export const WEIGHT_OPTIONS = [0, 1, 2, 3, 5, 10];

// How long an override lasts; null is until it's removed
export const OVERRIDE_DURATIONS = [3600, 86400, 7 * 86400, 30 * 86400, 90 * 86400, null] as const;
export type OverrideDuration = (typeof OVERRIDE_DURATIONS)[number];

export const OVERRIDE_DURATION_LABELS: Record<string, string> = {
  '3600': '1 hour',
  '86400': '1 day',
  '604800': '7 days',
  '2592000': '30 days',
  '7776000': '90 days',
  never: 'Until removed',
};

// An override for one user or one IP address: blocked from AI, unlimited, or a limit of its own in place of
// the User limit (for an IP address, in place of the IP cap and the Anonymous limit)
export const OVERRIDE_MODES = ['custom', 'unlimited', 'blocked'] as const;
export type OverrideMode = (typeof OVERRIDE_MODES)[number];

export type RateLimitOverride = {
  id: number;
  kind: 'user' | 'ip';
  userId: number | null;
  userName: string | null;
  emailAddress: string | null;
  ipAddress: string | null;
  mode: OverrideMode;
  limit: number | null;
  period: Period;
  note: string;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string | null;
};

// The usage report's time ranges
export const USAGE_RANGES = ['hour', 'day', 'week', 'month', 'all'] as const;
export type UsageRange = (typeof USAGE_RANGES)[number];

// A Training session or test makes several AI calls per question (a sentence, its alignment, its voice), so the
// User limit is generous. Page translation runs on every page view, so it doesn't count.
export const DEFAULT_RATE_LIMITS: RateLimitSettings = {
  enabled: false,
  resetStyle: 'rolling',
  exemptRoles: 'admins',
  tiers: {
    Anonymous: { limit: 0, period: 'day' },
    User: { limit: 1000, period: 'day' },
  },
  burst: { Anonymous: 2, User: 60 },
  ip: { limit: null, period: 'day' },
  weights: {
    translate: 1,
    uiTranslate: 0,
    friendChat: 1,
    grammarCheck: 1,
    wordAlignment: 1,
    practiceSentence: 1,
    readingTest: 1,
    writingTest: 1,
    speech: 1,
  },
};

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T => values.includes(value as T);

function parseLimit(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000 ? value : fallback;
}

function parseRule(value: unknown, fallback: LimitRule): LimitRule {
  const v = (value ?? {}) as Partial<LimitRule>;
  return {
    limit: 'limit' in v ? parseLimit(v.limit, fallback.limit) : fallback.limit,
    period: isOneOf(PERIODS, v.period) ? v.period : fallback.period,
  };
}

// Settings from stored or posted JSON; anything missing or invalid keeps its default (or `base`'s), so settings
// saved before a new option was added still load
export function parseRateLimitSettings(value: unknown, base: RateLimitSettings = DEFAULT_RATE_LIMITS): RateLimitSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const tiers = (v.tiers && typeof v.tiers === 'object' ? v.tiers : {}) as Record<string, unknown>;
  const burst = (v.burst && typeof v.burst === 'object' ? v.burst : {}) as Record<string, unknown>;
  const weights = (v.weights && typeof v.weights === 'object' ? v.weights : {}) as Record<string, unknown>;
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : base.enabled,
    resetStyle: isOneOf(RESET_STYLES, v.resetStyle) ? v.resetStyle : base.resetStyle,
    exemptRoles: isOneOf(EXEMPT_ROLES, v.exemptRoles) ? v.exemptRoles : base.exemptRoles,
    tiers: Object.fromEntries(LIMIT_TIERS.map((tier) => [tier, parseRule(tiers[tier], base.tiers[tier])])) as Record<LimitTier, LimitRule>,
    burst: Object.fromEntries(
      LIMIT_TIERS.map((tier) => [tier, tier in burst ? parseLimit(burst[tier], base.burst[tier]) : base.burst[tier]])
    ) as Record<LimitTier, number | null>,
    ip: parseRule(v.ip, base.ip),
    weights: Object.fromEntries(
      RATE_LIMITED_FEATURES.map((feature) => {
        const w = weights[feature];
        return [feature, typeof w === 'number' && Number.isInteger(w) && w >= 0 && w <= 100 ? w : base.weights[feature]];
      })
    ) as Record<RateLimitedFeature, number>,
  };
}

// What the 429 answer of a limited AI call carries besides its message (src/components/RateLimitDialog.tsx)
export type RateLimitInfo = {
  reason: 'limit' | 'burst' | 'ipLimit' | 'blocked';
  level: LimitTier;
  // A visitor who isn't signed in gets more by creating a free account
  signUp: boolean;
  retryAfterSeconds: number | null;
};
