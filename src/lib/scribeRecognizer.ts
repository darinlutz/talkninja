// The browser half of ElevenLabs Scribe speech recognition for Speaking practice (src/components/SpeakPractice.tsx).
// No imports, so it stays a small client module.
//
// The microphone is resampled to 16 kHz mono 16-bit PCM in an AudioWorklet and streamed in 100 ms chunks straight to
// ElevenLabs over the WebSocket URL /api/speech-recognition gave (src/lib/scribe.ts builds it with a single-use token).
// Nothing is recorded or kept: the audio exists only in these chunks on their way to ElevenLabs, and the transcript
// only in the page. TalkNinja's server never receives either (Privacy Policy, "Speaking practice").

// Mono, with the browser's own cleanup, which helps recognition in a noisy room
const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
  // The session has started and audio is flowing: the learner can speak
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
  // Sends what's left, commits, and resolves once the final transcript arrives (or after a short wait)
  finish: () => Promise<void>;
  // Stops at once, without waiting for a transcript
  abort: () => void;
}

const CHUNK_SAMPLES = 1600; // 100 ms at 16 kHz
// Scribe is asked to commit at least this often, so a long attempt never holds too much uncommitted audio
const MAX_UNCOMMITTED_SAMPLES = 16_000 * 20;
const CONNECT_TIMEOUT_MS = 8_000;
const FINAL_TRANSCRIPT_TIMEOUT_MS = 3_000;

// Streams `stream` (from openMicrophone) to the Scribe session at `url`. `context` is an AudioContext created during
// the click on Speak, so the browser lets it run.
export async function startScribe(input: {
  url: string;
  sampleRate: number;
  context: AudioContext;
  stream: MediaStream;
  handlers: ScribeHandlers;
}): Promise<ScribeRecognizer> {
  const { url, sampleRate, context, stream, handlers } = input;
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
  // A silent output keeps the worklet running in every browser; nothing is played
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(node).connect(mute).connect(context.destination);

  const socket = new WebSocket(url);
  // Audio from before the session started is kept and sent once it has, so the first word isn't lost
  const pending: string[] = [];
  let started = false;
  let closed = false;
  let failed = false;
  let uncommitted = 0; // samples sent since the last commit
  let partial = '';
  let finishing: Promise<void> | null = null;
  let resolveFinal: (() => void) | null = null;

  const send = (audio: string, commit: boolean) => {
    socket.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: audio, commit, sample_rate: sampleRate }));
  };

  const cleanUp = () => {
    if (closed) return;
    closed = true;
    window.clearTimeout(connectTimer);
    node.port.onmessage = null;
    try {
      source.disconnect();
      node.disconnect();
      mute.disconnect();
    } catch {
      // Already disconnected
    }
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    resolveFinal?.();
  };

  const fail = (message: string, busy: boolean) => {
    if (failed || closed) return;
    failed = true;
    handlers.onError(message, busy);
    cleanUp();
  };

  const connectTimer = window.setTimeout(() => {
    if (!started) fail('Speech recognition took too long to connect. Check your connection and try again.', true);
  }, CONNECT_TIMEOUT_MS);

  node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; level: number; last: boolean }>) => {
    const { pcm, level, last } = event.data;
    handlers.onLevel(Math.min(1, level * 4));
    const samples = pcm.byteLength / 2;
    if (closed || (samples === 0 && !last)) return;
    const audio = toBase64(pcm);
    if (!started) {
      pending.push(audio);
      return;
    }
    uncommitted += samples;
    // The final chunk commits; so does a long stretch without one
    const commit = last || uncommitted >= MAX_UNCOMMITTED_SAMPLES;
    if (commit) uncommitted = 0;
    send(audio, commit);
    if (last) {
      // Nothing uncommitted means no transcript is coming
      window.setTimeout(() => resolveFinal?.(), partial ? FINAL_TRANSCRIPT_TIMEOUT_MS : 600);
    }
  };

  socket.onmessage = (event) => {
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
      for (const audio of pending.splice(0)) {
        uncommitted += (audio.length * 3) / 8;
        send(audio, false);
      }
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

  socket.onerror = () => fail('Speech recognition couldn\'t connect. Check your connection and try again.', true);
  socket.onclose = () => {
    if (!closed && !finishing) fail('Speech recognition stopped unexpectedly. Please try again.', false);
    else resolveFinal?.();
  };

  return {
    finish() {
      if (finishing) return finishing;
      finishing = new Promise<void>((resolve) => {
        if (closed || !started) {
          resolve();
          return;
        }
        resolveFinal = resolve;
        node.port.postMessage('flush');
        // Never wait forever
        window.setTimeout(resolve, FINAL_TRANSCRIPT_TIMEOUT_MS + 1000);
      }).then(cleanUp);
      return finishing;
    },
    abort() {
      finishing ??= Promise.resolve();
      cleanUp();
    },
  };
}
