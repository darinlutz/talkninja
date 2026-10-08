'use client';

import { useRef, useState } from 'react';
import type { Language } from '@/lib/translate';
import type { AlignedSegment } from '@/lib/wordAlignment';
import ColoredSegments from '@/components/ColoredSegments';
import {
  DIFFICULTY_LEVELS,
  difficultyOptionLabel,
  FEMALE_VOICE,
  MALE_VOICE,
  playChime,
  playError,
  speakText,
  TEST_LENGTH,
} from '@/lib/languageTestClient';
import type { ProgressMap } from '@/lib/languageTestClient';
import type { RecordedActivity } from '@/lib/languageLevels';
import { progressFor, useProgressRecorder, useWorkingLevelDefault } from '@/lib/useLanguageProgress';
import TestScore from '@/components/TestScore';
import ProgressUpdate from '@/components/ProgressUpdate';

type SpeakStatus = 'idle' | 'loading' | 'error';


type Choice = { text: string; correct: boolean };

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

interface ReadingTestProps {
  learnLanguage: Language;
  userLanguage: Language;
  // The user's belt progress; null when signed out
  progressByLanguage: ProgressMap | null;
  // Whether to show the Difficulty combobox (Admins only)
  showDifficulty: boolean;
  onProgressRecorded: (result: RecordedActivity) => void;
}

