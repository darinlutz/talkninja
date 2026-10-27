'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DELETE_CONFIRMATION } from '@/lib/accountDeletion';

// The My Account page's Delete Account button (not shown to Admins). Asks
// the user to type DELETE, then deletes the account and all its data
// (DELETE /api/account), cancelling any live subscription first, and goes
// to the home page signed out.
export default function DeleteAccountButton({ isSubscribed }: { isSubscribed: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (deleting) return;
    setOpen(false);
    setTyped('');
    setError('');
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Your account could not be deleted. Please try again.');
      // Refreshed so the layout and nav show them signed out
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your account could not be deleted. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-6 py-3 rounded-lg font-semibold text-red-600 bg-white border border-red-300 hover:bg-red-50 transition-colors"
      >
        Delete Account
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deleteAccountTitle"
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="deleteAccountTitle" className="text-xl font-bold text-dark-blue">
              Delete your account?
            </h2>
            <p className="mt-2 text-slate-600">
              This permanently deletes your account, your belts and test scores in every language, and your saved
              settings. It can’t be undone.
              {isSubscribed && ' Your subscription will be cancelled, with no further charges.'}
            </p>

            <label htmlFor="deleteConfirmation" className="block mt-4 mb-2 text-sm font-medium text-dark-blue">
              Type <span translate="no" className="font-mono font-bold">{DELETE_CONFIRMATION}</span> to confirm
            </label>
            <input
              id="deleteConfirmation"
              autoComplete="off"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-300 transition-colors"
            />

            {error && <p className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</p>}

            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
              <button
                type="button"
                onClick={close}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors disabled:opacity-60"
              >
                Keep My Account
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={typed !== DELETE_CONFIRMATION || deleting}
                className="flex-1 px-4 py-2 rounded-lg font-semibold text-red-600 bg-white border border-red-300 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
