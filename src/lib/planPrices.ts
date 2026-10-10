import Stripe from 'stripe';
import type { Plan } from './accountStatus';

// The Stripe Product behind each plan; Checkout charges its default Price
// (see /api/create-checkout-session)
export const PLAN_PRODUCT_ENV: Record<Plan, string> = {
  monthly: 'TALKNINJA_MONTHLY_PRODUCT_ID',
  annual: 'TALKNINJA_ANNUAL_PRODUCT_ID',
};

// A plan's price in the currency's smallest unit (e.g. cents)
type PlanPrice = { amount: number; currency: string };

export type PlanPrices = {
  // Each plan's price, formatted (e.g. "$4.99"), or null if it can't be read
  monthly: string | null;
  annual: string | null;
  // How much less Annual costs than 12 months of Monthly, as a whole
  // percentage (e.g. 20), or null if it's not cheaper or can't be worked out
  annualDiscountPercent: number | null;
};

// The Pricing page shows the prices on every visit, so they're kept for a few
// minutes rather than asking Stripe each time. A price changed in Stripe
// shows up once this runs out.
const CACHE_MS = 10 * 60 * 1000;
let cached: { prices: PlanPrices; at: number } | null = null;

async function getPlanPrice(stripe: Stripe, productId: string | undefined): Promise<PlanPrice | null> {
  if (!productId) return null;

  try {
    const product = await stripe.products.retrieve(productId, {
      expand: ['default_price'],
    });
    const price = product.default_price;
    if (!price || typeof price === 'string' || price.unit_amount === null) return null;
    return { amount: price.unit_amount, currency: price.currency };
  } catch (error) {
    console.error(`Stripe price lookup error for ${productId}:`, error);
    return null;
  }
}

function formatPrice(price: PlanPrice | null): string | null {
  if (!price) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: price.currency.toUpperCase(),
  }).format(price.amount / 100);
}

function annualDiscountPercent(monthly: PlanPrice | null, annual: PlanPrice | null): number | null {
  if (!monthly || !annual || monthly.currency !== annual.currency || monthly.amount <= 0) return null;
  const percent = Math.round((1 - annual.amount / (12 * monthly.amount)) * 100);
  return percent > 0 ? percent : null;
}

export async function getPlanPrices(): Promise<PlanPrices> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.prices;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) return { monthly: null, annual: null, annualDiscountPercent: null };

  const stripe = new Stripe(stripeSecretKey);
  const [monthly, annual] = await Promise.all([
    getPlanPrice(stripe, process.env[PLAN_PRODUCT_ENV.monthly]),
    getPlanPrice(stripe, process.env[PLAN_PRODUCT_ENV.annual]),
  ]);
  const prices: PlanPrices = {
    monthly: formatPrice(monthly),
    annual: formatPrice(annual),
    annualDiscountPercent: annualDiscountPercent(monthly, annual),
  };
  // A failed lookup is tried again on the next visit
  if (monthly && annual) cached = { prices, at: Date.now() };
  return prices;
}
