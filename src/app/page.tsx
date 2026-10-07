import type { Metadata } from 'next';
import LandingPage from '@/components/LandingPage';

export const metadata: Metadata = {
  title: 'TalkNinja — Learn a language. Earn your belt.',
  description:
    'Learn from the language you already speak with color-connected vocabulary, voice practice, a conversational Friend, and a belt-by-belt path forward.',
  openGraph: {
    title: 'TalkNinja — Learn a language. Earn your belt.',
    description:
      'Different languages. Shared meaning. Discover color-connected learning and a rewarding path from your first white belt.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function Home() {
  return <LandingPage />;
}
