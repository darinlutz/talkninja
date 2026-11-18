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
  if (status === 'active' || status === 'trialing') return 'account-badge-green';
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete' || status === 'paused') return 'account-badge-amber';
  if (status === 'canceled' || status === 'incomplete_expired') return 'account-badge-red';
  return 'account-badge-blue';
}

// The Account page's dark design (src/app/landing.css, .account-page)
const button = 'practice-btn-outline';

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
    <section id="subscription" className="practice-panel account-section">
      <h2>My Subscription</h2>

      {message && (
        <p
          role="status"
          className={`mb-4 ${message.ok ? 'practice-success' : 'practice-error'}`}
        >
          {message.text}
        </p>
      )}

      {live && paymentIssue === 'payment_failed' && (
        <p role="alert" className="mb-4 practice-error">
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
        <p role="alert" className="mb-4 practice-warning">
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
        <dl className="account-list">
          <Row label="Plan">{overview?.planName ?? 'TalkNinja Monthly Subscription'}</Row>
          <Row label="Price">{price ? `${price} / month` : '—'}</Row>
          <Row label="Status">
            <span className={`account-badge ${statusBadge(status)}`}>
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
        <p className="account-empty">
          You don’t have a subscription. The Monthly Subscription{price ? ` is ${price} a month and` : ''} opens every
          belt’s Training and Tests, free practice, the Translator and AI Friend.
        </p>
      )}

      <div className="account-actions">
        {showSubscribe && (
          <form action="/api/create-checkout-session" method="POST">
            <button
              type="submit"
              name="plan"
              value="monthly"
              disabled={!monthlyPrice}
              className="practice-btn"
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
        <details className="mt-6 account-details">
          <summary>View Billing History</summary>
          <ul className="account-list text-sm">
            {overview.invoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="account-text">
                  {formatDate(invoice.created)} · {invoice.amount}
                  <span className="ml-2 text-xs capitalize account-note">{invoice.status}</span>
                </span>
                <span className="flex gap-3">
                  {invoice.hostedInvoiceUrl && (
                    <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="account-link">
                      {invoice.status === 'paid' ? 'Receipt' : 'View'}
                    </a>
                  )}
                  {invoice.pdfUrl && (
                    <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="account-link">
                      PDF
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="account-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
