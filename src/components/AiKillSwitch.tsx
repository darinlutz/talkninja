'use client';

import { useState } from 'react';
import AdminStatusMessage from './AdminStatusMessage';
import { SAFETY_LIMIT_ENV, type SafetyLimits } from '@/lib/rateLimitConfig';

type Status = { on: boolean; updatedAt: string | null; updatedBy: string | null };

const SAFETY_LABELS: Record<keyof SafetyLimits, string> = {
  perUserPerMinute: 'Per user, any minute',
  perUserPerDay: 'Per user, any 24 hours',
  sitePerDay: 'Whole site, any 24 hours',
};

// The Admin page's Emergency AI Stop: stops every AI model call, text to speech and image search for everyone at
// once (PUT /api/admin/ai-services, src/lib/aiKillSwitch.ts), and lists the safety ceilings that always apply
export default function AiKillSwitch({ status: initial, safetyLimits }: { status: Status; safetyLimits: SafetyLimits }) {
  const [status, setStatus] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const setOn = async (on: boolean) => {
    const question = on
      ? 'Turn AI back on for everyone?'
      : 'Stop ALL AI for everyone now? Every AI feature, text to speech and image search will be refused until you turn it back on.';
    if (!window.confirm(question)) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/ai-services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to save the setting');
      setStatus(data);
      setMessage({ ok: true, text: on ? 'AI is back on.' : 'All AI is stopped. Every server stops within 5 seconds.' });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Failed to save the setting' });
    } finally {
      setSaving(false);
    }
  };

  const changed = status.updatedAt
    ? `Last changed ${new Date(status.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}${
        status.updatedBy ? ` by ${status.updatedBy}` : ''
      }.`
    : null;

  return (
    <div
      className={`rounded-xl border p-6 sm:p-8 ${status.on ? 'bg-slate-50 border-slate-200' : 'bg-red-50 border-red-300'}`}
    >
      <h2 className="text-2xl font-bold text-dark-blue mb-2">Emergency AI Stop</h2>
      <p className="text-slate-600 mb-4">
        Stops every AI call at once (all AI features, text to speech and image search) for everyone, Admins included,
        without a redeploy. Use it if the AI bill spikes or the site is being abused.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <span
          role="status"
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${
            status.on ? 'bg-green-100 text-green-800' : 'bg-red-600 text-white'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${status.on ? 'bg-green-600' : 'bg-white'}`} aria-hidden="true" />
          {status.on ? 'AI is running' : 'AI is STOPPED'}
        </span>
        {status.on ? (
          <button
            type="button"
            onClick={() => setOn(false)}
            disabled={saving}
            className="px-6 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Stopping…' : 'Stop All AI Now'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOn(true)}
            disabled={saving}
            className="px-6 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Turning on…' : 'Turn AI Back On'}
          </button>
        )}
      </div>
      {changed && <p className="mt-3 text-sm text-slate-500">{changed}</p>}
      {message && <AdminStatusMessage message={message} />}

      <h3 className="text-lg font-semibold text-dark-blue mt-6 mb-2">Safety ceilings (always on)</h3>
      <p className="text-sm text-slate-600 mb-3">
        These apply to every signed-in user except Admins, even when Rate Limiting below is off, a feature&apos;s
        weight is 0, or a user has an Unlimited override. They count every AI call, including failed ones. Nobody who
        isn&apos;t signed in can use AI at all. Change them with the environment variables shown.
      </p>
      <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-slate-500">
              <th className="px-4 py-2">Ceiling</th>
              <th className="px-4 py-2">AI calls</th>
              <th className="px-4 py-2">Environment variable</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(SAFETY_LABELS) as (keyof SafetyLimits)[]).map((key) => (
              <tr key={key} className="border-t border-slate-200">
                <td className="px-4 py-2 text-dark-blue">{SAFETY_LABELS[key]}</td>
                <td className="px-4 py-2 text-dark-blue">{safetyLimits[key].toLocaleString('en-US')}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{SAFETY_LIMIT_ENV[key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        When the whole-site ceiling is reached, everyone but Admins is refused until the count falls, and the owner is
        emailed.
      </p>
    </div>
  );
}
