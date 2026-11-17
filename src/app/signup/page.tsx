import { redirect } from 'next/navigation';
import SignupForm from '@/components/SignupForm';
import { getCurrentUser } from '@/lib/session';

// In the training hall's dark design (src/app/landing.css, .auth-page)
export default async function SignupPage() {
  if (await getCurrentUser()) redirect('/');

  return (
    <div className="landing auth-page">
      <div className="auth-main auth-main-wide">
        <header className="practice-header">
          <span className="eyebrow">BEGIN YOUR TRAINING</span>
          <h1>Create an Account</h1>
          <p>Sign up to get started with TalkNinja.</p>
        </header>
        <div className="practice-panel">
          <SignupForm />
        </div>
      </div>
    </div>
  );
}
