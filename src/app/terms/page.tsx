import type { Metadata } from 'next';
import LegalDocument from '@/components/LegalDocument';
import { termsOfService } from '@/lib/legal';

export const metadata: Metadata = { title: 'Terms of Service | TalkNinja' };

// The Terms of Service, linked from the footer (and the signup form); open to everyone
export default function Page() {
  return <LegalDocument doc={termsOfService} />;
}
