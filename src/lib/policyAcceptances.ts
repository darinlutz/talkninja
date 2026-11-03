import { query, transaction } from './db';
import { MINIMUM_AGE, POLICY_VERSIONS } from './policyVersions';
import { ensureUserSchema } from './users';

// Which Terms of Service versions each user accepted ("PolicyAcceptances", src/lib/privacyDb.ts). Signing up records
// them (createUser in src/lib/users.ts); a signed-in user who hasn't accepted the current Terms (an account from
// before the Terms existed, or before they changed) sees PolicyUpdateNotice, which calls acceptCurrentTerms.
// The Privacy Policy version shown is stored alongside as evidence, but a Privacy Policy change never asks again.

export type TermsStatus = { acceptedCurrentTerms: boolean; ageConfirmed: boolean };

export async function getTermsStatus(userId: number): Promise<TermsStatus> {
  await ensureUserSchema();
  const [row] = await query<{ accepted: boolean; age_confirmed: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM "PolicyAcceptances" WHERE user_id = $1 AND policy = 'terms' AND version = $2) AS accepted,
       (SELECT age_confirmed_at IS NOT NULL FROM "Users" WHERE id = $1) AS age_confirmed`,
    [userId, POLICY_VERSIONS.terms]
  );
  return { acceptedCurrentTerms: !!row?.accepted, ageConfirmed: !!row?.age_confirmed };
}

// Records acceptance of the current Terms (and confirms the user's age, for accounts from before the age
// requirement). Accepting the same version again keeps the first record.
export async function acceptCurrentTerms(userId: number): Promise<void> {
  await ensureUserSchema();
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO "PolicyAcceptances" (user_id, policy, version, source)
       SELECT $1, policy, version, 'website' FROM unnest($2::text[], $3::text[]) AS p (policy, version)
       ON CONFLICT (user_id, policy, version) DO NOTHING`,
      [userId, ['terms', 'privacy'], [POLICY_VERSIONS.terms, POLICY_VERSIONS.privacy]]
    );
    await client.query('UPDATE "Users" SET age_confirmed_at = now() WHERE id = $1 AND age_confirmed_at IS NULL', [userId]);
  });
}

export { MINIMUM_AGE };
