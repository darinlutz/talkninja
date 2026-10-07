import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { getCurrentUser, getRememberedEmail } from '@/lib/session';

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/');
  const rememberedEmail = await getRememberedEmail();

  return (
    <section className="py-12 px-4 bg-gradient-to-b from-slate-100 to-white flex justify-center">
      <div className="w-full max-w-lg bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8">
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-powder-600 via-powder-500 to-powder-600 bg-clip-text text-transparent">
          Log In
        </h1>
        <p className="text-slate-600 mb-8">Welcome back. Log in to your account.</p>
        <LoginForm rememberedEmail={rememberedEmail} />
      </div>
    </section>
  );
}
