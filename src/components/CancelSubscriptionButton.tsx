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
// cancels in Stripe and shows Stripe's confirmation, "Remain Subscribed"
// just closes it.
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
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-6 py-3 rounded-lg font-semibold text-red-600 bg-white border border-red-300 hover:bg-red-50 transition-colors"
      >
        Cancel Subscription
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancelSubscriptionTitle"
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            {result ? (
              <>
                <h2 id="cancelSubscriptionTitle" className="text-xl font-bold text-dark-blue">
                  Your subscription has been cancelled
                </h2>
                <p className="mt-2 text-slate-600">
                  You won’t be charged again. Your subscription ends on{' '}
                  <span className="font-semibold text-dark-blue">{formatDate(result.subscriptionEndDate)}</span>.
                </p>

                {/* Stripe's record of the cancellation, as proof */}
                <dl className="mt-5 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 text-sm">
                  <div className="flex justify-between gap-4 px-4 py-2">
                    <dt className="text-slate-500">Confirmation number</dt>
                    <dd translate="no" className="font-mono text-dark-blue break-all text-right">
                      {result.confirmation.subscriptionId}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 px-4 py-2">
                    <dt className="text-slate-500">Cancelled on</dt>
                    <dd className="text-dark-blue text-right">{formatDate(result.confirmation.canceledAt, true)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 px-4 py-2">
                    <dt className="text-slate-500">Stripe status</dt>
                    <dd className="text-dark-blue text-right capitalize">{result.confirmation.status}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-slate-500">
                  Keep this confirmation number; it’s Stripe’s reference for your cancelled subscription.
                </p>

                <button
                  type="button"
                  autoFocus
                  onClick={close}
                  className="mt-6 w-full px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h2 id="cancelSubscriptionTitle" className="text-xl font-bold text-dark-blue">
                  Cancel your subscription?
                </h2>
                <p className="mt-2 text-slate-600">We’re sorry to see you go. Why are you cancelling?</p>

                <fieldset className="mt-4 space-y-2">
                  <legend className="sr-only">Reason for cancelling</legend>
                  {CANCELLATION_REASONS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                        reason === option.value
                          ? 'border-powder-600 bg-powder-500/10'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="cancellationReason"
                        value={option.value}
                        checked={reason === option.value}
                        onChange={() => setReason(option.value)}
                        className="accent-powder-600"
                      />
                      <span className="text-dark-blue">{option.label}</span>
                    </label>
                  ))}
                </fieldset>

                <label htmlFor="cancellationNotes" className="block mt-4 mb-2 text-sm font-medium text-dark-blue">
                  Comments <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <textarea
                  id="cancellationNotes"
                  rows={3}
                  maxLength={MAX_CANCELLATION_NOTES_LENGTH}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything you’d like to tell us"
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue placeholder-slate-400 focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors resize-y"
                />

                {error && (
                  <p className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</p>
                )}

                <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
                  <button
                    type="button"
                    autoFocus
                    onClick={close}
                    disabled={status === 'cancelling'}
                    className="flex-1 px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors disabled:opacity-60"
                  >
                    Remain Subscribed
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={!reason || status === 'cancelling'}
                    className="flex-1 px-4 py-2 rounded-lg font-semibold text-red-600 bg-white border border-red-300 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
