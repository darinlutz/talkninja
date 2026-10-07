'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowUpDown, Eye, EyeOff } from 'lucide-react';
import LanguageForm from '@/components/LanguageForm';
import ReadingTest from '@/components/ReadingTest';
import Training from '@/components/Training';
import WritingTest from '@/components/WritingTest';
import LanguageProgressBanner from '@/components/LanguageProgressBanner';
import type { Language } from '@/lib/translate';
import type { GrammarToken } from '@/lib/grammarCheck';
import type { WordCategory } from '@/lib/language';
import { isLanguage, LANGUAGES } from '@/lib/languages';
import { nextStepTab, startingProgress, type RecordedActivity } from '@/lib/languageLevels';
import {
  fetchLanguageProgress,
  saveLanguagePreferences,
  startLanguageProgress,
  type ProgressMap,
} from '@/lib/languageTestClient';

const TRANSLATOR_LANGUAGES: readonly Language[] = LANGUAGES;

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

const LANGUAGE_CODES: Record<Language, string> = {
  Arabic: 'ar',
  English: 'en',
  German: 'de',
  Japanese: 'ja',
  Korean: 'ko',
  Portuguese: 'pt',
  Spanish: 'es',
  Vietnamese: 'vi',
};

async function translateText(text: string, from: Language, to: Language): Promise<string> {
  if (!text.trim() || from === to) return text;

  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, from, to }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to translate text');
  }

  return data.translation;
}

// The vocabulary API only ever returns Vietnamese/English pairs, so resolving
// the Writing tab's answer field to Vietnamese or English is a lookup; any
// other language requires translating from the known English text.
async function resolveWritingAnswerText(
  vietnameseText: string,
  englishText: string,
  language: Language
): Promise<string> {
  if (language === 'Vietnamese') return vietnameseText;
  if (language === 'English') return englishText;
  return translateText(englishText, 'English', language);
}

const TABS = [
  'training',
  'readingTest',
  'writingTest',
  'reading',
  'writing',
  'translator',
  'friend',
] as const;
type Tab = (typeof TABS)[number];

// useSearchParams needs a Suspense boundary for the production build
export default function LanguagePage() {
  return (
    <Suspense fallback={null}>
      <Language />
    </Suspense>
  );
}

