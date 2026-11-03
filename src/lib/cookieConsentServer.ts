import { cookies } from 'next/headers';
import {
  CONSENT_COOKIE,
  DEFAULT_CONSENT_REVIEW_DAYS,
  isConsentCurrent,
  isGranted,
  needsChoice,
  OFFERED_CATEGORIES,
  parseConsent,
  serializeConsent,
  type ConsentChoices,
  type OptionalCategory,
  type StoredConsent,
} from './cookieConsent';
import { COOKIE_INVENTORY } from './cookieInventory';

// The server's view of the visitor's cookie consent (src/lib/cookieConsent.ts), read from the consent cookie. The root
// layout passes it to CookieConsentProvider, so optional technologies are decided on the server before the page
// renders; an optional technology's own endpoint must also refuse requests without consent (isCategoryGranted).
// Opt-in for everyone: TalkNinja doesn't geolocate visitors, and asking everyone is the conservative default.
// (RacingCoach's 'regional' mode isn't ported: it needs a country header the host sets, which Render doesn't
// document.)
//
// CONSENT_REVIEW_DAYS (optional) sets how many days a choice lasts before the banner asks again (default 180).

export function consentReviewDays(): number {
  const days = Number(process.env.CONSENT_REVIEW_DAYS);
  return Number.isInteger(days) && days >= 1 && days <= 395 ? days : DEFAULT_CONSENT_REVIEW_DAYS;
}

export type ConsentState = {
  stored: StoredConsent | null;
  current: boolean;
  // Whether the banner must ask (there's something optional and no current choice)
  needsChoice: boolean;
  // A choice was made before but no longer counts, so the banner says so
  reconsent: boolean;
  granted: ConsentChoices;
};

export async function getConsentState(): Promise<ConsentState> {
  const stored = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
  const current = isConsentCurrent(stored, Date.now(), consentReviewDays());
  const granted = Object.fromEntries(
    OFFERED_CATEGORIES.map((category) => [category, isGranted(category, stored, current)])
  ) as ConsentChoices;
  const ask = needsChoice(stored, current);
  return { stored, current, needsChoice: ask, reconsent: ask && stored !== null, granted };
}

export async function isCategoryGranted(category: OptionalCategory): Promise<boolean> {
  return (await getConsentState()).granted[category] === true;
}

export async function setConsentCookie(consent: StoredConsent): Promise<void> {
  (await cookies()).set(CONSENT_COOKIE, serializeConsent(consent), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: consentReviewDays() * 24 * 60 * 60,
  });
}

// Deletes the first-party cookies of the categories not granted. The page removes their browser storage itself (it
// can't be reached from the server); see CookieConsentProvider.
export async function deleteRefusedCookies(granted: ConsentChoices): Promise<void> {
  const store = await cookies();
  for (const item of COOKIE_INVENTORY) {
    if (item.kind !== 'cookie' || item.category === 'necessary' || granted[item.category] === true) continue;
    store.delete(item.name);
  }
}

export async function getConsentBrowserId(): Promise<string | null> {
  return parseConsent((await cookies()).get(CONSENT_COOKIE)?.value)?.browserId ?? null;
}
