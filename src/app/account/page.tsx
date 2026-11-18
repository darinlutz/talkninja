import { redirect } from 'next/navigation';
import MySubscription from '@/components/MySubscription';
import ChangePasswordButton from '@/components/ChangePasswordButton';
import PrivacyDataSection from '@/components/PrivacyDataSection';
import EmailVerificationNotice from '@/components/EmailVerificationNotice';
import MyAiUsageCard from '@/components/MyAiUsageCard';
import { readOwnAiUsage } from '@/lib/rateLimits';
import { isAdmin } from '@/lib/roles';
import { getCurrentUser } from '@/lib/session';
import { ACCOUNT_STATUS } from '@/lib/accountStatus';
import { getSubscriptionOverview } from '@/lib/stripeBilling';
import { getPlanPrices } from '@/lib/planPrices';
import { getUserById } from '@/lib/users';
import { getLanguageProgress } from '@/lib/languageProgress';
import Link from 'next/link';
import { beltName, continueTrainingHref, describeNextStep } from '@/lib/languageLevels';
import BeltIcon from '@/components/BeltIcon';
import DeleteLanguageButton from '@/components/DeleteLanguageButton';
import SheetSetup from '@/components/SheetSetup';
import CustomAgentInstructionsForm from '@/components/CustomAgentInstructionsForm';
import LanguageSetupForm from '@/components/LanguageSetupForm';
import { DEFAULT_LEARN_LANGUAGE, DEFAULT_USER_LANGUAGE } from '@/lib/languages';
import { getCustomAgentInstructions, MAX_CUSTOM_INSTRUCTIONS_LENGTH } from '@/lib/customAgentInstructions';

// Green for a current subscription, red once it's canceled or expired,
// blue (the site color) otherwise
function statusBadgeClass(accountStatus: string): string {
  switch (accountStatus) {
    case ACCOUNT_STATUS.subscribed:
      return 'account-badge-green';
    case ACCOUNT_STATUS.canceled:
    case ACCOUNT_STATUS.expired:
      return 'account-badge-red';
    default:
      return 'account-badge-blue';
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'long' });
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) redirect('/login');
  const params = await searchParams;
  // Arrived from the email's confirmation link (GET /api/auth/verify-email)
  const justVerified = params.emailVerified === '1' && sessionUser.emailVerified;
  // Sent back by checkout: subscribing waits for the confirmation link
  const mustVerify = params.verifyEmail === '1' && !sessionUser.emailVerified;
  // Read from Stripe on every visit (and the account synced with it first), so coming back from Checkout or the
  // Customer Portal shows the change straight away
  const [overview, prices] = await Promise.all([getSubscriptionOverview(sessionUser), getPlanPrices()]);
  const user = (overview && (await getUserById(sessionUser.id))) || sessionUser;
  const billing = typeof params.billing === 'string' ? params.billing : null;
  const [belts, customInstructions, aiUsage] = await Promise.all([
    getLanguageProgress(user.id),
    getCustomAgentInstructions(user.id),
    readOwnAiUsage(user.id),
  ]);
  const isSubscribed = user.accountStatus === ACCOUNT_STATUS.subscribed;

  // In the training hall's dark design (src/app/landing.css, .account-page), like My Dojo and the practice tabs
  return (
    <>
    {justVerified && <EmailVerificationNotice email={user.emailAddress} verified />}
    <div className="landing account-page">
      <div className="account-main">
        <header className="practice-header">
          <span className="eyebrow">YOUR DOJO PASS</span>
          <h1>My Account</h1>
          <p>Your details, subscription, languages and privacy settings.</p>
        </header>

        {mustVerify && (
          <p role="alert" className="practice-error">
            Confirm your email address before subscribing. Open the link we emailed you, or use Resend Link above.
          </p>
        )}

        <section className="practice-panel account-section">
          <h2>My Account Details</h2>
          <dl className="account-list">
            <div className="account-row">
              <dt>Name</dt>
              <dd translate="no">{user.userName}</dd>
            </div>
            {/* Admin or User (src/lib/roles.ts), read from the database with the session */}
            <div className="account-row">
              <dt>Account Role</dt>
              <dd>
                <span className={`account-badge ${isAdmin(user.role) ? 'account-badge-blue' : 'account-badge-neutral'}`}>
                  {user.role}
                </span>
              </dd>
            </div>
            <div className="account-row">
              <dt>Account Status</dt>
              <dd>
                <span className={`account-badge ${statusBadgeClass(user.accountStatus)}`}>{user.accountStatus}</span>
              </dd>
            </div>
            <div className="account-row">
              <dt>Signup Date</dt>
              <dd>{formatDate(user.signupDate)}</dd>
            </div>
          </dl>

          {/* Every account has a password (there's no Google sign-in) */}
          <ChangePasswordButton />
        </section>

        <MySubscription
          accountStatus={user.accountStatus}
          stripeStatus={user.stripeStatus}
          stripeCustomerId={user.stripeCustomerId}
          paymentIssue={user.stripePaymentIssue}
          subscriptionEndDate={user.subscriptionEndDate}
          overview={overview}
          monthlyPrice={prices.monthly}
          billing={billing}
        />

        <section className="practice-panel account-section">
          <h2>Language Setup</h2>
          {/* Same defaults as the Language page uses when nothing is saved */}
          <LanguageSetupForm
            initialUserLanguage={user.nativeLanguage ?? DEFAULT_USER_LANGUAGE}
            initialLearnLanguage={user.activeLearningLanguage ?? DEFAULT_LEARN_LANGUAGE}
          />
        </section>

        <section className="practice-panel account-section">
          <h2>Languages</h2>
          {belts.length > 0 ? (
            <dl className="account-list">
              {/* One belt per language the user has started */}
              {belts.map((progress) => {
                const continueHref = continueTrainingHref(progress);
                return (
                  <div key={progress.language} className="account-row">
                    <dt>{progress.language}</dt>
                    <dd className="flex items-center gap-3 flex-wrap justify-end">
                      {beltName(progress.beltColor)}
                      <BeltIcon color={progress.beltColor} />
                      {continueHref && (
                        <Link
                          href={continueHref}
                          title={`Next step: ${describeNextStep(progress)}`}
                          className="account-link text-sm"
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
            <p className="account-empty">
              You haven&apos;t started a language yet.{' '}
              <Link href="/dojo" className="account-link">
                Start learning
              </Link>
            </p>
          )}
        </section>

        <section className="practice-panel account-section">
          <h2>Setup</h2>
          <SheetSetup />
        </section>

        <section className="practice-panel account-section">
          <h2>Customize Training Experience</h2>
          <CustomAgentInstructionsForm
            initialInstructions={customInstructions}
            maxLength={MAX_CUSTOM_INSTRUCTIONS_LENGTH}
          />
        </section>

        <MyAiUsageCard day={aiUsage.day} week={aiUsage.week} />

        {/* Download My Data, Cookie Settings and Delete My Account. Admins can't delete their account, so there's
            always an Admin */}
        <PrivacyDataSection isSubscribed={isSubscribed} canDelete={!isAdmin(user.role)} />
      </div>
    </div>
    </>
  );
}
