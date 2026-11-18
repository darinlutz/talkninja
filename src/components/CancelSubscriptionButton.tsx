'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CANCELLATION_REASONS,
  MAX_CANCELLATION_NOTES_LENGTH,
  type CancellationReasonValue,
} from '@/lib/cancellationReasons';

type Confirmation = {
  subscriptionId: string;
  status: string;
  canceledAt: string;
};

function formatDate(iso: string | null, withTime = false): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', withTime ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' });
}

// The My Account page's Cancel Subscription button (subscribers only).
// Opens a modal asking why they're cancelling; "Cancel Subscription" there
// schedules the cancellation in Stripe for the end of the paid period and
// shows Stripe's confirmation; "Remain Subscribed" just closes it.
export default function CancelSubscriptionButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancellationReasonValue | null>(null);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'idle' | 'cancelling' | 'error'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ confirmation: Confirmation; subscriptionEndDate: string | null } | null>(
    null
  );

  const close = () => {
    if (status === 'cancelling') return;
    setOpen(false);
    setError('');
    setStatus('idle');
    // After cancelling, show the account's new status and end date
    if (result) router.refresh();
  };

  const handleCancel = async () => {
    if (!reason) return;
    setStatus('cancelling');
    setError('');

    try {
      const response = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notes }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Your subscription could not be cancelled. Please try again.');
      }
      setResult({ confirmation: data.confirmation, subscriptionEndDate: data.subscriptionEndDate });
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Your subscription could not be cancelled. Please try again.');
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="practice-btn-danger"
      >
        Cancel Subscription
      </button>

      {open && (
        <div className="account-overlay" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancelSubscriptionTitle"
            className="account-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            {result ? (
              <>
                <h2 id="cancelSubscriptionTitle">
                  Your subscription is cancelled
                </h2>
                <p className="mt-2 account-intro">
                  You won’t be charged again. You keep full access until{' '}
                  <span className="font-semibold account-text">{formatDate(result.subscriptionEndDate)}</span>, when
                  it ends. Changed your mind? Use Reactivate Subscription on this page before then.
                </p>

                {/* Stripe's record of the cancellation, as proof */}
                <dl className="mt-5 account-list text-sm">
                  <div className="account-row text-sm">
                    <dt>Confirmation number</dt>
                    <dd translate="no" className="font-mono break-all">
                      {result.confirmation.subscriptionId}
                    </dd>
                  </div>
                  <div className="account-row text-sm">
                    <dt>Cancelled on</dt>
                    <dd>{formatDate(result.confirmation.canceledAt, true)}</dd>
                  </div>
                  <div className="account-row text-sm">
                    <dt>Stripe status</dt>
                    <dd className="capitalize">{result.confirmation.status}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs account-note">
                  Keep this confirmation number; it’s Stripe’s reference for your cancelled subscription.
                </p>

                <button
                  type="button"
                  autoFocus
                  onClick={close}
                  className="mt-6 practice-btn practice-btn-wide"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h2 id="cancelSubscriptionTitle">
                  Cancel your subscription?
                </h2>
                <p className="mt-2 account-intro">We’re sorry to see you go. Why are you cancelling?</p>

                <fieldset className="mt-4 space-y-2">
                  <legend className="sr-only">Reason for cancelling</legend>
                  {CANCELLATION_REASONS.map((option) => (
                    <label
                      key={option.value}
                      className={`account-choice ${reason === option.value ? 'account-choice-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="cancellationReason"
                        value={option.value}
                        checked={reason === option.value}
                        onChange={() => setReason(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </fieldset>

                <label htmlFor="cancellationNotes" className="practice-label mt-4 mb-2">
                  Comments <span className="font-normal">(optional)</span>
                </label>
                <textarea
                  id="cancellationNotes"
                  rows={3}
                  maxLength={MAX_CANCELLATION_NOTES_LENGTH}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything you’d like to tell us"
                  className="practice-field resize-y"
                />

                {error && (
                  <p className="mt-3 practice-error">{error}</p>
                )}

                <div className="account-dialog-actions">
                  <button
                    type="button"
                    autoFocus
                    onClick={close}
                    disabled={status === 'cancelling'}
                    className="practice-btn"
                  >
                    Remain Subscribed
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={!reason || status === 'cancelling'}
                    className="practice-btn-danger"
                  >
                    {status === 'cancelling' ? 'Cancelling…' : 'Cancel Subscription'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
