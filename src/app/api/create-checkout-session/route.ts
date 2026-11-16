import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getSiteOrigin } from '@/lib/siteOrigin';
import { canSubscribe } from '@/lib/accountStatus';
import { customerForUser, findLiveSubscription, STRIPE_APP, stripeClient, syncSubscription } from '@/lib/stripeBilling';
import { isLiveStripeStatus } from '@/lib/subscriptionProjection';

// The Subscribe buttons (Pricing and Account pages): opens Stripe Checkout for TalkNinja's one plan, the Monthly
// Subscription (TALKNINJA_MONTHLY_PRODUCT_ID's default recurring monthly Price; the price shown comes from Stripe).
// The checkout is for the signed-in account's own Stripe Customer (created and saved the first time), and is refused
// when the account already has a live subscription, here or in Stripe. Paid access starts when Stripe says the first
// invoice is paid (src/lib/stripeBilling.ts), never just because Checkout redirected back.
export async function POST(request: Request) {
  const origin = getSiteOrigin(request);
  try {
    const stripe = stripeClient();
    const productId = process.env.TALKNINJA_MONTHLY_PRODUCT_ID;
    if (!stripe || !productId) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }

    // The webhook uses client_reference_id and the subscription's metadata to find which user subscribed
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.redirect(`${origin}/login`, 303);
    }
    // A subscription is bought by an account whose address is confirmed (src/lib/emailVerification.ts); the Account
    // page says how
    if (!user.emailVerified) {
      return NextResponse.redirect(`${origin}/account?verifyEmail=1`, 303);
    }
    // Prevents subscribing twice: the account's own record first, then Stripe itself
    if (!canSubscribe(user.accountStatus) || isLiveStripeStatus(user.stripeStatus)) {
      return NextResponse.redirect(`${origin}/account?billing=already#subscription`, 303);
    }

    const customerId = await customerForUser(stripe, user);
    const live = await findLiveSubscription(stripe, customerId);
    if (live) {
      // The account's record was behind; bring it up to date rather than sell a second subscription
      await syncSubscription(stripe, live.id, { userId: user.id });
      return NextResponse.redirect(`${origin}/account?billing=already#subscription`, 303);
    }

    const product = await stripe.products.retrieve(productId, { expand: ['default_price'] });
    const price = product.default_price;
    // Monthly only: the default price must renew every month
    if (
      !price ||
      typeof price === 'string' ||
      price.type !== 'recurring' ||
      price.recurring?.interval !== 'month' ||
      price.recurring.interval_count !== 1
    ) {
      console.error(`Stripe product ${productId} has no recurring monthly default price`);
      return NextResponse.json({ error: 'Stripe product has no monthly price' }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'hosted_page',
      mode: 'subscription',
      customer: customerId,
      payment_method_collection: 'always',
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: false },
      automatic_tax: { enabled: false },
      allow_promotion_codes: false,
      submit_type: 'auto',
      integration_identifier: 'hosted_web_0001',
      origin_context: 'web',
      client_reference_id: String(user.id),
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      // Back to the Pricing page, where Checkout was started
      cancel_url: `${origin}/pricing`,
      line_items: [{ price: price.id, quantity: 1 }],
      // The webhook skips checkouts and subscriptions without our app tag (the Stripe account is shared with
      // RacingCoach); the account ID lets a subscription event that arrives before the checkout one find its account
      metadata: { app: STRIPE_APP, plan: 'monthly' },
      subscription_data: { metadata: { app: STRIPE_APP, talkninja_user_id: String(user.id) } },
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Checkout session has no URL' }, { status: 500 });
    }

    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error('Stripe checkout error:', error);

    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
