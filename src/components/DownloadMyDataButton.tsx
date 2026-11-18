'use client';

import { useState } from 'react';
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog';
import { en } from '@/lib/i18n/en';

// The Account page's dark fields (src/app/landing.css; the page wraps everything in .landing)
const inputClass = 'practice-field';

// Privacy & Data → Download My Data: asks for the password, then saves the JSON file from POST /api/account/export
export default function DownloadMyDataButton() {
  const t = en.privacyData;
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setOpen(false);
    setPassword('');
    setError('');
  };

  const download = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t.downloadFailed);
      }
      const blob = await response.blob();
      const name = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'talkninja-my-data.json';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.downloadFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="practice-btn-outline w-full py-3"
      >
        {t.download}
      </button>
      {open && (
        <PasswordConfirmDialog titleId="downloadDataTitle" title={t.download} busy={busy} onClose={close}>
          <form onSubmit={download}>
            <p className="mt-2 account-intro">{t.downloadDescription}</p>
            <label htmlFor="exportPassword" className="practice-label mt-4">
              {t.passwordLabel}
            </label>
            <p className="mb-2 account-note">{t.passwordHelp}</p>
            <input
              id="exportPassword"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            {error && <p role="alert" className="mt-3 practice-error">{error}</p>}
            <div className="account-dialog-actions">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="practice-btn-ghost"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={!password || busy}
                className="practice-btn"
              >
                {busy ? t.downloading : t.download}
              </button>
            </div>
          </form>
        </PasswordConfirmDialog>
      )}
    </>
  );
}
