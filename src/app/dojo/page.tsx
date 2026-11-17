import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { hasPracticeAccess } from '@/lib/accountStatus';
import LanguageProgressBanner from '@/components/LanguageProgressBanner';
import { getCurrentUser } from '@/lib/session';
import { getLanguageProgress } from '@/lib/languageProgress';
import { startingProgress } from '@/lib/languageLevels';
import { DEFAULT_LEARN_LANGUAGE, DEFAULT_USER_LANGUAGE } from '@/lib/languages';
import reading from '@/assets/dojo-reading.jpg';
import writing from '@/assets/dojo-writing.jpg';
import translator from '@/assets/dojo-translator.jpg';
import friend from '@/assets/dojo-friend.jpg';

// The practice tabs, each opening its tab on the Language page (?tab=). Artwork from color-belt-lingo (2026-11-17).
const PRACTICE: { img: StaticImageData; alt: string; title: string; text: string; tab: string }[] = [
  {
    img: reading,
    alt: 'Hooded ninja reading a glowing scroll in a night dojo',
    title: 'Reading & Speaking',
    text: 'Read new sentences built from your vocabulary, hear them spoken, and say them out loud.',
    tab: 'reading',
  },
  {
    img: writing,
    alt: 'Ninja hand writing calligraphy by candlelight',
    title: 'Writing',
    text: 'See a word or sentence, then type it from memory until it’s a match.',
    tab: 'writing',
  },
  {
    img: translator,
    alt: 'Ninja on a bridge between two lantern-lit cities joined by a thread of light',
    title: 'Translator',
    text: 'Translate anything between the language you speak and the one you’re learning.',
    tab: 'translator',
  },
  {
    img: friend,
    alt: 'Ninja mentor and student talking over tea in a quiet dojo',
    title: 'Friend',
    text: 'Chat with a ninja who asks you questions in the language you’re learning.',
    tab: 'friend',
  },
];

// In the home page's design (src/app/landing.css, scoped under .landing, .dojo-page)
export default async function DojoPage() {
  const user = await getCurrentUser();
  // My Dojo is for paid subscribers (and Admins); everyone else, signed in
  // or not, is sent to Pricing
  if (!user || !hasPracticeAccess(user.subscriptionEndDate, user.role)) redirect('/pricing');

  // The Account page's Language Setup, or the defaults the Language page uses
  const userLanguage = user.nativeLanguage ?? DEFAULT_USER_LANGUAGE;
  const learnLanguage = user.activeLearningLanguage ?? DEFAULT_LEARN_LANGUAGE;
  // The belt and next step in the language being learned
  const progress =
    (await getLanguageProgress(user.id)).find((entry) => entry.language === learnLanguage) ??
    startingProgress(learnLanguage);

  return (
    <div className="landing dojo-page">
      <div className="container-wide dojo-main">
        <header className="dojo-header">
          <span className="eyebrow">TRAINING HALL</span>
          <h1>My Dojo</h1>
          <p>
            Pick how you want to practice <strong>{learnLanguage}</strong> today.
          </p>
          <LanguageProgressBanner progress={progress} />
          <p className="dojo-setup">
            I speak <strong>{userLanguage}</strong> and want to learn <strong>{learnLanguage}</strong>.{' '}
            <Link href="/account">Change in Language Setup</Link>
          </p>
        </header>

        <div className="dojo-grid">
          {PRACTICE.map(({ img, alt, title, text, tab }, index) => (
            <Link key={tab} href={`/language?tab=${tab}`} className="dojo-card">
              <div className="dojo-card-media">
                <Image src={img} alt={alt} sizes="(max-width: 767px) 100vw, 50vw" priority={index < 2} />
                <span className="dojo-num" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <div className="dojo-card-body">
                <div>
                  <h2>{title}</h2>
                  <p>{text}</p>
                </div>
                <span className="dojo-arrow" aria-hidden="true">
                  <ArrowRight size={18} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
