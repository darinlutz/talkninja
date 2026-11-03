import { query } from './db';
import type { ConsentAction, ConsentChoices, ConsentMethod } from './cookieConsent';
import { ensureUserSchema } from './users';

// The consent audit trail, "CookieConsents" (src/lib/privacyDb.ts): one row per choice made in the banner or Cookie
// Settings, never updated except to tie a browser's earlier rows to the account that later signs in on it. Holds no
// IP address, user agent or location: a random browser ID (kept in the consent cookie), the account when known,
// what was chosen and what was shown. Purged by the retention job after RETENTION_RULES.consentRecords.

export type ConsentRecord = {
  id: string;
  browserId: string;
  userId: number | null;
  action: ConsentAction;
  choices: ConsentChoices;
  cookiePolicyVersion: string;
  bannerVersion: string;
  purposesVersion: number;
  language: string;
  method: ConsentMethod;
};

export async function recordCookieConsent(record: ConsentRecord): Promise<void> {
  await ensureUserSchema();
  await query(
    `INSERT INTO "CookieConsents"
       (id, browser_id, user_id, action, categories, cookie_policy_version, banner_version, purposes_version,
        notice_language, method)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      record.id,
      record.browserId,
      record.userId,
      record.action,
      JSON.stringify({ necessary: true, ...record.choices }),
      record.cookiePolicyVersion,
      record.bannerVersion,
      record.purposesVersion,
      record.language,
      record.method,
    ]
  );
}

// When someone signs in on a browser whose choices were made anonymously, those rows are tied to the account, so an
// access or deletion request finds them. It doesn't copy the choice to other browsers.
export async function linkConsentToUser(browserId: string, userId: number): Promise<void> {
  await ensureUserSchema();
  await query(
    `UPDATE "CookieConsents" SET user_id = $1, user_linked_at = now() WHERE browser_id = $2 AND user_id IS NULL`,
    [userId, browserId]
  );
}
