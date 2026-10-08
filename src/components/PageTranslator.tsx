'use client';

import { useEffect } from 'react';
import { LANGUAGE_CODES, type Language } from '@/lib/languages';

// Shows the whole site in the signed-in user's "I speak" language (Account
// page, Language Setup). The site is written in English, so for any other
// language this finds the visible text on the page and swaps each piece for
// its translation, again whenever React changes it. Learning content (the
// words being practiced, answers, chat) is marked translate="no" and left
// alone, as is anything typed into a text box.

// Attributes people see or hear as text
const TRANSLATED_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];
// Elements whose text isn't interface text
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);
const MAX_STRINGS_PER_REQUEST = 100;
const MAX_STRING_LENGTH = 500;
const HAS_LETTER = /\p{L}/u;

// What a text node or attribute said before translation, and what it shows now
type TranslationRecord = { original: string; shown: string };

function storageKey(language: Language) {
  return `talkninja-ui-translations-${language}`;
}

function loadCache(language: Language): Map<string, string> {
  try {
    const saved = localStorage.getItem(storageKey(language));
    return new Map(saved ? Object.entries(JSON.parse(saved) as { [text: string]: string }) : []);
  } catch {
    return new Map();
  }
}

function saveCache(language: Language, cache: Map<string, string>) {
  try {
    localStorage.setItem(storageKey(language), JSON.stringify(Object.fromEntries(cache)));
  } catch {
    // Without storage the translations are just fetched again next visit
  }
}

// Text inside these is left as it is
function isExcluded(element: Element | null): boolean {
  if (!element) return true;
  if (element.closest('[translate="no"], [contenteditable="true"]')) return true;
  for (let el: Element | null = element; el; el = el.parentElement) {
    if (SKIPPED_TAGS.has(el.tagName)) return true;
  }
  return false;
}

// Splits off leading/trailing whitespace, which is kept as is
function splitWhitespace(value: string): [string, string, string] {
  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return match ? [match[1], match[2], match[3]] : ['', value, ''];
}

function createTranslator(language: Language) {
  const cache = loadCache(language);
  const textRecords = new WeakMap<Text, TranslationRecord>();
  const attributeRecords = new WeakMap<Element, Map<string, TranslationRecord>>();
  // Every node and element changed, so they can be put back
  const touchedTexts = new Set<Text>();
  const touchedElements = new Set<Element>();
  // Strings waiting for, or being fetched from, the server
  const pending = new Set<string>();
  const inFlight = new Set<string>();
  // Strings the server couldn't translate on this visit
  const failed = new Set<string>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  // The translation of a piece of text, or null if it isn't known yet (it's
  // then queued for the server)
  const translationFor = (core: string): string | null => {
    const cached = cache.get(core);
    if (cached !== undefined) return cached;
    if (!failed.has(core) && !inFlight.has(core) && core.length <= MAX_STRING_LENGTH) {
      pending.add(core);
      scheduleFlush();
    }
    return null;
  };

  const translateTextNode = (node: Text) => {
    if (isExcluded(node.parentElement)) return;
    const value = node.nodeValue ?? '';
    const record = textRecords.get(node);
    // Unchanged since it was translated
    if (record && value === record.shown) return;

    // New text, or React changed it: this is the new original
    const [lead, core, trail] = splitWhitespace(value);
    if (!HAS_LETTER.test(core)) return;
    const translation = translationFor(core);
    if (translation === null) return;

    const shown = lead + translation + trail;
    textRecords.set(node, { original: value, shown });
    touchedTexts.add(node);
    if (shown !== value) node.nodeValue = shown;
  };

  const translateAttributes = (element: Element) => {
    if (isExcluded(element)) return;
    for (const name of TRANSLATED_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (!value) continue;
      const records = attributeRecords.get(element) ?? new Map<string, TranslationRecord>();
      const record = records.get(name);
      if (record && value === record.shown) continue;

      const [lead, core, trail] = splitWhitespace(value);
      if (!HAS_LETTER.test(core)) continue;
      const translation = translationFor(core);
      if (translation === null) continue;

      const shown = lead + translation + trail;
      records.set(name, { original: value, shown });
      attributeRecords.set(element, records);
      touchedElements.add(element);
      if (shown !== value) element.setAttribute(name, shown);
    }
  };

  const translateTree = (root: Node) => {
    if (stopped) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root as Text);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;

    translateAttributes(root as Element);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        translateTextNode(node as Text);
      } else {
        translateAttributes(node as Element);
      }
    }
  };

  // Sends the queued strings to the server in batches, then applies them
  function scheduleFlush() {
    if (flushTimer !== null || stopped) return;
    flushTimer = setTimeout(flush, 50);
  }

  async function flush() {
    flushTimer = null;
    const batches: string[][] = [];
    const strings = Array.from(pending);
    pending.clear();
    for (let i = 0; i < strings.length; i += MAX_STRINGS_PER_REQUEST) {
      batches.push(strings.slice(i, i + MAX_STRINGS_PER_REQUEST));
    }

    await Promise.all(
      batches.map(async (batch) => {
        batch.forEach((text) => inFlight.add(text));
        try {
          const response = await fetch('/api/ui-translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: batch, language }),
          });
          const data = await response.json();
          if (!response.ok || !Array.isArray(data.translations)) throw new Error(data.error);
          batch.forEach((text, i) => {
            const translation = data.translations[i];
            if (typeof translation === 'string') cache.set(text, translation);
            else failed.add(text);
          });
        } catch {
          // Shown in English until the next visit
          batch.forEach((text) => failed.add(text));
        } finally {
          batch.forEach((text) => inFlight.delete(text));
        }
      })
    );

    if (stopped) return;
    saveCache(language, cache);
    translateTree(document.body);
  }

  // Runs before the browser paints, so text with a known translation never
  // shows in English
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => translateTree(node));
      } else if (mutation.type === 'characterData') {
        translateTextNode(mutation.target as Text);
      } else if (mutation.target.nodeType === Node.ELEMENT_NODE) {
        // An attribute changed, or translate="no" was added or removed
        translateTree(mutation.target);
      }
    }
  });

  return {
    start() {
      document.documentElement.lang = LANGUAGE_CODES[language];
      translateTree(document.body);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: [...TRANSLATED_ATTRIBUTES, 'translate'],
      });
    },
    // Puts back the English, e.g. after switching "I speak" to English
    stop() {
      stopped = true;
      observer.disconnect();
      if (flushTimer !== null) clearTimeout(flushTimer);
      for (const node of touchedTexts) {
        const record = textRecords.get(node);
        if (record && node.nodeValue === record.shown) node.nodeValue = record.original;
      }
      for (const element of touchedElements) {
        attributeRecords.get(element)?.forEach((record, name) => {
          if (element.getAttribute(name) === record.shown) element.setAttribute(name, record.original);
        });
      }
      document.documentElement.lang = LANGUAGE_CODES.English;
    },
  };
}

export default function PageTranslator({ language }: { language: Language | null }) {
  useEffect(() => {
    // The site is written in English; signed-out visitors see it as is
    if (!language || language === 'English') return;
    const translator = createTranslator(language);
    translator.start();
    return () => translator.stop();
  }, [language]);

  return null;
}
