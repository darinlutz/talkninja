// Cookie consent: what a visitor's choice is, how it's kept in their browser and when it must be asked again.
// Pure (no imports), so the client, the server and the Node tests (scripts/privacy.test.mjs) share it.
// Adapted from RacingCoach's src/lib/cookieConsent.ts. The server side is src/lib/cookieConsentServer.ts, the records
// src/lib/cookieConsentRecords.ts, the banner and Cookie Settings src/components/CookieConsentProvider.tsx.
// See docs/privacy.md.
//
// TalkNinja uses no optional cookies today (src/lib/cookieInventory.ts: every item is strictly necessary), so
// OFFERED_CATEGORIES is empty and the banner never shows: there's nothing to ask about. Cookie Settings (the footer)
// still opens and lists what's used. Adding an optional technology means:
//   1. Add its cookies/storage to COOKIE_INVENTORY with its category.
//   2. Add the category to OFFERED_CATEGORIES and bump CONSENT_PURPOSES_VERSION.
//   3. Render it only inside <ConsentGate category="..."> and refuse its server endpoint without consent
//      (isCategoryGranted in cookieConsentServer.ts).
//   4. Update the Cookie Policy (src/lib/legal.ts) and its version (src/lib/policyVersions.ts).
// The banner then shows for everyone (opt-in everywhere; no geolocation), with Accept All, Reject Nonessential and
// Customize given equal weight and nothing pre-ticked.

// The banner/Cookie Settings wording version, stored with every consent record as evidence of what was shown.
// Change it whenever the banner or Cookie Settings text changes. (The Cookie Policy's version is in policyVersions.ts.)
export const CONSENT_BANNER_VERSION = '2026-11-03';

// Bump when a material change is made to what optional cookies do (a new technology, category or purpose): every
// earlier choice stops counting and the banner asks again. Wording fixes don't need it.
export const CONSENT_PURPOSES_VERSION = 1;

// How long a choice lasts before the banner asks again (CONSENT_REVIEW_DAYS overrides it on the server). No law sets
// one period; 180 days follows the CNIL's recommendation of about 6 months for acceptances and refusals alike.
export const DEFAULT_CONSENT_REVIEW_DAYS = 180;

// The cookie that holds the choice (HttpOnly, set only by POST /api/consent). Strictly necessary: it only remembers
// the choice itself.
export const CONSENT_COOKIE = 'cookie_consent';

// Every category the framework knows. Strictly necessary is always on and isn't stored.
export const OPTIONAL_CATEGORIES = ['functional', 'analytics', 'marketing'] as const;
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];
export type ConsentCategory = 'necessary' | OptionalCategory;

// The optional categories TalkNinja actually uses; only these are shown and recorded. Empty: none are used.
export const OFFERED_CATEGORIES: readonly OptionalCategory[] = [];

export type ConsentChoices = Partial<Record<OptionalCategory, boolean>>;

// How the choice was made: Accept All, Reject Nonessential, or Save Preferences (Customize)
export const CONSENT_VIAS = ['acceptAll', 'rejectAll', 'save'] as const;
export type ConsentVia = (typeof CONSENT_VIAS)[number];

export const CONSENT_METHODS = ['banner', 'preferenceCenter'] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export const CONSENT_ACTIONS = ['accepted', 'rejected', 'customized', 'withdrawn', 'updated'] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

// What the consent cookie holds: the browser's pseudonymous ID (the same in every record from this browser), the
// latest record's ID, the purposes version it was given for, the choices and when (ms since 1970, UTC).
export type StoredConsent = {
  browserId: string;
  recordId: string;
  purposesVersion: number;
  choices: ConsentChoices;
  decidedAt: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

// Whether the banner has anything to ask about
export function hasOptionalCategories(offered: readonly OptionalCategory[] = OFFERED_CATEGORIES): boolean {
  return offered.length > 0;
}

// Only the offered categories, each true or false (anything missing or not exactly true is false)
export function normalizeChoices(choices: unknown, offered: readonly OptionalCategory[] = OFFERED_CATEGORIES): ConsentChoices {
  const source = choices && typeof choices === 'object' ? (choices as Record<string, unknown>) : {};
  return Object.fromEntries(offered.map((category) => [category, source[category] === true]));
}

export function allChoices(granted: boolean, offered: readonly OptionalCategory[] = OFFERED_CATEGORIES): ConsentChoices {
  return Object.fromEntries(offered.map((category) => [category, granted]));
}

export function grantsAny(choices: ConsentChoices): boolean {
  return OPTIONAL_CATEGORIES.some((category) => choices[category] === true);
}

export function serializeConsent(consent: StoredConsent, offered: readonly OptionalCategory[] = OFFERED_CATEGORIES): string {
  return JSON.stringify({
    b: consent.browserId,
    r: consent.recordId,
    p: consent.purposesVersion,
    c: normalizeChoices(consent.choices, offered),
    t: consent.decidedAt,
  });
}

// The cookie's value, or null when it's missing or not one of ours
export function parseConsent(value: string | undefined | null): StoredConsent | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return null;
    if (!isUuid(raw.b) || !isUuid(raw.r)) return null;
    if (typeof raw.p !== 'number' || !Number.isInteger(raw.p)) return null;
    if (typeof raw.t !== 'number' || !Number.isFinite(raw.t) || raw.t <= 0) return null;
    if (!raw.c || typeof raw.c !== 'object') return null;
    const choices: ConsentChoices = {};
    for (const category of OPTIONAL_CATEGORIES) {
      const v = (raw.c as Record<string, unknown>)[category];
      if (typeof v === 'boolean') choices[category] = v;
    }
    return { browserId: raw.b, recordId: raw.r, purposesVersion: raw.p, choices, decidedAt: raw.t };
  } catch {
    return null;
  }
}

// Whether a stored choice still counts: given for the current purposes, not older than the review interval, and not
// from the future (a clock more than a day ahead)
export function isConsentCurrent(
  consent: StoredConsent | null,
  now: number,
  reviewDays: number,
  purposesVersion: number = CONSENT_PURPOSES_VERSION
): consent is StoredConsent {
  if (!consent) return false;
  if (consent.purposesVersion !== purposesVersion) return false;
  const age = now - consent.decidedAt;
  return age >= -24 * 60 * 60 * 1000 && age < reviewDays * 24 * 60 * 60 * 1000;
}

// Whether a category may run. Opt-in everywhere: only a current choice that grants it does. An expired or outdated
// grant stops counting; a refusal is never turned into consent by time or a policy change.
export function isGranted(category: OptionalCategory, consent: StoredConsent | null, current: boolean): boolean {
  return !!consent && current && consent.choices[category] === true;
}

// What a new choice is, for the record: taking back everything that was granted is a withdrawal; otherwise Accept All
// and Reject Nonessential are accepted and rejected, and Save Preferences is customized the first time, updated after.
export function consentAction(previous: StoredConsent | null, choices: ConsentChoices, via: ConsentVia): ConsentAction {
  if (previous && grantsAny(previous.choices) && !grantsAny(choices)) return 'withdrawn';
  if (via === 'acceptAll') return 'accepted';
  if (via === 'rejectAll') return 'rejected';
  return previous ? 'updated' : 'customized';
}

// Whether the banner must show: there's something optional to ask about and no current choice
export function needsChoice(
  consent: StoredConsent | null,
  current: boolean,
  offered: readonly OptionalCategory[] = OFFERED_CATEGORIES
): boolean {
  return hasOptionalCategories(offered) && !(consent && current);
}
