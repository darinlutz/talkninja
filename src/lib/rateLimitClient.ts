import type { RateLimitInfo } from './rateLimitConfig';

// Lets the page's AI features show the rate limit dialog (src/components/RateLimitDialog.tsx, in the root layout)
// when an AI route answers 429 because the user's limit is used up (src/lib/rateLimits.ts aiRateLimit). Every
// fetch of an AI route passes its response here; anything but a rate limit answer is ignored, so the feature
// still shows its error message as usual. It reads a clone, so the caller can still read the body.

export const RATE_LIMIT_EVENT = 'talkninja:ai-rate-limit';

export type RateLimitEventDetail = { message: string; info: RateLimitInfo };

// Resolves true when the response was a rate limit refusal (and the dialog was opened)
export async function reportRateLimit(response: Response): Promise<boolean> {
  if (response.status !== 429 || typeof window === 'undefined') return false;
  const body = (await response.clone().json().catch(() => null)) as { error?: unknown; rateLimit?: RateLimitInfo } | null;
  if (!body?.rateLimit) return false;
  const detail: RateLimitEventDetail = { message: typeof body.error === 'string' ? body.error : '', info: body.rateLimit };
  window.dispatchEvent(new CustomEvent(RATE_LIMIT_EVENT, { detail }));
  return true;
}
