'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RATE_LIMIT_EVENT, type RateLimitEventDetail } from '@/lib/rateLimitClient';

// Shown over any page (it's in the root layout) when one of its AI features
// was refused because the user's AI limit is used up (the Admin page's Rate
// Limiting, src/lib/rateLimits.ts): the server's message, when they can try
// again, and for a visitor who isn't signed in, buttons to create a free
// account or log in. Features open it with reportRateLimit
// (src/lib/rateLimitClient.ts). Escape or a click outside closes it.
export default function RateLimitDialog() {
  const [detail, setDetail] = useState<RateLimitEventDetail | null>(null);
  // The time the dialog opened, so "try again at" stays put while it's open
  const [openedAt, setOpenedAt] = useState(0);

  useEffect(() => {
    const onLimit = (event: Event) => {
      setDetail((event as CustomEvent<RateLimitEventDetail>).detail);
      setOpenedAt(Date.now());
    };
    window.addEventListener(RATE_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(RATE_LIMIT_EVENT, onLimit);
  }, []);

  useEffect(() => {
    if (!detail) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetail(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [detail]);

  if (!detail) return null;
  const { info } = detail;
  const close = () => setDetail(null);
  const title =
    info.reason === 'burst' ? 'Slow down a little' : info.reason === 'blocked' ? 'AI features unavailable' : 'AI limit reached';
  const retryAt =
    info.retryAfterSeconds !== null
      ? new Date(openedAt + info.retryAfterSeconds * 1000).toLocaleString('en-US', {
          dateStyle: info.retryAfterSeconds > 20 * 3600 ? 'medium' : undefined,
          timeStyle: 'short',
        })
      : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 px-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rateLimitTitle"
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl text-center"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="rateLimitTitle" className="text-xl font-bold text-dark-blue">
          {title}
        </h2>
        <p className="mt-2 text-slate-600">{detail.message}</p>
        {retryAt && (
          <p className="mt-3 text-sm text-slate-500">
            You can try again at <span className="font-semibold text-dark-blue">{retryAt}</span>.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {info.signUp && (
            <>
              <Link
                href="/signup"
                autoFocus
                onClick={close}
                className="block w-full px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors"
              >
                Create Account
              </Link>
              <Link
                href="/login"
                onClick={close}
                className="block w-full px-4 py-2 rounded-lg font-semibold text-powder-600 bg-white border border-powder-600 hover:bg-powder-500/10 transition-colors"
              >
                Log In
              </Link>
            </>
          )}
          <button
            type="button"
            autoFocus={!info.signUp}
            onClick={close}
            className={
              info.signUp
                ? 'w-full px-4 py-2 rounded-lg font-semibold text-slate-600 hover:bg-slate-50 transition-colors'
                : 'w-full px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors'
            }
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
