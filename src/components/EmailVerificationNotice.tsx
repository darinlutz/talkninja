'use client';

import { useState } from 'react';
import { MailCheck } from 'lucide-react';

const SEND_FAILED = "We couldn't send the email. Please try again in a few minutes.";

// Shown above every page to a signed-in user whose email address isn't confirmed yet (src/lib/emailVerification.ts):
// subscribing and AI features wait for it. Resend Link emails a new link (POST /api/auth/verify-email, a few an
// hour). With `verified`, the address was just confirmed: it says so once.
export default function EmailVerificationNotice({ email, verified = false }: { email: string; verified?: boolean }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  if (verified) {
    return (
      <section role="status" className="border-b border-green-200 bg-green-50 px-4 py-3">
        <p className="mx-auto flex max-w-3xl items-center gap-2 text-sm text-green-700">
          <MailCheck className="h-4 w-4 shrink-0" aria-hidden />
          Your email address is confirmed and your account is active.
        </p>
      </section>
    );
  }

  const resend = async () => {
    setState('sending');
    setError('');
    try {
      const response = await fetch('/api/auth/verify-email', { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || SEND_FAILED);
        setState('idle');
        return;
      }
      setState('sent');
    } catch {
      setError(SEND_FAILED);
      setState('idle');
    }
  };

  return (
    <section aria-label="Confirm your email address" className="border-b border-powder-500/30 bg-powder-500/10 px-4 py-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 text-sm text-dark-blue md:flex-row md:items-center md:gap-6">
        <p className="flex min-w-0 flex-1 items-start gap-2">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-powder-600" aria-hidden />
          <span>
            <span className="font-semibold">Activate your account.</span> We sent a link to{' '}
            <span translate="no" className="font-semibold">{email}</span>. Open it to confirm your email address
            before you subscribe.
            {state === 'sent' && <span className="mt-1 block text-slate-600">Sent. Check your inbox (and spam folder).</span>}
            {error && <span role="alert" className="mt-1 block text-red-700">{error}</span>}
          </span>
        </p>
        <button
          type="button"
          onClick={resend}
          disabled={state !== 'idle'}
          className="self-start rounded-lg bg-gradient-to-r from-powder-500 to-powder-600 px-4 py-2 font-semibold text-white transition-all hover:shadow-lg disabled:opacity-60 md:self-center"
        >
          {state === 'sending' ? 'Sending…' : 'Resend Link'}
        </button>
      </div>
    </section>
  );
}
