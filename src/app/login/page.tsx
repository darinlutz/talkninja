import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { getCurrentUser, getRememberedEmail } from '@/lib/session';

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
    <section className="py-12 px-4 bg-gradient-to-b from-slate-100 to-white flex justify-center">
      <div className="w-full max-w-lg bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8">
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-powder-600 via-powder-500 to-powder-600 bg-clip-text text-transparent">
          Log In
        </h1>
        <p className="text-slate-600 mb-8">Welcome back. Log in to your account.</p>
        {emailVerified === '1' && (
          <p role="status" className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm mb-6">
            Your email address is confirmed and your account is active. Log in to continue.
          </p>
        )}
        {emailVerified === 'invalid' && (
          <p role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-6">
            This confirmation link is invalid or has expired. Log in and use Resend Link to get a new one.
          </p>
        )}
        <LoginForm rememberedEmail={rememberedEmail} />
      </div>
    </section>
  );
}
