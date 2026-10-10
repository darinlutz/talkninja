import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getCurrentUser } from '@/lib/session';
import { getSiteOrigin } from '@/lib/siteOrigin';
import { canSubscribe, isPlan } from '@/lib/accountStatus';
import { PLAN_PRODUCT_ENV } from '@/lib/planPrices';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const plan = formData.get('plan');
    if (!isPlan(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Check if Stripe secret key and the plan's product are configured
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const productId = process.env[PLAN_PRODUCT_ENV[plan]];
    if (!stripeSecretKey || !productId) {
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 500 }
      );
    }

    const origin = getSiteOrigin(request);

    // The webhook uses client_reference_id to find which user subscribed
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.redirect(`${origin}/login`, 303);
    }
    // Prevents subscribing twice
    if (!canSubscribe(user.accountStatus)) {
      return NextResponse.redirect(`${origin}/account`, 303);
    }

    const stripe = new Stripe(stripeSecretKey);

    const product = await stripe.products.retrieve(productId, {
      expand: ['default_price'],
    });
    const price = product.default_price;
    // Both plans renew: monthly, or yearly
    if (!price || typeof price === 'string' || price.type !== 'recurring') {
      console.error(`Stripe product ${productId} has no recurring default price`);
      return NextResponse.json(
        { error: 'Stripe product has no recurring price' },
        { status: 500 }
      );
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      ui_mode: 'hosted_page',
      mode: 'subscription',
      payment_method_collection: 'always',
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: false },
      automatic_tax: { enabled: false },
      allow_promotion_codes: false,
      submit_type: 'auto',
      integration_identifier: 'hosted_web_0001',
      origin_context: 'web',
      client_reference_id: String(user.id),
      customer_email: user.emailAddress,
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      // Back to the Pricing page, where Checkout was started
      cancel_url: `${origin}/pricing`,
      line_items: [{ price: price.id, quantity: 1 }],
      // The webhook skips checkouts without our app tag, and reads the plan
      // to decide how to update the account
      metadata: { app: 'talkninja', plan },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      return NextResponse.json(
        { error: 'Checkout session has no URL' },
        { status: 500 }
      );
    }

    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error('Stripe checkout error:', error);

    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
