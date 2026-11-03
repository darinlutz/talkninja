// The current version of each legal document (src/lib/legal.ts). No imports, so the signup form, the server and the
// Node tests share it.
//
// Change a version together with the document's effectiveDate whenever its wording changes.
//
// Only the Terms of Service is something users *accept*: it's the contract. Signing up records the Terms version the
// form showed (and the 18+ confirmation) in "PolicyAcceptances" (src/lib/policyAcceptances.ts), and a new Terms
// version asks signed-in users to accept again (src/components/PolicyUpdateNotice.tsx).
//
// The Privacy Policy and the Cookie Policy are notices, not contracts: a new version is published with its effective
// date and is never "accepted" or used to gate the site. Their versions are still recorded with each signup and each
// cookie choice, as evidence of which notice the person was shown.
export const POLICY_VERSIONS = {
  terms: '2026-11-03',
  privacy: '2026-11-03',
  cookies: '2026-11-03',
} as const;

export type Policy = keyof typeof POLICY_VERSIONS;

// The documents a user must accept (a contract). Everything else in POLICY_VERSIONS is a notice.
export const ACCEPTED_POLICIES: readonly Policy[] = ['terms'];

// The minimum age to have an account (Terms of Service, section 2). The signup form asks people to confirm it.
export const MINIMUM_AGE = 18;

// What a signup or "accept the updated Terms" request says it was shown
export type ShownPolicyVersions = Partial<Record<Policy, string>>;

// Whether a request accepted exactly the current Terms (a page loaded before the Terms changed hasn't)
export function acceptsCurrentTerms(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return (value as Record<string, unknown>).terms === POLICY_VERSIONS.terms;
}
