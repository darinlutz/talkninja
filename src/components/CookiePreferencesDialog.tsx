'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { OFFERED_CATEGORIES, type ConsentCategory, type ConsentChoices } from '@/lib/cookieConsent';
import { COOKIE_INVENTORY } from '@/lib/cookieInventory';
import { en } from '@/lib/i18n/en';

type CookiePreferencesDialogProps = {
  granted: ConsentChoices;
  saving: boolean;
  error: string;
  onClose: () => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onSave: (choices: ConsentChoices) => void;
};

const buttonClass =
  'px-4 py-2 rounded-lg font-semibold text-powder-600 bg-white border border-powder-500 hover:bg-powder-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-powder-500 focus-visible:ring-offset-2 transition-colors disabled:opacity-60';

// Cookie Settings (CookieConsentProvider): each category the site uses, what it's for and what it uses
// (src/lib/cookieInventory.ts), with an unticked-by-default switch for each optional one. While no optional category
// is offered it lists the strictly necessary items, says so, and has just a Done button. A native modal <dialog>:
// the page behind can't be reached until it closes, Escape or the close button closes it without changing
// anything, and the provider puts focus back where it was.
export default function CookiePreferencesDialog({ granted, saving, error, onClose, onAcceptAll, onRejectAll, onSave }: CookiePreferencesDialogProps) {
  const c = en.cookieConsent;
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [choices, setChoices] = useState<ConsentChoices>(() =>
    Object.fromEntries(OFFERED_CATEGORIES.map((category) => [category, granted[category] === true]))
  );

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    titleRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const categories: ConsentCategory[] = ['necessary', ...OFFERED_CATEGORIES];
  const offersChoice = OFFERED_CATEGORIES.length > 0;

  return (
    <dialog
      ref={ref}
      aria-labelledby="cookie-preferences-title"
      aria-describedby="cookie-preferences-intro"
      data-testid="cookie-preferences"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(100%-2rem,40rem)] max-h-[min(100%-2rem,52rem)] rounded-xl border border-slate-200 bg-white p-0 text-dark-blue shadow-xl backdrop:bg-slate-900/50"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <h2 id="cookie-preferences-title" ref={titleRef} tabIndex={-1} className="text-lg font-bold outline-none">
          {c.preferencesTitle}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={c.close}
          className="-m-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-dark-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-powder-500"
        >
          <X className="w-5 h-5" aria-hidden />
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <p id="cookie-preferences-intro" className="text-sm text-slate-700">
          {c.preferencesIntro}{' '}
          <Link href="/cookies" onClick={onClose} className="font-semibold text-powder-600 underline underline-offset-2 hover:no-underline">
            {c.cookiesLink}
          </Link>
          .
        </p>
        {!offersChoice && <p className="rounded-lg bg-powder-500/10 px-4 py-3 text-sm text-dark-blue">{c.noOptional}</p>}

        <ul className="space-y-3">
          {categories.map((category) => {
            const { name, description } = c.categories[category];
            const items = COOKIE_INVENTORY.filter((item) => item.category === category);
            const switchId = `cookie-category-${category}`;
            return (
              <li key={category} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  {category === 'necessary' ? (
                    <>
                      <h3 className="font-semibold">{name}</h3>
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">{c.alwaysActive}</span>
                    </>
                  ) : (
                    <>
                      <label htmlFor={switchId} className="font-semibold cursor-pointer">{name}</label>
                      <input
                        id={switchId}
                        type="checkbox"
                        role="switch"
                        checked={choices[category] === true}
                        aria-checked={choices[category] === true}
                        aria-describedby={`${switchId}-description`}
                        onChange={(e) => setChoices((current) => ({ ...current, [category]: e.target.checked }))}
                        className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full border border-slate-300 bg-slate-200 transition-colors relative
                          before:absolute before:left-0.5 before:top-1/2 before:h-[18px] before:w-[18px] before:-translate-y-1/2 before:rounded-full before:bg-white before:shadow before:transition-transform
                          checked:border-powder-600 checked:bg-powder-600 checked:before:translate-x-5
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-powder-500 focus-visible:ring-offset-2"
                      />
                    </>
                  )}
                </div>
                <p id={`${switchId}-description`} className="mt-1 text-sm text-slate-700">{description}</p>
                {items.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-slate-600 hover:text-dark-blue">{c.technologies}</summary>
                    <ul className="mt-1 space-y-0.5 pl-4">
                      {items.map((item) => (
                        <li key={item.name}>
                          <code translate="no" className="text-xs">{item.name}</code>{' '}
                          <span className="text-slate-600">({c.kinds[item.kind]}, {item.provider})</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
        {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
      </div>

      <div className={`grid grid-cols-1 gap-2 border-t border-slate-200 px-5 py-4 ${offersChoice ? 'sm:grid-cols-3' : ''}`}>
        {offersChoice ? (
          <>
            <button type="button" className={buttonClass} onClick={onAcceptAll} disabled={saving}>
              {c.acceptAll}
            </button>
            <button type="button" className={buttonClass} onClick={onRejectAll} disabled={saving}>
              {c.rejectAll}
            </button>
            <button type="button" className={buttonClass} onClick={() => onSave(choices)} disabled={saving}>
              {saving ? c.saving : c.savePreferences}
            </button>
          </>
        ) : (
          <button type="button" className={buttonClass} onClick={onClose}>
            {c.done}
          </button>
        )}
      </div>
    </dialog>
  );
}
