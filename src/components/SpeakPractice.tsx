'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import {
  gradeSpokenAttempt,
  gradeSpokenWords,
  MAX_SPEAK_ATTEMPT_MS,
  recognizerLabel,
  SCRIBE_SAMPLE_RATE,
  scribeLanguageCode,
  SPEAKING_PASS_SCORE,
  speechLocale,
  type BrowserRecognitionReason,
  type SpokenWordGrade,
  type SpokenWordPart,
} from '@/lib/speechPractice';
import {
  closeMicrophone,
  microphoneError,
  openMicrophone,
  startScribe,
  type ScribeRecognizer,
} from '@/lib/scribeRecognizer';
import { reportRateLimit } from '@/lib/rateLimitClient';

// The Reading & Speaking tab's Speak button: the learner says the sentence shown above, it's turned into text as they
// speak, and the attempt is scored 0-100% against the sentence. The box beside the button shows only the sentence's
// own words, each one as the learner reaches it, colored by how well it was said (green correct, light red close, red
// wrong). The microphone is allowed for this site only (Permissions-Policy in next.config.js).
//
// Recognition: ElevenLabs Scribe (scribe_v3_live). /api/speech-recognition gives a WebSocket URL with a single-use
// token and the microphone is streamed straight to ElevenLabs (src/lib/scribeRecognizer.ts). To start listening
// quickly, the microphone is captured while the session is still being set up (and sent once it's open), and a
// session is requested ahead of time when the pointer reaches the button or an attempt ends (kept SESSION_REUSE_MS,
// under the token's 15 minutes). When it answers
// { provider: 'browser' } (a language Scribe doesn't know, no ElevenLabs key, the Emergency AI Stop on), or Scribe
// can't connect, the browser's own speech recognition (Web Speech API) is used. TalkNinja's server never receives the
// audio; the transcript and score stay in this component (Privacy Policy, "Speaking practice").
//
// Browser recognizers stop on their own (after a pause, after a few silent seconds, or for no reason in some
// browsers), so an attempt keeps listening across them: a recognizer that ends before the learner is done is started
// again. With either, the attempt ends after a pause once they've spoken, when they press the button, or after a time
// limit.

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

// How long to wait: for the learner to start speaking, after they pause (long enough for a learner to think of the
// next word), and for the whole attempt. Scribe's live text lags the voice a little, so once it has reached the end
// of the sentence it gets a moment longer than the browser's settled results.
const START_TIMEOUT_MS = 10_000;
const PAUSE_MS = 2_500;
const PAUSE_AFTER_WHOLE_SENTENCE_MS = 700;
const SCRIBE_PAUSE_AFTER_WHOLE_SENTENCE_MS = 900;
const MAX_ATTEMPT_MS = MAX_SPEAK_ATTEMPT_MS;
// A session requested ahead of time is used if the learner presses Speak within this long
const SESSION_REUSE_MS = 10 * 60_000;
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
  language: string;
  // Which recognizer this attempt uses (scribe until it turns out it can't)
  engine: 'scribe' | 'browser';
  recognition: Recognition | null;
  // Scribe: the microphone, the audio context it's resampled in, and the session (once connected)
  microphone: Promise<MediaStream> | null;
  stream: MediaStream | null;
  context: AudioContext | null;
  scribe: ScribeRecognizer | null;
  ready: boolean;
  // Scribe: shown as listening while the session was still opening (audio is kept until it opens)
  listeningEarly: boolean;
  // Scribe: the session's URL has been handed to the recognizer
  connected: boolean;
  // Scribe: the learner finished before the session's URL arrived; finish as soon as it's connected
  finishWhenConnected: boolean;
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

// What /api/speech-recognition answered for one session request (status 0: it couldn't be reached)
interface SessionAnswer {
  status: number;
  response: Response | null;
  provider?: string;
  url?: string;
  reason?: BrowserRecognitionReason;
  error?: string;
}

