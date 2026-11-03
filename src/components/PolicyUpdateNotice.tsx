'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { en, fill } from '@/lib/i18n/en';
import { MINIMUM_AGE, POLICY_VERSIONS } from '@/lib/policyVersions';

// Shown above every page to a signed-in user who hasn't accepted the current Terms of Service (an account from
// before the Terms existed or before they changed; src/lib/policyAcceptances.ts). Also asks accounts from before the
// age requirement to confirm they're 18 or older. Both boxes start unticked; Accept records the version shown
// (POST /api/account/policy-acceptance) and the notice goes away. It doesn't block the site.
export default function PolicyUpdateNotice({ needsAgeConfirmation }: { needsAgeConfirmation: boolean }) {
  const t = en.policyUpdate;
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(!needsAgeConfirmation);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (done) return null;

  const accept = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/account/policy-acceptance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versions: { terms: POLICY_VERSIONS.terms }, ageConfirmed: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t.failed);
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label={t.label} className="border-b border-powder-500/30 bg-powder-500/10 px-4 py-4">
      <div className="mx-auto max-w-3xl space-y-2 text-sm text-dark-blue">
        <h2 className="font-semibold">{t.title}</h2>
        <p>{t.body}</p>
        {needsAgeConfirmation && (
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} className="mt-1" />
            <span>{fill(t.ageConfirm, { age: MINIMUM_AGE })}</span>
          </label>
        )}
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
          <span>
            {t.acceptBefore}
            <Link href="/terms" target="_blank" className="font-semibold text-powder-600 underline underline-offset-2">
              {en.footer.terms}
            </Link>
            {t.acceptAfter}
          </span>
        </label>
        {error && <p role="alert" className="text-red-700 font-semibold">{error}</p>}
        <button
          type="button"
          onClick={accept}
          disabled={!agreed || !ageConfirmed || saving}
          className="px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t.accepting : t.accept}
        </button>
      </div>
    </section>
  );
}
