import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getCurrentUser } from '@/lib/session';
import { getSiteOrigin } from '@/lib/siteOrigin';
import { canBuy } from '@/lib/users';

// Each plan is a Stripe Product; Checkout charges its default Price
const PLAN_PRODUCT_ENV = {
  monthly: 'STRIPE_MONTHLY_PRODUCT_ID',
  lifetime: 'STRIPE_LIFETIME_PRODUCT_ID',
} as const;

type Plan = keyof typeof PLAN_PRODUCT_ENV;

function isPlan(value: unknown): value is Plan {
  return value === 'monthly' || value === 'lifetime';
}

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
    // Prevents buying a plan the account already has (or one it's past,
    // e.g. Monthly on a Lifetime account)
    if (!canBuy(user, plan)) {
      return NextResponse.redirect(`${origin}/account`, 303);
    }

    const stripe = new Stripe(stripeSecretKey);

    const product = await stripe.products.retrieve(productId, {
      expand: ['default_price'],
    });
    const price = product.default_price;
    if (!price || typeof price === 'string') {
      console.error(`Stripe product ${productId} has no default price`);
      return NextResponse.json(
        { error: 'Stripe product has no price' },
        { status: 500 }
      );
    }

    // Monthly is a recurring price; Lifetime is a one-time payment
    const mode: Stripe.Checkout.SessionCreateParams.Mode =
      price.type === 'recurring' ? 'subscription' : 'payment';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      ui_mode: 'hosted_page',
      mode,
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
    if (sessionParams.mode === 'subscription') {
      sessionParams.payment_method_collection = 'always';
    } else {
      // Payment mode only creates a Stripe Customer when asked to
      sessionParams.customer_creation = 'always';
    }

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
