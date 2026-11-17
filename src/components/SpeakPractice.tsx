'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import {
  bestSpokenAttempt,
  gradeSpokenWords,
  SPEAKING_PASS_SCORE,
  speechLocale,
  type SpokenWordGrade,
} from '@/lib/speechPractice';

// The Reading & Speaking tab's Speak button: the learner says the sentence shown above, the browser's own speech
// recognition (Web Speech API) turns it into text as they speak, and the attempt is scored 0-100% against the
// sentence. The box beside the button shows only the sentence's own words, each one as the learner reaches it, colored
// by how well it was said (green correct, light red close, bright red wrong). TalkNinja never receives the audio; the transcript and score stay in this component (Privacy Policy,
// "Speaking practice"). The microphone is allowed for this site only (Permissions-Policy in next.config.js).

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

// A short synthesized chime (no audio files): rising notes for a pass, falling for a miss
const WORD_STYLES: Record<SpokenWordGrade, { className: string; label: string }> = {
  correct: { className: 'text-green-400', label: 'Correct' },
  close: { className: 'text-red-300', label: 'Close' },
  wrong: { className: 'text-red-500 font-bold underline decoration-wavy decoration-2 underline-offset-4', label: 'Wrong' },
};

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

interface SpeakPracticeProps {
  // The sentence to say (the top text box) and its language
  expected: string;
  language: string;
}

export default function SpeakPractice({ expected, language }: SpeakPracticeProps) {
  const [listening, setListening] = useState(false);
  // What the recognizer has heard so far, and whether the attempt is over (then every word is graded)
  const [heard, setHeard] = useState<{ text: string; finished: boolean }>({ text: '', finished: false });
  // The score of the last attempt, and the sentence it was for (a new sentence clears it)
  const [result, setResult] = useState<{ for: string; score: number } | null>(null);
  const [message, setMessage] = useState('');
  const recognitionRef = useRef<Recognition | null>(null);

  // A new sentence (or language) starts fresh
  const [attemptKey, setAttemptKey] = useState(`${language}|${expected}`);
  if (attemptKey !== `${language}|${expected}`) {
    setAttemptKey(`${language}|${expected}`);
    setListening(false);
    setHeard({ text: '', finished: false });
    setResult(null);
    setMessage('');
  }

  // Stops listening if the sentence changes or the tab closes mid-attempt
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, [expected, language]);

  const handleSpeak = () => {
    if (listening) {
      // Pressing again finishes the attempt early; onend scores it
      recognitionRef.current?.stop();
      return;
    }
    if (!expected.trim()) return;

    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setMessage('Your browser doesn\'t support speech recognition. Try Chrome, Edge or Safari.');
      return;
    }

    const locale = speechLocale(language);
    const target = expected;
    const recognition = new Constructor();
    recognition.lang = locale;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 3;

    let finalAlternatives: string[] = [];
    let interim = '';
    let failed = false;

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      const alternatives: string[][] = [];
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalText += res[0].transcript;
          alternatives.push(Array.from({ length: res.length }, (_, k) => res[k].transcript));
        } else {
          interimText += res[0].transcript;
        }
      }
      interim = interimText;
      // One final result (the usual case): score each of its alternatives; several: their first choices joined
      if (alternatives.length === 1) finalAlternatives = alternatives[0];
      else if (alternatives.length > 1) finalAlternatives = [finalText];
      setHeard({ text: `${finalText}${interimText}`.trim(), finished: false });
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      if (event.error === 'no-speech') return; // onend reports it
      failed = true;
      setMessage(RECOGNITION_ERRORS[event.error] ?? 'Speech recognition stopped unexpectedly. Please try again.');
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setListening(false);
      if (failed) return;

      const heard = finalAlternatives.length > 0 ? finalAlternatives : interim.trim() ? [interim] : [];
      if (heard.length === 0) {
        setMessage('We didn\'t hear anything. Press Speak and say the phrase.');
        return;
      }
      const best = bestSpokenAttempt(target, heard, locale);
      setHeard({ text: best.transcript.trim(), finished: true });
      setResult({ for: target, score: best.score });
      playChime(best.score >= SPEAKING_PASS_SCORE);
    };

    recognitionRef.current?.abort();
    recognitionRef.current = recognition;
    setHeard({ text: '', finished: false });
    setResult(null);
    setMessage('');
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setMessage('The microphone couldn\'t be started. Please try again.');
    }
  };

  const shownResult = result && result.for === expected ? result : null;
  const passed = shownResult ? shownResult.score >= SPEAKING_PASS_SCORE : false;
  const spokenWords = heard.text ? gradeSpokenWords(expected, heard.text, speechLocale(language), heard.finished) : [];

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
          {listening ? (
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
