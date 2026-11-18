'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import {
  gradeSpokenAttempt,
  gradeSpokenWords,
  SPEAKING_PASS_SCORE,
  speechLocale,
  type SpokenWordGrade,
  type SpokenWordPart,
} from '@/lib/speechPractice';

// The Reading & Speaking tab's Speak button: the learner says the sentence shown above, the browser's own speech
// recognition (Web Speech API) turns it into text as they speak, and the attempt is scored 0-100% against the
// sentence. The box beside the button shows only the sentence's own words, each one as the learner reaches it, colored
// by how well it was said (green correct, light red close, red wrong). TalkNinja never receives the audio; the
// transcript and score stay in this component (Privacy Policy, "Speaking practice"). The microphone is allowed for
// this site only (Permissions-Policy in next.config.js).
//
// Recognizers stop on their own (after a pause, after a few silent seconds, or for no reason in some browsers), so an
// attempt keeps listening across them: a recognizer that ends before the learner is done is started again, and the
// attempt ends after a pause once they've spoken, when they press the button, or after a time limit.

// The parts of the Web Speech API used here (not in every TypeScript DOM library)
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent {
  readonly error: string;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const RECOGNITION_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow the microphone for this site in your browser, then press Speak again.',
  'service-not-allowed': 'Speech recognition isn\'t allowed in this browser. Try Chrome, Edge or Safari.',
  'audio-capture': 'No microphone was found. Connect one, then press Speak again.',
  network: 'Speech recognition needs an internet connection. Check your connection and try again.',
  'language-not-supported': 'Your browser can\'t recognize speech in this language yet.',
};

// How long to wait: for the learner to start speaking, after they pause, and for the whole attempt
const START_TIMEOUT_MS = 10_000;
const PAUSE_MS = 1_800;
const PAUSE_AFTER_WHOLE_SENTENCE_MS = 700;
const MAX_ATTEMPT_MS = 30_000;
// Recognizers that end straight away (before hearing anything) are restarted at most this many times
const MAX_QUICK_RESTARTS = 4;

const WORD_STYLES: Record<SpokenWordGrade, { className: string; label: string }> = {
  correct: { className: 'text-green-400', label: 'Correct' },
  close: { className: 'text-red-300', label: 'Close' },
  wrong: { className: 'text-red-500', label: 'Wrong' },
};

// A short synthesized chime (no audio files): rising notes for a pass, falling for a miss
function playChime(passed: boolean) {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const notes = passed ? [523.25, 659.25, 783.99] : [311.13, 233.08];
    const step = passed ? 0.11 : 0.2;
    notes.forEach((frequency, i) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = passed ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      const start = context.currentTime + i * step;
      const length = passed ? 0.35 : 0.3;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + length);
    });
    window.setTimeout(() => void context.close(), (notes.length * step + 0.5) * 1000);
  } catch {
    // Sound is a nicety; the score is still shown
  }
}

const squash = (text: string) => text.toLowerCase().replace(/[\s\p{P}]/gu, '');

// One attempt: everything heard across the recognizers it used
interface Attempt {
  target: string;
  locale: string;
  recognition: Recognition | null;
  // Final results from recognizers that have ended, and from the current one: each with the recognizer's alternatives
  committed: string[][];
  current: string[][];
  interim: string;
  // Every distinct full transcript seen along the way (interim ones too), so a word heard right once counts
  snapshots: string[];
  heardSpeech: boolean;
  stopping: boolean;
  failed: boolean;
  quickRestarts: number;
  startedAt: number;
  pauseTimer?: number;
  startTimer?: number;
  maxTimer?: number;
}

function joined(segments: string[][], interim = ''): string {
  return [...segments.map((s) => s[0] ?? ''), interim].join(' ').replace(/\s+/g, ' ').trim();
}

// The first choices joined, plus each alternative of each final result swapped in, plus the snapshots
function transcripts(attempt: Attempt): string[] {
  const segments = [...attempt.committed, ...attempt.current];
  const all = new Set<string>();
  const main = joined(segments, attempt.interim);
  if (main) all.add(main);
  segments.forEach((alternatives, k) => {
    alternatives.slice(1).forEach((alt) => {
      const swapped = segments.map((s, i) => (i === k ? [alt] : s));
      all.add(joined(swapped, attempt.interim));
    });
  });
  for (const s of attempt.snapshots) all.add(s);
  return Array.from(all).filter(Boolean).slice(0, 40);
}

interface SpeakPracticeProps {
  // The sentence to say (the top text box) and its language
  expected: string;
  language: string;
}

