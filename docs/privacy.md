# Privacy, legal and data protection

TalkNinja's privacy implementation: the audit behind it, what each piece does, how retention is enforced, how to
run and deploy it, and what is still open. This is an engineering record to brief the owner and counsel, **not legal
advice**, and implementing these features does not by itself make TalkNinja GDPR (or any other law) compliant.

Audit date: 2026-11-03. Decisions by the owner on 2026-11-03: operator Clarivex, LLC; Kentucky law;
support@talkninja.app; minimum age 18; no cookie banner while nothing optional is used; DeepSeek removed; LangSmith
disclosed; no EU withdrawal-waiver checkbox at checkout for now; the retention periods below; owner notification
emails keep going to the owner's Yahoo inbox.

## 1. Data inventory

| Data | Where | Purpose | Legal basis (GDPR) | Sent to | Retention | Deletion |
| --- | --- | --- | --- | --- | --- | --- |
| Name, email, password hash (scrypt), role, languages, created/signup dates, last login, 18+ confirmation | `"Users"` | Account, sign-in | Contract | Resend (emails), Stripe (email), Yahoo (owner notices) | Account lifetime | Delete My Account |
| Subscription status, Stripe customer/subscription IDs, end date | `"Users"` | Billing | Contract; legal obligation (Stripe's records) | Stripe | Account lifetime (Stripe keeps its own) | Delete My Account (Stripe's records are Stripe's) |
| Belts, next step | `"UserLanguageProgress"` | Instruction | Contract | — | Account lifetime | Cascade |
| Training/test results (score, level, date) | `"LanguageActivity"` | Instruction | Contract | — | Account lifetime | Cascade |
| Custom training instructions | `"CustomAgentInstructions"` | Instruction | Contract | AI provider (in prompts) | Account lifetime | Cascade |
| Typed text: test answers, Friend chat, Translator input, words to speak | **Not stored** (browser memory; sent per request) | Instruction | Contract | OpenAI / Anthropic; LangSmith (tracing) | Providers' terms | n/a |
| Spoken audio | **Not stored** (generated, streamed to browser) | Text-to-speech | Contract | OpenAI | Providers' terms | n/a |
| Microphone audio, transcripts, pronunciation scores | **Do not exist** (no mic access; `Permissions-Policy: microphone=()`) | — | — | — | — | — |
| UI translation cache | Browser localStorage | Show site in user's language | Contract | OpenAI (UI strings only) | Until cleared | User's browser |
| Vocabulary sheet ID | `vocab_sheet` cookie | Training from user's sheet | Contract | Google (Sheets API) | 1 year | Disconnect / cookie expiry |
| Sessions (hashed token, expiry) | `"Sessions"` | Security | Contract | — | 7 days after expiry | Retention job; cascade |
| Password reset tokens (hashed) | `"PasswordResets"` | Security | Contract | Resend (link in email) | 7 days after expiry (links last 1 h) | Retention job; cascade |
| AI usage (feature, model, tokens, time, user ID or IP) | `"AiUsage"` (no FK) | Fair-use limits, cost, abuse | Legitimate interests | — | 400 days; IP removed at 90 days; user ID removed at deletion | Retention job; deletion unlinks |
| Cancellation reason, notes, name, email | `"CancellationReason"` (FK SET NULL) | Product improvement | Legitimate interests | Yahoo (owner notice) | Name/email/notes removed at 2 years; reason kept | Retention job |
| Terms acceptances | `"PolicyAcceptances"` | Contract evidence | Legitimate interests | — | Account lifetime | Cascade |
| Cookie choices (random browser ID, choice, versions; no IP) | `"CookieConsents"` (FK SET NULL) | Consent evidence | Legal obligation | — | 3 years | Retention job |
| Deletion ledger (account ID, created/deleted time) | `"DeletionLedger"` (no FK) | Re-apply deletions after a restore | Legal obligation / legitimate interests | — | 3 years | Retention job |
| Rate-limit overrides (Admin notes about a user) | `"RateLimitOverrides"` | Abuse handling | Legitimate interests | — | Until expiry/removal; account lifetime | Retention job (expired); cascade |
| Server logs (requests, errors; IP on rate-limit refusals) | Render | Operations, security | Legitimate interests | Render | Render's log retention (**confirm**) | Render |
| Backups | Render | Disaster recovery | Legitimate interests | Render | Render's backup period (**confirm**) | Overwritten; deletions re-applied on restore |

Not collected: analytics, advertising identifiers, device fingerprints, location, voice, payment card data.

**Data flow.** Browser → Render (Next.js server, Postgres `talkninja` schema) → OpenAI/Anthropic (prompts; no name or
email), LangSmith (traces of those prompts when `LANGSMITH_TRACING=true`), Tavily (English word only), Google Sheets
(sheet ID), Stripe (checkout redirect, webhooks), Resend (emails) → Yahoo (owner notices). All processing is in the
United States as far as known.

## 2. RacingCoach reference audit (read-only)

Examined in `../racingcoach`: `src/lib/legal.ts`, `policyVersions.ts`, `policyAcceptances.ts`, `cookieConsent.ts`,
`cookieConsentServer.ts`, `cookieConsentRecords.ts`, `cookieInventory.ts`, `consentRegion.ts`, `dataErasure.ts`,
`activityRetention.ts`, `lapRetention.ts`, `instrumentation.ts`, the consent components, and `docs/cookie-consent.md`,
`docs/gdpr-gap-analysis.md`, `docs/privacy-requests.md`, `docs/lap-retention.md`. Nothing in RacingCoach was changed.

**Reused (adapted):** legal documents as data rendered by one component; policy versions; the cookie consent rules,
inventory, server reading, record table (no IP), `/api/consent`, provider/banner/preferences dialog/`ConsentGate`;
the erasure ledger idea; step-up password check before deletion and export; `node --test` with source guards.

**Not copied, and why:**
1. RacingCoach's `PolicyUpdateNotice` makes users *accept* Privacy Policy updates. A privacy notice isn't a contract;
   here only the Terms are accepted.
2. RacingCoach's Terms say refunds follow "the refund policy disclosed at purchase", which isn't disclosed anywhere.
   TalkNinja's Terms state the policy and preserve non-waivable statutory rights.
3. 13+ minimum age with no enforcement. TalkNinja is 18+, confirmed by a checkbox at signup (still self-declared).
4. Background jobs only run on in-process timers. TalkNinja adds an authenticated cron endpoint for a Render Cron Job,
   with the in-process scheduler as fallback.
5. `consentRegion`/`CONSENT_MODE=regional` relies on a country header Render doesn't document. Not ported: opt-in
   everywhere.
6. The full privacy-request workflow (public form, Admin queue, export jobs) is far larger than TalkNinja needs today;
   TalkNinja does synchronous export and deletion, and email for the rest.
7. Its ledger copies need object storage; TalkNinja has none, so the ledger is copied out of the live database by
   `npm run db:reapply-deletions` at restore time (see section 6).
8. Shared open gaps (also TalkNinja's): DPAs not evidenced, no EU/UK representative, no breach runbook, customer emails
   in a personal mailbox.

## 3. Third-party vendors

Statements about vendors' retention, training and safeguards come from their public terms and **must be confirmed
against TalkNinja's actual account settings and agreements** (column "Confirm").

| Vendor | Service | Personal data | Location | Retention / training (as published) | Safeguards to confirm | Deletion | Privacy docs | Confirm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Render | Hosting, Postgres, logs, backups | Everything stored | US (region of the shared instance: confirm, RacingCoach says Oregon) | Logs and backups per plan | DPA, SCCs/DPF, encryption at rest, dashboard MFA | Data removed with service; backups expire | https://render.com/privacy | Log & backup retention, region, DPA |
| OpenAI | AI features, TTS, UI translation | Prompt content, languages, instructions (no name/email) | US | API data not used for training by default; kept up to 30 days for abuse monitoring | API DPA (must be executed), SCCs | No per-request deletion API for abuse logs | https://openai.com/policies/privacy-policy | DPA signed? ZDR not enabled |
| Anthropic | AI features if selected on the Admin page | As OpenAI | US | Commercial API data not used for training by default | Commercial DPA, SCCs | Per Anthropic terms | https://www.anthropic.com/legal/privacy | DPA |
| LangChain (LangSmith) | AI tracing | Full prompts and responses | US | Per LangSmith plan trace retention | DPA, SCCs | Traces can be deleted in LangSmith | https://www.langchain.com/privacy-policy | **Whether `LANGSMITH_TRACING` is on in Render** (couldn't check: Render CLI not logged in); retention setting |
| Stripe | Payments | Email, user ID, payment details | US | Stripe's legal retention; separate controller for some processing | Stripe DPA (automatic), DPF | Not deleted by TalkNinja | https://stripe.com/privacy | — |
| Resend | Email | Email, name, message | US | Per Resend | DPA | Per Resend | https://resend.com/legal/privacy-policy | DPA |
| Yahoo | Owner's inbox for notices | Customer email addresses | US | Consumer mailbox, no DPA | **None (consumer account)** | Manual | https://legal.yahoo.com/us/en/yahoo/privacy/index.html | Owner decided to keep for now; see gap 5 |
| Tavily | Picture search | English practice word | Confirm | Per Tavily | DPA probably unnecessary (no personal data) | — | https://tavily.com/privacy | Location |
| Google | Sheets API (user's own sheet) | Sheet ID/content | US | User's own Google account | Service-account terms | User controls the sheet | https://policies.google.com/privacy | — |

**ElevenLabs:** not used anywhere in TalkNinja (no package, no API calls). The prompt's assumption came from
RacingCoach. If it's added later, update `SERVICE_PROVIDERS` in `src/lib/legal.ts`, this table and the Privacy Policy
version first.

**DeepSeek:** removed from `AI_MODELS` (processing in China, no adequacy decision, no safeguard). Stored choices of a
DeepSeek model are deleted by the schema step and fall back to defaults.

## 4. What was built

### Files

| Area | Files |
| --- | --- |
| Legal text & versions | `src/lib/legal.ts`, `src/lib/policyVersions.ts`, `src/components/LegalDocument.tsx`, `src/app/{terms,privacy,cookies}/page.tsx`, `src/components/SiteFooter.tsx` |
| Terms acceptance | `src/lib/policyAcceptances.ts`, `src/app/api/account/policy-acceptance/route.ts`, `src/components/PolicyUpdateNotice.tsx`, `src/components/SignupForm.tsx`, `src/app/api/auth/signup/route.ts`, `createUser` in `src/lib/users.ts` |
| Cookie consent framework | `src/lib/cookieConsent.ts`, `src/lib/cookieInventory.ts`, `src/lib/cookieConsentServer.ts`, `src/lib/cookieConsentRecords.ts`, `src/app/api/consent/route.ts`, `src/components/{CookieConsentProvider,CookieConsentBanner,CookiePreferencesDialog,CookieSettingsButton,ConsentGate}.tsx` |
| Privacy & Data (Account page) | `src/components/{PrivacyDataSection,DownloadMyDataButton,DeleteAccountButton,PasswordConfirmDialog}.tsx`, `src/app/account/page.tsx` |
| Export | `src/lib/personalDataExport.ts`, `src/app/api/account/export/route.ts` |
| Deletion | `src/lib/deletionLedger.ts`, `src/lib/accountDeletionServer.ts`, `src/app/api/account/route.ts`, `src/lib/passwordConfirmation.ts`, `scripts/reapply-deletions.mjs` |
| Retention | `src/lib/retentionRules.ts`, `src/lib/retentionJob.ts`, `src/lib/retention.ts`, `src/instrumentation.ts`, `src/app/api/cron/retention/route.ts`, `src/app/api/admin/retention/route.ts`, `src/components/RetentionRunsCard.tsx`, `src/app/admin/page.tsx` |
| Schema | `src/lib/privacyDb.ts` (run by `ensureUserSchema`) |
| Strings | `src/lib/i18n/en.ts` |
| Security & clean-up | `next.config.js` (headers), DeepSeek removed (`aiModelList.ts`, `aiModels.ts`, `aiModelPrices.ts`), `/api/weight` and `weightStore.ts` deleted (public GET exposed unrelated personal data), `src/lib/db.ts` (`withClient`), login records `last_login_at` |
| Tests | `scripts/privacy.test.mjs`, `scripts/privacy-db.test.mjs`, `scripts/test/{register,resolve-ts}.mjs`, `tsconfig.json` (`allowImportingTsExtensions`) |

### Database changes (`src/lib/privacyDb.ts`; additive, idempotent, run on first use after deploy)

- `"Users"`: `last_login_at`, `age_confirmed_at` (nullable).
- New: `"PolicyAcceptances"` (FK CASCADE), `"CookieConsents"` (FK SET NULL), `"DeletionLedger"` (no FK),
  `"RetentionRuns"`.
- `"CancellationReason"`: `user_name`, `email_address` now nullable; `anonymized_at` added.
- Deletes `"SiteSettings"` rows that chose a DeepSeek model.

Rollback: redeploy the previous version; the new tables and columns are ignored. The previous `deleteUser` behavior
returns (no ledger, no password check).

### Endpoints

| Route | Who | What |
| --- | --- | --- |
| `POST /api/account/export` | Signed in + password | JSON of the account's data, `no-store` |
| `DELETE /api/account` | Signed in + `DELETE` + password; not Admins | Cancels Stripe, deletes with ledger, emails confirmation |
| `POST /api/account/policy-acceptance` | Signed in | Accept current Terms (+ 18+ for older accounts) |
| `POST /api/consent` | Anyone, same-origin JSON | Records a cookie choice (409 while nothing optional is offered) |
| `POST /api/cron/retention` | Bearer `RETENTION_CRON_SECRET` (≥ 32 chars) | Runs retention; 404 otherwise |
| `GET/POST /api/admin/retention` | Admins (404 for others) | List runs / Run Now |

Password checks allow 5 wrong attempts per 15 minutes per account (in memory: resets on restart, per instance).

## 5. Retention matrix

Periods are in `src/lib/retentionRules.ts` (owner-approved 2026-11-03), each overridable by its env var but never
below its minimum. Enforced daily by `src/lib/retentionJob.ts`.

| Data | Period | Storage | Mechanism | Env var |
| --- | --- | --- | --- | --- |
| Expired sessions | 7 days after expiry | `"Sessions"` | Delete | `RETENTION_EXPIRED_SESSIONS_DAYS` |
| Expired reset links | 7 days after expiry | `"PasswordResets"` | Delete | `RETENTION_EXPIRED_PASSWORD_RESETS_DAYS` |
| AI usage IP addresses | 90 days | `"AiUsage"` | Set NULL | `RETENTION_AI_USAGE_IP_DAYS` (min 35) |
| AI usage rows | 400 days | `"AiUsage"` | Delete | `RETENTION_AI_USAGE_DAYS` |
| AI usage of deleted accounts | At deletion (+ daily orphan sweep) | `"AiUsage"` | user_id NULL | — |
| Cancellation name/email/notes | 2 years | `"CancellationReason"` | Set NULL, `anonymized_at` | `RETENTION_CANCELLATION_CONTACT_DAYS` |
| Cookie choice records | 3 years | `"CookieConsents"` | Delete | `RETENTION_CONSENT_RECORDS_DAYS` (min 365) |
| Deletion ledger | 3 years | `"DeletionLedger"` | Delete | `RETENTION_DELETION_LEDGER_DAYS` (min 365) |
| Expired rate-limit overrides | At expiry | `"RateLimitOverrides"` | Delete | — |
| Retention run records | 1 year | `"RetentionRuns"` | Delete | `RETENTION_RUNS_DAYS` |
| Account, progress, results, instructions, acceptances | Account lifetime | various | Delete My Account | — |
| Inactive accounts | **Not enforced** (owner: "your call"; not enabled) | `"Users"` | `last_login_at` now recorded so a rule can be added | — |
| Typed text, audio | Not stored | — | — | — |
| Server logs, backups | Render's periods | Render | Render; deletions re-applied on restore | — |

## 6. Operations

### Render Cron Job (primary trigger)

1. Set `RETENTION_CRON_SECRET` on the web service (e.g. `openssl rand -hex 32`).
2. Create a Render Cron Job, schedule `17 4 * * *` (daily, UTC), command:
   `curl -fsS -X POST -H "Authorization: Bearer $RETENTION_CRON_SECRET" https://talkninja.app/api/cron/retention`
   with the same secret in its environment.
3. Check the Admin page's Data Retention section the next day.

Without it, the web server's fallback runs the job when the last successful run is more than 20 hours old (checked
every 6 hours, production only; `RETENTION_SCHEDULER=off` disables it, `=on` enables it outside production). Only one
run happens at a time (advisory lock). Failures are logged (step name and error message only) and shown on the
Admin page; the next run retries.

### Backups

Before sending users to a restored database:
`LEDGER_SOURCE_DATABASE_URL=<current db> TARGET_DATABASE_URL=<restored db> npm run db:reapply-deletions`.
If the current database is gone too, deletions after the backup point can't be re-applied automatically; the
deletion confirmation emails (Resend logs) are the fallback record.

### Tests

```
npm run test:privacy                                    # 26 pure tests and source guards
PRIVACY_TEST_DATABASE_URL=postgres://...@127.0.0.1:.../db npm run test:privacy:db   # 9 database tests (local only; drops the talkninja schema there)
```

### Adding an optional cookie (analytics, etc.)

See the header of `src/lib/cookieConsent.ts`. The banner (Accept All / Reject Nonessential / Customize) appears
automatically once `OFFERED_CATEGORIES` isn't empty.

## 7. Testing results (2026-11-03)

- `npm run test:privacy`: 26/26 pass (consent rules incl. opt-in, expiry, withdrawal; inventory vs code; no
  third-party scripts; legal docs vs inventory, providers and periods; retention rules; route guard order; every
  user table exported and deletable).
- `npm run test:privacy:db` on a disposable local Postgres 18: 9/9 pass (signup acceptance; legacy acceptance;
  deletion isolation and what's kept; idempotent and Admin-safe deletion; restore re-application incl. reused IDs;
  export isolation and no secrets; retention boundaries both sides of each period and idempotent rerun; failure of
  one step recorded and recovered; run records and locking).
- `npm run lint`, `tsc --noEmit`, `npm run build`: pass.
- Live smoke test of the production build against the local database: security headers present; `/terms`,
  `/privacy`, `/cookies` 200; no cookie banner and no cookies for anonymous visitors; footer links; `/admin` and
  `/api/admin/retention` 404 anonymously; cron 404 without the secret, runs with it; signup refused without 18+, without
  Terms, or with a stale Terms version; export refused with a wrong password, returns the account's data only; deletion
  refused without `DELETE` or with a wrong password, succeeds, old session and login stop working, ledger row written;
  legacy account sees the Terms notice, acceptance validated and recorded; 6th wrong password → 429.
- Not run: browser-level accessibility checks (screen reader, 200% zoom), Playwright e2e (not installed in this
  project), Stripe cancellation during deletion (no test key used), real email sending.

## 8. Compliance readiness

**Implemented and tested:** Terms/Privacy/Cookie pages and footer; signup 18+ and Terms acceptance with versions;
updated-Terms notice; cookie inventory and Cookie Settings; consent framework (opt-in, records without IP, withdrawal
clean-up) ready for optional categories; Download My Data; Delete My Account with password, ledger, AI-usage
unlinking; restore re-application; retention job with all approved periods, run records, Admin view, cron endpoint;
security headers; DeepSeek removed; public `/api/weight` removed.

**Implemented, awaiting verification:** Render Cron Job (needs creating, section 6); in-process fallback in
production; deletion with a live Stripe subscription; confirmation email delivery (needs `RESEND_FROM_EMAIL` on a
verified domain); keyboard/screen reader pass over the new dialogs; layout at 375 px.

**Requires business decision:** refund policy wording (drafted as "non-refundable except where law requires");
inactive-account deletion; EU 14-day withdrawal waiver at checkout (deferred by owner: until added, EU/UK consumers
likely keep a 14-day right to withdraw and a refund); moving owner notices off a personal Yahoo inbox (no DPA);
whether to keep LangSmith tracing in production (prompts are sent there); `remembered_email` kept 1 year as
"strictly necessary" (user-requested) — consider shortening to 30 days to match the remembered session.

**Requires vendor confirmation:** section 3's "Confirm" column (especially LangSmith on/off and retention, OpenAI DPA,
Render region/backups/log retention, Tavily location).

**Requires legal review:** all three documents; legal bases (legitimate-interests assessments for AI usage logs,
LangSmith tracing, owner notices); EU and UK Article 27 representatives (none named); Article 30 record of processing;
DPIA screening (AI evaluation of learners); transfer mechanism wording; US state law thresholds; the liability cap
and Kentucky forum clause vs. EU consumer law; whether 18+ self-declaration is sufficient.

**Not yet implemented:** breach response runbook and register; DSAR intake beyond email (no request log for
objection/restriction); correction of name/email in the UI (email request only); translations of the legal texts
(English governs; UI strings are keyed in `src/lib/i18n/en.ts` but only English exists, translated at runtime by the
page translator); full Content-Security-Policy (needs nonces); login brute-force limiting (outside this scope);
separate database credentials per schema (TalkNinja's DB user can likely read other apps' schemas on the shared
instance).

TalkNinja should not be described as "GDPR compliant" on the strength of this work.