function Language() {
  // ?tab= and ?learn= open a given tab and language, e.g. the Account
  // page's "Continue training" link
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tab = searchParams.get('tab');
    return TABS.find((t) => t === tab) ?? 'reading';
  });
  // The practice tabs start shown; the "Show tabs?" switch hides them
  const [showTabs, setShowTabs] = useState(true);
  const [userLanguage, setUserLanguage] = useState<Language>('English');
  const [learnLanguage, setLearnLanguage] = useState<Language>(() => {
    const learn = searchParams.get('learn');
    return isLanguage(learn) ? learn : 'Vietnamese';
  });
  // Which of the two language comboboxes have been set on this visit (by
  // the user, or by a ?learn= link), so restoring the saved languages
  // doesn't override them
  const languagePickedRef = useRef({ learn: searchParams.get('learn') !== null, native: false });
  // The user's belt and next step per language: undefined while loading,
  // null when signed out (progress isn't saved)
  const [progressByLanguage, setProgressByLanguage] = useState<ProgressMap | null | undefined>(undefined);
  // Only Admins see the Difficulty combobox on Training/Reading Test/Writing
  // Test; everyone else practices at the level they're working on
  const [isAdmin, setIsAdmin] = useState(false);
  const [vietnameseText, setVietnameseText] = useState('');
  const [userInput, setUserInput] = useState('');
  const [showVietnamese, setShowVietnamese] = useState(true);
  const [writingWordText, setWritingWordText] = useState('');
  const [writingWordLanguage, setWritingWordLanguage] = useState<Language>('Vietnamese');
  const [englishSource, setEnglishSource] = useState('');
  const [writingAnswerText, setWritingAnswerText] = useState('');
  const [writingAnswerLanguage, setWritingAnswerLanguage] = useState<Language>(userLanguage);
  const [appliedWritingAnswerLanguage, setAppliedWritingAnswerLanguage] = useState(userLanguage);
  const [appliedWritingWordLanguage, setAppliedWritingWordLanguage] = useState(learnLanguage);
  const [complexity, setComplexity] = useState<
    'words' | 'fastPhrases' | 'generalPhrases' | 'easy' | 'medium' | 'hard'
  >('words');
  const [wordCategory, setWordCategory] = useState<WordCategory>('adjectives');
  const [wordCategoryCount, setWordCategoryCount] = useState<number | null>(null);
  const [totalMatched, setTotalMatched] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [writingSpeakStatus, setWritingSpeakStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [writingSpeakFemaleStatus, setWritingSpeakFemaleStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Session memory: words/phrases already generated per category, so the
  // same ones don't keep coming up. Resets on page reload.
  const [usedWordsByCategory, setUsedWordsByCategory] = useState<
    Partial<Record<WordCategory, string[]>>
  >({});

  // Writing tab words/phrases/sentences marked as known via "Known Word -
  // Get New". Unlike usedWordsByCategory (which is capped so old items
  // eventually cycle back), these are never trimmed, so a known item stays
  // excluded (pushed to the end of the queue) until everything else in its
  // category has been shown.
  const [writingKnownWordsByCategory, setWritingKnownWordsByCategory] = useState<
    Partial<Record<WordCategory, string[]>>
  >({});
  const [writingKnownSentences, setWritingKnownSentences] = useState<string[]>([]);

  // The word/phrase/sentence flagged via "Flag Word - Get New" on the
  // Writing tab, and how many presses of "Get New Word" remain before it's
  // shown again.
  const [writingFlaggedItem, setWritingFlaggedItem] = useState<{
    vietnamese: string;
    english: string;
  } | null>(null);
  const [writingPressesSinceFlag, setWritingPressesSinceFlag] = useState(0);

  const [translatorTopText, setTranslatorTopText] = useState('');
  const [translatorBottomText, setTranslatorBottomText] = useState('');
  const [translatorLanguage, setTranslatorLanguage] = useState<Language>('Vietnamese');
  const [translatorSecondLanguage, setTranslatorSecondLanguage] = useState<Language>('English');
  const [appliedTranslatorBottomLanguage, setAppliedTranslatorBottomLanguage] = useState(userLanguage);
  const [appliedTranslatorTopLanguage, setAppliedTranslatorTopLanguage] = useState(learnLanguage);
  const [isSwapped, setIsSwapped] = useState(false);
  const [translatorStatus, setTranslatorStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [translatorMessage, setTranslatorMessage] = useState('');
  const [translatorSpeakStatus, setTranslatorSpeakStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');

  const [friendMessages, setFriendMessages] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([]);
  const [friendCorrections, setFriendCorrections] = useState<Record<number, GrammarToken[]>>({});
  const [friendStarted, setFriendStarted] = useState(false);
  const [friendInput, setFriendInput] = useState('');
  const [friendStatus, setFriendStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [friendMessage, setFriendMessage] = useState('');
  const [friendDifficulty, setFriendDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [friendLanguage, setFriendLanguage] = useState<Language>('Vietnamese');
  const [friendInputTranslation, setFriendInputTranslation] = useState('');
  const [friendInputTranslationLanguage, setFriendInputTranslationLanguage] =
    useState<Language>('English');
  const [appliedFriendBottomLanguage, setAppliedFriendBottomLanguage] = useState(userLanguage);
  const [appliedFriendTopLanguage, setAppliedFriendTopLanguage] = useState(learnLanguage);
  const [friendSpeakStatus, setFriendSpeakStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [friendReplyTranslation, setFriendReplyTranslation] = useState('');
  const [showFriendReplyTranslation, setShowFriendReplyTranslation] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    fetchLanguageProgress()
      .then((progress) => {
        if (!isCurrent) return;
        setProgressByLanguage(progress?.progressByLanguage ?? null);
        setIsAdmin(progress?.isAdmin ?? false);
        // Restore the user's saved languages, unless they've already picked
        // one on this visit (or a ?learn= link chose the language)
        if (progress?.nativeLanguage && !languagePickedRef.current.native) {
          setUserLanguage(progress.nativeLanguage);
        }
        if (progress?.activeLearningLanguage && !languagePickedRef.current.learn) {
          setLearnLanguage(progress.activeLearningLanguage);
        }
      })
      // Progress is a nice-to-have here; the tabs still work without it
      .catch(() => {
        if (isCurrent) setProgressByLanguage(null);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  // Bumped by the banner's "Next step" link to remount the tab content, so
  // its Difficulty resets to the level being worked on
  const [tabContentKey, setTabContentKey] = useState(0);
  const tabsSectionRef = useRef<HTMLElement>(null);

  // The banner's "Next step" link: opens that step's tab (Training, Reading
  // Test or Writing Test) for the language being learned, like the Account
  // page's "Continue training" link
  const handleNextStepClick = () => {
    const progress = progressByLanguage?.[learnLanguage] ?? startingProgress(learnLanguage);
    const tab = TABS.find((t) => t === nextStepTab(progress));
    if (!tab) return;
    setActiveTab(tab);
    setShowTabs(true);
    setTabContentKey((key) => key + 1);
    // Wait for the tabs to render (they may have been hidden) before scrolling
    requestAnimationFrame(() => tabsSectionRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  // Remembers the user's "I speak" pick for next time
  const handleUserLanguageChange = (language: Language) => {
    setUserLanguage(language);
    languagePickedRef.current.native = true;
    saveLanguagePreferences({ nativeLanguage: language }).catch(() => {});
  };

  // Picking a language to learn adds it to the signed-in user's profile at
  // Level 0 (the Account page lists it, with a Delete button until a belt
  // is earned)
  const handleLearnLanguageChange = (language: Language) => {
    setLearnLanguage(language);
    languagePickedRef.current.learn = true;
    saveLanguagePreferences({ activeLearningLanguage: language }).catch(() => {});
    if (!progressByLanguage || progressByLanguage[language]) return;

    startLanguageProgress(language)
      .then((progress) => {
        if (progress) {
          setProgressByLanguage((prev) => (prev ? { ...prev, [language]: progress } : prev));
        }
      })
      // Not saving it only means it's added later, with the first result
      .catch(() => {});
  };

  // A tab saved a Training/test result; keep the banner and tabs current
  const handleProgressRecorded = (result: RecordedActivity) => {
    setProgressByLanguage((prev) => ({ ...prev, [result.progress.language]: result.progress }));
  };

  const maskText = (text: string) => text.replace(/\S/g, '•');

  // Lets the "I currently speak" selector drive the Writing tab's answer
  // language without taking away the user's ability to change it locally.
  if (userLanguage !== appliedWritingAnswerLanguage) {
    setAppliedWritingAnswerLanguage(userLanguage);
    setWritingAnswerLanguage(userLanguage);
  }

  // Lets the "I currently speak" selector drive the Translator tab's bottom
  // (To) combobox, wherever that currently maps to, without taking away the
  // user's ability to change it locally.
  if (userLanguage !== appliedTranslatorBottomLanguage) {
    setAppliedTranslatorBottomLanguage(userLanguage);
    if (isSwapped) {
      setTranslatorLanguage(userLanguage);
    } else {
      setTranslatorSecondLanguage(userLanguage);
    }
  }

  // Lets the "I currently speak" selector drive the Friend tab's bottom
  // (Translation) combobox without taking away the user's ability to change
  // it locally.
  if (userLanguage !== appliedFriendBottomLanguage) {
    setAppliedFriendBottomLanguage(userLanguage);
    setFriendInputTranslationLanguage(userLanguage);
  }

  // Lets the "I want to learn" selector drive the Writing tab's top
  // (word/sentence) combobox without taking away the user's ability to
  // change it locally.
  if (learnLanguage !== appliedWritingWordLanguage) {
    setAppliedWritingWordLanguage(learnLanguage);
    setWritingWordLanguage(learnLanguage);
  }

  // Lets the "I want to learn" selector drive the Translator tab's top
  // (From) combobox, wherever that currently maps to, without taking away
  // the user's ability to change it locally.
  if (learnLanguage !== appliedTranslatorTopLanguage) {
    setAppliedTranslatorTopLanguage(learnLanguage);
    if (isSwapped) {
      setTranslatorSecondLanguage(learnLanguage);
    } else {
      setTranslatorLanguage(learnLanguage);
    }
  }

  // Lets the "I want to learn" selector drive the Friend tab's top
  // (Language) combobox without taking away the user's ability to change it
  // locally.
  if (learnLanguage !== appliedFriendTopLanguage) {
    setAppliedFriendTopLanguage(learnLanguage);
    setFriendLanguage(learnLanguage);
  }

  const fromLanguage: Language = isSwapped ? translatorSecondLanguage : translatorLanguage;
  const toLanguage: Language = isSwapped ? translatorLanguage : translatorSecondLanguage;

  const handleFromLanguageChange = (lang: Language) => {
    if (isSwapped) {
      setTranslatorSecondLanguage(lang);
    } else {
      setTranslatorLanguage(lang);
    }
    setTranslatorTopText('');
    setTranslatorBottomText('');
    setTranslatorMessage('');
  };

  const handleToLanguageChange = (lang: Language) => {
    if (isSwapped) {
      setTranslatorLanguage(lang);
    } else {
      setTranslatorSecondLanguage(lang);
    }
    handleTranslate(lang);
  };

  const handleGetWord = async () => {
    setStatus('loading');
    setMessage('');
    setUserInput('');
    setShowVietnamese(false);

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
              ...(writingKnownWordsByCategory[wordCategory] ?? []),
            ])
          ),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate a new word');
      }

      setVietnameseText(data.vietnamese);
      setEnglishSource(data.english);
      setWritingWordText(await translateText(data.vietnamese, 'Vietnamese', writingWordLanguage));
      setStatus('success');
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
    setUserInput('');
    setShowVietnamese(false);

    const category = complexity as WordCategory;

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
              ...(writingKnownWordsByCategory[category] ?? []),
            ])
          ),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate a new phrase');
      }

      setVietnameseText(data.vietnamese);
      setEnglishSource(data.english);
      setWritingWordText(await translateText(data.vietnamese, 'Vietnamese', writingWordLanguage));
      setStatus('success');
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
    setUserInput('');
    setShowVietnamese(false);

    try {
      const response = await fetch('/api/language', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          complexity,
          usedSentences: writingKnownSentences,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate a new sentence');
      }

      setVietnameseText(data.vietnamese);
      setEnglishSource(data.english);
      setWritingWordText(await translateText(data.vietnamese, 'Vietnamese', writingWordLanguage));
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error ? error.message : 'Failed to generate a new sentence. Please try again.'
      );
    }
  };

  const handleGetLanguageItem = async () => {
    if (complexity === 'words') {
      await handleGetWord();
    } else if (complexity === 'fastPhrases' || complexity === 'generalPhrases') {
      await handleGetPhrase();
    } else {
      await handleGetSentence();
    }
  };

  // Wraps handleGetLanguageItem so that, once something is flagged on the
  // Writing tab, the 3rd time the user cycles to a new item (via "Get New
  // Word" OR "Known Word - Get New" — both move on to a new item, so both
  // count) re-shows the flagged item instead of fetching a new one. After
  // that, normal random selection resumes.
  const writingAdvanceAndFetchNew = async () => {
    if (writingFlaggedItem) {
      const nextPresses = writingPressesSinceFlag + 1;
      if (nextPresses >= 3) {
        setVietnameseText(writingFlaggedItem.vietnamese);
        setEnglishSource(writingFlaggedItem.english);
        setUserInput('');
        setShowVietnamese(false);
        setWritingWordText(
          await translateText(writingFlaggedItem.vietnamese, 'Vietnamese', writingWordLanguage)
        );
        setWritingFlaggedItem(null);
        setWritingPressesSinceFlag(0);
        return;
      }
      setWritingPressesSinceFlag(nextPresses);
    }

    await handleGetLanguageItem();
  };

  const handleWritingGetNewClick = writingAdvanceAndFetchNew;

  // Remembers the currently displayed Writing tab word/phrase/sentence, then
  // fetches a new one right away like "Get New Word" would. This starts (or
  // restarts) the countdown, so it does not itself count as one of the 3
  // presses.
  const handleWritingFlagAndGetNew = async () => {
    if (vietnameseText || englishSource) {
      setWritingFlaggedItem({ vietnamese: vietnameseText, english: englishSource });
      setWritingPressesSinceFlag(0);
    }

    await handleGetLanguageItem();
  };

  // Marks the currently displayed Writing tab word/phrase/sentence as known
  // so it's excluded from now on (pushed to the end of the queue), then
  // advances to a new one the same way "Get New Word" does (counting toward
  // the flagged-item countdown, if one is pending).
  const handleWritingKnownAndGetNew = async () => {
    if (vietnameseText) {
      if (complexity === 'words' || complexity === 'fastPhrases' || complexity === 'generalPhrases') {
        const category = complexity === 'words' ? wordCategory : (complexity as WordCategory);
        setWritingKnownWordsByCategory((prev) => ({
          ...prev,
          [category]: Array.from(new Set([...(prev[category] ?? []), vietnameseText])),
        }));
      } else {
        setWritingKnownSentences((prev) => Array.from(new Set([...prev, vietnameseText])));
      }
    }

    await writingAdvanceAndFetchNew();
  };

  const speakWritingWordText = async (
    voice: string,
    setStatus: (status: 'idle' | 'loading' | 'error') => void
  ) => {
    if (!writingWordText.trim()) return;

    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: writingWordText, voice }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate speech');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      await audio.play();

      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error ? error.message : 'Failed to play audio. Please try again.'
      );
    }
  };

  const handleWritingSpeak = () => speakWritingWordText('alloy', setWritingSpeakStatus);
  const handleWritingSpeakFemale = () => speakWritingWordText('nova', setWritingSpeakFemaleStatus);


  const handleWritingWordLanguageChange = async (newLanguage: Language) => {
    setWritingWordLanguage(newLanguage);

    if (!vietnameseText.trim()) return;

    try {
      setWritingWordText(await translateText(vietnameseText, 'Vietnamese', newLanguage));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to translate text. Please try again.'
      );
    }
  };

  // Keeps the Writing tab's answer field in sync with its language and with
  // whatever word/sentence was last generated.
  useEffect(() => {
    let isCurrent = true;

    resolveWritingAnswerText(vietnameseText, englishSource, writingAnswerLanguage)
      .then((text) => {
        if (isCurrent) setWritingAnswerText(text);
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
  }, [vietnameseText, englishSource, writingAnswerLanguage]);

  // Fast Phrases has no Word Categories combobox of its own; it always pulls
  // from the fixed "fastPhrases" category, so the "Available" label tracks
  // that category instead of whatever's selected in the (hidden) combobox.
  const activeWordCategory: WordCategory =
    complexity === 'fastPhrases' ? 'fastPhrases' : wordCategory;

  // Keeps the Writing tab's "Available" label in sync with whatever category
  // is currently active.
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

  const handleTranslatorSpeak = async (text: string) => {
    if (!text.trim()) return;

    setTranslatorSpeakStatus('loading');
    setTranslatorMessage('');

    try {
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate speech');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      await audio.play();

      setTranslatorSpeakStatus('idle');
    } catch (error) {
      setTranslatorSpeakStatus('error');
      setTranslatorMessage(
        error instanceof Error ? error.message : 'Failed to play audio. Please try again.'
      );
    }
  };

  const handleTranslate = async (toLanguageOverride?: Language) => {
    if (!translatorTopText.trim()) return;

    setTranslatorStatus('loading');
    setTranslatorMessage('');

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: translatorTopText,
          from: fromLanguage,
          to: toLanguageOverride ?? toLanguage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to translate text');
      }

      setTranslatorBottomText(data.translation);
      setTranslatorStatus('success');
    } catch (error) {
      setTranslatorStatus('error');
      setTranslatorMessage(
        error instanceof Error ? error.message : 'Failed to translate text. Please try again.'
      );
    }
  };

  const handleSwap = () => {
    setIsSwapped(!isSwapped);
    setTranslatorTopText(translatorBottomText);
    setTranslatorBottomText(translatorTopText);
    setTranslatorMessage('');
  };

  const playFriendSpeech = async (text: string) => {
    if (!text.trim()) return;

    setFriendSpeakStatus('loading');

    try {
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate speech');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      // Wait for playback to finish (not just start) so callers can chain
      // audio clips sequentially instead of overlapping them.
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          reject(new Error('Failed to play audio'));
        };
        audio.play().catch(reject);
      });

      setFriendSpeakStatus('idle');
    } catch (error) {
      setFriendSpeakStatus('error');
      setFriendMessage(
        error instanceof Error ? error.message : 'Failed to play audio. Please try again.'
      );
    }
  };

  const translateFriendReply = async (text: string, toLanguageOverride?: Language) => {
    if (!text.trim()) return;

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          from: friendLanguage,
          to: toLanguageOverride ?? friendInputTranslationLanguage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to translate text');
      }

      setFriendReplyTranslation(data.translation);
    } catch {
      // Silently ignore translation errors so they don't interrupt the chat.
    }
  };

  const handleToggleFriendReplyTranslation = () => {
    setShowFriendReplyTranslation((prev) => !prev);
  };

  const handleFriendSpeak = () => {
    const lastAssistantMessage = [...friendMessages].reverse().find((msg) => msg.role === 'assistant');
    if (lastAssistantMessage) {
      playFriendSpeech(lastAssistantMessage.content);
    }
  };

  const handleFriendStart = async () => {
    setFriendStatus('loading');
    setFriendMessage('');
    setFriendCorrections({});

    try {
      const response = await fetch('/api/friend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ history: [], difficulty: friendDifficulty, language: friendLanguage }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start the conversation');
      }

      setFriendMessages([{ role: 'assistant', content: data.reply }]);
      setFriendStarted(true);
      setFriendStatus('idle');
      setShowFriendReplyTranslation(false);
      playFriendSpeech(data.reply);
      translateFriendReply(data.reply);
    } catch (error) {
      setFriendStatus('error');
      setFriendMessage(
        error instanceof Error ? error.message : 'Failed to start the conversation. Please try again.'
      );
    }
  };

  // Checks the user's message for spelling, grammar, and diacritic errors so
  // it can be rendered word-by-word (correct in green, incorrect in red with
  // the fix shown alongside in blue). Runs in the background and doesn't
  // block or interrupt the chat if it fails.
  const checkFriendMessage = async (text: string, messageIndex: number) => {
    try {
      const response = await fetch('/api/friend/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, language: friendLanguage }),
      });

      const data = await response.json();

      if (!response.ok) return;

      setFriendCorrections((prev) => ({ ...prev, [messageIndex]: data.tokens }));
    } catch {
      // Silently ignore grammar check errors so they don't interrupt the chat.
    }
  };

  const handleFriendSend = async () => {
    if (!friendInput.trim()) return;

    const messageText = friendInput;
    const updatedMessages = [...friendMessages, { role: 'user' as const, content: messageText }];
    const userMessageIndex = updatedMessages.length - 1;
    setFriendMessages(updatedMessages);
    setFriendInput('');
    setFriendInputTranslation('');
    setFriendStatus('loading');
    setFriendMessage('');
    const userMessageSpeech = playFriendSpeech(messageText);
    checkFriendMessage(messageText, userMessageIndex);

    try {
      const response = await fetch('/api/friend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          history: updatedMessages,
          difficulty: friendDifficulty,
          language: friendLanguage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get a reply');
      }

      setFriendMessages([...updatedMessages, { role: 'assistant', content: data.reply }]);
      setFriendStatus('idle');
      setShowFriendReplyTranslation(false);
      await userMessageSpeech;
      playFriendSpeech(data.reply);
      translateFriendReply(data.reply);
    } catch (error) {
      setFriendStatus('error');
      setFriendMessage(
        error instanceof Error ? error.message : 'Failed to get a reply. Please try again.'
      );
    }
  };

  const handleFriendTranslateInput = async (toLanguageOverride?: Language) => {
    if (!friendInput.trim()) return;

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: friendInput,
          from: friendLanguage,
          to: toLanguageOverride ?? friendInputTranslationLanguage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to translate text');
      }

      setFriendInputTranslation(data.translation);
    } catch {
      // Silently ignore translation errors so they don't interrupt the chat.
    }
  };

  const handleFriendInputTranslationLanguageChange = (newLanguage: Language) => {
    setFriendInputTranslationLanguage(newLanguage);
    handleFriendTranslateInput(newLanguage);

    const lastAssistantMessage = [...friendMessages].reverse().find((msg) => msg.role === 'assistant');
    if (lastAssistantMessage) {
      translateFriendReply(lastAssistantMessage.content, newLanguage);
    }
  };

  const isMatch = writingWordText === userInput && userInput.length > 0;

  // Tracks whether the current word has already been counted as matched, so
  // clearing and retyping the same correct answer doesn't double-count it.
  // Resets whenever a new word/sentence is generated.
  const matchedCurrentWordRef = useRef(false);
  useEffect(() => {
    matchedCurrentWordRef.current = false;
  }, [vietnameseText]);

  useEffect(() => {
    if (isMatch && !matchedCurrentWordRef.current) {
      setTotalMatched((count) => count + 1);
      matchedCurrentWordRef.current = true;
    }
  }, [isMatch]);

  return (
    <div className="w-full">
      {/* Header Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-100 to-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 pb-2 bg-gradient-to-r from-powder-600 via-powder-500 to-powder-600 bg-clip-text text-transparent">
            Language
          </h1>
          <p className="text-lg text-slate-600">
            Practice {learnLanguage} with a new sentence built from words you already know.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            <label htmlFor="userLanguage" className="text-sm font-medium text-dark-blue">
              I speak
            </label>
            <select
              id="userLanguage"
              name="userLanguage"
              value={userLanguage}
              onChange={(e) => handleUserLanguageChange(e.target.value as Language)}
              className="px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
            >
              {TRANSLATOR_LANGUAGES.map((lang) => (
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
              className="px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
            >
              {TRANSLATOR_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>
          {progressByLanguage !== undefined && (
            <div className="mt-4">
              <LanguageProgressBanner
                progress={
                  progressByLanguage &&
                  (progressByLanguage[learnLanguage] ?? startingProgress(learnLanguage))
                }
                onNextStepClick={handleNextStepClick}
              />
            </div>
          )}
          <div className="flex items-center justify-center gap-2 mt-4">
            <span id="showTabsLabel" className="text-sm font-medium text-dark-blue">
              Show tabs?
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={showTabs}
              aria-labelledby="showTabsLabel"
              onClick={() => setShowTabs(!showTabs)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-powder-500 focus-visible:ring-offset-2 ${
                showTabs ? 'bg-powder-600' : 'bg-slate-300'
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  showTabs ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-sm text-slate-600 w-7">{showTabs ? 'On' : 'Off'}</span>
          </div>
        </div>
      </section>

      {/* Language Practice Content */}
      {showTabs && (
      <section
        ref={tabsSectionRef}
        className="py-16 px-6 sm:px-10 lg:px-16 bg-white flex flex-col items-center scroll-mt-4"
      >
        <div className="w-full max-w-5xl">
          {/* Tab Navigation */}
          <div className="flex gap-4 mb-6 border-b border-slate-200 overflow-x-auto">
            <button
              onClick={() => setActiveTab('training')}
              className={`px-6 py-3 font-semibold border-b-2 whitespace-nowrap flex-shrink-0 transition-colors ${
                activeTab === 'training'
                  ? 'text-powder-600 border-powder-600'
                  : 'text-slate-600 border-transparent hover:text-dark-blue'
              }`}
            >
              Training
            </button>
            <button
              onClick={() => setActiveTab('readingTest')}
              className={`px-6 py-3 font-semibold border-b-2 whitespace-nowrap flex-shrink-0 transition-colors ${
                activeTab === 'readingTest'
                  ? 'text-powder-600 border-powder-600'
                  : 'text-slate-600 border-transparent hover:text-dark-blue'
              }`}
            >
              Reading Test
            </button>
            <button
              onClick={() => setActiveTab('writingTest')}
              className={`px-6 py-3 font-semibold border-b-2 whitespace-nowrap flex-shrink-0 transition-colors ${
                activeTab === 'writingTest'
                  ? 'text-powder-600 border-powder-600'
                  : 'text-slate-600 border-transparent hover:text-dark-blue'
              }`}
            >
              Writing Test
            </button>
            <button
              onClick={() => setActiveTab('reading')}
              className={`px-6 py-3 font-semibold border-b-2 whitespace-nowrap flex-shrink-0 transition-colors ${
                activeTab === 'reading'
                  ? 'text-powder-600 border-powder-600'
                  : 'text-slate-600 border-transparent hover:text-dark-blue'
              }`}
            >
              Reading & Speaking
            </button>
            <button
              onClick={() => setActiveTab('writing')}
              className={`px-6 py-3 font-semibold border-b-2 whitespace-nowrap flex-shrink-0 transition-colors ${
                activeTab === 'writing'
                  ? 'text-powder-600 border-powder-600'
                  : 'text-slate-600 border-transparent hover:text-dark-blue'
              }`}
            >
              Writing
            </button>
            <button
              onClick={() => setActiveTab('translator')}
              className={`px-6 py-3 font-semibold border-b-2 whitespace-nowrap flex-shrink-0 transition-colors ${
                activeTab === 'translator'
                  ? 'text-powder-600 border-powder-600'
                  : 'text-slate-600 border-transparent hover:text-dark-blue'
              }`}
            >
              Translator
            </button>
            <button
              onClick={() => setActiveTab('friend')}
              className={`px-6 py-3 font-semibold border-b-2 whitespace-nowrap flex-shrink-0 transition-colors ${
                activeTab === 'friend'
                  ? 'text-powder-600 border-powder-600'
                  : 'text-slate-600 border-transparent hover:text-dark-blue'
              }`}
            >
              Friend
            </button>
          </div>

          {/* Tab Content (re-keyed by "Next step" so the tab starts fresh at
              the user's working level) */}
          <div key={tabContentKey} className="bg-slate-50 rounded-xl border border-slate-200 p-8">
            {/* Training Tab */}
            {activeTab === 'training' && (
              <div>
                <h2 className="text-2xl font-bold text-dark-blue mb-2">Training</h2>
                <p className="text-slate-600 mb-8">
                  Study 10 {learnLanguage} words or phrases with their {userLanguage} translations.
                </p>
                <Training
                  learnLanguage={learnLanguage}
                  userLanguage={userLanguage}
                  progressByLanguage={progressByLanguage ?? null}
                  showDifficulty={isAdmin}
                  onProgressRecorded={handleProgressRecorded}
                />
              </div>
            )}

            {/* Reading Test Tab */}
            {activeTab === 'readingTest' && (
              <div>
                <h2 className="text-2xl font-bold text-dark-blue mb-2">Reading Test</h2>
                <p className="text-slate-600 mb-8">
                  Read the {learnLanguage} sentence, then pick its {userLanguage} translation.
                </p>
                <ReadingTest
                  learnLanguage={learnLanguage}
                  userLanguage={userLanguage}
                  progressByLanguage={progressByLanguage ?? null}
                  showDifficulty={isAdmin}
                  onProgressRecorded={handleProgressRecorded}
                />
              </div>
            )}

            {/* Writing Test Tab */}
            {activeTab === 'writingTest' && (
              <div>
                <h2 className="text-2xl font-bold text-dark-blue mb-2">Writing Test</h2>
                <p className="text-slate-600 mb-8">
                  Listen to the {learnLanguage}, type exactly what you hear, then press Submit.
                </p>
                <WritingTest
                  progressByLanguage={progressByLanguage ?? null}
                  showDifficulty={isAdmin}
                  onProgressRecorded={handleProgressRecorded}
                  learnLanguage={learnLanguage}
                  userLanguage={userLanguage}
                />
              </div>
            )}

            {/* Reading & Speaking Tab */}
            {activeTab === 'reading' && (
              <div>
                <h2 className="text-2xl font-bold text-dark-blue mb-2">Reading & Speaking</h2>
                <p className="text-slate-600 mb-8">
                  Press the button below to generate a new sentence based on your vocabulary notes.
                </p>
                <LanguageForm answerLanguage={userLanguage} wordLanguage={learnLanguage} />
              </div>
            )}

            {/* Writing Tab */}
            {activeTab === 'writing' && (
              <div>
                <h2 className="text-2xl font-bold text-dark-blue mb-2">Writing</h2>
                <p className="text-slate-600 mb-8">
                  Translate the {writingWordLanguage} sentence shown below by typing it in the text box.
                </p>

                <div className="space-y-4">
                  {/* Word/Sentence Display */}
                  <div>
                    <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                      <select
                        id="writingWordLanguage"
                        name="writingWordLanguage"
                        value={writingWordLanguage}
                        onChange={(e) => handleWritingWordLanguageChange(e.target.value as Language)}
                        className="px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
                      >
                        {TRANSLATOR_LANGUAGES.map((lang) => (
                          <option key={lang} value={lang}>
                            {lang}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowVietnamese(!showVietnamese)}
                        disabled={status === 'loading' || !writingWordText}
                        aria-label={showVietnamese ? 'Hide' : 'Show'}
                        title={showVietnamese ? 'Hide' : 'Show'}
                        className="px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
                      >
                        {showVietnamese ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      {showVietnamese ? (
                        <textarea
                          value={writingWordText}
                          readOnly
                          placeholder="Press Get New Sentence to generate one"
                          className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors resize-none text-[2rem]"
                          rows={2}
                        />
                      ) : (
                        <textarea
                          value={maskText(writingWordText)}
                          readOnly
                          placeholder="Press Get New Sentence to generate one"
                          className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors resize-none text-[2rem]"
                          rows={2}
                        />
                      )}
                      <div className="flex flex-row sm:flex-col gap-3 flex-shrink-0 sm:self-start">
                        <button
                          type="button"
                          onClick={handleWritingSpeak}
                          disabled={!writingWordText.trim() || writingSpeakStatus === 'loading'}
                          aria-label="Speak"
                          title="Speak"
                          className="px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
                        >
                          {writingSpeakStatus === 'loading' ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
                          ) : (
                            <span aria-hidden="true">🔊 ♂</span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleWritingSpeakFemale}
                          disabled={!writingWordText.trim() || writingSpeakFemaleStatus === 'loading'}
                          aria-label="Speak (female voice)"
                          title="Speak (female voice)"
                          className="px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
                        >
                          {writingSpeakFemaleStatus === 'loading' ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
                          ) : (
                            <span aria-hidden="true">🔊 ♀</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* User Input Box */}
                  <div>
                    <label className="block text-sm font-medium text-dark-blue mb-2">
                      Type {writingWordLanguage} Here
                    </label>
                    <textarea
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder={`Type your ${writingWordLanguage} translation here`}
                      className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors resize-none"
                      rows={2}
                    />
                    <div className={`mt-2 text-sm font-semibold ${isMatch ? 'text-green-600' : 'text-red-600'}`}>
                      {isMatch ? 'MATCH' : 'No Match'}
                    </div>
                  </div>

                  {/* Answer Display */}
                  <div>
                    <select
                      id="writingAnswerLanguage"
                      name="writingAnswerLanguage"
                      value={writingAnswerLanguage}
                      onChange={(e) => setWritingAnswerLanguage(e.target.value as Language)}
                      className="mb-2 px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
                    >
                      {TRANSLATOR_LANGUAGES.map((lang) => (
                        <option key={lang} value={lang}>
                          {lang}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={writingAnswerText}
                      readOnly
                      placeholder="The translation will appear here"
                      className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors resize-none"
                      rows={2}
                    />
                  </div>

                  {/* Difficulty / Word Category Selectors */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <label htmlFor="complexity" className="block text-sm font-medium text-dark-blue">
                      Difficulty
                    </label>
                    <select
                      id="complexity"
                      value={complexity}
                      onChange={(e) => {
                        setComplexity(
                          e.target.value as
                            | 'words'
                            | 'fastPhrases'
                            | 'generalPhrases'
                            | 'easy'
                            | 'medium'
                            | 'hard'
                        );
                        setTotalMatched(0);
                        matchedCurrentWordRef.current = false;
                      }}
                      className="px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
                    >
                      <option value="words">Words</option>
                      <option value="fastPhrases">Fast Phrases</option>
                      <option value="generalPhrases">General Phrases</option>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>

                    {complexity === 'words' && (
                      <>
                        <label htmlFor="wordCategory" className="block text-sm font-medium text-dark-blue">
                          Word Categories
                        </label>
                        <select
                          id="wordCategory"
                          value={wordCategory}
                          onChange={(e) => {
                            setWordCategory(e.target.value as WordCategory);
                            setTotalMatched(0);
                            matchedCurrentWordRef.current = false;
                          }}
                          className="px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
                        >
                          {WORD_CATEGORIES.map(({ value, label }) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </>
                    )}

                    {(complexity === 'words' || complexity === 'fastPhrases') && (
                      <>
                        <span className="text-sm font-medium text-dark-blue">
                          Available: {wordCategoryCount ?? '...'}
                        </span>
                      </>
                    )}

                    {(complexity === 'words' || complexity === 'fastPhrases') && (
                      <>
                        <span className="text-sm font-medium text-dark-blue">
                          Matched: {totalMatched}
                          {wordCategoryCount ? ` (${Math.round((totalMatched / wordCategoryCount) * 100)}%)` : ''}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Status Message */}
                  {message && (
                    <div className={`p-3 rounded-lg text-sm ${status === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {message}
                    </div>
                  )}

                  {/* Get New Word/Sentence Button */}
                  <div className="pt-4 space-y-2">
                    <button
                      type="button"
                      onClick={handleWritingGetNewClick}
                      disabled={status === 'loading'}
                      className="w-full px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
                    >
                      {status === 'loading' ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Generating...
                        </span>
                      ) : complexity === 'words' ? (
                        'Get New Word'
                      ) : complexity === 'fastPhrases' || complexity === 'generalPhrases' ? (
                        'Get New Phrase'
                      ) : (
                        'Get New Sentence'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleWritingFlagAndGetNew}
                      disabled={status === 'loading' || !(vietnameseText || englishSource)}
                      className="w-full px-4 py-2 bg-white border border-powder-500 text-powder-600 font-bold rounded-lg hover:bg-powder-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Flag Word - Get New
                    </button>
                    <button
                      type="button"
                      onClick={handleWritingKnownAndGetNew}
                      disabled={status === 'loading' || !(vietnameseText || englishSource)}
                      className="w-full px-4 py-2 bg-white border border-slate-300 text-dark-blue font-bold rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Known Word - Get New
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Translator Tab */}
            {activeTab === 'translator' && (
              <div>
                <h2 className="text-2xl font-bold text-dark-blue mb-2">Translator</h2>
                <p className="text-slate-600 mb-8">
                  Type {fromLanguage} text below and press Translate to see the {toLanguage} translation.
                </p>

                <div className="space-y-6">
                  {/* From Field (top, editable) */}
                  <div>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <label htmlFor="translatorFrom" className="block text-sm font-medium text-dark-blue">
                        From
                      </label>
                      <select
                        id="translatorFromLanguage"
                        name="translatorFromLanguage"
                        value={fromLanguage}
                        onChange={(e) => handleFromLanguageChange(e.target.value as Language)}
                        className="px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
                      >
                        {TRANSLATOR_LANGUAGES.map((lang) => (
                          <option key={lang} value={lang}>
                            {lang}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <textarea
                        id="translatorFrom"
                        name="translatorFrom"
                        lang={LANGUAGE_CODES[fromLanguage]}
                        value={translatorTopText}
                        onChange={(e) => setTranslatorTopText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === ' ') {
                            handleTranslate();
                          }
                        }}
                        placeholder={`Type ${fromLanguage} text here`}
                        rows={3}
                        className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue placeholder-slate-400 focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleTranslatorSpeak(translatorTopText)}
                        disabled={!translatorTopText.trim() || translatorSpeakStatus === 'loading'}
                        aria-label="Speak"
                        title="Speak"
                        className="px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100 flex-shrink-0 sm:self-start"
                      >
                        {translatorSpeakStatus === 'loading' ? (
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
                        ) : (
                          <span aria-hidden="true">🔊 ♂</span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Swap Button */}
                  <div>
                    <button
                      type="button"
                      onClick={handleSwap}
                      aria-label="Swap"
                      title="Swap"
                      className="px-4 py-2 text-sm bg-powder-500 text-white rounded-lg hover:bg-powder-600 transition-colors"
                    >
                      <ArrowUpDown className="w-4 h-4" />
                    </button>
                  </div>

                  {/* To Field (bottom, read-only) */}
                  <div>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <label htmlFor="translatorTo" className="block text-sm font-medium text-dark-blue">
                        To
                      </label>
                      <select
                        id="translatorToLanguage"
                        name="translatorToLanguage"
                        value={toLanguage}
                        onChange={(e) => handleToLanguageChange(e.target.value as Language)}
                        className="px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
                      >
                        {TRANSLATOR_LANGUAGES.map((lang) => (
                          <option key={lang} value={lang}>
                            {lang}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <textarea
                        id="translatorTo"
                        name="translatorTo"
                        lang={LANGUAGE_CODES[toLanguage]}
                        value={translatorBottomText}
                        readOnly
                        placeholder="The translation will appear here"
                        rows={3}
                        className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue placeholder-slate-400 focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleTranslatorSpeak(translatorBottomText)}
                        disabled={!translatorBottomText.trim() || translatorSpeakStatus === 'loading'}
                        aria-label="Speak"
                        title="Speak"
                        className="px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100 flex-shrink-0 sm:self-start"
                      >
                        {translatorSpeakStatus === 'loading' ? (
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
                        ) : (
                          <span aria-hidden="true">🔊 ♂</span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Status Messages */}
                  {translatorMessage && (
                    <div className="p-4 rounded-lg bg-red-100 border border-red-300 text-red-800">
                      {translatorMessage}
                    </div>
                  )}

                  {/* Translate Button */}
                  <div className="pt-4 pb-2">
                    <button
                      type="button"
                      onClick={() => handleTranslate()}
                      disabled={!translatorTopText.trim() || translatorStatus === 'loading'}
                      className="w-full px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
                    >
                      {translatorStatus === 'loading' ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Translating...
                        </span>
                      ) : (
                        'Translate'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Friend Tab */}
            {activeTab === 'friend' && (
              <div>
                <h2 className="text-2xl font-bold text-dark-blue mb-2">Friend</h2>
                <p className="text-slate-600 mb-8">
                  Chat with a {friendLanguage}-speaking friend who asks you questions using words from your
                  vocabulary notes. Reply in {friendLanguage} in the text box below.
                </p>

                <div className="space-y-4">
                  {/* Language & Difficulty Selectors */}
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label htmlFor="friendLanguage" className="block text-sm font-medium text-dark-blue">
                        Language
                      </label>
                      <select
                        id="friendLanguage"
                        value={friendLanguage}
                        onChange={(e) => setFriendLanguage(e.target.value as Language)}
                        className="px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
                      >
                        {TRANSLATOR_LANGUAGES.map((lang) => (
                          <option key={lang} value={lang}>
                            {lang}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <label htmlFor="friendDifficulty" className="block text-sm font-medium text-dark-blue">
                        Difficulty
                      </label>
                      <select
                        id="friendDifficulty"
                        value={friendDifficulty}
                        onChange={(e) => setFriendDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                        className="px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                  </div>

                  {/* Chat History */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 space-y-3 max-h-96 overflow-y-auto p-4 bg-white border border-slate-300 rounded-lg">
                      {friendMessages.length === 0 ? (
                        <p className="text-slate-400 text-sm">Press Start Chat to begin.</p>
                      ) : (
                        friendMessages.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className={`max-w-[80%] px-4 py-2 rounded-lg whitespace-pre-wrap ${
                                msg.role === 'user'
                                  ? 'bg-powder-500 text-white'
                                  : 'bg-slate-100 text-dark-blue'
                              }`}
                            >
                              {msg.role === 'user' && friendCorrections[i] ? (
                                friendCorrections[i].map((token, idx) => (
                                  <span key={idx}>
                                    {token.isCorrect ? (
                                      <span className="text-green-300">{token.word}</span>
                                    ) : (
                                      <>
                                        <span className="text-red-300">{token.word}</span>{' '}
                                        <span className="bg-white text-blue-700 px-1 rounded">
                                          {token.correct}
                                        </span>
                                      </>
                                    )}
                                    {idx < friendCorrections[i].length - 1 ? ' ' : ''}
                                  </span>
                                ))
                              ) : (
                                msg.content
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex flex-row sm:flex-col gap-3 flex-shrink-0 sm:self-end">
                      <button
                        type="button"
                        onClick={handleFriendSpeak}
                        disabled={!friendMessages.some((msg) => msg.role === 'assistant') || friendSpeakStatus === 'loading'}
                        aria-label="Speak"
                        title="Speak"
                        className="px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
                      >
                        {friendSpeakStatus === 'loading' ? (
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
                        ) : (
                          <span aria-hidden="true">🔊 ♂</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleFriendReplyTranslation}
                        disabled={!friendMessages.some((msg) => msg.role === 'assistant')}
                        aria-label={showFriendReplyTranslation ? 'Hide' : 'Show'}
                        title={showFriendReplyTranslation ? 'Hide' : 'Show'}
                        className="px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
                      >
                        {showFriendReplyTranslation ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Translation of the chatbot's most recent message */}
                  {showFriendReplyTranslation && (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <textarea
                        value={friendReplyTranslation}
                        readOnly
                        placeholder="The translation will appear here"
                        rows={3}
                        className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue placeholder-slate-400 focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors resize-none"
                      />
                      {/* Invisible spacer matching the chat window's button column so the
                          translation box lines up with the chat window above it. */}
                      <div
                        aria-hidden="true"
                        className="invisible flex flex-row sm:flex-col gap-3 flex-shrink-0"
                      >
                        <button
                          type="button"
                          tabIndex={-1}
                          className="px-4 py-2 font-bold rounded-lg"
                        >
                          Speak
                        </button>
                        <button
                          type="button"
                          tabIndex={-1}
                          className="px-4 py-2 font-bold rounded-lg"
                        >
                          {showFriendReplyTranslation ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Status Message */}
                  {friendMessage && (
                    <div className="p-4 rounded-lg bg-red-100 border border-red-300 text-red-800">
                      {friendMessage}
                    </div>
                  )}

                  {!friendStarted ? (
                    <button
                      type="button"
                      onClick={handleFriendStart}
                      disabled={friendStatus === 'loading'}
                      className="w-full px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
                    >
                      {friendStatus === 'loading' ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Starting...
                        </span>
                      ) : (
                        'Start Chat'
                      )}
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <textarea
                          value={friendInput}
                          onChange={(e) => setFriendInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === ' ') {
                              handleFriendTranslateInput();
                            }
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleFriendSend();
                            }
                          }}
                          placeholder={`Type your response in ${friendLanguage}`}
                          rows={2}
                          className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue placeholder-slate-400 focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors resize-none"
                        />
                        <button
                          type="button"
                          onClick={handleFriendSend}
                          disabled={!friendInput.trim() || friendStatus === 'loading'}
                          className="px-4 py-2 bg-gradient-to-r from-powder-500 to-powder-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-powder-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100 flex-shrink-0 sm:self-start"
                        >
                          {friendStatus === 'loading' ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
                          ) : (
                            'Send'
                          )}
                        </button>
                      </div>

                      {/* Translation (read-only, updates as you type) */}
                      <div>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <select
                            id="friendInputTranslationLanguage"
                            name="friendInputTranslationLanguage"
                            value={friendInputTranslationLanguage}
                            onChange={(e) =>
                              handleFriendInputTranslationLanguageChange(e.target.value as Language)
                            }
                            className="px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
                          >
                            {TRANSLATOR_LANGUAGES.map((lang) => (
                              <option key={lang} value={lang}>
                                {lang}
                              </option>
                            ))}
                          </select>
                          <label htmlFor="friendInputTranslation" className="block text-sm font-medium text-dark-blue">
                            Translation
                          </label>
                        </div>
                        <textarea
                          id="friendInputTranslation"
                          value={friendInputTranslation}
                          readOnly
                          placeholder="The translation will appear here as you type"
                          rows={2}
                          className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue placeholder-slate-400 focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors resize-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
