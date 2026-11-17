import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { getCurrentUser, getRememberedEmail } from '@/lib/session';

// In the training hall's dark design (src/app/landing.css, .auth-page)
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (await getCurrentUser()) redirect('/');
  // The result of an email confirmation link opened in a browser that isn't signed in (GET /api/auth/verify-email)
  const { emailVerified } = await searchParams;
  const rememberedEmail = await getRememberedEmail();

  return (
    <div className="landing auth-page">
      <div className="auth-main">
        <header className="practice-header">
          <span className="eyebrow">WELCOME BACK</span>
          <h1>Log In</h1>
          <p>Step back into the dojo and keep training.</p>
        </header>
        <div className="practice-panel space-y-6">
          {emailVerified === '1' && (
            <p role="status" className="practice-success">
              Your email address is confirmed and your account is active. Log in to continue.
            </p>
          )}
          {emailVerified === 'invalid' && (
            <p role="alert" className="practice-error">
              This confirmation link is invalid or has expired. Log in and use Resend Link to get a new one.
            </p>
          )}
          <LoginForm rememberedEmail={rememberedEmail} />
        </div>
      </div>
    </div>
  );
}
