'use client';

import { useState } from 'react';

// The training hall's dark fields (src/app/landing.css; the page wraps the form in .landing)
const inputClass = 'practice-field';

export default function ForgotPasswordForm({ onBack, backLabel }: { onBack: () => void; backLabel: string }) {
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
    <form onSubmit={handleSubmit} className="auth-form">
      <div>
        <label htmlFor="resetEmailAddress" className="practice-label">
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
        <p className="practice-error">{error}</p>
      )}
      {sent && (
        <p className="practice-success">
          If {emailAddress} has a TalkNinja account, we&apos;ve sent it a password reset link. It expires in 1 hour.
          If it doesn&apos;t arrive in a few minutes, check your spam folder.
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="practice-btn practice-btn-wide auth-submit"
      >
        {loading ? 'Sending...' : 'Reset Password'}
      </button>

      <p className="auth-note">
        <button type="button" onClick={onBack} className="auth-link">
          {backLabel}
        </button>
      </p>
    </form>
  );
}
