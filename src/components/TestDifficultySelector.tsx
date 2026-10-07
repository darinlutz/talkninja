'use client';

import { useEffect, useState } from 'react';
import type { WordCategory } from '@/lib/language';
import {
  DIFFICULTY_LEVELS,
  difficultyOptionLabel,
  vocabCategoryFor,
  WORD_CATEGORIES,
  type TestDifficulty,
} from '@/lib/languageTestClient';

const selectClassName =
  'px-2 py-1 text-sm bg-white border border-slate-300 rounded-lg text-dark-blue focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

interface TestDifficultySelectorProps {
  // Prefixes the element ids so several tabs can each have one
  idPrefix: string;
  difficulty: TestDifficulty;
  onDifficultyChange: (difficulty: TestDifficulty) => void;
  wordCategory: WordCategory;
  onWordCategoryChange: (category: WordCategory) => void;
  // Locks both comboboxes, e.g. while a test is in progress
  disabled?: boolean;
}

// The Difficulty (Fast Phrases, Words, 1-10) and Word Categories
// comboboxes, with the number of vocabulary items available.
export default function TestDifficultySelector({
  idPrefix,
  difficulty,
  onDifficultyChange,
  wordCategory,
  onWordCategoryChange,
  disabled = false,
}: TestDifficultySelectorProps) {
  const [wordCategoryCount, setWordCategoryCount] = useState<number | null>(null);
  const vocabCategory = vocabCategoryFor(difficulty, wordCategory);

  // Keeps the "Available" label in sync with the active vocabulary category
  useEffect(() => {
    if (!vocabCategory) return;

    let isCurrent = true;
    fetch('/api/language/word/count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: vocabCategory }),
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
  }, [vocabCategory]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label htmlFor={`${idPrefix}Difficulty`} className="block text-sm font-medium text-dark-blue">
        Difficulty
      </label>
      <select
        id={`${idPrefix}Difficulty`}
        name={`${idPrefix}Difficulty`}
        value={difficulty}
        onChange={(e) => onDifficultyChange(e.target.value as TestDifficulty)}
        disabled={disabled}
        className={selectClassName}
      >
        <option value="fastPhrases">Fast Phrases</option>
        <option value="words">Words</option>
        {DIFFICULTY_LEVELS.map((level) => (
          <option key={level} value={String(level)}>
            {difficultyOptionLabel(level)}
          </option>
        ))}
      </select>

      {difficulty === 'words' && (
        <>
          <label htmlFor={`${idPrefix}WordCategory`} className="block text-sm font-medium text-dark-blue">
            Word Categories
          </label>
          <select
            id={`${idPrefix}WordCategory`}
            name={`${idPrefix}WordCategory`}
            value={wordCategory}
            onChange={(e) => onWordCategoryChange(e.target.value as WordCategory)}
            disabled={disabled}
            className={selectClassName}
          >
            {WORD_CATEGORIES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </>
      )}

      {vocabCategory && (
        <span className="text-sm font-medium text-dark-blue">
          Available: {wordCategoryCount ?? '...'}
        </span>
      )}
    </div>
  );
}
