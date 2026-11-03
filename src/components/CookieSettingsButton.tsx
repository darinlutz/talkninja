'use client';

import { useCookieConsent } from '@/components/CookieConsentProvider';

// Opens Cookie Settings from the footer, the Cookie Policy and the Account page's Privacy & Data, for everyone
export default function CookieSettingsButton({ label, className }: { label: string; className?: string }) {
  const { openPreferences } = useCookieConsent();
  return (
    <button type="button" onClick={(e) => openPreferences(e.currentTarget)} aria-haspopup="dialog" className={className}>
      {label}
    </button>
  );
}
