'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ForgotPasswordForm from './ForgotPasswordForm';

const inputClass =
  'w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue placeholder-slate-400 focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors';

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
    return <ForgotPasswordForm onBack={() => setForgotPassword(false)} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="emailAddress" className="block text-sm font-medium text-dark-blue mb-2">
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
        <label htmlFor="password" className="block text-sm font-medium text-dark-blue mb-2">
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

      <label className="flex items-center gap-2 text-sm text-dark-blue cursor-pointer">
        <input
          type="checkbox"
          name="rememberMe"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 accent-powder-600"
        />
        Remember me
      </label>

      {error && (
        <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-powder-500 to-powder-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-60"
      >
        {loading ? 'Logging in...' : 'Log In'}
      </button>

      <p className="text-center text-sm text-slate-600">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-powder-600 hover:underline font-medium">
          Sign up
        </Link>
      </p>
      <p className="text-center text-sm text-slate-600">
        Forgot password?{' '}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setForgotPassword(true);
          }}
          className="text-powder-600 hover:underline font-medium"
        >
          Click here
        </a>
      </p>
    </form>
  );
}
