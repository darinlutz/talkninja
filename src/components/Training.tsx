'use client';

import { useRef, useState } from 'react';
import type { Language } from '@/lib/translate';
import type { WordCategory } from '@/lib/language';
import type { AlignedSegment } from '@/lib/wordAlignment';
import ColoredSegments from '@/components/ColoredSegments';
import TestDifficultySelector from '@/components/TestDifficultySelector';
import {
  alignTexts,
  FEMALE_VOICE,
  fetchTestItem,
  MALE_VOICE,
  speakText,
  withLanguages,
  type TestDifficulty,
  type TestHistory,
} from '@/lib/languageTestClient';
import { difficultyLevel, type ProgressMap } from '@/lib/languageTestClient';
import type { RecordedActivity } from '@/lib/languageLevels';
import { progressFor, useProgressRecorder, useWorkingLevelDefault } from '@/lib/useLanguageProgress';
import ProgressUpdate from '@/components/ProgressUpdate';

// Items per training session
const TRAINING_LENGTH = 10;

type SpeakStatus = 'idle' | 'loading' | 'error';

type TrainingItem = {
  text: string;
  translation: string;
  // Null when the words couldn't be paired up; the text is then uncolored
  segments: { sentenceSegments: AlignedSegment[]; translationSegments: AlignedSegment[] } | null;
};

interface TrainingProps {
  learnLanguage: Language;
  userLanguage: Language;
  // The user's belt progress; null when signed out
  progressByLanguage: ProgressMap | null;
  // Whether to show the Difficulty combobox (Admins only)
  showDifficulty: boolean;
  onProgressRecorded: (result: RecordedActivity) => void;
}

