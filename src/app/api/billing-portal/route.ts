import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getPublicSiteUrl } from '@/lib/siteOrigin';
import { billingPortalUrl, stripeClient } from '@/lib/stripeBilling';

// The Account page's Manage Subscription, Update Payment Method and View Billing History (a form POST): opens
// Stripe's Customer Portal for the signed-in account's own Stripe customer (from the database, never the request).
// Form field flow=payment_method_update opens it on changing the card. Answers a 303 to the portal, or back to the
// Account page with ?billing=unavailable when there's nothing to manage or Stripe fails.
export async function POST(request: Request) {
  const siteUrl = getPublicSiteUrl(request);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${siteUrl}/login`, 303);
  const back = `${siteUrl}/account?billing=unavailable#subscription`;
  const stripe = stripeClient();
  if (!user.stripeCustomerId || !stripe) return NextResponse.redirect(back, 303);

  const form = await request.formData().catch(() => null);
  const flow = form?.get('flow') === 'payment_method_update' ? 'payment_method_update' : null;
  try {
    return NextResponse.redirect(await billingPortalUrl(stripe, user.stripeCustomerId, siteUrl, flow), 303);
  } catch (error) {
    console.error('Billing portal error:', error);
    return NextResponse.redirect(back, 303);
  }
}
