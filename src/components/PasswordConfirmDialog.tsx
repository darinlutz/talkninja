'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// A modal for actions that need the account's password (Download My Data, Delete My Account). A native <dialog>:
// focus stays inside, Escape closes it (unless busy), and focus returns to what opened it.
export default function PasswordConfirmDialog({
  titleId,
  title,
  busy,
  onClose,
  children,
}: {
  titleId: string;
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (opener?.isConnected) window.setTimeout(() => opener.focus(), 0);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[min(100%-2rem,28rem)] max-h-[90vh] rounded-xl bg-white p-6 text-dark-blue shadow-xl backdrop:bg-slate-900/50"
    >
      <h2 id={titleId} className="text-xl font-bold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
