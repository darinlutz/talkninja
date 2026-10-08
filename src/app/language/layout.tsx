import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { hasPracticeAccess } from '@/lib/accountStatus';

// The Language page runs in the browser, so its subscription check is here,
// on the server, before it loads: like My Dojo, it's for paid subscribers
// (and Admins), and everyone else, signed in or not, is sent to Pricing.
export default async function LanguageLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !hasPracticeAccess(user.accountStatus, user.role)) redirect('/pricing');

  return children;
}
