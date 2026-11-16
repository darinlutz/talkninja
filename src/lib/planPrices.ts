import Stripe from 'stripe';

// TalkNinja's one plan, the Monthly Subscription, is TALKNINJA_MONTHLY_PRODUCT_ID's default recurring Price in
// Stripe (see /api/create-checkout-session). Its price is read from Stripe, never written in the code.
export type PlanPrices = {
  // e.g. "$4.99", or null if it can't be read
  monthly: string | null;
};

// The Pricing page shows the price on every visit, so it's kept for a few minutes rather than asking Stripe each
// time. A price changed in Stripe shows up once this runs out.
const CACHE_MS = 10 * 60 * 1000;
let cached: { prices: PlanPrices; at: number } | null = null;

export async function getPlanPrices(): Promise<PlanPrices> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.prices;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const productId = process.env.TALKNINJA_MONTHLY_PRODUCT_ID;
  if (!stripeSecretKey || !productId) return { monthly: null };

  try {
    const product = await new Stripe(stripeSecretKey).products.retrieve(productId, { expand: ['default_price'] });
    const price = product.default_price;
    if (!price || typeof price === 'string' || price.unit_amount === null || price.recurring?.interval !== 'month') {
      console.error(`Stripe product ${productId} has no monthly default price`);
      return { monthly: null };
    }
    const prices = {
      monthly: new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency.toUpperCase() }).format(
        price.unit_amount / 100
      ),
    };
    cached = { prices, at: Date.now() };
    return prices;
  } catch (error) {
    // Tried again on the next visit
    console.error(`Stripe price lookup error for ${productId}:`, error);
    return { monthly: null };
  }
}
