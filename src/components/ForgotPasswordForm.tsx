'use client';

import { useState } from 'react';

const inputClass =
  'w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue placeholder-slate-400 focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors';

export default function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [emailAddress, setEmailAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailAddress }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset email');
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="resetEmailAddress" className="block text-sm font-medium text-dark-blue mb-2">
          Email Address *
        </label>
        <input
          type="email"
          id="resetEmailAddress"
          name="emailAddress"
          value={emailAddress}
          onChange={(e) => setEmailAddress(e.target.value)}
          required
          autoComplete="email"
          className={inputClass}
        />
      </div>

      {error && (
        <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</p>
      )}
      {sent && (
        <p className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
          If {emailAddress} has a TalkNinja account, we&apos;ve sent it a password reset link. It expires in 1 hour.
          If it doesn&apos;t arrive in a few minutes, check your spam folder.
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-powder-500 to-powder-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-60"
      >
        {loading ? 'Sending...' : 'Reset Password'}
      </button>

      <p className="text-center text-sm text-slate-600">
        <button type="button" onClick={onBack} className="text-powder-600 hover:underline font-medium">
          Back to Create an Account
        </button>
      </p>
    </form>
  );
}
