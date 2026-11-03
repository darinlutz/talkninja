'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog';
import { DELETE_CONFIRMATION } from '@/lib/accountDeletion';
import { en } from '@/lib/i18n/en';

const inputClass =
  'w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-300 transition-colors';

// Privacy & Data → Delete My Account (not shown to Admins). Explains what's deleted and what's kept, asks the user
// to type DELETE and enter their password, then deletes the account (DELETE /api/account), cancelling any live
// subscription first, and goes to the home page signed out.
export default function DeleteAccountButton({ isSubscribed }: { isSubscribed: boolean }) {
  const t = en.deleteAccount;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (deleting) return;
    setOpen(false);
    setTyped('');
    setPassword('');
    setError('');
  };

  const handleDelete = async (event: React.FormEvent) => {
    event.preventDefault();
    setDeleting(true);
    setError('');
    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t.failed);
      // Refreshed so the layout and nav show them signed out
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failed);
      setDeleting(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="w-full px-6 py-3 rounded-lg font-semibold text-red-600 bg-white border border-red-300 hover:bg-red-50 transition-colors"
      >
        {t.button}
      </button>

      {open && (
        <PasswordConfirmDialog titleId="deleteAccountTitle" title={t.title} busy={deleting} onClose={close}>
          <form onSubmit={handleDelete}>
            <div className="mt-2 space-y-2 text-slate-600 text-sm">
              <p className="text-base">{t.body}</p>
              {isSubscribed && <p>{t.subscribed}</p>}
              <p>{t.kept}</p>
              <p>{t.sheet}</p>
            </div>

            <label htmlFor="deleteConfirmation" className="block mt-4 mb-2 text-sm font-medium">
              {t.typeBefore}
              <span translate="no" className="font-mono font-bold">{DELETE_CONFIRMATION}</span>
              {t.typeAfter}
            </label>
            <input
              id="deleteConfirmation"
              autoComplete="off"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className={inputClass}
            />
            <label htmlFor="deletePassword" className="block mt-4 mb-2 text-sm font-medium">
              {en.privacyData.passwordLabel}
            </label>
            <input
              id="deletePassword"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />

            {error && <p role="alert" className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</p>}

            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
              <button
                type="button"
                onClick={close}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors disabled:opacity-60"
              >
                {t.keep}
              </button>
              <button
                type="submit"
                disabled={typed !== DELETE_CONFIRMATION || !password || deleting}
                className="flex-1 px-4 py-2 rounded-lg font-semibold text-red-600 bg-white border border-red-300 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? t.deleting : t.button}
              </button>
            </div>
          </form>
        </PasswordConfirmDialog>
      )}
    </div>
  );
}
