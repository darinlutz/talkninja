import { redirect } from 'next/navigation';
import SignupForm from '@/components/SignupForm';
import { getCurrentUser } from '@/lib/session';

export default async function SignupPage() {
  if (await getCurrentUser()) redirect('/');

  return (
    <section className="py-12 px-4 bg-gradient-to-b from-slate-100 to-white flex justify-center">
      <div className="w-full max-w-lg bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8">
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-powder-600 via-powder-500 to-powder-600 bg-clip-text text-transparent">
          Create an Account
        </h1>
        <p className="text-slate-600 mb-8">Sign up to get started with TalkNinja.</p>
        <SignupForm />
      </div>
    </section>
  );
}