export default function Training({
  learnLanguage,
  userLanguage,
  progressByLanguage,
  showDifficulty,
  onProgressRecorded,
}: TrainingProps) {
  const [difficulty, setDifficulty] = useState<TestDifficulty>('words');
  useWorkingLevelDefault(progressFor(progressByLanguage, learnLanguage), (level) =>
    setDifficulty(String(level) as TestDifficulty)
  );
  const progressRecorder = useProgressRecorder(onProgressRecorded);
  // The language and level of this session, saved when it's completed
  const sessionInfo = useRef({ language: learnLanguage, level: difficultyLevel(difficulty) });
  const [wordCategory, setWordCategory] = useState<WordCategory>('adjectives');
  const [item, setItem] = useState<TrainingItem | null>(null);
  // How many items have been shown this session
  const [count, setCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [speakStatus, setSpeakStatus] = useState<SpeakStatus>('idle');
  const [speakFemaleStatus, setSpeakFemaleStatus] = useState<SpeakStatus>('idle');

  // Session memory so the same words/sentences don't keep coming up.
  // Resets on page reload.
  const history = useRef<TestHistory>({ usedWordsByCategory: {}, recentSentences: [] });
  const nextItemId = useRef(1);

  const speak = async (text: string, voice: string, setSpeak: (s: SpeakStatus) => void) => {
    if (!text.trim()) return;

    setSpeak('loading');
    try {
      await speakText(text, voice);
      setSpeak('idle');
    } catch (error) {
      setSpeak('error');
      setMessage(error instanceof Error ? error.message : 'Failed to play audio. Please try again.');
    }
  };

  const handleNext = async () => {
    if (count >= TRAINING_LENGTH) {
      setCompleted(true);
      progressRecorder.record({ ...sessionInfo.current, activity: 'training' });
      return;
    }
    if (count === 0) {
      sessionInfo.current = { language: learnLanguage, level: difficultyLevel(difficulty) };
    }

    setStatus('loading');
    setMessage('');

    try {
      const fetched = await withLanguages(
        await fetchTestItem(
          nextItemId.current++,
          difficulty,
          wordCategory,
          learnLanguage,
          userLanguage,
          history.current
        ),
        [learnLanguage, userLanguage]
      );
      const text = fetched.texts[learnLanguage] ?? '';
      const translation = fetched.texts[userLanguage] ?? '';
      const segments = await alignTexts(text, learnLanguage, translation, userLanguage);

      const newCount = count + 1;
      setItem({ text, translation, segments });
      setCount(newCount);
      setStatus('idle');

      // Alternate voices: male on odd items, female on even ones
      if (newCount % 2 === 1) {
        speak(text, MALE_VOICE, setSpeakStatus);
      } else {
        speak(text, FEMALE_VOICE, setSpeakFemaleStatus);
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to get the next item. Please try again.');
    }
  };

  const buttonClassName =
    'px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100';
  const boxClassName =
    'px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue whitespace-pre-wrap break-words';
  const spinner = (
    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
  );
  // Difficulty is locked during a session, so it's the session's level
  const completedLevel = difficultyLevel(difficulty);
  const buttonLabel =
    count === 0 ? 'Start Training' : count < TRAINING_LENGTH ? 'Next' : 'Complete Training';

  return (
    <div className="space-y-6">
      {/* Text in the language being learned */}
      <div>
        <div className="flex items-center justify-between mb-2 gap-2">
          <span className="text-sm font-medium text-dark-blue">{learnLanguage}</span>
          {count > 0 && (
            <span className="text-sm font-semibold text-powder-600">
              {count} of {TRAINING_LENGTH}
            </span>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          {/* A textarea can't color individual words, so the text is shown
              in a box styled like one */}
          <div className={`flex-1 min-h-[7.5rem] text-[2rem] ${boxClassName}`}>
            {!item ? (
              <span className="text-slate-400">Press Start Training to begin</span>
            ) : item.segments ? (
              <ColoredSegments segments={item.segments.sentenceSegments} />
            ) : (
              <span translate="no">{item.text}</span>
            )}
          </div>
          <div className="flex flex-row sm:flex-col gap-3 flex-shrink-0 sm:self-start">
            <button
              type="button"
              onClick={() => item && speak(item.text, MALE_VOICE, setSpeakStatus)}
              disabled={!item || speakStatus === 'loading'}
              aria-label="Speak"
              title="Speak"
              className={buttonClassName}
            >
              {speakStatus === 'loading' ? spinner : <span aria-hidden="true">🔊 ♂</span>}
            </button>
            <button
              type="button"
              onClick={() => item && speak(item.text, FEMALE_VOICE, setSpeakFemaleStatus)}
              disabled={!item || speakFemaleStatus === 'loading'}
              aria-label="Speak (female voice)"
              title="Speak (female voice)"
              className={buttonClassName}
            >
              {speakFemaleStatus === 'loading' ? spinner : <span aria-hidden="true">🔊 ♀</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Translation */}
      <div>
        <span className="block mb-2 text-sm font-medium text-dark-blue">{userLanguage}</span>
        <div className={`w-full min-h-[4.5rem] ${boxClassName}`}>
          {!item ? (
            <span className="text-slate-400">The translation will appear here</span>
          ) : item.segments ? (
            <ColoredSegments segments={item.segments.translationSegments} />
          ) : (
            <span translate="no">{item.translation}</span>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {message && (
        <div className="p-4 rounded-lg bg-red-100 border border-red-300 text-red-800">{message}</div>
      )}

      {showDifficulty && (
        <TestDifficultySelector
          idPrefix="training"
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          wordCategory={wordCategory}
          onWordCategoryChange={setWordCategory}
          // Fixed once a session starts, since it's saved for this level
          disabled={count > 0}
        />
      )}

      <ProgressUpdate outcome={progressRecorder.outcome} />

      {completed ? (
        <div className="p-4 rounded-lg bg-green-100 border border-green-300 text-green-800 font-semibold text-center">
          {completedLevel === null ? 'Training complete' : `Training complete for Level ${completedLevel}`}
        </div>
      ) : (
        <div className="pt-4 pb-2">
          <button
            type="button"
            onClick={handleNext}
            disabled={status === 'loading'}
            className={`w-full ${buttonClassName}`}
          >
            {status === 'loading' ? (
              <span className="flex items-center justify-center gap-2">
                {spinner}
                Loading...
              </span>
            ) : (
              buttonLabel
            )}
          </button>
        </div>
      )}
    </div>
  );
}
