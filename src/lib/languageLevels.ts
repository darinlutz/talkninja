// Belt-level rules and types shared by the server (recording progress) and
// the Language page. Dependency-free.
import type { Language } from './languages';

// Each belt level is worked through in this order; passing Writing earns the
// belt and starts the next level's Training.
export type LanguageActivity = 'training' | 'reading' | 'writing';
export type NextStep = LanguageActivity | 'complete';

export const MAX_BELT_LEVEL = 8;
// Reading/Writing test score (percent) needed to pass
export const PASSING_SCORE = 80;

export type LanguageProgress = {
  language: Language;
  // Highest level earned (0 = No Belt) and its "BeltLevelKey" color
  beltLevel: number;
  beltColor: string;
  // The level being worked on (null once every belt is earned) and what to
  // do there next
  workingLevel: number | null;
  nextStep: NextStep;
};

// Where someone starts in a language they haven't practiced yet
export function startingProgress(language: Language): LanguageProgress {
  return { language, beltLevel: 0, beltColor: 'No Belt', workingLevel: 1, nextStep: 'training' };
}

const ACTIVITY_NAMES: Record<LanguageActivity, string> = {
  training: 'Training',
  reading: 'Reading Test',
  writing: 'Writing Test',
};

// e.g. "Level 3 Reading Test", or "All belts earned"
export function describeNextStep(progress: LanguageProgress): string {
  if (progress.nextStep === 'complete' || progress.workingLevel === null) return 'All belts earned';
  return `Level ${progress.workingLevel} ${ACTIVITY_NAMES[progress.nextStep]}`;
}

// The Language page tab for each step
const STEP_TABS: Record<LanguageActivity, string> = {
  training: 'training',
  reading: 'readingTest',
  writing: 'writingTest',
};

// The Language page tab for the user's next step, or null once every belt
// is earned
export function nextStepTab(progress: LanguageProgress): string | null {
  return progress.nextStep === 'complete' ? null : STEP_TABS[progress.nextStep];
}

// Link to the Language page tab for the user's next step in a language
// (its Difficulty defaults to the level being worked on), or null once
// every belt is earned.
export function continueTrainingHref(progress: LanguageProgress): string | null {
  if (progress.nextStep === 'complete') return null;
  const params = new URLSearchParams({ tab: STEP_TABS[progress.nextStep], learn: progress.language });
  return `/language?${params}`;
}

// e.g. "Green Belt", or "No Belt"
export function beltName(color: string): string {
  return color === 'No Belt' ? color : `${color} Belt`;
}

// The result of recording a Training completion or test score
export type RecordedActivity = {
  progress: LanguageProgress;
  // Whether this was the user's next step (rather than practice)
  wasNextStep: boolean;
  // Whether it moved them on to a new step
  advanced: boolean;
  // Set when passing Writing earned a new belt
  newBelt: string | null;
};
