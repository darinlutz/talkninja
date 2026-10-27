'use client';

import { useState } from 'react';
import { MIN_PASSWORD_LENGTH } from '@/lib/passwordRules';

const inputClass =
  'w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue placeholder-slate-400 focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors';

// The My Account page's Change Password button. Opens a form for the current
// password and the new one twice (PUT /api/account/password). Afterwards
// every other browser and device is signed out; this one stays signed in.
export default function ChangePasswordButton() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const close = () => {
    if (saving) return;
    setOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setDone(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('The new passwords don’t match');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/account/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to change your password');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change your password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-6 py-3 rounded-lg font-semibold text-powder-600 bg-white border border-powder-600 hover:bg-powder-500/10 transition-colors"
      >
        Change Password
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="changePasswordTitle"
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="changePasswordTitle" className="text-xl font-bold text-dark-blue">
              {done ? 'Your password has been changed' : 'Change Password'}
            </h2>
            {done ? (
              <>
                <p className="mt-2 text-slate-600">
                  You’ve been signed out on every other browser and device. You’re still signed in here.
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
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="currentPassword" className="block mb-2 text-sm font-medium text-dark-blue">
                    Current Password
                  </label>
                  <input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="newPassword" className="block mb-2 text-sm font-medium text-dark-blue">
                    New Password{' '}
                    <span className="text-slate-500 font-normal">(at least {MIN_PASSWORD_LENGTH} characters)</span>
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="confirmNewPassword" className="block mb-2 text-sm font-medium text-dark-blue">
                    Confirm New Password
                  </label>
                  <input
                    id="confirmNewPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>

                {error && <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</p>}

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={saving}
                    className="flex-1 px-4 py-2 rounded-lg font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Change Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
