import { CalendarDays, CalendarRange, Check } from 'lucide-react';
import { canSubscribe, type Plan } from '@/lib/accountStatus';
import type { PlanPrices } from '@/lib/planPrices';

// The Pricing page's two plan cards, with each plan's Stripe price and a
// button that starts Checkout. Both plans share one style; Annual also shows
// how much it saves over 12 months of Monthly.

const PLANS: {
  plan: Plan;
  name: string;
  icon: React.ReactNode;
  // Shown after the price, e.g. "$4.99 / month"
  period: string;
  description: string;
  features: string[];
}[] = [
  {
    plan: 'monthly',
    name: 'Monthly Subscription',
    icon: <CalendarDays className="w-5 h-5" aria-hidden="true" />,
    period: '/ month',
    description: 'One month at a time. Cancel anytime from your account.',
    features: [
      'Training, Reading and Writing Tests for every belt',
      'Free Reading and Writing practice',
      'Translator and conversations with Friend',
    ],
  },
  {
    plan: 'annual',
    name: 'Annual Subscription',
    icon: <CalendarRange className="w-5 h-5" aria-hidden="true" />,
    period: '/ year',
    description: 'A full year at a time, billed once a year. Cancel anytime from your account.',
    features: ['Everything in Monthly', 'One payment a year'],
  },
];

export default function PricingPlans({
  prices,
  accountStatus,
}: {
  prices: PlanPrices;
  // The signed-in user's account status, or null when signed out
  accountStatus: string | null;
}) {
  // Signed-out visitors can click Buy; Checkout sends them to log in
  const buyable = accountStatus === null || canSubscribe(accountStatus);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {PLANS.map((info) => {
        const price = prices[info.plan];
        const discount = info.plan === 'annual' ? prices.annualDiscountPercent : null;

        return (
          <div
            key={info.plan}
            className="relative flex flex-col bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8"
          >
            {discount !== null && (
              <span className="absolute -top-3 right-6 px-3 py-1 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600">
                Save {discount}%
              </span>
            )}
            <h2 className="flex items-center gap-2 text-2xl font-bold text-dark-blue">
              <span className="text-powder-600">{info.icon}</span>
              {info.name}
            </h2>
            <p className="mt-2 text-slate-600">{info.description}</p>

            <p className="mt-6 flex items-baseline gap-2">
              <span className="text-4xl font-bold text-dark-blue">{price ?? '—'}</span>
              {price && <span className="text-slate-500 font-medium">{info.period}</span>}
            </p>
            {discount !== null && (
              <p className="mt-1 text-sm font-medium text-green-700">
                {discount}% less than 12 months of Monthly
              </p>
            )}

            <ul className="mt-6 mb-8 space-y-3">
              {info.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-dark-blue">
                  <Check className="mt-0.5 w-4 h-4 flex-shrink-0 text-powder-600" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-auto">
              {buyable ? (
                <form action="/api/create-checkout-session" method="POST">
                  <button
                    type="submit"
                    name="plan"
                    value={info.plan}
                    disabled={!price}
                    className="w-full px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Buy {info.name}
                  </button>
                </form>
              ) : (
                <p className="w-full px-6 py-3 rounded-lg font-semibold text-center bg-green-100 text-green-700">
                  You&apos;re subscribed
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