export default function SpeakPractice({ expected, language }: SpeakPracticeProps) {
  // starting: the microphone is opening (don't speak yet); listening: speak now
  const [phase, setPhase] = useState<'idle' | 'starting' | 'listening'>('idle');
  // What the recognizer has heard so far (shown live while listening)
  const [liveText, setLiveText] = useState('');
  // The graded words and score of the last attempt, and the sentence it was for (a new sentence clears it)
  const [result, setResult] = useState<{ for: string; parts: SpokenWordPart[]; score: number } | null>(null);
  const [message, setMessage] = useState('');
  const attemptRef = useRef<Attempt | null>(null);

  // A new sentence (or language) starts fresh
  const [attemptKey, setAttemptKey] = useState(`${language}|${expected}`);
  if (attemptKey !== `${language}|${expected}`) {
    setAttemptKey(`${language}|${expected}`);
    setPhase('idle');
    setLiveText('');
    setResult(null);
    setMessage('');
  }

  // Stops listening if the sentence changes or the tab closes mid-attempt
  useEffect(() => {
    return () => {
      const attempt = attemptRef.current;
      attemptRef.current = null;
      if (attempt) {
        clearTimers(attempt);
        attempt.recognition?.abort();
      }
    };
  }, [expected, language]);

  function clearTimers(attempt: Attempt) {
    window.clearTimeout(attempt.pauseTimer);
    window.clearTimeout(attempt.startTimer);
    window.clearTimeout(attempt.maxTimer);
  }

  function stopAttempt(attempt: Attempt) {
    if (attempt.stopping) return;
    attempt.stopping = true;
    clearTimers(attempt);
    if (attempt.recognition) {
      try {
        attempt.recognition.stop();
      } catch {
        finishAttempt(attempt);
      }
    } else {
      finishAttempt(attempt);
    }
  }

  function finishAttempt(attempt: Attempt) {
    if (attemptRef.current !== attempt) return;
    attemptRef.current = null;
    clearTimers(attempt);
    setPhase('idle');
    if (attempt.failed) return;

    const heard = transcripts(attempt);
    if (heard.length === 0) {
      setLiveText('');
      setMessage(
        'We didn\'t hear anything. Press Speak, wait for "Listening…", then say the phrase clearly, close to your microphone.'
      );
      return;
    }
    const graded = gradeSpokenAttempt(attempt.target, heard, attempt.locale);
    setLiveText('');
    setResult({ for: attempt.target, parts: graded.parts, score: graded.score });
    playChime(graded.score >= SPEAKING_PASS_SCORE);
  }

  // Whether every word of the sentence has been reached in what's been heard
  function reachedWholeSentence(attempt: Attempt, text: string): boolean {
    const parts = gradeSpokenWords(attempt.target, text, attempt.locale, false);
    const all = gradeSpokenWords(attempt.target, text, attempt.locale, true);
    return parts.filter((p) => p.grade).length === all.filter((p) => p.grade).length;
  }

  function startRecognizer(attempt: Attempt, Constructor: RecognitionConstructor) {
    const recognition = new Constructor();
    recognition.lang = attempt.locale;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 5;
    attempt.recognition = recognition;
    attempt.current = [];
    attempt.interim = '';
    let heardHere = false;

    recognition.onstart = () => {
      if (attemptRef.current !== attempt) return;
      setPhase('listening');
    };

    recognition.onresult = (event) => {
      if (attemptRef.current !== attempt || attempt.recognition !== recognition) return;
      const finals: string[][] = [];
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          const alternatives = Array.from({ length: res.length }, (_, k) => res[k].transcript.trim()).filter(Boolean);
          if (alternatives.length === 0) continue;
          // Some browsers (Chrome on Android) repeat everything said so far in each new result: keep the longer one
          const previous = finals[finals.length - 1];
          if (previous && squash(alternatives[0]).startsWith(squash(previous[0]))) finals[finals.length - 1] = alternatives;
          else finals.push(alternatives);
        } else {
          interim += `${res[0].transcript} `;
        }
      }
      attempt.current = finals;
      attempt.interim = interim.trim();
      const text = joined([...attempt.committed, ...finals], attempt.interim);
      if (!text) return;
      heardHere = true;
      attempt.heardSpeech = true;
      if (!attempt.snapshots.includes(text)) attempt.snapshots = [...attempt.snapshots.slice(-19), text];
      setLiveText(text);

      // End after a pause: a short one once the whole sentence has been said, a longer one otherwise
      window.clearTimeout(attempt.startTimer);
      window.clearTimeout(attempt.pauseTimer);
      const done = !attempt.interim && reachedWholeSentence(attempt, text);
      attempt.pauseTimer = window.setTimeout(
        () => stopAttempt(attempt),
        done ? PAUSE_AFTER_WHOLE_SENTENCE_MS : PAUSE_MS
      );
    };

    recognition.onerror = (event) => {
      if (attemptRef.current !== attempt) return;
      // Silence and our own stops aren't failures: onend restarts or scores
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      attempt.failed = true;
      setMessage(RECOGNITION_ERRORS[event.error] ?? 'Speech recognition stopped unexpectedly. Please try again.');
    };

    recognition.onend = () => {
      if (attemptRef.current !== attempt || attempt.recognition !== recognition) return;
      // Keep what this recognizer heard (an unfinished phrase too)
      attempt.committed = [...attempt.committed, ...attempt.current];
      if (attempt.interim) attempt.committed.push([attempt.interim]);
      attempt.current = [];
      attempt.interim = '';
      attempt.recognition = null;

      const elapsed = Date.now() - attempt.startedAt;
      const text = joined(attempt.committed);
      const keepListening =
        !attempt.stopping &&
        !attempt.failed &&
        elapsed < MAX_ATTEMPT_MS &&
        (attempt.heardSpeech ? !reachedWholeSentence(attempt, text) : elapsed < START_TIMEOUT_MS) &&
        (heardHere || attempt.quickRestarts++ < MAX_QUICK_RESTARTS);
      if (keepListening) {
        try {
          startRecognizer(attempt, Constructor);
          return;
        } catch {
          // Couldn't start again: score what was heard
        }
      }
      finishAttempt(attempt);
    };

    recognition.start();
  }

  const handleSpeak = () => {
    const running = attemptRef.current;
    if (running) {
      // Pressing again finishes the attempt early and scores it
      stopAttempt(running);
      return;
    }
    if (!expected.trim()) return;

    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setMessage('Your browser doesn\'t support speech recognition. Try Chrome, Edge or Safari.');
      return;
    }

    const attempt: Attempt = {
      target: expected,
      locale: speechLocale(language),
      recognition: null,
      committed: [],
      current: [],
      interim: '',
      snapshots: [],
      heardSpeech: false,
      stopping: false,
      failed: false,
      quickRestarts: 0,
      startedAt: Date.now(),
    };
    attemptRef.current = attempt;
    setLiveText('');
    setResult(null);
    setMessage('');
    setPhase('starting');
    try {
      startRecognizer(attempt, Constructor);
    } catch {
      attemptRef.current = null;
      setPhase('idle');
      setMessage('The microphone couldn\'t be started. Please try again.');
      return;
    }
    // Nothing heard at all: give up and say so. And never listen forever.
    attempt.startTimer = window.setTimeout(() => {
      if (!attempt.heardSpeech) stopAttempt(attempt);
    }, START_TIMEOUT_MS);
    attempt.maxTimer = window.setTimeout(() => stopAttempt(attempt), MAX_ATTEMPT_MS);
  };

  const shownResult = result && result.for === expected ? result : null;
  const passed = shownResult ? shownResult.score >= SPEAKING_PASS_SCORE : false;
  const listening = phase !== 'idle';
  const spokenWords: SpokenWordPart[] = shownResult
    ? shownResult.parts
    : liveText
      ? gradeSpokenWords(expected, liveText, speechLocale(language), false)
      : [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleSpeak}
          disabled={!expected.trim()}
          aria-pressed={listening}
          title={listening ? 'Stop and score' : 'Say the phrase above'}
          className="practice-btn flex-shrink-0 sm:self-start"
        >
          {phase === 'starting' ? (
            <>
              <Mic className="w-5 h-5 animate-pulse" aria-hidden="true" />
              Starting…
            </>
          ) : phase === 'listening' ? (
            <>
              <Square className="w-4 h-4" aria-hidden="true" />
              Listening…
            </>
          ) : (
            <>
              <Mic className="w-5 h-5" aria-hidden="true" />
              Speak
            </>
          )}
        </button>
        <div
          aria-label="Your pronunciation"
          aria-live="polite"
          className="practice-field practice-text-lg"
          style={{ minHeight: 'calc(2.7em + 1.5rem + 2px)' }}
        >
          {spokenWords.length === 0 && phase === 'listening' && (
            <span className="practice-hint">Speak now…</span>
          )}
          {spokenWords.map((part, i) =>
            part.grade ? (
              <span key={i} className={WORD_STYLES[part.grade].className} title={WORD_STYLES[part.grade].label}>
                {part.text}
              </span>
            ) : (
              <span key={i}>{part.text}</span>
            )
          )}
        </div>
      </div>

      {spokenWords.some((part) => part.grade) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-hidden="true">
          {(Object.keys(WORD_STYLES) as SpokenWordGrade[]).map((grade) => (
            <span key={grade} className={WORD_STYLES[grade].className}>
              {WORD_STYLES[grade].label}
            </span>
          ))}
        </div>
      )}

      {shownResult && (
        <div className="mt-2 flex items-center gap-3 font-semibold" role="status">
          <span className={`text-2xl ${passed ? 'text-green-400' : 'text-red-400'}`}>{shownResult.score}%</span>
          {!passed && <span className="text-red-400">Try Again</span>}
        </div>
      )}

      {message && <div className="practice-error mt-2">{message}</div>}
    </div>
  );
}
