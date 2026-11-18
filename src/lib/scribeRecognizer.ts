// The browser half of ElevenLabs Scribe speech recognition for Speaking practice (src/components/SpeakPractice.tsx).
// No imports, so it stays a small client module.
//
// The microphone is resampled to 16 kHz mono 16-bit PCM in an AudioWorklet and streamed in 100 ms chunks straight to
// ElevenLabs over the WebSocket URL /api/speech-recognition gave (src/lib/scribe.ts builds it with a single-use token).
// Nothing is recorded or kept: the audio exists only in these chunks on their way to ElevenLabs, and the transcript
// only in the page. TalkNinja's server never receives either (Privacy Policy, "Speaking practice").

// Mono. Echo cancellation keeps the page's own voices (the speaker buttons) out, and gain control evens out quiet
// microphones. The browser's noise suppression is off: it clips the soft consonants (s, f, h, t) and tone contours
// that speech recognition needs, and Scribe handles background noise better on its own.
const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: true },
};

// Opens the microphone (the browser asks for permission the first time). Errors are mapped by microphoneError.
export function openMicrophone(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error('unsupported'));
  }
  return navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
}

export function closeMicrophone(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

// What to tell the learner when the microphone couldn't be opened
export function microphoneError(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access was blocked. Allow the microphone for this site in your browser, then press Speak again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found. Connect one, then press Speak again.';
  if (name === 'NotReadableError') return 'Your microphone is being used by another app. Close it, then press Speak again.';
  return 'The microphone couldn\'t be started. Please try again.';
}

// Resamples the microphone to the target rate (averaging the samples in each output step, which also filters out
// what the lower rate can't carry), converts to 16-bit PCM, posts a chunk every `chunk` samples with its loudness,
// and posts what's left when told to flush
const WORKLET = `
class TalkNinjaPcm extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { targetRate, chunk } = options.processorOptions;
    this.ratio = sampleRate / targetRate;
    this.pos = 0; this.sum = 0; this.count = 0; this.energy = 0;
    this.size = chunk; this.buf = new Int16Array(chunk); this.len = 0;
    this.port.onmessage = (e) => { if (e.data === 'flush') this.post(true); };
  }
  post(last) {
    const out = this.buf.slice(0, this.len);
    const level = this.len ? Math.sqrt(this.energy / this.len) : 0;
    this.port.postMessage({ pcm: out.buffer, level, last }, [out.buffer]);
    this.len = 0; this.energy = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.sum += ch[i]; this.count++; this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const s = Math.max(-1, Math.min(1, this.sum / this.count));
        this.sum = 0; this.count = 0;
        this.energy += s * s;
        this.buf[this.len++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.len === this.size) this.post(false);
      }
    }
    return true;
  }
}
registerProcessor('talkninja-pcm', TalkNinjaPcm);
`;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Scribe's error messages that mean the service is busy or out of quota, rather than something about the audio
const BUSY_ERRORS = new Set(['quota_exceeded', 'rate_limited', 'resource_exhausted', 'queue_overflow', 'commit_throttled']);
const SCRIBE_ERRORS = new Set([
  'error', 'auth_error', 'quota_exceeded', 'commit_throttled', 'unaccepted_terms', 'rate_limited', 'queue_overflow',
  'resource_exhausted', 'session_time_limit_exceeded', 'input_error', 'invalid_request', 'chunk_size_exceeded',
  'insufficient_audio_activity', 'transcriber_error',
]);

export interface ScribeHandlers {
  // The session has started (audio captured before it is sent now, so nothing said early is lost)
  onReady: () => void;
  // The text of the part not yet committed (changes as more is heard); '' when there is none
  onPartial: (text: string) => void;
  // A finished piece of the transcript
  onCommitted: (text: string) => void;
  // 0-1, how loud the microphone is, about ten times a second
  onLevel: (level: number) => void;
  // The session failed (busy says it's the service, not the learner's setup); finish() still resolves
  onError: (message: string, busy: boolean) => void;
}

export interface ScribeRecognizer {
  // Opens the session at `url` (from /api/speech-recognition) and sends what's been captured so far
  connect: (url: string) => void;
  // Sends what's left, commits, and resolves once the final transcript arrives (or after `finalWaitMs`, default 3 s).
  // Called before the session has started, it waits for it first, so a quick attempt still gets transcribed.
  finish: (finalWaitMs?: number) => Promise<void>;
  // Stops at once, without waiting for a transcript
  abort: () => void;
}

const CHUNK_SAMPLES = 1600; // 100 ms at 16 kHz
// Scribe is asked to commit at least this often, so a long attempt never holds too much uncommitted audio
const MAX_UNCOMMITTED_SAMPLES = 16_000 * 20;
// Less than this much uncommitted audio at the end (0.3 s) means no transcript is coming
const MIN_TRANSCRIBED_SAMPLES = 4_800;
const CONNECT_TIMEOUT_MS = 8_000;
const FINAL_TRANSCRIPT_TIMEOUT_MS = 3_000;
// Audio kept while the session opens (12 s); anything older is dropped
const MAX_PENDING_CHUNKS = 120;

// Starts capturing `stream` (from openMicrophone) straight away, resampled to `sampleRate`, and keeps it until
// connect() opens the Scribe session, so the learner can start speaking while the session is still being set up.
// `context` is an AudioContext created during the click on Speak, so the browser lets it run.
export async function startScribe(input: {
  sampleRate: number;
  context: AudioContext;
  stream: MediaStream;
  handlers: ScribeHandlers;
}): Promise<ScribeRecognizer> {
  const { sampleRate, context, stream, handlers } = input;
  if (context.sampleRate < sampleRate || !context.audioWorklet) throw new Error('unsupported');

  const moduleUrl = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  try {
    await context.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
  if (context.state === 'suspended') await context.resume().catch(() => undefined);

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'talkninja-pcm', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { targetRate: sampleRate, chunk: CHUNK_SAMPLES },
  });
  // Before going down to 16 kHz, everything above ~7 kHz is filtered out (a 4th-order Butterworth low-pass: two
  // biquads, whose Q is in dB). Without it, the hiss of "s", "sh" and "ch" folds back into the speech band as noise.
  const filters: BiquadFilterNode[] = [];
  if (context.sampleRate > sampleRate * 1.01) {
    for (const qDb of [-5.33, 2.32]) {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = sampleRate * 0.45;
      filter.Q.value = qDb;
      filters.push(filter);
    }
  }
  // A silent output keeps the worklet running in every browser; nothing is played
  const mute = context.createGain();
  mute.gain.value = 0;
  let chain: AudioNode = source;
  for (const filter of filters) chain = chain.connect(filter);
  chain.connect(node).connect(mute).connect(context.destination);

  let socket: WebSocket | null = null;
  // Audio from before the session started is kept and sent once it has, so the first word isn't lost
  const pending: { audio: string; samples: number; last: boolean }[] = [];
  let started = false;
  let closed = false;
  let failed = false;
  let uncommitted = 0; // samples sent since the last commit
  let partial = '';
  let finishing: Promise<void> | null = null;
  let resolveFinal: (() => void) | null = null;
  let connectTimer: number | undefined;
  let finalWait = FINAL_TRANSCRIPT_TIMEOUT_MS;

  const transmit = (audio: string, samples: number, last: boolean) => {
    uncommitted += samples;
    const pendingSamples = uncommitted;
    // The final chunk commits; so does a long stretch without one
    const commit = last || uncommitted >= MAX_UNCOMMITTED_SAMPLES;
    if (commit) uncommitted = 0;
    socket?.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: audio, commit, sample_rate: sampleRate }));
    if (last) {
      // Nothing (or almost nothing) uncommitted means no transcript is coming
      const waiting = partial || pendingSamples >= MIN_TRANSCRIBED_SAMPLES;
      window.setTimeout(() => resolveFinal?.(), waiting ? finalWait : Math.min(600, finalWait));
    }
  };

  const cleanUp = () => {
    if (closed) return;
    closed = true;
    window.clearTimeout(connectTimer);
    node.port.onmessage = null;
    try {
      source.disconnect();
      for (const filter of filters) filter.disconnect();
      node.disconnect();
      mute.disconnect();
    } catch {
      // Already disconnected
    }
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) socket.close();
    resolveFinal?.();
  };

  const fail = (message: string, busy: boolean) => {
    if (failed || closed) return;
    failed = true;
    handlers.onError(message, busy);
    cleanUp();
  };

  node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; level: number; last: boolean }>) => {
    const { pcm, level, last } = event.data;
    handlers.onLevel(Math.min(1, level * 4));
    const samples = pcm.byteLength / 2;
    if (closed || (samples === 0 && !last)) return;
    const audio = toBase64(pcm);
    if (!started) {
      pending.push({ audio, samples, last });
      if (pending.length > MAX_PENDING_CHUNKS) pending.shift();
      return;
    }
    transmit(audio, samples, last);
  };

  const onMessage = (event: MessageEvent) => {
    let message: { message_type?: string; text?: string; error?: string };
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    const type = message.message_type ?? '';
    if (type === 'session_started') {
      started = true;
      window.clearTimeout(connectTimer);
      for (const chunk of pending.splice(0)) transmit(chunk.audio, chunk.samples, chunk.last);
      handlers.onReady();
    } else if (type === 'partial_transcript') {
      partial = (message.text ?? '').trim();
      handlers.onPartial(partial);
    } else if (type === 'committed_transcript') {
      const text = (message.text ?? '').trim();
      partial = '';
      handlers.onPartial('');
      if (text) handlers.onCommitted(text);
      // Once finishing, the commit we asked for has arrived
      if (finishing) resolveFinal?.();
    } else if (type === 'insufficient_audio_activity') {
      // Nothing was said: not a failure, the attempt just ends with nothing heard
      if (finishing) resolveFinal?.();
    } else if (SCRIBE_ERRORS.has(type)) {
      console.warn('Speech recognition error:', type, message.error);
      fail(
        BUSY_ERRORS.has(type)
          ? 'Speech recognition is busy right now. Please try again in a moment.'
          : 'Speech recognition stopped unexpectedly. Please try again.',
        BUSY_ERRORS.has(type) || type === 'auth_error' || type === 'unaccepted_terms'
      );
    }
  };

  return {
    connect(url: string) {
      if (closed || socket) return;
      socket = new WebSocket(url);
      socket.onmessage = onMessage;
      socket.onerror = () => fail('Speech recognition couldn\'t connect. Check your connection and try again.', true);
      socket.onclose = () => {
        if (!closed && !finishing) fail('Speech recognition stopped unexpectedly. Please try again.', false);
        else resolveFinal?.();
      };
      connectTimer = window.setTimeout(() => {
        if (!started) fail('Speech recognition took too long to connect. Check your connection and try again.', true);
      }, CONNECT_TIMEOUT_MS);
    },
    finish(finalWaitMs?: number) {
      if (finishing) return finishing;
      if (finalWaitMs !== undefined) finalWait = finalWaitMs;
      finishing = new Promise<void>((resolve) => {
        if (closed || !socket) {
          resolve();
          return;
        }
        resolveFinal = resolve;
        // The last chunk commits (kept until the session starts, if it hasn't yet)
        node.port.postMessage('flush');
        // Never wait forever
        window.setTimeout(resolve, (started ? 0 : CONNECT_TIMEOUT_MS) + finalWait + 1000);
      }).then(cleanUp);
      return finishing;
    },
    abort() {
      finishing ??= Promise.resolve();
      cleanUp();
    },
  };
}
