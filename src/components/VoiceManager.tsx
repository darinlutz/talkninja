'use client';

import { useRef, useState } from 'react';
import AdminStatusMessage from './AdminStatusMessage';
import type { AdminVoiceRow } from '@/lib/voiceSettings';
import { ELEVENLABS_MODELS, VOICE_GENDERS, type VoiceGender } from '@/lib/voiceConfig';

const GENDER_LABEL: Record<VoiceGender, string> = { male: 'Male', female: 'Female' };
const SOURCE_LABEL = { database: 'Saved here', environment: 'Environment variable', none: 'Not set' } as const;

// Starting sample text; anything can be typed instead
const SAMPLE_TEXT: Partial<Record<string, string>> = {
  Vietnamese: 'Xin chào! Hôm nay bạn có khỏe không? Mình đang học tiếng Việt ở Sài Gòn.',
  English: 'Hello! How are you today? I am practicing my English.',
  Spanish: '¡Hola! ¿Cómo estás hoy? Estoy practicando mi español.',
  French: 'Bonjour ! Comment allez-vous aujourd’hui ? Je pratique mon français.',
};

type Draft = {
  maleVoiceId: string;
  femaleVoiceId: string;
  maleEnabled: boolean;
  femaleEnabled: boolean;
  defaultGender: VoiceGender;
  model: string;
};

function draftOf(row: AdminVoiceRow): Draft {
  return {
    // Only what's saved here: an empty box means the environment variable's voice
    maleVoiceId: row.voices.male.source === 'database' ? row.voices.male.voiceId ?? '' : '',
    femaleVoiceId: row.voices.female.source === 'database' ? row.voices.female.voiceId ?? '' : '',
    maleEnabled: row.voices.male.enabled,
    femaleEnabled: row.voices.female.enabled,
    defaultGender: row.defaultGender,
    model: row.modelSaved ? row.model : '',
  };
}

