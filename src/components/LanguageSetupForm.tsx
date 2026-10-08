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

  const handleUserLanguageChange = (language: Language) => {
    setUserLanguage(language);
    save(() => saveLanguagePreferences({ nativeLanguage: language }));
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

  const selectClassName =
    'px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors';

  return (
    <div>
      <p className="text-slate-600 mb-6">
        Every tab on the Language page uses these languages.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="userLanguage" className="text-sm font-medium text-dark-blue">
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
        <label htmlFor="learnLanguage" className="text-sm font-medium text-dark-blue ml-4">
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
          className={`mt-3 text-sm ${status === 'error' ? 'text-red-700' : 'text-green-700'}`}
          role="status"
        >
          {message}
        </p>
      )}
    </div>
  );
}
