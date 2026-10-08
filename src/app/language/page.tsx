'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
import { DEFAULT_LEARN_LANGUAGE, DEFAULT_USER_LANGUAGE, isLanguage, LANGUAGE_CODES } from '@/lib/languages';
import { nextStepTab, startingProgress, type RecordedActivity } from '@/lib/languageLevels';
import {
  DIFFICULTY_LEVELS,
  difficultyOptionLabel,
  fetchLanguageProgress,
  saveLanguagePreferences,
  type ProgressMap,
} from '@/lib/languageTestClient';

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

function isTestTab(tab: Tab): boolean {
  return tab === 'readingTest' || tab === 'writingTest';
}

// useSearchParams needs a Suspense boundary for the production build
export default function LanguagePage() {
  return (
    <Suspense fallback={null}>
      <Language />
    </Suspense>
  );
}

function Language() {
  // There's no tab bar: ?tab= picks the tab (My Dojo's cards for practice,
  // the Account page's "Continue training" for Training and the tests), as
  // does the banner's "Next step" link, so learners reach a test only when
  // it's their next step. ?learn= picks the language.
  const searchParams = useSearchParams();
  const tabParam = TABS.find((t) => t === searchParams.get('tab')) ?? 'reading';
  const [activeTab, setActiveTab] = useState<Tab>(tabParam);
  // A test opened by link (or typed into the address bar) is only shown if
  // it's the learner's next step; that's checked once their progress loads
  const [testToCheck, setTestToCheck] = useState(isTestTab(tabParam));
  // Follow a new ?tab= link even when the page is already open
  const [appliedTabParam, setAppliedTabParam] = useState(tabParam);
  if (tabParam !== appliedTabParam) {
    setAppliedTabParam(tabParam);
    setActiveTab(tabParam);
    setTestToCheck(isTestTab(tabParam));
  }
  // Every tab's languages come from the Account page's Language Setup: the
  // "I speak" language for answers and translations, and the "and want to
  // learn" language for the words being practiced. A ?learn= link (the
  // Account page's "Continue training") switches the language to learn and
  // saves it there too.
  const learnParam = searchParams.get('learn');
  const linkedLearnLanguage = isLanguage(learnParam) ? learnParam : null;
  const [userLanguage, setUserLanguage] = useState<Language>(DEFAULT_USER_LANGUAGE);
  const [learnLanguage, setLearnLanguage] = useState<Language>(linkedLearnLanguage ?? DEFAULT_LEARN_LANGUAGE);
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
  const [englishSource, setEnglishSource] = useState('');
  const [writingAnswerText, setWritingAnswerText] = useState('');
  // "1"-"8" are generated sentences on the Difficulty scale
  const [complexity, setComplexity] = useState<'words' | 'fastPhrases' | 'generalPhrases' | `${number}`>(
    'words'
  );
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
  // Swapped translates from the "I speak" language instead of into it
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
  // DEFAULT_FRIEND_DIFFICULTY in friend.ts
  const [friendDifficulty, setFriendDifficulty] = useState(3);
  const [friendInputTranslation, setFriendInputTranslation] = useState('');
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
        // The user's saved languages, unless a ?learn= link chose the
        // language to learn
        if (progress?.nativeLanguage) {
          setUserLanguage(progress.nativeLanguage);
        }
        if (progress?.activeLearningLanguage && !linkedLearnLanguage) {
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
    // linkedLearnLanguage only matters on the first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A ?learn= link becomes the saved language to learn, so the Account
  // page's Language Setup matches what the tabs are using
  useEffect(() => {
    if (linkedLearnLanguage) {
      saveLanguagePreferences({ activeLearningLanguage: linkedLearnLanguage }).catch(() => {});
    }
  }, [linkedLearnLanguage]);

  // Once progress has loaded, a test that isn't the learner's next step
  // becomes their actual next step (Reading & Speaking once every belt is
  // earned). Checked once per link, so a test that's passed and moves them
  // on stays open to show its score. Admins can open any test.
  if (testToCheck && progressByLanguage !== undefined) {
    setTestToCheck(false);
    const progress = progressByLanguage?.[learnLanguage] ?? startingProgress(learnLanguage);
    const nextTab = TABS.find((t) => t === nextStepTab(progress)) ?? 'reading';
    if (!isAdmin && nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }
  // Nothing is shown in place of a test until it's been checked
  const shownTab: Tab | null = testToCheck ? null : activeTab;

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
    setTabContentKey((key) => key + 1);
    // Wait for the new tab to render before scrolling
    requestAnimationFrame(() => tabsSectionRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  // A tab saved a Training/test result; keep the banner and tabs current
  const handleProgressRecorded = (result: RecordedActivity) => {
    setProgressByLanguage((prev) => ({ ...prev, [result.progress.language]: result.progress }));
  };

  const maskText = (text: string) => text.replace(/\S/g, '•');

  // The Translator goes from the language being learned (top) into the
  // "I speak" language (bottom), or the other way once swapped
  const fromLanguage: Language = isSwapped ? userLanguage : learnLanguage;
  const toLanguage: Language = isSwapped ? learnLanguage : userLanguage;

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


  // Keeps the Writing tab's word/sentence in the language being learned,
  // for whatever was last generated.
  useEffect(() => {
    let isCurrent = true;

    translateText(vietnameseText, 'Vietnamese', learnLanguage)
      .then((text) => {
        if (isCurrent) setWritingWordText(text);
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
  }, [vietnameseText, learnLanguage]);

  // Keeps the Writing tab's answer field in the "I speak" language, for
  // whatever word/sentence was last generated.
  useEffect(() => {
    let isCurrent = true;

    resolveWritingAnswerText(vietnameseText, englishSource, userLanguage)
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
  }, [vietnameseText, englishSource, userLanguage]);

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

  const handleTranslate = async () => {
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
          to: toLanguage,
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

  const translateFriendReply = async (text: string) => {
    if (!text.trim()) return;

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          from: learnLanguage,
          to: userLanguage,
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
        body: JSON.stringify({ history: [], difficulty: friendDifficulty, language: learnLanguage }),
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
        body: JSON.stringify({ text, language: learnLanguage }),
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
          language: learnLanguage,
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

  const handleFriendTranslateInput = async () => {
    if (!friendInput.trim()) return;

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: friendInput,
          from: learnLanguage,
          to: userLanguage,
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
          <p className="mt-4 text-sm text-dark-blue">
            I speak <span className="font-semibold">{userLanguage}</span> and want to learn{' '}
            <span className="font-semibold">{learnLanguage}</span>.{' '}
            <Link href="/account" className="font-semibold text-powder-600 hover:underline">
              Change in Language Setup
            </Link>
          </p>
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
        </div>
      </section>

      {/* Language Practice Content */}
      <section
        ref={tabsSectionRef}
        className="py-16 px-6 sm:px-10 lg:px-16 bg-white flex flex-col items-center scroll-mt-4"
      >
        <div className="w-full max-w-5xl">
          {/* Tab Content (re-keyed by "Next step" so the tab starts fresh at
              the user's working level) */}
          <div key={tabContentKey} className="bg-slate-50 rounded-xl border border-slate-200 p-8">
            {shownTab === null && <p className="text-slate-500">Loading…</p>}

            {/* Training Tab */}
            {shownTab === 'training' && (
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
            {shownTab === 'readingTest' && (
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
            {shownTab === 'writingTest' && (
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
            {shownTab === 'reading' && (
              <div>
                <h2 className="text-2xl font-bold text-dark-blue mb-2">Reading & Speaking</h2>
                <p className="text-slate-600 mb-8">
                  Press the button below to generate a new sentence based on your vocabulary notes.
                </p>
                <LanguageForm answerLanguage={userLanguage} wordLanguage={learnLanguage} />
              </div>
            )}

            {/* Writing Tab */}
            {shownTab === 'writing' && (
              <div>
                <h2 className="text-2xl font-bold text-dark-blue mb-2">Writing</h2>
                <p className="text-slate-600 mb-8">
                  Translate the {learnLanguage} sentence shown below by typing it in the text box.
                </p>

                <div className="space-y-4">
                  {/* Word/Sentence Display */}
                  <div>
                    <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                      <span className="text-sm font-medium text-dark-blue">{learnLanguage}</span>
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
                      Type {learnLanguage} Here
                    </label>
                    <textarea
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder={`Type your ${learnLanguage} translation here`}
                      className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors resize-none"
                      rows={2}
                    />
                    <div className={`mt-2 text-sm font-semibold ${isMatch ? 'text-green-600' : 'text-red-600'}`}>
                      {isMatch ? 'MATCH' : 'No Match'}
                    </div>
                  </div>

                  {/* Answer Display */}
                  <div>
                    <span className="block mb-2 text-sm font-medium text-dark-blue">{userLanguage}</span>
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
                        setComplexity(e.target.value as typeof complexity);
                        setTotalMatched(0);
                        matchedCurrentWordRef.current = false;
                      }}
                      className="px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
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
            {shownTab === 'translator' && (
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
                        From {fromLanguage}
                      </label>
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
                        To {toLanguage}
                      </label>
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
            {shownTab === 'friend' && (
              <div>
                <h2 className="text-2xl font-bold text-dark-blue mb-2">Friend</h2>
                <p className="text-slate-600 mb-8">
                  Chat with a {learnLanguage}-speaking friend who asks you questions using words from your
                  vocabulary notes. Reply in {learnLanguage} in the text box below.
                </p>

                <div className="space-y-4">
                  {/* Difficulty Selector */}
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label htmlFor="friendDifficulty" className="block text-sm font-medium text-dark-blue">
                        Difficulty
                      </label>
                      <select
                        id="friendDifficulty"
                        value={String(friendDifficulty)}
                        onChange={(e) => setFriendDifficulty(Number(e.target.value))}
                        className="px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors"
                      >
                        {DIFFICULTY_LEVELS.map((level) => (
                          <option key={level} value={String(level)}>
                            {difficultyOptionLabel(level)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Chat History */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    {/* The conversation is practice content, so it isn't
                        shown in the "I speak" language */}
                    <div
                      translate="no"
                      className="flex-1 space-y-3 max-h-96 overflow-y-auto p-4 bg-white border border-slate-300 rounded-lg"
                    >
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
                          placeholder={`Type your response in ${learnLanguage}`}
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
                        <label
                          htmlFor="friendInputTranslation"
                          className="block mb-2 text-sm font-medium text-dark-blue"
                        >
                          {userLanguage} Translation
                        </label>
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
    </div>
  );
}