function formatWhen(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

const hasElevenLabs = (row: AdminVoiceRow) =>
  VOICE_GENDERS.some((g) => row.voices[g].voiceId && row.voices[g].enabled);

// The Admin page's Voice Management: each language's male and female ElevenLabs voices (src/lib/voiceSettings.ts),
// saved in the database and applied to the next audio request without a redeploy. Languages without one use the
// default OpenAI voices. Samples are made on the server (POST /api/admin/voices/sample); the key never reaches here.
export default function VoiceManager({ languages: initial, elevenLabsKeySet }: { languages: AdminVoiceRow[]; elevenLabsKeySet: boolean }) {
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sampleText, setSampleText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const visible = showAll ? rows : rows.filter((row) => row.customized || hasElevenLabs(row) || row.language === editing);

  const startEdit = (row: AdminVoiceRow) => {
    setEditing(row.language);
    setDraft(draftOf(row));
    setSampleText(SAMPLE_TEXT[row.language] ?? '');
    setMessage(null);
  };

  const play = async (language: string, gender: VoiceGender, test: boolean) => {
    const text = (sampleText || SAMPLE_TEXT[language] || '').trim();
    if (!text) {
      setMessage({ ok: false, text: 'Type some sample text first.' });
      return;
    }
    const voiceId = test && draft ? (gender === 'male' ? draft.maleVoiceId : draft.femaleVoiceId).trim() : '';
    setBusy(`${language}:${gender}`);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/voices/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, gender, text, voiceId: voiceId || undefined, model: test && draft?.model ? draft.model : undefined }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'The sample could not be played');
      }
      const url = URL.createObjectURL(await response.blob());
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'The sample could not be played' });
    } finally {
      setBusy(null);
    }
  };

  const send = async (method: 'PUT' | 'DELETE', language: string, body: object, done: string) => {
    setBusy(`${language}:save`);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/voices', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, ...body }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to save the voice settings');
      setRows(data.languages);
      setEditing(null);
      setDraft(null);
      setMessage({ ok: true, text: done });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Failed to save the voice settings' });
    } finally {
      setBusy(null);
    }
  };

  const save = (language: string) =>
    draft &&
    send(
      'PUT',
      language,
      { ...draft, maleVoiceId: draft.maleVoiceId.trim() || null, femaleVoiceId: draft.femaleVoiceId.trim() || null, model: draft.model || null },
      `${language} voices saved. The next audio request uses them.`
    );

  const reset = (language: string) => {
    if (!window.confirm(`Reset ${language} to its default voices (the environment variables and the default model)?`)) return;
    void send('DELETE', language, {}, `${language} is back to its default voices.`);
  };

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8">
      <h2 className="text-2xl font-bold text-dark-blue mb-2">Voice Management</h2>
      <p className="text-slate-600 mb-2">
        The ElevenLabs voices each language is spoken in, chosen by the language being learned, never the learner&apos;s
        own language. Changes apply to the next audio request without a redeploy. A language without a voice here
        uses the default OpenAI voices. If a voice fails, learners hear the default voice and the problem shows below.
      </p>
      <p className="text-sm text-slate-500 mb-4">
        A voice ID left empty uses its environment variable (e.g. <span className="font-mono">TALKNINJA_VIETNAMESE_MALE_VOICE_ID</span>);
        Reset goes back to those.
      </p>
      {!elevenLabsKeySet && (
        <p role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          ELEVENLABS_API_KEY is not set on this server, so every language uses the default voices and samples can&apos;t
          play.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-600 mb-3">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Show all {rows.length} languages (otherwise only those with ElevenLabs voices or saved settings)
      </label>

      <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-slate-500">
              <th className="px-3 py-2">Language</th>
              <th className="px-3 py-2">Male voice</th>
              <th className="px-3 py-2">Female voice</th>
              <th className="px-3 py-2">Default voice</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Last updated</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-slate-500">
                  No language has an ElevenLabs voice yet. Tick &quot;Show all&quot; to set one up.
                </td>
              </tr>
            )}
            {visible.map((row) => {
              const isEditing = editing === row.language && draft;
              return (
                <tr key={row.language} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-2 font-medium text-dark-blue">{row.language}</td>
                  {VOICE_GENDERS.map((g) => {
                    const v = row.voices[g];
                    return (
                      <td key={g} className="px-3 py-2">
                        {v.voiceId ? (
                          <>
                            <div className="font-mono text-xs text-dark-blue break-all" translate="no">
                              {v.voiceId}
                            </div>
                            <div className="text-xs text-slate-500">
                              {SOURCE_LABEL[v.source]} ·{' '}
                              <span className={v.enabled ? 'text-green-700' : 'text-red-600'}>{v.enabled ? 'Enabled' : 'Disabled'}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => play(row.language, g, false)}
                              disabled={!elevenLabsKeySet || busy !== null}
                              className="mt-1 text-xs font-semibold text-powder-600 hover:underline disabled:opacity-50"
                            >
                              {busy === `${row.language}:${g}` ? 'Playing…' : 'Play Sample'}
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-500">
                            Default (OpenAI {g === 'male' ? 'alloy' : 'nova'})
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-dark-blue">{GENDER_LABEL[row.defaultGender]}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.model}</td>
                  <td className="px-3 py-2">
                    {hasElevenLabs(row) ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">ElevenLabs</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Default voices</span>
                    )}
                    {row.lastProblem && (
                      <p className="mt-1 text-xs text-red-600 max-w-xs" title={formatWhen(row.lastProblem.at)}>
                        {row.lastProblem.message}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {row.customized ? `${formatWhen(row.updatedAt)}${row.updatedBy ? ` by ${row.updatedBy}` : ''}` : 'Defaults'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {!isEditing && (
                      <button type="button" onClick={() => startEdit(row)} className="text-xs font-semibold text-powder-600 hover:underline">
                        Edit
                      </button>
                    )}
                    {row.customized && !isEditing && (
                      <button
                        type="button"
                        onClick={() => reset(row.language)}
                        disabled={busy !== null}
                        className="ml-3 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                      >
                        Reset
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && draft && (
        <div className="mt-4 bg-white rounded-lg border border-powder-500/40 p-4 space-y-4">
          <h3 className="text-lg font-semibold text-dark-blue">Edit {editing} voices</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {VOICE_GENDERS.map((g) => {
              const row = rows.find((r) => r.language === editing)!;
              const idKey = g === 'male' ? 'maleVoiceId' : 'femaleVoiceId';
              const onKey = g === 'male' ? 'maleEnabled' : 'femaleEnabled';
              return (
                <fieldset key={g} className="space-y-2">
                  <legend className="text-sm font-medium text-dark-blue">{GENDER_LABEL[g]} voice</legend>
                  <input
                    type="text"
                    value={draft[idKey]}
                    onChange={(e) => setDraft({ ...draft, [idKey]: e.target.value })}
                    placeholder={row.voices[g].source === 'environment' ? `From ${row.voices[g].envName}` : 'ElevenLabs voice ID'}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm"
                  />
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={draft[onKey]} onChange={(e) => setDraft({ ...draft, [onKey]: e.target.checked })} />
                    Enabled
                  </label>
                  <button
                    type="button"
                    onClick={() => play(editing, g, true)}
                    disabled={!elevenLabsKeySet || busy !== null}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold text-powder-600 border border-powder-500/50 hover:bg-powder-500/10 disabled:opacity-50"
                  >
                    {busy === `${editing}:${g}` ? 'Playing…' : `Test ${GENDER_LABEL[g]} Voice`}
                  </button>
                </fieldset>
              );
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-dark-blue">Default voice</span>
              <select
                value={draft.defaultGender}
                onChange={(e) => setDraft({ ...draft, defaultGender: e.target.value as VoiceGender })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300"
              >
                {VOICE_GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {GENDER_LABEL[g]}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">Speaks when no speaker is chosen (AI Friend, Translator).</span>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-dark-blue">ElevenLabs model</span>
              <select
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300"
              >
                <option value="">Default</option>
                {ELEVENLABS_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-dark-blue">Sample text</span>
            <textarea
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              maxLength={300}
              rows={2}
              lang="und"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => save(editing)}
              disabled={busy !== null}
              className="px-6 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors disabled:opacity-50"
            >
              {busy === `${editing}:save` ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setDraft(null);
              }}
              disabled={busy !== null}
              className="px-6 py-2 rounded-lg font-semibold text-slate-600 border border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && <AdminStatusMessage message={message} />}
    </div>
  );
}
