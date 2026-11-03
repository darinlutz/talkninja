import Link from 'next/link';
import CookieSettingsButton from '@/components/CookieSettingsButton';
import DeleteAccountButton from '@/components/DeleteAccountButton';
import DownloadMyDataButton from '@/components/DownloadMyDataButton';
import { en } from '@/lib/i18n/en';
import { SERVICE_PROVIDERS, SUPPORT_EMAIL } from '@/lib/legal';
import { KEPT_FOR_ACCOUNT_LIFETIME, RETENTION_RULES } from '@/lib/retentionRules';

// The Account page's Privacy & Data section ("My Settings → Privacy & Data"): what's kept and what isn't, where
// it goes, Download My Data, Cookie Settings and Delete My Account. Admins can't delete their account (there must
// always be an Admin), so they don't see that part.
export default function PrivacyDataSection({ isSubscribed, canDelete }: { isSubscribed: boolean; canDelete: boolean }) {
  const t = en.privacyData;
  const kept = [
    ...KEPT_FOR_ACCOUNT_LIFETIME.map((item) => `${item} — until you delete your account`),
    `Records of your AI feature use — ${RETENTION_RULES.aiUsageRows.days} days`,
  ];
  return (
    <div id="privacy" className="bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8 scroll-mt-24">
      <h2 className="text-2xl font-bold text-dark-blue mb-2">{t.title}</h2>
      <p className="text-slate-600 mb-4">
        {t.intro}{' '}
        <Link href="/privacy" className="font-semibold text-powder-600 hover:underline">
          {en.footer.privacy}
        </Link>
      </p>

      <div className="space-y-4">
        <details className="bg-white rounded-lg border border-slate-200 px-4 py-3">
          <summary className="cursor-pointer font-semibold text-dark-blue">{t.whatWeKeep}</summary>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-slate-700">
            {kept.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
        <details className="bg-white rounded-lg border border-slate-200 px-4 py-3">
          <summary className="cursor-pointer font-semibold text-dark-blue">{t.whatWeDontKeep}</summary>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-slate-700">
            {t.notKept.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
        <details className="bg-white rounded-lg border border-slate-200 px-4 py-3">
          <summary className="cursor-pointer font-semibold text-dark-blue">{t.sentTo}</summary>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-slate-700">
            {SERVICE_PROVIDERS.map((p) => (
              <li key={p.name}>
                <span translate="no" className="font-medium">{p.name}</span>: {p.service}
              </li>
            ))}
          </ul>
        </details>

        <div className="space-y-1">
          <DownloadMyDataButton />
          <p className="text-sm text-slate-500">{t.downloadDescription}</p>
        </div>

        <div className="space-y-1">
          <CookieSettingsButton
            label={t.cookieSettings}
            className="w-full px-6 py-3 rounded-lg font-semibold text-powder-600 bg-white border border-powder-500 hover:bg-powder-500/10 transition-colors"
          />
          <p className="text-sm text-slate-500">{t.cookieDescription}</p>
        </div>

        {canDelete && (
          <div className="space-y-1">
            <h3 className="sr-only">{t.deleteHeading}</h3>
            <DeleteAccountButton isSubscribed={isSubscribed} />
            <p className="text-sm text-slate-500">{t.deleteDescription}</p>
          </div>
        )}

        <p className="text-sm text-slate-600">
          {t.otherRequests}{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-powder-600 hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
