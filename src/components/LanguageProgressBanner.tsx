import Link from 'next/link';
import BeltIcon from '@/components/BeltIcon';
import { beltName, continueTrainingHref, describeNextStep, type LanguageProgress } from '@/lib/languageLevels';

// The user's belt and next step in the language they're learning, shown at
// the top of the My Dojo page. `progress` is null when signed out. The next
// step links to its tab on the Language page, like the Account page's
// "Continue training".
export default function LanguageProgressBanner({ progress }: { progress: LanguageProgress | null }) {
  if (!progress) {
    return <p className="text-sm text-slate-500">Sign in to save your progress and earn belts.</p>;
  }

  const nextStepHref = continueTrainingHref(progress);

  return (
    <div className="inline-flex items-center gap-3 flex-wrap justify-center px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm text-dark-blue">
      <span className="font-semibold">
        {progress.language}: {beltName(progress.beltColor)}
      </span>
      <BeltIcon color={progress.beltColor} className="w-9 h-6" />
      <span className="text-slate-400">|</span>
      <span>
        Next step:{' '}
        {nextStepHref ? (
          <Link href={nextStepHref} className="font-semibold text-powder-600 hover:underline">
            {describeNextStep(progress)}
          </Link>
        ) : (
          <span className="font-semibold text-powder-600">{describeNextStep(progress)}</span>
        )}
      </span>
    </div>
  );
}
