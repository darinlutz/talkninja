import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  allChoices,
  CONSENT_BANNER_VERSION,
  CONSENT_METHODS,
  CONSENT_PURPOSES_VERSION,
  CONSENT_VIAS,
  consentAction,
  grantsAny,
  hasOptionalCategories,
  normalizeChoices,
} from '@/lib/cookieConsent';
import { recordCookieConsent } from '@/lib/cookieConsentRecords';
import { deleteRefusedCookies, getConsentState, setConsentCookie } from '@/lib/cookieConsentServer';
import { POLICY_VERSIONS } from '@/lib/policyVersions';
import { getCurrentUser } from '@/lib/session';
import { getSiteOrigin } from '@/lib/siteOrigin';

const consentSchema = z.object({
  via: z.enum(CONSENT_VIAS),
  method: z.enum(CONSENT_METHODS),
  // Only read for Save Preferences; Accept All and Reject Nonessential set every category
  choices: z.record(z.string(), z.boolean()).optional(),
  language: z.string().max(40).optional(),
});

// Saves a choice made in the cookie banner or Cookie Settings (src/components/CookieConsentProvider.tsx): records it
// in "CookieConsents", stores it in the consent cookie and deletes the cookies of the categories refused. Open to
// visitors who aren't signed in. A refusal is applied even if it can't be recorded; a grant isn't, as there'd be no
// evidence of it. While TalkNinja offers no optional categories there's nothing to choose, so it answers 409.
export async function POST(request: Request) {
  // Only the site's own pages: a cross-site form can't send JSON, and a browser's Origin, when sent, must be this site
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 415 });
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== getSiteOrigin(request)) {
    return NextResponse.json({ error: 'Cross-site request refused' }, { status: 403 });
  }
  if (!hasOptionalCategories()) {
    return NextResponse.json({ error: 'There are no optional cookies to choose' }, { status: 409 });
  }

  const parsed = consentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid consent choice' }, { status: 400 });
  }
  const { via, method, language } = parsed.data;
  const choices =
    via === 'acceptAll' ? allChoices(true) : via === 'rejectAll' ? allChoices(false) : normalizeChoices(parsed.data.choices);

  const state = await getConsentState();
  const previous = state.current ? state.stored : null;
  const action = consentAction(previous, choices, via);
  const consent = {
    browserId: state.stored?.browserId ?? randomUUID(),
    recordId: randomUUID(),
    purposesVersion: CONSENT_PURPOSES_VERSION,
    choices,
    decidedAt: Date.now(),
  };

  let recorded = true;
  try {
    const user = await getCurrentUser();
    await recordCookieConsent({
      id: consent.recordId,
      browserId: consent.browserId,
      userId: user?.id ?? null,
      action,
      choices,
      cookiePolicyVersion: POLICY_VERSIONS.cookies,
      bannerVersion: CONSENT_BANNER_VERSION,
      purposesVersion: CONSENT_PURPOSES_VERSION,
      language: language ?? 'English',
      method,
    });
  } catch (error) {
    console.error('Cookie consent record error:', error instanceof Error ? error.message : error);
    recorded = false;
    if (grantsAny(choices)) {
      return NextResponse.json({ error: 'Failed to save your cookie choices' }, { status: 500 });
    }
  }

  await setConsentCookie(consent);
  await deleteRefusedCookies(choices);
  return NextResponse.json({ choices, action, recorded });
}
