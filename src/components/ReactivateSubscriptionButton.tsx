'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// The Account page's Reactivate Subscription (shown while a cancellation is scheduled): undoes it in Stripe
// (POST /api/reactivate-subscription), so the subscription renews as before
export default function ReactivateSubscriptionButton({ endsOn }: { endsOn: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle');
  const [error, setError] = useState('');

  const reactivate = async () => {
    if (!window.confirm(`Keep your subscription? It will renew on ${endsOn} and every month after, until you cancel.`)) return;
    setStatus('working');
    setError('');
    try {
      const response = await fetch('/api/reactivate-subscription', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Your subscription could not be reactivated. Please try again.');
      setStatus('idle');
      router.refresh();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Your subscription could not be reactivated. Please try again.');
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={reactivate}
        disabled={status === 'working'}
        className="w-full px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors disabled:opacity-60"
      >
        {status === 'working' ? 'Reactivating…' : 'Reactivate Subscription'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
