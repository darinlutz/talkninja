'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ForgotPasswordForm from './ForgotPasswordForm';
import { DEFAULT_LEARN_LANGUAGE, DEFAULT_USER_LANGUAGE, LANGUAGES, type Language } from '@/lib/languages';

const inputClass =
  'w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue placeholder-slate-400 focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors';

export default function SignupForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    userName: '',
    emailAddress: '',
    password: '',
    nativeLanguage: DEFAULT_USER_LANGUAGE as Language,
    activeLearningLanguage: DEFAULT_LEARN_LANGUAGE as Language,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotPassword, setForgotPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create account');
      }
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
      setLoading(false);
    }
  };

  if (forgotPassword) {
    return <ForgotPasswordForm onBack={() => setForgotPassword(false)} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="userName" className="block text-sm font-medium text-dark-blue mb-2">
          Name *
        </label>
        <input
          type="text"
          id="userName"
          name="userName"
          value={formData.userName}
          onChange={handleChange}
          required
          autoComplete="name"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="emailAddress" className="block text-sm font-medium text-dark-blue mb-2">
          Email Address *
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
          Password * <span className="text-slate-500 font-normal">(at least 8 characters)</span>
        </label>
        <input
          type="password"
          id="password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      {/* Changed later on the Account page's Language Setup */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="nativeLanguage" className="block text-sm font-medium text-dark-blue mb-2">
            I speak *
          </label>
          <select
            id="nativeLanguage"
            name="nativeLanguage"
            value={formData.nativeLanguage}
            onChange={handleChange}
            required
            className={inputClass}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="activeLearningLanguage" className="block text-sm font-medium text-dark-blue mb-2">
            and want to learn *
          </label>
          <select
            id="activeLearningLanguage"
            name="activeLearningLanguage"
            value={formData.activeLearningLanguage}
            onChange={handleChange}
            required
            className={inputClass}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="-mt-3 text-sm text-slate-500">You can change these anytime on your Account page.</p>

      {error && (
        <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-powder-500 to-powder-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-60"
      >
        {loading ? 'Creating account...' : 'Create Account'}
      </button>

      <p className="text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="text-powder-600 hover:underline font-medium">
          Log in
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
