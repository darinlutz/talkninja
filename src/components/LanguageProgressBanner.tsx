import Link from 'next/link';
import BeltIcon from '@/components/BeltIcon';
import { beltName, continueTrainingHref, describeNextStep, type LanguageProgress } from '@/lib/languageLevels';

// The user's belt and next step in the language they're learning, shown at
// the top of the My Dojo page (styled by .dojo-status in src/app/landing.css).
// `progress` is null when signed out. The next step links to its tab on the
// Language page, like the Account page's "Continue training".
export default function LanguageProgressBanner({ progress }: { progress: LanguageProgress | null }) {
  if (!progress) {
    return <p className="dojo-setup">Sign in to save your progress and earn belts.</p>;
  }

  const nextStepHref = continueTrainingHref(progress);

  return (
    <div className="dojo-status">
      <BeltIcon color={progress.beltColor} className="w-9 h-6" />
      <span>
        {progress.language} · {beltName(progress.beltColor)}
      </span>
      <span className="dojo-divider" aria-hidden="true" />
      <span>
        Next step:{' '}
        {nextStepHref ? (
          <Link href={nextStepHref} className="dojo-next-step">
            {describeNextStep(progress)}
          </Link>
        ) : (
          <strong className="dojo-next-step">{describeNextStep(progress)}</strong>
        )}
      </span>
    </div>
  );
}
