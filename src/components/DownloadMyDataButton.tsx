'use client';

import { useState } from 'react';
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog';
import { en } from '@/lib/i18n/en';

const inputClass =
  'w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors';

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
        className="w-full px-6 py-3 rounded-lg font-semibold text-powder-600 bg-white border border-powder-500 hover:bg-powder-500/10 transition-colors"
      >
        {t.download}
      </button>
      {open && (
        <PasswordConfirmDialog titleId="downloadDataTitle" title={t.download} busy={busy} onClose={close}>
          <form onSubmit={download}>
            <p className="mt-2 text-slate-600">{t.downloadDescription}</p>
            <label htmlFor="exportPassword" className="block mt-4 mb-1 text-sm font-medium">
              {t.passwordLabel}
            </label>
            <p className="mb-2 text-sm text-slate-500">{t.passwordHelp}</p>
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
            {error && <p role="alert" className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</p>}
            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="flex-1 px-4 py-2 rounded-lg font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={!password || busy}
                className="flex-1 px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 disabled:opacity-50"
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
