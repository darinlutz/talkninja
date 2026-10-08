import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import DojoIllustration, { type DojoScene } from '@/components/DojoIllustration';
import { getCurrentUser } from '@/lib/session';

// The practice tabs, each opening its tab on the Language page (?tab=)
const PRACTICE: { scene: DojoScene; title: string; text: string; tab: string }[] = [
  {
    scene: 'reading',
    title: 'Reading & Speaking',
    text: 'Read new sentences built from your vocabulary, hear them spoken, and say them out loud.',
    tab: 'reading',
  },
  {
    scene: 'writing',
    title: 'Writing',
    text: 'See a word or sentence, then type it from memory until it’s a match.',
    tab: 'writing',
  },
  {
    scene: 'translator',
    title: 'Translator',
    text: 'Translate anything between the language you speak and the one you’re learning.',
    tab: 'translator',
  },
  {
    scene: 'friend',
    title: 'Friend',
    text: 'Chat with a friendly ninja who asks you questions in the language you’re learning.',
    tab: 'friend',
  },
];

export default async function DojoPage() {
  const user = await getCurrentUser();

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-100 to-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold pb-2 bg-gradient-to-r from-powder-600 via-powder-500 to-powder-600 bg-clip-text text-transparent">
            My Dojo
          </h1>
          <p className="mt-2 text-lg text-slate-600">
            {user?.activeLearningLanguage ? (
              <>
                Pick how you want to practice <span className="font-semibold">{user.activeLearningLanguage}</span>{' '}
                today.
              </>
            ) : (
              'Pick how you want to practice today.'
            )}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {PRACTICE.map(({ scene, title, text, tab }) => (
            <Link
              key={tab}
              href={`/language?tab=${tab}`}
              className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-powder-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-powder-500 focus-visible:ring-offset-2"
            >
              <div className="aspect-[16/10] overflow-hidden">
                <div className="h-full w-full transition-transform duration-500 group-hover:scale-105">
                  <DojoIllustration scene={scene} />
                </div>
              </div>
              <div className="flex items-start justify-between gap-4 p-6">
                <div>
                  <h2 className="text-2xl font-bold text-dark-blue">{title}</h2>
                  <p className="mt-2 text-slate-600">{text}</p>
                </div>
                <span className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-powder-500/10 text-powder-600 transition-colors group-hover:bg-powder-600 group-hover:text-white">
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
