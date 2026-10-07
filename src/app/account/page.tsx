import { redirect } from 'next/navigation';
import CancelSubscriptionButton from '@/components/CancelSubscriptionButton';
import { getCurrentUser } from '@/lib/session';
import { canBuy } from '@/lib/users';
import { ACCOUNT_STATUS } from '@/lib/accountStatus';
import { getLanguageProgress } from '@/lib/languageProgress';
import Link from 'next/link';
import { beltName, continueTrainingHref, describeNextStep } from '@/lib/languageLevels';
import BeltIcon from '@/components/BeltIcon';
import DeleteLanguageButton from '@/components/DeleteLanguageButton';
import SheetSetup from '@/components/SheetSetup';

// Green for a current subscription, red once it's canceled or expired,
// blue (the site color) otherwise
function statusBadgeClass(accountStatus: string): string {
  switch (accountStatus) {
    case ACCOUNT_STATUS.monthly:
    case ACCOUNT_STATUS.lifetime:
      return 'bg-green-100 text-green-700';
    case ACCOUNT_STATUS.canceled:
    case ACCOUNT_STATUS.expired:
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-powder-500/15 text-powder-600';
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'long' });
}

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const belts = await getLanguageProgress(user.id);
  const isMonthly = user.accountStatus === ACCOUNT_STATUS.monthly;
  const canBuyMonthly = canBuy(user, 'monthly');
  const canBuyLifetime = canBuy(user, 'lifetime');

  return (
    <section className="py-12 px-4 bg-gradient-to-b from-slate-100 to-white flex justify-center">
      <div className="w-full max-w-lg space-y-6">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-powder-600 via-powder-500 to-powder-600 bg-clip-text text-transparent">
          My Account
        </h1>

        <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-dark-blue mb-4">My Account Details</h2>
          <dl className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200">
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-sm font-medium text-slate-500">Name</dt>
              <dd className="text-dark-blue font-medium text-right">
                {user.userName}
              </dd>
            </div>
            <div className="flex justify-between items-center gap-4 px-4 py-3">
              <dt className="text-sm font-medium text-slate-500">Account Status</dt>
              <dd>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${statusBadgeClass(user.accountStatus)}`}
                >
                  {user.accountStatus}
                </span>
              </dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-sm font-medium text-slate-500">Signup Date</dt>
              <dd className="text-dark-blue font-medium text-right">
                {formatDate(user.signupDate)}
              </dd>
            </div>
            {isMonthly && (
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-sm font-medium text-slate-500">Subscription End Date</dt>
                <dd className="text-dark-blue font-medium text-right">
                  {formatDate(user.subscriptionEndDate)}
                </dd>
              </div>
            )}
          </dl>

          {(canBuyMonthly || canBuyLifetime) && (
            <form action="/api/create-checkout-session" method="POST" className="mt-6 space-y-3">
              {canBuyMonthly && (
                <button
                  type="submit"
                  name="plan"
                  value="monthly"
                  className="w-full px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors"
                >
                  Monthly Subscription
                </button>
              )}
              {canBuyLifetime && (
                <button
                  type="submit"
                  name="plan"
                  value="lifetime"
                  className="w-full px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors"
                >
                  Lifetime Subscription
                </button>
              )}
            </form>
          )}

          {isMonthly && <CancelSubscriptionButton />}
        </div>

        <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-dark-blue mb-4">Languages</h2>
          {belts.length > 0 ? (
            <dl className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200">
              {/* One belt per language the user has started */}
              {belts.map((progress) => {
                const continueHref = continueTrainingHref(progress);
                return (
                  <div key={progress.language} className="flex justify-between items-center gap-4 px-4 py-3">
                    <dt className="text-sm font-medium text-slate-500">{progress.language}</dt>
                    <dd className="flex items-center gap-3 flex-wrap justify-end text-dark-blue font-medium text-right">
                      {beltName(progress.beltColor)}
                      <BeltIcon color={progress.beltColor} />
                      {continueHref && (
                        <Link
                          href={continueHref}
                          title={`Next step: ${describeNextStep(progress)}`}
                          className="text-sm font-semibold text-powder-600 hover:underline"
                        >
                          Continue training
                        </Link>
                      )}
                      {/* Only a language with no belt earned yet can be removed */}
                      {progress.beltLevel === 0 && <DeleteLanguageButton language={progress.language} />}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : (
            <p className="bg-white rounded-lg border border-slate-200 px-4 py-3 text-slate-600">
              You haven&apos;t started a language yet.{' '}
              <Link href="/language" className="font-semibold text-powder-600 hover:underline">
                Start learning
              </Link>
            </p>
          )}
        </div>

        <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-dark-blue mb-2">Setup</h2>
          <SheetSetup />
        </div>
      </div>
    </section>
  );
}