async function requestSession(language: string): Promise<SessionAnswer> {
  try {
    const response = await fetch('/api/speech-recognition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language }),
    });
    const body = (await response.clone().json().catch(() => null)) as Omit<SessionAnswer, 'status' | 'response'> | null;
    return { status: response.status, response, ...body };
  } catch {
    return { status: 0, response: null };
  }
}

const usableSession = (answer: SessionAnswer) => answer.provider === 'elevenlabs' && Boolean(answer.url);

interface SpeakPracticeProps {
  // The sentence to say (the top text box) and its language
  expected: string;
  language: string;
}

export default function SpeakPractice({ expected, language }: SpeakPracticeProps) {
  // starting: the microphone is opening (don't speak yet); listening: speak now; scoring: waiting for Scribe's
  // final transcript
  const [phase, setPhase] = useState<'idle' | 'starting' | 'listening' | 'scoring'>('idle');
  // What the recognizer has heard so far (shown live while listening)
  const [liveText, setLiveText] = useState('');
  // The graded words and score of the last attempt, and the sentence it was for (a new sentence clears it)
  // `heard` is what the recognizer wrote down, shown under the score so a surprising grade can be checked
  const [result, setResult] = useState<{ for: string; parts: SpokenWordPart[]; score: number; heard: string } | null>(null);
  const [message, setMessage] = useState('');
  // A note that isn't an error (switched to the browser's recognition mid-attempt)
  const [notice, setNotice] = useState('');
  // 0-1, how loud the microphone is while Scribe listens (the button's icon grows with it)
  const [level, setLevel] = useState(0);
  // Which recognizer listens (or will): from the server's answer before the first attempt, then from each attempt
  const [recognizer, setRecognizer] = useState<{
    language: string;
    provider: 'elevenlabs' | 'browser';
    reason: BrowserRecognitionReason | null;
  } | null>(null);
  const attemptRef = useRef<Attempt | null>(null);
  // A session requested ahead of time (see SESSION_REUSE_MS)
  const prefetchRef = useRef<{ language: string; at: number; answer: Promise<SessionAnswer> } | null>(null);

  // A new sentence (or language) starts fresh
  const [attemptKey, setAttemptKey] = useState(`${language}|${expected}`);
  if (attemptKey !== `${language}|${expected}`) {
    setAttemptKey(`${language}|${expected}`);
    setPhase('idle');
    setLiveText('');
    setResult(null);
    setMessage('');
    setNotice('');
  }

  // Which recognizer Speak will use, before the first attempt (nothing paid, not counted)
  useEffect(() => {
    if (scribeLanguageCode(language) === null) return;
    let live = true;
    fetch('/api/speech-recognition')
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { provider?: string; reason?: BrowserRecognitionReason } | null) => {
        if (!live || !body?.provider) return;
        setRecognizer((current) =>
          // An attempt's own answer is newer
          current?.language === language
            ? current
            : { language, provider: body.provider === 'elevenlabs' ? 'elevenlabs' : 'browser', reason: body.reason ?? null }
        );
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [language]);

  const shownRecognizer =
    scribeLanguageCode(language) === null
      ? { provider: 'browser' as const, reason: 'language' as const }
      : recognizer?.language === language
        ? recognizer
        : null;

  // Requests the next attempt's session ahead of time (only when Scribe is expected to be used)
  function prefetchSession() {
    if (attemptRef.current || scribeLanguageCode(language) === null) return;
    if (shownRecognizer?.provider === 'browser' && shownRecognizer.reason !== 'unavailable') return;
    const held = prefetchRef.current;
    if (held && held.language === language && Date.now() - held.at < SESSION_REUSE_MS) return;
    const answer = requestSession(language);
    const entry = { language, at: Date.now(), answer };
    prefetchRef.current = entry;
    // A refusal isn't kept: pressing Speak asks again and shows why
    void answer.then((a) => {
      if (!usableSession(a) && prefetchRef.current === entry) prefetchRef.current = null;
    });
  }

  // The session for an attempt: the one requested ahead of time if it's still good, else a new one
  function takeSession(forLanguage: string): Promise<SessionAnswer> {
    const held = prefetchRef.current;
    prefetchRef.current = null;
    if (held && held.language === forLanguage && Date.now() - held.at < SESSION_REUSE_MS) {
      return held.answer.then((a) => (usableSession(a) ? a : requestSession(forLanguage)));
    }
    return requestSession(forLanguage);
  }

  // Stops listening if the sentence changes or the tab closes mid-attempt
  useEffect(() => {
    return () => {
      const attempt = attemptRef.current;
      attemptRef.current = null;
      if (attempt) {
        clearTimers(attempt);
        attempt.recognition?.abort();
        attempt.scribe?.abort();
        releaseAudio(attempt);
      }
    };
  }, [expected, language]);

  function clearTimers(attempt: Attempt) {
    window.clearTimeout(attempt.pauseTimer);
    window.clearTimeout(attempt.startTimer);
    window.clearTimeout(attempt.maxTimer);
  }

  // Turns the microphone off (the browser's recording indicator goes away) and closes the audio context
  function releaseAudio(attempt: Attempt) {
    closeMicrophone(attempt.stream);
    attempt.stream = null;
    // Still opening: close it as soon as it opens
    attempt.microphone?.then(closeMicrophone, () => undefined);
    attempt.microphone = null;
    const context = attempt.context;
    attempt.context = null;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }

  // Nothing heard at all: give up and say so. And never listen forever.
  function armTimers(attempt: Attempt) {
    clearTimers(attempt);
    attempt.startedAt = Date.now();
    attempt.startTimer = window.setTimeout(() => {
      if (!attempt.heardSpeech) stopAttempt(attempt);
    }, START_TIMEOUT_MS);
    attempt.maxTimer = window.setTimeout(() => stopAttempt(attempt), MAX_ATTEMPT_MS);
  }

  // Something new was heard: show it, remember it, and end the attempt after a pause (a short one once the whole
  // sentence has been said and nothing is still being worked out, a longer one otherwise)
  function heard(attempt: Attempt, text: string, settled: boolean) {
    if (!text) return;
    attempt.heardSpeech = true;
    if (!attempt.snapshots.includes(text)) attempt.snapshots = [...attempt.snapshots.slice(-19), text];
    setLiveText(text);
    window.clearTimeout(attempt.startTimer);
    window.clearTimeout(attempt.pauseTimer);
    // Scribe only commits at the end, so its live text is what there is to go on
    const scribe = attempt.engine === 'scribe';
    const done = (settled || scribe) && reachedWholeSentence(attempt, text);
    attempt.pauseTimer = window.setTimeout(
      () => stopAttempt(attempt),
      done ? (scribe ? SCRIBE_PAUSE_AFTER_WHOLE_SENTENCE_MS : PAUSE_AFTER_WHOLE_SENTENCE_MS) : PAUSE_MS
    );
  }

  function stopAttempt(attempt: Attempt) {
    if (attempt.stopping) return;
    attempt.stopping = true;
    clearTimers(attempt);
    if (attempt.engine === 'scribe') {
      // Commit and wait for the final transcript (the whole attempt, with its full context), then score
      setLevel(0);
      if (!attempt.scribe) {
        finishAttempt(attempt);
        return;
      }
      setPhase('scoring');
      // The session's URL hasn't arrived yet: what was captured is sent once it has
      if (!attempt.connected) {
        attempt.finishWhenConnected = true;
        return;
      }
      void attempt.scribe.finish().then(() => finishAttempt(attempt));
      return;
    }
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
    attempt.scribe?.abort();
    releaseAudio(attempt);
    setPhase('idle');
    setLevel(0);
    // Ready for "Try Again" without waiting for a new session
    if (attempt.engine === 'scribe' && attempt.ready) prefetchSession();
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
    setResult({ for: attempt.target, parts: graded.parts, score: graded.score, heard: heard[0] });
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
      heard(attempt, text, !attempt.interim);
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

  // The browser's own recognition, for this attempt (when Scribe can't be used). `restarted`: the learner was already
  // told to speak (Scribe was expected), so they're asked to say it again.
  function startBrowserAttempt(attempt: Attempt, reason: BrowserRecognitionReason, restarted = false): boolean {
    attempt.engine = 'browser';
    attempt.scribe?.abort();
    attempt.scribe = null;
    releaseAudio(attempt);
    setLevel(0);
    setRecognizer({ language: attempt.language, provider: 'browser', reason });
    if (restarted) {
      setPhase('starting');
      setLiveText('');
      setNotice('Switched to your browser\'s speech recognition. Please say the phrase again when it says "Listening…".');
    }
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      failAttempt(attempt, 'Your browser doesn\'t support speech recognition. Try Chrome, Edge or Safari.');
      return false;
    }
    try {
      startRecognizer(attempt, Constructor);
    } catch {
      failAttempt(attempt, 'The microphone couldn\'t be started. Please try again.');
      return false;
    }
    armTimers(attempt);
    return true;
  }

  function failAttempt(attempt: Attempt, text: string) {
    if (attemptRef.current !== attempt) return;
    attempt.failed = true;
    setMessage(text);
    finishAttempt(attempt);
  }

  // ElevenLabs Scribe: the session is requested while the microphone opens; the microphone is captured as soon as it
  // is open (the learner can speak) and streamed to the session once its URL arrives
  async function startScribeAttempt(attempt: Attempt, microphone: Promise<MediaStream>, session: Promise<SessionAnswer>) {
    const current = () => attemptRef.current === attempt && !attempt.stopping;
    // When it's known Scribe will be used, the learner can start before the session is open
    let expectScribe = shownRecognizer?.provider === 'elevenlabs';
    void session.then((answer) => {
      if (usableSession(answer)) expectScribe = true;
    });

    let stream: MediaStream;
    try {
      stream = await microphone;
    } catch (error) {
      failAttempt(attempt, microphoneError(error));
      return;
    }
    attempt.stream = stream;
    attempt.microphone = null;
    if (!current() || !attempt.context) {
      releaseAudio(attempt);
      return;
    }

    try {
      attempt.scribe = await startScribe({
        sampleRate: SCRIBE_SAMPLE_RATE,
        context: attempt.context,
        stream,
        handlers: {
          onReady: () => {
            if (attemptRef.current !== attempt) return;
            attempt.ready = true;
            setRecognizer({ language: attempt.language, provider: 'elevenlabs', reason: null });
            if (attempt.listeningEarly || attempt.stopping) return;
            setPhase('listening');
            armTimers(attempt);
          },
          onPartial: (text) => {
            if (attemptRef.current !== attempt) return;
            attempt.interim = text;
            heard(attempt, joined(attempt.committed, text), false);
          },
          onCommitted: (text) => {
            if (attemptRef.current !== attempt) return;
            attempt.committed = [...attempt.committed, [text]];
            attempt.interim = '';
            if (!attempt.stopping) heard(attempt, joined(attempt.committed), true);
          },
          onLevel: (value) => {
            if (attemptRef.current === attempt && !attempt.stopping) setLevel(value);
          },
          onError: (text) => {
            // While finishing, score what was heard so far (finish() resolves)
            if (attemptRef.current !== attempt || attempt.stopping) return;
            // Couldn't connect at all: listen with the browser instead; once listening, say what went wrong
            if (!attempt.ready) {
              attempt.scribe = null;
              startBrowserAttempt(attempt, 'unavailable', attempt.listeningEarly);
              return;
            }
            failAttempt(attempt, text);
          },
        },
      });
    } catch {
      if (current()) startBrowserAttempt(attempt, 'unsupported');
      return;
    }
    if (attemptRef.current !== attempt) {
      attempt.scribe.abort();
      return;
    }
    // Capturing: speak now (unless the session may yet say to use the browser instead)
    if (expectScribe && !attempt.stopping) {
      attempt.listeningEarly = true;
      setPhase('listening');
      armTimers(attempt);
    }

    const answer = await session;
    if (attemptRef.current !== attempt || !attempt.scribe) return;
    if (usableSession(answer)) {
      attempt.connected = true;
      attempt.scribe.connect(answer.url!);
      if (attempt.finishWhenConnected) void attempt.scribe.finish().then(() => finishAttempt(attempt));
      return;
    }
    attempt.scribe.abort();
    attempt.scribe = null;
    if (attempt.stopping) {
      finishAttempt(attempt);
      return;
    }
    if (answer.response && (await reportRateLimit(answer.response))) {
      failAttempt(attempt, 'You\'ve reached your AI limit for now, so Speak can\'t listen. Please try again later.');
      return;
    }
    if (answer.status === 401 || answer.status === 403) {
      failAttempt(attempt, answer.error ?? 'Please log in to practice speaking.');
      return;
    }
    // Scribe isn't available for this language (or right now): use the browser's recognition
    startBrowserAttempt(attempt, answer.provider === 'browser' && answer.reason ? answer.reason : 'unavailable', attempt.listeningEarly);
  }

  const handleSpeak = () => {
    const running = attemptRef.current;
    if (running) {
      // Pressing again finishes the attempt early and scores it
      stopAttempt(running);
      return;
    }
    if (!expected.trim()) return;

    const useScribe = scribeLanguageCode(language) !== null;
    const attempt: Attempt = {
      target: expected,
      locale: speechLocale(language),
      language,
      engine: useScribe ? 'scribe' : 'browser',
      recognition: null,
      microphone: null,
      stream: null,
      context: null,
      scribe: null,
      ready: false,
      listeningEarly: false,
      connected: false,
      finishWhenConnected: false,
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
    setNotice('');
    setLevel(0);
    setPhase('starting');

    if (!useScribe) {
      startBrowserAttempt(attempt, 'language');
      return;
    }
    // Asked for first, so it's on its way while the microphone opens
    const session = takeSession(language);
    // Opened during the click, so the browser lets the audio context run and asks for the microphone straight away,
    // while the session is being opened
    const AudioContextClass =
      typeof window === 'undefined'
        ? undefined
        : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      startBrowserAttempt(attempt, 'unsupported');
      return;
    }
    try {
      attempt.context = new AudioContextClass();
      void attempt.context.resume().catch(() => undefined);
    } catch {
      startBrowserAttempt(attempt, 'unsupported');
      return;
    }
    const microphone = openMicrophone();
    microphone.catch(() => undefined);
    attempt.microphone = microphone;
    void startScribeAttempt(attempt, microphone, session);
  };

  const shownResult = result && result.for === expected ? result : null;
  const passed = shownResult ? shownResult.score >= SPEAKING_PASS_SCORE : false;
  const listening = phase === 'starting' || phase === 'listening';
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
          onPointerEnter={prefetchSession}
          onPointerDown={prefetchSession}
          onFocus={prefetchSession}
          disabled={!expected.trim() || phase === 'scoring'}
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
              {/* Grows with the learner's voice (Scribe), so they can see they're being heard */}
              <Square
                className="w-4 h-4 transition-transform duration-100"
                style={{ transform: `scale(${1 + Math.min(level, 1) * 0.6})` }}
                aria-hidden="true"
              />
              Listening…
            </>
          ) : phase === 'scoring' ? (
            <>
              <Mic className="w-5 h-5 animate-pulse" aria-hidden="true" />
              Checking…
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

      {shownRecognizer && (
        <div className="practice-hint mt-1" data-recognizer={shownRecognizer.provider}>
          {recognizerLabel(shownRecognizer.provider, shownRecognizer.reason, language)}
        </div>
      )}

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
      {shownResult?.heard && (
        <div className="practice-hint mt-1">
          Heard: <span lang={speechLocale(language)}>“{shownResult.heard}”</span>
        </div>
      )}

      {notice && !message && <div className="practice-hint mt-2">{notice}</div>}
      {message && <div className="practice-error mt-2">{message}</div>}
    </div>
  );
}
