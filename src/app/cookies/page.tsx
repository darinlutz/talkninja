import type { Metadata } from 'next';
import LegalDocument from '@/components/LegalDocument';
import { cookiePolicy } from '@/lib/legal';

export const metadata: Metadata = { title: 'Cookie Policy | TalkNinja' };

// The Cookie Policy, linked from the footer (and the signup form); open to everyone
export default function Page() {
  return <LegalDocument doc={cookiePolicy} />;
}
