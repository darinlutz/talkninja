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
    <section id="privacy" className="practice-panel account-section">
      <h2>{t.title}</h2>
      <p className="account-intro">
        {t.intro}{' '}
        <Link href="/privacy" className="account-link">
          {en.footer.privacy}
        </Link>
      </p>

      <div className="space-y-4">
        <details className="account-details">
          <summary>{t.whatWeKeep}</summary>
          <ul>
            {kept.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
        <details className="account-details">
          <summary>{t.whatWeDontKeep}</summary>
          <ul>
            {t.notKept.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
        <details className="account-details">
          <summary>{t.sentTo}</summary>
          <ul>
            {SERVICE_PROVIDERS.map((p) => (
              <li key={p.name}>
                <span translate="no" className="font-medium account-text">{p.name}</span>: {p.service}
              </li>
            ))}
          </ul>
        </details>

        <div className="space-y-1">
          <DownloadMyDataButton />
          <p className="account-note">{t.downloadDescription}</p>
        </div>

        <div className="space-y-1">
          <CookieSettingsButton
            label={t.cookieSettings}
            className="practice-btn-outline w-full py-3"
          />
          <p className="account-note">{t.cookieDescription}</p>
        </div>

        {canDelete && (
          <div className="space-y-1">
            <h3 className="sr-only">{t.deleteHeading}</h3>
            <DeleteAccountButton isSubscribed={isSubscribed} />
            <p className="account-note">{t.deleteDescription}</p>
          </div>
        )}

        <p className="account-note">
          {t.otherRequests}{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="account-link">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    </section>
  );
}
