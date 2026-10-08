'use client';

// Hooks the Language page's Training/Reading Test/Writing Test tabs share
// for belt progress.
import { useState } from 'react';
import type { Language } from '@/lib/languages';
import {
  startingProgress,
  type LanguageActivity,
  type LanguageProgress,
  type RecordedActivity,
} from '@/lib/languageLevels';
import { recordLanguageResult, type ProgressMap } from '@/lib/languageTestClient';
import type { ProgressOutcome } from '@/components/ProgressUpdate';

// The user's progress in `language`, or null when signed out
export function progressFor(progressByLanguage: ProgressMap | null, language: Language): LanguageProgress | null {
  if (!progressByLanguage) return null;
  return progressByLanguage[language] ?? startingProgress(language);
}

// Sets the tab's Difficulty to the level being worked on whenever that
// level (or the language) changes, while still letting the user pick
// another Difficulty for practice.
export function useWorkingLevelDefault(progress: LanguageProgress | null, apply: (level: number) => void) {
  const key = progress?.workingLevel ? `${progress.language}|${progress.workingLevel}` : '';
  const [appliedKey, setAppliedKey] = useState('');
  if (key !== appliedKey) {
    setAppliedKey(key);
    if (progress?.workingLevel) apply(progress.workingLevel);
  }
}

// Saves a finished Training/test and reports what it meant for the user's
// progress (shown with <ProgressUpdate>). record() resolves to that outcome
// once saving is done, so callers can wait for it (e.g. before going back
// to My Dojo).
export function useProgressRecorder(onRecorded: (result: RecordedActivity) => void) {
  const [outcome, setOutcome] = useState<ProgressOutcome | null>(null);

  const record = async (input: {
    language: Language;
    level: number | null;
    activity: LanguageActivity;
    score?: number;
  }): Promise<ProgressOutcome> => {
    setOutcome('saving');
    let result: ProgressOutcome;
    try {
      result = await recordLanguageResult(input);
      if (result !== 'signedOut') onRecorded(result);
    } catch (error) {
      result = { error: error instanceof Error ? error.message : 'Failed to save your progress' };
    }
    setOutcome(result);
    return result;
  };

  return { outcome, record, clear: () => setOutcome(null) };
}
