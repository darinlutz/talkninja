'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { Language } from '@/lib/translate';
import type { WordCategory } from '@/lib/language';
import { DIFFICULTY_LEVELS, difficultyOptionLabel } from '@/lib/languageTestClient';
import { alignTexts, FEMALE_VOICE, MALE_VOICE, speakText } from '@/lib/languageTestClient';
import { reportRateLimit } from '@/lib/rateLimitClient';
import ColoredTextArea from '@/components/ColoredTextArea';
import type { AlignedSegment } from '@/lib/wordAlignment';

const WORD_CATEGORIES: { value: WordCategory; label: string }[] = [
  { value: 'activities', label: 'Activities' },
  { value: 'adjectives', label: 'Adjectives' },
  { value: 'classifiers', label: 'Classifiers' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'colors', label: 'Colors' },
  { value: 'conjunctionsPrepositions', label: 'Conjunctions & Prepositions' },
  { value: 'focus', label: 'Focus' },
  { value: 'foodDrink', label: 'Food & Drink' },
  { value: 'houseHome', label: 'House & Home' },
  { value: 'numbers', label: 'Numbers & Money' },
  { value: 'peopleAnimals', label: 'People & Animals' },
  { value: 'places', label: 'Places' },
  { value: 'pronouns', label: 'Pronouns' },
  { value: 'things', label: 'Things' },
  { value: 'timeRelated', label: 'Time Related' },
  { value: 'verbs', label: 'Verbs' },
];

async function translateText(text: string, from: Language, to: Language): Promise<string> {
  if (!text.trim() || from === to) return text;

  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, from, to }),
  });
  // A 429 for the AI limit opens the rate limit dialog
  void reportRateLimit(response);

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to translate text');
  }

  return data.translation;
}

// The vocabulary API only ever returns Vietnamese/English pairs, so resolving
// the answer field to Vietnamese or English is a lookup; any other language
// requires translating from the known English text.
async function resolveAnswerText(
  vietnameseText: string,
  englishText: string,
  language: Language
): Promise<string> {
  if (language === 'Vietnamese') return vietnameseText;
  if (language === 'English') return englishText;
  return translateText(englishText, 'English', language);
}

interface LanguageFormProps {
  // The Account page's "and want to learn" and "I speak" languages
  wordLanguage: Language;
  answerLanguage: Language;
}

