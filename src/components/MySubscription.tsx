import CancelSubscriptionButton from './CancelSubscriptionButton';
import ReactivateSubscriptionButton from './ReactivateSubscriptionButton';
import type { SubscriptionOverview } from '@/lib/stripeBilling';
import { canSubscribe } from '@/lib/accountStatus';
import { isLiveStripeStatus, STRIPE_STATUS_LABELS } from '@/lib/subscriptionProjection';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'long' });
}

const BILLING_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  updated: { ok: true, text: 'Your billing details are up to date below.' },
  unavailable: { ok: false, text: 'Billing can’t be opened right now. Please try again in a moment, or contact support@talkninja.app.' },
  already: { ok: true, text: 'You already have a subscription, so nothing new was started.' },
};

function statusBadge(status: string | null): string {
  if (status === 'active' || status === 'trialing') return 'bg-green-100 text-green-700';
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete' || status === 'paused') return 'bg-amber-100 text-amber-800';
  if (status === 'canceled' || status === 'incomplete_expired') return 'bg-red-100 text-red-700';
  return 'bg-powder-500/15 text-powder-600';
}

const button =
  'w-full px-6 py-3 rounded-lg font-semibold transition-colors text-powder-600 bg-white border border-powder-500/50 hover:bg-powder-500/10';

// The Account page's My Subscription: the plan, price, Stripe status, billing dates, cancellation, card and invoices,
// read from Stripe on each visit (src/lib/stripeBilling.ts getSubscriptionOverview), with Subscribe, Manage
// Subscription and Update Payment Method (Stripe's Customer Portal), Cancel (at the end of the paid period),
// Reactivate and the billing history. Only the signed-in account's own billing.
export default function MySubscription({
  accountStatus,
  stripeStatus,
  stripeCustomerId,
  paymentIssue,
  subscriptionEndDate,
  overview,
  monthlyPrice,
  billing,
}: {
  accountStatus: string;
  stripeStatus: string | null;
  stripeCustomerId: string | null;
  paymentIssue: string | null;
  subscriptionEndDate: string | null;
  overview: SubscriptionOverview | null;
  monthlyPrice: string | null;
  billing: string | null;
}) {
  const status = overview?.status ?? stripeStatus;
  const live = isLiveStripeStatus(status);
  const cancelAt = overview?.cancelAt ?? null;
  const message = billing ? BILLING_MESSAGES[billing] : null;
  const showSubscribe = !live && canSubscribe(accountStatus);
  const price = overview?.price ?? monthlyPrice;

  return (
    <div id="subscription" className="bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8 scroll-mt-24">
      <h2 className="text-2xl font-bold text-dark-blue mb-4">My Subscription</h2>

      {message && (
        <p
          role="status"
          className={`mb-4 p-3 rounded-lg text-sm ${message.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}
        >
          {message.text}
        </p>
      )}

      {live && paymentIssue === 'payment_failed' && (
        <p role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          Your last payment didn’t go through. Stripe will try again; update your payment method below to keep your
          subscription.
          {overview?.openInvoiceUrl && (
            <>
              {' '}
              <a href={overview.openInvoiceUrl} className="font-semibold underline" target="_blank" rel="noopener noreferrer">
                Pay the invoice now
              </a>
            </>
          )}
        </p>
      )}
      {live && paymentIssue === 'action_required' && (
        <p role="alert" className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          Your bank needs you to confirm the payment.{' '}
          {overview?.openInvoiceUrl ? (
            <a href={overview.openInvoiceUrl} className="font-semibold underline" target="_blank" rel="noopener noreferrer">
              Confirm the payment
            </a>
          ) : (
            'Check your email from Stripe to confirm it.'
          )}
        </p>
      )}

      {status ? (
        <dl className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200">
          <Row label="Plan">{overview?.planName ?? 'TalkNinja Monthly Subscription'}</Row>
          <Row label="Price">{price ? `${price} / month` : '—'}</Row>
          <Row label="Status">
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${statusBadge(status)}`}>
              {STRIPE_STATUS_LABELS[status] ?? status}
            </span>
          </Row>
          {live && !cancelAt && <Row label="Next billing date">{formatDate(overview?.currentPeriodEnd ?? subscriptionEndDate)}</Row>}
          <Row label="Cancellation">
            {cancelAt
              ? `Scheduled: ends ${formatDate(cancelAt)}`
              : live
                ? 'None scheduled'
                : `Ended${subscriptionEndDate ? `; access until ${formatDate(subscriptionEndDate)}` : ''}`}
          </Row>
          {overview?.paymentMethod && <Row label="Payment method">{overview.paymentMethod}</Row>}
          <Row label="Started">{formatDate(overview?.startedAt ?? null)}</Row>
        </dl>
      ) : (
        <p className="bg-white rounded-lg border border-slate-200 px-4 py-3 text-slate-600">
          You don’t have a subscription. The Monthly Subscription{price ? ` is ${price} a month and` : ''} opens every
          belt’s Training and Tests, free practice, the Translator and AI Friend.
        </p>
      )}

      <div className="mt-6 space-y-3">
        {showSubscribe && (
          <form action="/api/create-checkout-session" method="POST">
            <button
              type="submit"
              name="plan"
              value="monthly"
              disabled={!monthlyPrice}
              className="w-full px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors disabled:opacity-60"
            >
              Subscribe{monthlyPrice ? ` (${monthlyPrice} / month)` : ''}
            </button>
          </form>
        )}

        {live && cancelAt && <ReactivateSubscriptionButton endsOn={formatDate(cancelAt)} />}

        {stripeCustomerId && (
          <>
            <form action="/api/billing-portal" method="POST">
              <button type="submit" className={button}>
                Manage Subscription
              </button>
            </form>
            {live && (
              <form action="/api/billing-portal" method="POST">
                <input type="hidden" name="flow" value="payment_method_update" />
                <button type="submit" className={button}>
                  Update Payment Method
                </button>
              </form>
            )}
          </>
        )}

        {live && !cancelAt && <CancelSubscriptionButton />}
      </div>

      {overview && overview.invoices.length > 0 && (
        <details className="mt-6 bg-white rounded-lg border border-slate-200">
          <summary className="cursor-pointer px-4 py-3 font-semibold text-powder-600">View Billing History</summary>
          <ul className="divide-y divide-slate-200 text-sm">
            {overview.invoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="text-dark-blue">
                  {formatDate(invoice.created)} · {invoice.amount}
                  <span className="ml-2 text-xs capitalize text-slate-500">{invoice.status}</span>
                </span>
                <span className="flex gap-3">
                  {invoice.hostedInvoiceUrl && (
                    <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-powder-600 hover:underline">
                      {invoice.status === 'paid' ? 'Receipt' : 'View'}
                    </a>
                  )}
                  {invoice.pdfUrl && (
                    <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-powder-600 hover:underline">
                      PDF
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-4 px-4 py-3">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="text-dark-blue font-medium text-right">{children}</dd>
    </div>
  );
}
