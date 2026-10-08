import type { Metadata } from 'next';
import Stripe from 'stripe';
import { getCurrentUser } from '@/lib/session';
import { canBuy } from '@/lib/users';
import { ACCOUNT_STATUS, type Plan } from '@/lib/accountStatus';

export const metadata: Metadata = {
  title: 'Pricing — TalkNinja',
  description: 'TalkNinja monthly and lifetime subscriptions.',
};

type PlanInfo = {
  plan: Plan;
  name: string;
  productEnv: string;
  // Shown after the price, e.g. "$9.99 / month"
  period: string;
  description: string;
  features: string[];
  // The account status that means the user already has this plan
  ownedStatus: string;
};

const PLANS: PlanInfo[] = [
  {
    plan: 'monthly',
    name: 'Monthly Subscription',
    productEnv: 'STRIPE_MONTHLY_PRODUCT_ID',
    period: '/ month',
    description: 'One month at a time. Cancel anytime from your account.',
    features: [
      'Training, Reading and Writing Tests for every belt',
      'Free Reading and Writing practice',
      'Translator and conversations with Friend',
    ],
    ownedStatus: ACCOUNT_STATUS.monthly,
  },
  {
    plan: 'lifetime',
    name: 'Lifetime Subscription',
    productEnv: 'STRIPE_LIFETIME_PRODUCT_ID',
    period: 'one time',
    description: 'Pay once and keep your place in the dojo for good.',
    features: [
      'Everything in Monthly',
      'No renewals, ever',
      'Replaces a monthly subscription if you have one',
    ],
    ownedStatus: ACCOUNT_STATUS.lifetime,
  },
];

// Reads the plan's price from the default Price of its Stripe Product, the
// same Price /api/create-checkout-session charges. Null if it can't be read.
async function getPlanPrice(stripe: Stripe | null, productId: string | undefined): Promise<string | null> {
  if (!stripe || !productId) return null;

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

export default async function PricingPage() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

  const [user, prices] = await Promise.all([
    getCurrentUser(),
    Promise.all(PLANS.map((info) => getPlanPrice(stripe, process.env[info.productEnv]))),
  ]);

  return (
    <section className="py-12 px-4 bg-gradient-to-b from-slate-100 to-white flex justify-center">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-powder-600 via-powder-500 to-powder-600 bg-clip-text text-transparent">
            Pricing
          </h1>
          <p className="mt-3 text-slate-600">
            Same curiosity. Two ways to keep it going.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {PLANS.map((info, index) => {
            const price = prices[index];
            const owned = user?.accountStatus === info.ownedStatus;
            // Logged-out visitors can click Buy; checkout sends them to log in
            const buyable = !user || canBuy(user, info.plan);

            return (
              <div
                key={info.plan}
                className="flex flex-col bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8"
              >
                <h2 className="text-2xl font-bold text-dark-blue">{info.name}</h2>
                <p className="mt-2 text-slate-600">{info.description}</p>

                <p className="mt-6 flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-dark-blue">{price ?? '—'}</span>
                  {price && <span className="text-slate-500 font-medium">{info.period}</span>}
                </p>

                <ul className="mt-6 mb-8 space-y-3">
                  {info.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-dark-blue">
                      <span className="text-powder-600 font-bold" aria-hidden="true">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                  {owned ? (
                    <p className="w-full px-6 py-3 rounded-lg font-semibold text-center bg-green-100 text-green-700">
                      Your current plan
                    </p>
                  ) : buyable ? (
                    <form action="/api/create-checkout-session" method="POST">
                      <button
                        type="submit"
                        name="plan"
                        value={info.plan}
                        disabled={!price}
                        className="w-full px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {info.plan === 'lifetime' && user?.accountStatus === ACCOUNT_STATUS.monthly
                          ? `Upgrade to ${info.name}`
                          : `Buy ${info.name}`}
                      </button>
                    </form>
                  ) : (
                    <p className="w-full px-6 py-3 rounded-lg font-semibold text-center bg-slate-200 text-slate-600">
                      Included in your Lifetime Subscription
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