export default function LanguageForm({ wordLanguage, answerLanguage }: LanguageFormProps) {
  const [vietnameseSource, setVietnameseSource] = useState('');
  const [englishSource, setEnglishSource] = useState('');
  const [word, setWord] = useState('');
  const [answerText, setAnswerText] = useState('');
  // The generated item (its vietnameseSource) each field's text was translated from, so the two are only
  // aligned once both belong to the same item
  const [wordFor, setWordFor] = useState('');
  const [answerFor, setAnswerFor] = useState('');
  // Matching colors for the word field and its translation (like Training), for the texts they were made for
  const [alignment, setAlignment] = useState<{
    key: string;
    sentenceSegments: AlignedSegment[];
    translationSegments: AlignedSegment[];
  } | null>(null);
  const [speakFemaleStatus, setSpeakFemaleStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [speakStatus, setSpeakStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [showAnswer, setShowAnswer] = useState(true);
  // "1"-"8" are generated sentences on the Difficulty scale
  const [mode, setMode] = useState<'words' | 'fastPhrases' | 'generalPhrases' | `${number}`>('words');
  const [wordCategory, setWordCategory] = useState<WordCategory>('adjectives');
  const [wordCategoryCount, setWordCategoryCount] = useState<number | null>(null);
  const [wordsShownCount, setWordsShownCount] = useState(0);

  // Session memory: words/sentences already generated, so the same common
  // ones don't keep coming up. Resets on page reload.
  const [usedWordsByCategory, setUsedWordsByCategory] = useState<
    Partial<Record<WordCategory, string[]>>
  >({});
  const [usedSentenceWords, setUsedSentenceWords] = useState<string[]>([]);
  const [usedSentences, setUsedSentences] = useState<string[]>([]);

  // Words/phrases/sentences marked as known via "Known Word - Get New".
  // Unlike usedWordsByCategory/usedSentences (which are capped so old items
  // eventually cycle back), these are never trimmed, so a known item stays
  // excluded (pushed to the end of the queue) until everything else in its
  // category has been shown.
  const [knownWordsByCategory, setKnownWordsByCategory] = useState<
    Partial<Record<WordCategory, string[]>>
  >({});
  const [knownSentences, setKnownSentences] = useState<string[]>([]);

  // The word/phrase/sentence flagged via "Flag Word - Get New", and how many
  // presses of "Get New Word" remain before it's shown again.
  const [flaggedItem, setFlaggedItem] = useState<{ vietnamese: string; english: string } | null>(
    null
  );
  const [pressesSinceFlag, setPressesSinceFlag] = useState(0);

  const maskText = (text: string) => text.replace(/\S/g, '•');

  // The server picks the male or female voice for the language (src/lib/voiceSettings.ts)
  const handleSpeak = async (voice: string, setVoiceStatus: (status: 'idle' | 'loading' | 'error') => void) => {
    if (!word.trim()) return;

    setVoiceStatus('loading');
    setMessage('');

    try {
      await speakText(word, voice, wordLanguage);
      setVoiceStatus('idle');
    } catch (error) {
      setVoiceStatus('error');
      setMessage(
        error instanceof Error ? error.message : 'Failed to play audio. Please try again.'
      );
    }
  };

  const handleGetWord = async () => {
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/language/word', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: wordCategory,
          usedWords: Array.from(
            new Set([
              ...(usedWordsByCategory[wordCategory] ?? []),
              ...(knownWordsByCategory[wordCategory] ?? []),
            ])
          ),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate a new word');
      }

      setVietnameseSource(data.vietnamese);
      setEnglishSource(data.english);
      setShowAnswer(false);
      setStatus('success');
      setWordsShownCount((prev) => prev + 1);
      setUsedWordsByCategory((prev) => ({
        ...prev,
        [wordCategory]: [...(prev[wordCategory] ?? []), data.vietnamese].slice(-100),
      }));
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error ? error.message : 'Failed to generate a new word. Please try again.'
      );
    }
  };

  const handleGetPhrase = async () => {
    setStatus('loading');
    setMessage('');

    const category = mode as WordCategory;

    try {
      const response = await fetch('/api/language/word', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category,
          usedWords: Array.from(
            new Set([
              ...(usedWordsByCategory[category] ?? []),
              ...(knownWordsByCategory[category] ?? []),
            ])
          ),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate a new phrase');
      }

      setVietnameseSource(data.vietnamese);
      setEnglishSource(data.english);
      setShowAnswer(false);
      setStatus('success');
      setWordsShownCount((prev) => prev + 1);
      setUsedWordsByCategory((prev) => ({
        ...prev,
        [category]: [...(prev[category] ?? []), data.vietnamese].slice(-100),
      }));
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error ? error.message : 'Failed to generate a new phrase. Please try again.'
      );
    }
  };

  const handleGetSentence = async () => {
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/language', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          complexity: mode,
          usedWords: usedSentenceWords,
          usedSentences: Array.from(new Set([...usedSentences.slice(-8), ...knownSentences])),
        }),
      });
      // A 429 for the AI limit opens the rate limit dialog
      void reportRateLimit(response);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate a new sentence');
      }

      setVietnameseSource(data.vietnamese);
      setEnglishSource(data.english);
      setShowAnswer(false);
      setStatus('success');
      setUsedSentences((prev) => [...prev, data.vietnamese].slice(-50));
      setUsedSentenceWords((prev) =>
        Array.from(new Set([...prev, ...(data.wordsUsed ?? [])])).slice(-100)
      );
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error ? error.message : 'Failed to generate a new sentence. Please try again.'
      );
    }
  };

  const handleGetLanguageItem = async () => {
    if (mode === 'words') {
      await handleGetWord();
    } else if (mode === 'fastPhrases' || mode === 'generalPhrases') {
      await handleGetPhrase();
    } else {
      await handleGetSentence();
    }
  };

  // Wraps handleGetLanguageItem so that, once something is flagged, the 3rd
  // time the user cycles to a new item (via "Get New Word" OR "Known Word -
  // Get New" — both move on to a new item, so both count) re-shows the
  // flagged item instead of fetching a new one. After that, normal random
  // selection resumes.
  const advanceAndFetchNew = async () => {
    if (flaggedItem) {
      const nextPresses = pressesSinceFlag + 1;
      if (nextPresses >= 3) {
        setVietnameseSource(flaggedItem.vietnamese);
        setEnglishSource(flaggedItem.english);
        setShowAnswer(false);
        setFlaggedItem(null);
        setPressesSinceFlag(0);
        return;
      }
      setPressesSinceFlag(nextPresses);
    }

    await handleGetLanguageItem();
  };

  const handleGetNewClick = advanceAndFetchNew;

  // Remembers the currently displayed word/phrase/sentence, then fetches a
  // new one right away like "Get New Word" would. This starts (or restarts)
  // the countdown, so it does not itself count as one of the 3 presses.
  const handleFlagAndGetNew = async () => {
    if (vietnameseSource || englishSource) {
      setFlaggedItem({ vietnamese: vietnameseSource, english: englishSource });
      setPressesSinceFlag(0);
    }

    await handleGetLanguageItem();
  };

  // Marks the currently displayed word/phrase/sentence as known so it's
  // excluded from now on (pushed to the end of the queue), then advances to
  // a new one the same way "Get New Word" does (counting toward the
  // flagged-item countdown, if one is pending).
  const handleKnownAndGetNew = async () => {
    if (vietnameseSource) {
      if (mode === 'words' || mode === 'fastPhrases' || mode === 'generalPhrases') {
        const category = mode === 'words' ? wordCategory : (mode as WordCategory);
        setKnownWordsByCategory((prev) => ({
          ...prev,
          [category]: Array.from(new Set([...(prev[category] ?? []), vietnameseSource])),
        }));
      } else {
        setKnownSentences((prev) => Array.from(new Set([...prev, vietnameseSource])));
      }
    }

    await advanceAndFetchNew();
  };

  // Keeps the word field's translation in sync with its language and with
  // whatever word/sentence was last generated.
  useEffect(() => {
    let isCurrent = true;

    translateText(vietnameseSource, 'Vietnamese', wordLanguage)
      .then((text) => {
        if (isCurrent) {
          setWord(text);
          setWordFor(vietnameseSource);
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setMessage(
            error instanceof Error ? error.message : 'Failed to translate text. Please try again.'
          );
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [vietnameseSource, wordLanguage]);

  // Keeps the answer field's translation in sync with its language and with
  // whatever word/sentence was last generated.
  useEffect(() => {
    let isCurrent = true;

    resolveAnswerText(vietnameseSource, englishSource, answerLanguage)
      .then((text) => {
        if (isCurrent) {
          setAnswerText(text);
          setAnswerFor(vietnameseSource);
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setMessage(
            error instanceof Error ? error.message : 'Failed to translate text. Please try again.'
          );
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [vietnameseSource, englishSource, answerLanguage]);

  // Colors each word to match its translation once both fields hold the same item's text (one alignment per
  // item and language pair; editing a field drops its colors, see ColoredTextArea)
  const alignmentKey =
    vietnameseSource && wordFor === vietnameseSource && answerFor === vietnameseSource
      ? `${vietnameseSource}|${wordLanguage}|${answerLanguage}`
      : '';
  useEffect(() => {
    if (!alignmentKey || alignment?.key === alignmentKey) return;
    let isCurrent = true;
    const key = alignmentKey;
    alignTexts(word, wordLanguage, answerText, answerLanguage).then((segments) => {
      if (isCurrent && segments) setAlignment({ key, ...segments });
    });
    return () => {
      isCurrent = false;
    };
    // Aligned once per item: word/answerText are that item's texts when alignmentKey is set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alignmentKey]);
  const currentAlignment = alignmentKey && alignment?.key === alignmentKey ? alignment : null;

  // Fast Phrases and General Phrases have no Word Categories combobox of
  // their own; they always pull from their own fixed category, so the
  // Available/Shown labels track that category instead of whatever's
  // selected in the (hidden) combobox.
  const activeWordCategory: WordCategory =
    mode === 'fastPhrases' || mode === 'generalPhrases' ? mode : wordCategory;

  // Resets the "Shown" counter when the active category changes. Done
  // during render rather than in the effect below so it doesn't trigger
  // a second render pass.
  const [countedWordCategory, setCountedWordCategory] = useState(activeWordCategory);
  if (countedWordCategory !== activeWordCategory) {
    setCountedWordCategory(activeWordCategory);
    setWordsShownCount(0);
  }

  // Keeps the "Available" label in sync with whatever category is
  // currently active.
  useEffect(() => {
    let isCurrent = true;

    fetch('/api/language/word/count', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ category: activeWordCategory }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (isCurrent) setWordCategoryCount(typeof data.count === 'number' ? data.count : null);
      })
      .catch(() => {
        if (isCurrent) setWordCategoryCount(null);
      });

    return () => {
      isCurrent = false;
    };
  }, [activeWordCategory]);

  return (
    <div className="space-y-6">
      {/* Word/Sentence Field */}
      <div>
        <span className="practice-label mb-2">{wordLanguage}</span>
        <div className="flex flex-col sm:flex-row gap-3">
          <ColoredTextArea
            id="word"
            name="word"
            value={word}
            onChange={setWord}
            segments={currentAlignment?.sentenceSegments ?? null}
            placeholder="Press Get New Sentence to generate one"
            rows={2}
            large
          />
          <div className="flex flex-row sm:flex-col gap-3 flex-shrink-0 sm:self-start">
            <button
              type="button"
              onClick={() => handleSpeak(MALE_VOICE, setSpeakStatus)}
              disabled={!word.trim() || speakStatus === 'loading'}
              aria-label="Speak"
              title="Speak"
              className="practice-btn"
            >
              {speakStatus === 'loading' ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
              ) : (
                <span aria-hidden="true">🔊 ♂</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleSpeak(FEMALE_VOICE, setSpeakFemaleStatus)}
              disabled={!word.trim() || speakFemaleStatus === 'loading'}
              aria-label="Speak (female voice)"
              title="Speak (female voice)"
              className="practice-btn"
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

      {/* Answer Field */}
      <div>
        <span className="practice-label mb-2">{answerLanguage}</span>
        <div className="flex flex-col sm:flex-row gap-3">
          <ColoredTextArea
            id="answer"
            name="answer"
            value={showAnswer ? answerText : maskText(answerText)}
            onChange={(text) => showAnswer && setAnswerText(text)}
            segments={showAnswer ? (currentAlignment?.translationSegments ?? null) : null}
            readOnly={!showAnswer}
            placeholder="The translation will appear here"
            rows={2}
          />
          <button
            type="button"
            onClick={() => setShowAnswer(!showAnswer)}
            disabled={!answerText.trim()}
            aria-label={showAnswer ? 'Hide' : 'Show'}
            title={showAnswer ? 'Hide' : 'Show'}
            className="practice-btn flex-shrink-0 sm:self-start"
          >
            {showAnswer ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {message && (
        <div className="practice-error">
          {message}
        </div>
      )}

      {/* Difficulty / Word Categories Selectors */}
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="mode" className="practice-label">
          Difficulty
        </label>
        <select
          id="mode"
          name="mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          className="practice-select"
        >
          <option value="words">Words</option>
          <option value="fastPhrases">Fast Phrases</option>
          <option value="generalPhrases">General Phrases</option>
          {DIFFICULTY_LEVELS.map((level) => (
            <option key={level} value={String(level)}>
              {difficultyOptionLabel(level)}
            </option>
          ))}
        </select>

        {mode === 'words' && (
          <>
            <label htmlFor="wordCategory" className="practice-label">
              Word Categories
            </label>
            <select
              id="wordCategory"
              name="wordCategory"
              value={wordCategory}
              onChange={(e) => setWordCategory(e.target.value as WordCategory)}
              className="practice-select"
            >
              {WORD_CATEGORIES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </>
        )}

        {(mode === 'words' || mode === 'fastPhrases' || mode === 'generalPhrases') && (
          <>
            <span className="practice-label">
              Available: {wordCategoryCount ?? '...'}
            </span>
            <span className="practice-label">
              Shown: {wordsShownCount}
              {wordCategoryCount ? ` (${Math.round((wordsShownCount / wordCategoryCount) * 100)}%)` : ''}
            </span>
          </>
        )}
      </div>

      {/* Get New Item Button */}
      <div className="pt-4 pb-2 space-y-2">
        <button
          type="button"
          onClick={handleGetNewClick}
          disabled={status === 'loading'}
          className="practice-btn practice-btn-wide"
        >
          {status === 'loading' ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Generating...
            </span>
          ) : mode === 'words' ? (
            'Get New Word'
          ) : mode === 'fastPhrases' || mode === 'generalPhrases' ? (
            'Get New Phrase'
          ) : (
            'Get New Sentence'
          )}
        </button>
        <button
          type="button"
          onClick={handleFlagAndGetNew}
          disabled={status === 'loading' || !(vietnameseSource || englishSource)}
          className="practice-btn-outline practice-btn-wide"
        >
          Flag Word - Get New
        </button>
        <button
          type="button"
          onClick={handleKnownAndGetNew}
          disabled={status === 'loading' || !(vietnameseSource || englishSource)}
          className="practice-btn-ghost practice-btn-wide"
        >
          Known Word - Get New
        </button>
      </div>
    </div>
  );
}
