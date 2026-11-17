'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ForgotPasswordForm from './ForgotPasswordForm';

// The training hall's dark fields (src/app/landing.css; the page wraps the form in .landing)
const inputClass = 'practice-field';

type LoginFormProps = {
  // Email saved by a previous "Remember me" login on this browser, or ''
  rememberedEmail: string;
};

export default function LoginForm({ rememberedEmail }: LoginFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({ emailAddress: rememberedEmail, password: '' });
  const [rememberMe, setRememberMe] = useState(rememberedEmail !== '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotPassword, setForgotPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, rememberMe }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to log in');
      }
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log in');
      setLoading(false);
    }
  };

  if (forgotPassword) {
    return <ForgotPasswordForm onBack={() => setForgotPassword(false)} backLabel="Back to Log In" />;
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <div>
        <label htmlFor="emailAddress" className="practice-label">
          Email Address
        </label>
        <input
          type="email"
          id="emailAddress"
          name="emailAddress"
          value={formData.emailAddress}
          onChange={handleChange}
          required
          autoComplete="email"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="password" className="practice-label">
          Password
        </label>
        <input
          type="password"
          id="password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>

      <label className="auth-check">
        <input
          type="checkbox"
          name="rememberMe"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
        />
        Remember me
      </label>

      {error && (
        <p className="practice-error">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="practice-btn practice-btn-wide auth-submit"
      >
        {loading ? 'Logging in...' : 'Log In'}
      </button>

      <p className="auth-note">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="auth-link">
          Sign up
        </Link>
      </p>
      <p className="auth-note">
        Forgot password?{' '}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setForgotPassword(true);
          }}
          className="auth-link"
        >
          Click here
        </a>
      </p>
    </form>
  );
}
