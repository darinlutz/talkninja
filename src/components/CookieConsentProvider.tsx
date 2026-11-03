'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import CookieConsentBanner from '@/components/CookieConsentBanner';
import CookiePreferencesDialog from '@/components/CookiePreferencesDialog';
import {
  allChoices,
  grantsAny,
  normalizeChoices,
  OFFERED_CATEGORIES,
  type ConsentChoices,
  type ConsentMethod,
  type ConsentVia,
  type OptionalCategory,
} from '@/lib/cookieConsent';
import { storageKeysOf } from '@/lib/cookieInventory';
import { en } from '@/lib/i18n/en';

// The visitor's cookie consent on the page (src/lib/cookieConsent.ts), adapted from RacingCoach. The root layout
// reads the consent cookie on the server (getConsentState) and passes what may run, so the first render already
// leaves out anything not consented to: optional technologies are rendered inside <ConsentGate>, which renders
// nothing until their category is granted. Shows the banner while a choice is needed (never, while TalkNinja offers
// no optional categories) and Cookie Settings when opened from the footer. A refusal takes effect at once, before
// the server answers, and removes that category's browser storage; a grant only once the server has recorded it.

export type ConsentInitialState = {
  needsChoice: boolean;
  reconsent: boolean;
  granted: ConsentChoices;
};

type CookieConsentContextValue = {
  granted: ConsentChoices;
  openPreferences: (from?: HTMLElement | null) => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

export function useCookieConsent(): CookieConsentContextValue {
  const value = useContext(CookieConsentContext);
  if (!value) throw new Error('useCookieConsent must be used inside CookieConsentProvider');
  return value;
}

// Removes the browser storage of the categories no longer granted (their cookies are deleted by /api/consent).
// Inventory names ending in "*" are prefixes.
function clearStorage(categories: OptionalCategory[]) {
  for (const category of categories) {
    for (const kind of ['localStorage', 'sessionStorage'] as const) {
      try {
        const storage = window[kind];
        for (const name of storageKeysOf(category, kind)) {
          if (name.endsWith('*')) {
            const prefix = name.slice(0, -1);
            for (const key of Object.keys(storage)) if (key.startsWith(prefix)) storage.removeItem(key);
          } else {
            storage.removeItem(name);
          }
        }
      } catch {
        // Storage can be blocked; there's nothing in it then
      }
    }
  }
}

export default function CookieConsentProvider({ initial, children }: { initial: ConsentInitialState; children: ReactNode }) {
  const c = en.cookieConsent;
  const [granted, setGranted] = useState<ConsentChoices>(initial.granted);
  const [bannerOpen, setBannerOpen] = useState(initial.needsChoice);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const opener = useRef<HTMLElement | null>(null);

  const openPreferences = useCallback((from?: HTMLElement | null) => {
    opener.current = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setError('');
    setPreferencesOpen(true);
  }, []);

  const closePreferences = useCallback(() => {
    setPreferencesOpen(false);
    setError('');
    const back = opener.current;
    opener.current = null;
    if (back?.isConnected) window.setTimeout(() => back.focus(), 0);
  }, []);

  const choose = useCallback(
    async (via: ConsentVia, method: ConsentMethod, picked?: ConsentChoices) => {
      const next = via === 'acceptAll' ? allChoices(true) : via === 'rejectAll' ? allChoices(false) : normalizeChoices(picked);
      // Taken back at once: whatever is turned off stops now, whether or not the server answers
      const withdrawn = OFFERED_CATEGORIES.filter((category) => next[category] !== true);
      setGranted((current) =>
        Object.fromEntries(OFFERED_CATEGORIES.map((category) => [category, current[category] === true && next[category] === true]))
      );
      clearStorage(withdrawn);

      setSaving(true);
      setError('');
      setStatus('');
      try {
        const response = await fetch('/api/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ via, method, choices: next, language: document.documentElement.lang || 'en' }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as { choices: ConsentChoices };
        setGranted(normalizeChoices(body.choices));
        setBannerOpen(false);
        if (preferencesOpen) closePreferences();
        setStatus(c.saved);
      } catch {
        if (grantsAny(next)) {
          // Nothing optional starts without a recorded choice
          setError(c.saveFailed);
        } else {
          // A refusal holds on this page even if it couldn't be saved; the banner asks again next visit
          setBannerOpen(false);
          if (preferencesOpen) closePreferences();
        }
      } finally {
        setSaving(false);
      }
    },
    [preferencesOpen, closePreferences, c.saved, c.saveFailed]
  );

  const value = useMemo(() => ({ granted, openPreferences }), [granted, openPreferences]);

  return (
    <CookieConsentContext.Provider value={value}>
      {/* Early in the page, so keyboard and screen reader users reach it first; it's drawn at the bottom */}
      {bannerOpen && (
        <CookieConsentBanner
          reconsent={initial.reconsent}
          saving={saving}
          error={preferencesOpen ? '' : error}
          onAcceptAll={() => choose('acceptAll', 'banner')}
          onRejectAll={() => choose('rejectAll', 'banner')}
          onCustomize={(from) => openPreferences(from)}
        />
      )}
      {preferencesOpen && (
        <CookiePreferencesDialog
          granted={granted}
          saving={saving}
          error={error}
          onClose={closePreferences}
          onAcceptAll={() => choose('acceptAll', 'preferenceCenter')}
          onRejectAll={() => choose('rejectAll', 'preferenceCenter')}
          onSave={(choices) => choose('save', 'preferenceCenter', choices)}
        />
      )}
      <p role="status" aria-live="polite" className="sr-only">{status}</p>
      {children}
    </CookieConsentContext.Provider>
  );
}
