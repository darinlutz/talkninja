'use client';

import { useState } from 'react';
import { MIN_PASSWORD_LENGTH } from '@/lib/passwordRules';

// The Account page's dark fields (src/app/landing.css; the page wraps everything in .landing)
const inputClass = 'practice-field';

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
    <div className="account-actions">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="practice-btn-outline"
      >
        Change Password
      </button>

      {open && (
        <div className="account-overlay" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="changePasswordTitle"
            className="account-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="changePasswordTitle">
              {done ? 'Your password has been changed' : 'Change Password'}
            </h2>
            {done ? (
              <>
                <p className="mt-2 account-intro">
                  You’ve been signed out on every other browser and device. You’re still signed in here.
                </p>
                <button
                  type="button"
                  autoFocus
                  onClick={close}
                  className="mt-4 practice-btn practice-btn-wide"
                >
                  Done
                </button>
              </>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="currentPassword" className="practice-label">
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
                  <label htmlFor="newPassword" className="practice-label">
                    New Password{' '}
                    <span className="font-normal">(at least {MIN_PASSWORD_LENGTH} characters)</span>
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
                  <label htmlFor="confirmNewPassword" className="practice-label">
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

                {error && <p className="practice-error">{error}</p>}

                <div className="account-dialog-actions">
                  <button
                    type="button"
                    onClick={close}
                    disabled={saving}
                    className="practice-btn-ghost"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="practice-btn"
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
