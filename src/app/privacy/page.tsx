import type { Metadata } from 'next';
import LegalDocument from '@/components/LegalDocument';
import { privacyPolicy } from '@/lib/legal';

export const metadata: Metadata = { title: 'Privacy Policy | TalkNinja' };

// The Privacy Policy, linked from the footer (and the signup form); open to everyone
export default function Page() {
  return <LegalDocument doc={privacyPolicy} />;
}
