import { ArrowRight, CalendarDays, Check, CheckCircle2 } from 'lucide-react';
import { canSubscribe } from '@/lib/accountStatus';
import { belts } from '@/lib/landingSamples';
import type { PlanPrices } from '@/lib/planPrices';

// The Pricing page's plan: TalkNinja's one plan, the Monthly Subscription, with its Stripe price and a button that
// starts Checkout, beside every belt it includes. Design from color-belt-lingo (2026-11-17); styles in
// src/app/landing.css under .pricing-section.

const FEATURES = [
  'Training, Reading and Writing Tests for every belt',
  'Free Reading and Writing practice',
  'Translator and conversations with Friend',
];

const PERKS = ['No contracts', 'Cancel anytime', 'Any language pair'];

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
  // From Stripe; null if it couldn't be read, which disables Buy
  const price = prices.monthly;

  return (
    <div className="pricing-showcase">
      <article className="plan plan-featured">
        <div className="plan-glow" aria-hidden="true" />
        <h2 className="plan-label">
          <CalendarDays size={16} aria-hidden="true" /> MONTHLY SUBSCRIPTION
        </h2>
        <p className="plan-price">
          <span className="price-amount">{price ?? '—'}</span>
          {price && <span className="price-period">/ month</span>}
        </p>
        <p>
          Billed monthly. Cancel anytime from your account; you keep access until the end of the month you paid for.
        </p>
        <ul>
          {FEATURES.map((feature) => (
            <li key={feature}>
              <Check aria-hidden="true" /> {feature}
            </li>
          ))}
        </ul>
        <div className="plan-action">
          {buyable ? (
            <form action="/api/create-checkout-session" method="POST">
              {/* The app's own button style, like the home page's */}
              <button
                type="submit"
                name="plan"
                value="monthly"
                disabled={!price}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Buy Monthly Subscription <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </form>
          ) : (
            <p className="w-full px-6 py-4 rounded-xl font-semibold text-center bg-green-100 text-green-700">
              You&apos;re subscribed
            </p>
          )}
        </div>
      </article>

      <aside className="plan-path" aria-label="What the plan includes">
        <span className="eyebrow">EVERY BELT INCLUDED</span>
        <h3>One plan. The whole dojo.</h3>
        <ul className="plan-belts">
          {belts.map((belt) => (
            <li className="plan-belt" key={belt.name}>
              <span className={`belt ${belt.className}`} aria-hidden="true" />
              <span>{belt.name} belt</span>
            </li>
          ))}
        </ul>
        <ul className="plan-perks">
          {PERKS.map((perk) => (
            <li key={perk}>
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{perk}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
