import type { Queryable } from './deletionLedger.ts';
import { POLICY_VERSIONS } from './policyVersions.ts';

// Download My Data (Account page → Privacy & Data; POST /api/account/export): every row TalkNinja's database holds
// about one account, as JSON (GDPR Articles 15 and 20). Every query is scoped to that account's ID; nothing about
// other users is included. Never included: the password hash and session/reset token hashes (security secrets, not
// information about the person). Takes a client so the database tests can call it. Imports only plain .ts files.
//
// Keep in step with the schema: a new table that belongs to a user needs a section here (the source guard in
// scripts/privacy.test.mjs checks every table referencing "Users" is either exported or listed in NOT_EXPORTED).

export const EXPORT_FORMAT_VERSION = 1;

// Tables that reference "Users" but aren't exported, and why
export const NOT_EXPORTED: Record<string, string> = {
  Sessions: 'Only hashed sign-in tokens; the export says how many sessions are active and when they expire.',
  PasswordResets: 'Only hashed one-time reset tokens.',
  SiteSettings: 'Site settings an Admin saved (updated_by); not information about you.',
  DeletionLedger: 'Only exists once an account is deleted.',
};

export const EXPORTED_TABLES = [
  'Users',
  'UserLanguageProgress',
  'LanguageActivity',
  'CustomAgentInstructions',
  'CancellationReason',
  'AiUsage',
  'PolicyAcceptances',
  'CookieConsents',
  'RateLimitOverrides',
] as const;

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ?? null);

function clean(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, iso(value)]));
}

export async function buildPersonalDataExport(client: Queryable, userId: number, now: Date = new Date()) {
  const q = async (sql: string) => (await client.query(sql, [userId])).rows.map(clean);
  const [account] = await q(
    `SELECT id, user_name, email_address, role, account_status, created_at, signup_date, subscription_end_date,
       stripe_customer_id, stripe_subscription_id, native_language, active_learning_language, age_confirmed_at,
       last_login_at
     FROM "Users" WHERE id = $1`
  );
  if (!account) return null;

  const [sessions] = await q(
    `SELECT count(*)::int AS active_sessions, max(expires_at) AS latest_expiry_ms FROM "Sessions"
     WHERE user_id = $1 AND expires_at > (extract(epoch FROM now()) * 1000)`
  );

  return {
    about: {
      service: 'TalkNinja (talkninja.app), operated by Clarivex, LLC',
      exportedAt: now.toISOString(),
      formatVersion: EXPORT_FORMAT_VERSION,
      privacyPolicyVersion: POLICY_VERSIONS.privacy,
      notes: [
        'Times are in UTC (ISO 8601).',
        'What you type into practice, the Translator and the AI Friend is not stored by TalkNinja, so it is not in this file.',
        'Your Google Sheet link is stored only in your browser (the vocab_sheet cookie), not in our database.',
        'Payment details are held by Stripe; the Stripe IDs below identify your records there.',
        'Password and sign-in token hashes are security secrets and are not included.',
      ],
      notExported: NOT_EXPORTED,
    },
    account,
    sessions: { active: sessions?.active_sessions ?? 0, latestExpiry: sessions?.latest_expiry_ms ? new Date(Number(sessions.latest_expiry_ms)).toISOString() : null },
    languageProgress: await q(
      'SELECT language, belt_level, next_step, updated_at FROM "UserLanguageProgress" WHERE user_id = $1 ORDER BY language'
    ),
    languageActivity: await q(
      `SELECT language, level, activity, score, passed, was_next_step, completed_at FROM "LanguageActivity"
       WHERE user_id = $1 ORDER BY completed_at, id`
    ),
    customTrainingInstructions: await q(
      'SELECT instructions, updated_at FROM "CustomAgentInstructions" WHERE user_id = $1'
    ),
    cancellations: await q(
      `SELECT cancelled_at, reason, notes, user_name, email_address, stripe_subscription_id, stripe_canceled_at,
         subscription_end_date FROM "CancellationReason" WHERE user_id = $1 ORDER BY cancelled_at`
    ),
    aiUsage: await q(
      `SELECT created_at, feature, model, tier, weight, blocked, reason, counted, failed, input_tokens,
         cached_input_tokens, output_tokens, model_calls, ip_address FROM "AiUsage" WHERE user_id = $1
       ORDER BY created_at, id`
    ),
    policyAcceptances: await q(
      'SELECT policy, version, source, accepted_at FROM "PolicyAcceptances" WHERE user_id = $1 ORDER BY accepted_at, policy'
    ),
    cookieConsents: await q(
      `SELECT recorded_at, action, categories, cookie_policy_version, banner_version, method FROM "CookieConsents"
       WHERE user_id = $1 ORDER BY recorded_at`
    ),
    usageLimitOverrides: await q(
      'SELECT mode, limit_count, period, note, expires_at, created_at FROM "RateLimitOverrides" WHERE user_id = $1'
    ),
  };
}

export type PersonalDataExport = NonNullable<Awaited<ReturnType<typeof buildPersonalDataExport>>>;
