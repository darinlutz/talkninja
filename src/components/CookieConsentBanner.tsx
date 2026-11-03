'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { en } from '@/lib/i18n/en';

type CookieConsentBannerProps = {
  reconsent: boolean;
  saving: boolean;
  error: string;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onCustomize: (from: HTMLElement) => void;
};

const buttonClass =
  'px-4 py-2 rounded-lg font-semibold text-powder-600 bg-white border border-powder-500 hover:bg-powder-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-powder-500 focus-visible:ring-offset-2 transition-colors disabled:opacity-60';

// The cookie banner (CookieConsentProvider), across the bottom of every page until a choice is made. Shown only once
// TalkNinja offers optional cookies. Accept All, Reject Nonessential and Customize look the same and sit side by side:
// none is preselected or played down. It doesn't block the site, and only those buttons count as a choice (not
// scrolling, browsing on or closing the page). While it's showing, the page gets room at the bottom so nothing it
// covers is hidden for good, and keyboard focus scrolls clear of it.
export default function CookieConsentBanner({ reconsent, saving, error, onAcceptAll, onRejectAll, onCustomize }: CookieConsentBannerProps) {
  const c = en.cookieConsent;
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const banner = ref.current;
    if (!banner) return;
    const html = document.documentElement;
    const fit = () => {
      const height = `${banner.offsetHeight}px`;
      html.style.scrollPaddingBottom = height;
      document.body.style.paddingBottom = height;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      html.style.scrollPaddingBottom = '';
      document.body.style.paddingBottom = '';
    };
  }, []);

  return (
    <section
      ref={ref}
      aria-label={c.bannerLabel}
      aria-describedby="cookie-banner-body"
      data-testid="cookie-banner"
      className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.12)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-dark-blue">{reconsent ? c.reconsentTitle : c.title}</h2>
          <p id="cookie-banner-body" className="mt-1 text-sm text-slate-700">
            {reconsent && <>{c.reconsentBody} </>}
            {c.body}{' '}
            <Link href="/cookies" className="font-semibold text-powder-600 underline underline-offset-2 hover:no-underline">
              {c.cookiesLink}
            </Link>
            {' · '}
            <Link href="/privacy" className="font-semibold text-powder-600 underline underline-offset-2 hover:no-underline">
              {c.privacyLink}
            </Link>
          </p>
          {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:shrink-0">
          <button type="button" className={buttonClass} onClick={onAcceptAll} disabled={saving}>
            {c.acceptAll}
          </button>
          <button type="button" className={buttonClass} onClick={onRejectAll} disabled={saving}>
            {c.rejectAll}
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={(e) => onCustomize(e.currentTarget)}
            disabled={saving}
            aria-haspopup="dialog"
          >
            {c.customize}
          </button>
        </div>
      </div>
    </section>
  );
}
