import Stripe from 'stripe';
import type { Plan } from './accountStatus';

// The Stripe Product behind each plan; Checkout charges its default Price
// (see /api/create-checkout-session)
const PLAN_PRODUCT_ENV: Record<Plan, string> = {
  monthly: 'STRIPE_MONTHLY_PRODUCT_ID',
  lifetime: 'STRIPE_LIFETIME_PRODUCT_ID',
};

// Each plan's price, formatted (e.g. "$4.99"), or null if it can't be read
export type PlanPrices = Record<Plan, string | null>;

// The Pricing page shows the prices on every visit, so they're kept for a few
// minutes rather than asking Stripe each time. A price changed in Stripe
// shows up once this runs out.
const CACHE_MS = 10 * 60 * 1000;
let cached: { prices: PlanPrices; at: number } | null = null;

async function getPlanPrice(stripe: Stripe, productId: string | undefined): Promise<string | null> {
  if (!productId) return null;

  try {
    const product = await stripe.products.retrieve(productId, {
      expand: ['default_price'],
    });
    const price = product.default_price;
    if (!price || typeof price === 'string' || price.unit_amount === null) return null;

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: price.currency.toUpperCase(),
    }).format(price.unit_amount / 100);
  } catch (error) {
    console.error(`Stripe price lookup error for ${productId}:`, error);
    return null;
  }
}

export async function getPlanPrices(): Promise<PlanPrices> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.prices;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) return { monthly: null, lifetime: null };

  const stripe = new Stripe(stripeSecretKey);
  const [monthly, lifetime] = await Promise.all([
    getPlanPrice(stripe, process.env[PLAN_PRODUCT_ENV.monthly]),
    getPlanPrice(stripe, process.env[PLAN_PRODUCT_ENV.lifetime]),
  ]);
  const prices = { monthly, lifetime };
  // A failed lookup is tried again on the next visit
  if (monthly && lifetime) cached = { prices, at: Date.now() };
  return prices;
}