export default function ReadingTest({
  learnLanguage,
  userLanguage,
  progressByLanguage,
  showDifficulty,
  onProgressRecorded,
}: ReadingTestProps) {
  const [difficulty, setDifficulty] = useState(1);
  useWorkingLevelDefault(progressFor(progressByLanguage, learnLanguage), setDifficulty);
  const progressRecorder = useProgressRecorder(onProgressRecorded);
  // The language and level of the test in progress, saved with its score
  const testInfo = useRef({ language: learnLanguage, level: difficulty });
  const [sentence, setSentence] = useState('');
  // The sentence and its translation split into word pairs, colored once
  // the correct answer is picked
  const [sentenceSegments, setSentenceSegments] = useState<AlignedSegment[]>([]);
  const [translationSegments, setTranslationSegments] = useState<AlignedSegment[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [wrongPicks, setWrongPicks] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [speakStatus, setSpeakStatus] = useState<SpeakStatus>('idle');
  const [speakFemaleStatus, setSpeakFemaleStatus] = useState<SpeakStatus>('idle');
  // Questions shown so far in this test
  const [count, setCount] = useState(0);
  // Questions answered correctly on the first click
  const [correctCount, setCorrectCount] = useState(0);
  // Percent correct once the test is finished, otherwise null
  const [score, setScore] = useState<number | null>(null);
  // Recent sentences, so the same one doesn't keep coming up. Resets on reload.
  const recentSentences = useRef<string[]>([]);

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

  const handleSpeak = () => speak(sentence, MALE_VOICE, setSpeakStatus);
  const handleSpeakFemale = () => speak(sentence, FEMALE_VOICE, setSpeakFemaleStatus);

  // Loads a new question; returns whether it succeeded
  const loadQuestion = async (): Promise<boolean> => {
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/language/reading-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learnLanguage,
          userLanguage,
          difficulty,
          avoid: recentSentences.current,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate a reading test');
      }

      recentSentences.current = [...recentSentences.current, data.sentence].slice(-20);
      setSentence(data.sentence);
      setSentenceSegments(data.sentenceSegments ?? []);
      setTranslationSegments(data.translationSegments ?? []);
      setChoices(
        shuffle<Choice>([
          { text: data.translation, correct: true },
          ...data.distractors.map((text: string) => ({ text, correct: false })),
        ])
      );
      setWrongPicks([]);
      setSolved(false);
      setStatus('idle');

      speak(data.sentence, MALE_VOICE, setSpeakStatus);
      return true;
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error ? error.message : 'Failed to generate a reading test. Please try again.'
      );
      return false;
    }
  };

  // Start Test -> Next Question (x9) -> Finish Test -> score, after which
  // the button starts a new test.
  const handleTestButton = async () => {
    const finished = score !== null;

    if (!finished && count >= TEST_LENGTH) {
      const finalScore = Math.round((correctCount / TEST_LENGTH) * 100);
      setScore(finalScore);
      progressRecorder.record({ ...testInfo.current, activity: 'reading', score: finalScore });
      return;
    }

    if (await loadQuestion()) {
      if (finished || count === 0) {
        testInfo.current = { language: learnLanguage, level: difficulty };
        progressRecorder.clear();
        setScore(null);
        setCorrectCount(0);
        setCount(1);
      } else {
        setCount(count + 1);
      }
    }
  };

  const testInProgress = count > 0 && score === null;
  const buttonLabel = !testInProgress
    ? 'Start Test'
    : count < TEST_LENGTH
      ? 'Next Question'
      : 'Finish Test';

  const handleChoiceClick = (index: number) => {
    if (solved || score !== null) return;

    if (choices[index].correct) {
      setSolved(true);
      if (wrongPicks.length === 0 && testInProgress) setCorrectCount((n) => n + 1);
      playChime();
      speak(sentence, FEMALE_VOICE, setSpeakFemaleStatus);
    } else {
      setWrongPicks((prev) => (prev.includes(index) ? prev : [...prev, index]));
      playError();
    }
  };

  const choiceClassName = (choice: Choice, index: number) => {
    const base =
      'w-full text-left px-4 py-3 bg-white rounded-lg text-dark-blue transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-powder-500';
    if (solved && choice.correct) return `${base} border-4 border-green-600 font-bold`;
    if (wrongPicks.includes(index)) return `${base} border-2 border-red-600 bg-red-50 text-red-800`;
    if (solved) return `${base} border border-slate-300 opacity-60 cursor-default`;
    return `${base} border border-slate-300 cursor-pointer hover:border-powder-600 hover:ring-2 hover:ring-powder-500`;
  };

  return (
    <div className="space-y-6">
      {/* Sentence Field */}
      <div>
        <div className="flex items-center justify-between mb-2 gap-2">
          <span className="text-sm font-medium text-dark-blue">{learnLanguage}</span>
          {testInProgress && (
            <span className="text-sm font-semibold text-powder-600">
              {count} of {TEST_LENGTH}
            </span>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          {solved && sentenceSegments.length > 0 ? (
            // A textarea can't color individual words, so once solved the
            // sentence is shown in a box styled like it.
            <div
              id="readingTestSentence"
              className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue text-[2rem] whitespace-pre-wrap break-words"
            >
              <ColoredSegments segments={sentenceSegments} />
            </div>
          ) : (
            <textarea
              id="readingTestSentence"
              name="readingTestSentence"
              value={sentence}
              readOnly
              placeholder="Press Start Test to generate a sentence"
              rows={2}
              className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue placeholder-slate-400 focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors resize-none text-[2rem]"
            />
          )}
          <div className="flex flex-row sm:flex-col gap-3 flex-shrink-0 sm:self-start">
            <button
              type="button"
              onClick={handleSpeak}
              disabled={!sentence.trim() || speakStatus === 'loading'}
              aria-label="Speak"
              title="Speak"
              className="px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
            >
              {speakStatus === 'loading' ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
              ) : (
                <span aria-hidden="true">🔊 ♂</span>
              )}
            </button>
            <button
              type="button"
              onClick={handleSpeakFemale}
              disabled={!sentence.trim() || speakFemaleStatus === 'loading'}
              aria-label="Speak (female voice)"
              title="Speak (female voice)"
              className="px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
            >
              {speakFemaleStatus === 'loading' ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
              ) : (
                <span aria-hidden="true">🔊 ♀</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Answer Choices */}
      {choices.length > 0 && (
        <div>
          <span className="block mb-2 text-sm font-medium text-dark-blue">
            Pick the {userLanguage} translation
          </span>
          <div className="space-y-3">
            {choices.map((choice, index) => (
              <button
                key={`${index}-${choice.text}`}
                type="button"
                onClick={() => handleChoiceClick(index)}
                className={choiceClassName(choice, index)}
              >
                {solved && choice.correct && translationSegments.length > 0 ? (
                  <ColoredSegments segments={translationSegments} />
                ) : (
                  <span translate="no">{choice.text}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status Messages */}
      {message && (
        <div className="p-4 rounded-lg bg-red-100 border border-red-300 text-red-800">{message}</div>
      )}

      {/* Difficulty Selector */}
      {showDifficulty && (
        <div className="flex items-center gap-2 flex-wrap">
          <label htmlFor="readingTestDifficulty" className="block text-sm font-medium text-dark-blue">
            Difficulty
          </label>
          <select
            id="readingTestDifficulty"
            name="readingTestDifficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            // Fixed for the length of a test, since its score is saved for this level
            disabled={testInProgress}
            className="px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
          >
            {DIFFICULTY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {difficultyOptionLabel(level)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Score */}
      {score !== null && <TestScore score={score} />}
      <ProgressUpdate outcome={progressRecorder.outcome} />

      {/* Start Test / Next Question / Finish Test Button */}
      <div className="pt-4 pb-2">
        <button
          type="button"
          onClick={handleTestButton}
          // Each question must be answered before moving on
          disabled={status === 'loading' || (testInProgress && !solved)}
          className="w-full px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
        >
          {status === 'loading' ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Generating...
            </span>
          ) : (
            buttonLabel
          )}
        </button>
      </div>
    </div>
  );
}
