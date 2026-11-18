'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Language } from '@/lib/translate';
import { LANGUAGES } from '@/lib/languages';
import { saveLanguagePreferences, startLanguageProgress } from '@/lib/languageTestClient';

// The Account page's "Language Setup": the "I speak" and "and want to learn"
// languages, which every tab on the Language page uses. Each pick saves
// right away.
export default function LanguageSetupForm({
  initialUserLanguage,
  initialLearnLanguage,
}: {
  initialUserLanguage: Language;
  initialLearnLanguage: Language;
}) {
  const router = useRouter();
  const [userLanguage, setUserLanguage] = useState(initialUserLanguage);
  const [learnLanguage, setLearnLanguage] = useState(initialLearnLanguage);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const save = async (work: () => Promise<unknown>) => {
    setStatus('saving');
    setMessage('');
    try {
      await work();
      setStatus('saved');
      setMessage('Saved.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to save your languages. Please try again.');
    }
  };

  // The whole site is shown in the "I speak" language, so refresh the page
  // to switch it over
  const handleUserLanguageChange = (language: Language) => {
    setUserLanguage(language);
    save(async () => {
      await saveLanguagePreferences({ nativeLanguage: language });
      router.refresh();
    });
  };

  // Picking a language to learn also adds it to the Languages list below at
  // No Belt (if it isn't there yet), so refresh the page to show it
  const handleLearnLanguageChange = (language: Language) => {
    setLearnLanguage(language);
    save(async () => {
      await saveLanguagePreferences({ activeLearningLanguage: language });
      await startLanguageProgress(language);
      router.refresh();
    });
  };

  // The Account page's dark design (src/app/landing.css)
  const selectClassName = 'practice-select';

  return (
    <div>
      <p className="account-intro">
        Every tab on the Language page uses these languages.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="userLanguage" className="practice-label">
          I speak
        </label>
        <select
          id="userLanguage"
          name="userLanguage"
          value={userLanguage}
          onChange={(e) => handleUserLanguageChange(e.target.value as Language)}
          className={selectClassName}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <label htmlFor="learnLanguage" className="practice-label sm:ml-4">
          and want to learn
        </label>
        <select
          id="learnLanguage"
          name="learnLanguage"
          value={learnLanguage}
          onChange={(e) => handleLearnLanguageChange(e.target.value as Language)}
          className={selectClassName}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </div>

      {message && (
        <p
          className={`mt-3 ${status === 'error' ? 'practice-error' : 'practice-success'}`}
          role="status"
        >
          {message}
        </p>
      )}
    </div>
  );
}
