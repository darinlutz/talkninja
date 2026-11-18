'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog';
import { DELETE_CONFIRMATION } from '@/lib/accountDeletion';
import { en } from '@/lib/i18n/en';

// The Account page's dark fields (src/app/landing.css; the page wraps everything in .landing)
const inputClass = 'practice-field';

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
        className="practice-btn-danger w-full py-3"
      >
        {t.button}
      </button>

      {open && (
        <PasswordConfirmDialog titleId="deleteAccountTitle" title={t.title} busy={deleting} onClose={close}>
          <form onSubmit={handleDelete}>
            <div className="mt-2 space-y-2 account-intro text-sm">
              <p className="text-base">{t.body}</p>
              {isSubscribed && <p>{t.subscribed}</p>}
              <p>{t.kept}</p>
              <p>{t.sheet}</p>
            </div>

            <label htmlFor="deleteConfirmation" className="practice-label mt-4">
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
            <label htmlFor="deletePassword" className="practice-label mt-4">
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

            {error && <p role="alert" className="mt-3 practice-error">{error}</p>}

            <div className="account-dialog-actions">
              <button
                type="button"
                onClick={close}
                disabled={deleting}
                className="practice-btn"
              >
                {t.keep}
              </button>
              <button
                type="submit"
                disabled={typed !== DELETE_CONFIRMATION || !password || deleting}
                className="practice-btn-danger"
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
