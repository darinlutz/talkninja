import Link from 'next/link';
import CookieSettingsButton from '@/components/CookieSettingsButton';
import { en, fill } from '@/lib/i18n/en';

const linkClass = 'text-slate-600 hover:text-powder-600 hover:underline underline-offset-2';

// The footer on every page: the legal documents and Cookie Settings
export default function SiteFooter() {
  const t = en.footer;
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm">
        <p className="text-slate-500">{fill(t.rights, { year: new Date().getFullYear() })}</p>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/terms" className={linkClass}>{t.terms}</Link>
          <Link href="/privacy" className={linkClass}>{t.privacy}</Link>
          <Link href="/cookies" className={linkClass}>{t.cookies}</Link>
          <CookieSettingsButton label={t.cookieSettings} className={linkClass} />
        </nav>
      </div>
    </footer>
  );
}
