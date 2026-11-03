'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { en } from '@/lib/i18n/en';
import type { RetentionRunRow } from '@/lib/retention';

type Rule = { key: string; description: string; days: number };

// The Admin page's Data Retention section: the periods in force, the recent runs of the retention job with what
// each changed and any step's error, and Run Now (POST /api/admin/retention).
export default function RetentionRunsCard({ runs, rules }: { runs: RetentionRunRow[]; rules: Rule[] }) {
  const t = en.retention;
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');

  const runNow = async () => {
    setRunning(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/retention', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The retention job failed');
      setMessage(data.skipped ? 'Another run is in progress.' : `Run ${data.runId}: ${data.status}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The retention job failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 className="text-2xl font-bold text-dark-blue">{t.title}</h2>
        <button
          type="button"
          onClick={runNow}
          disabled={running}
          className="px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 disabled:opacity-60"
        >
          {running ? t.running : t.runNow}
        </button>
      </div>
      <p className="text-slate-600 mb-4">{t.intro}</p>
      {message && <p role="status" className="mb-4 text-sm font-semibold text-dark-blue">{message}</p>}

      <details className="mb-4 bg-white rounded-lg border border-slate-200 px-4 py-3">
        <summary className="cursor-pointer font-semibold text-dark-blue">Periods in force</summary>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {rules.map((rule) => (
            <li key={rule.key}>
              <span className="font-medium">{rule.days} days</span>: {rule.description}
            </li>
          ))}
        </ul>
      </details>

      <h3 className="font-semibold text-dark-blue mb-2">{t.lastRuns}</h3>
      {runs.length === 0 ? (
        <p className="text-slate-600">{t.none}</p>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
          <table className="w-full min-w-[36rem] text-sm text-left">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-3 py-2">Started (UTC)</th>
                <th scope="col" className="px-3 py-2">Trigger</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2">Changed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {runs.map((run) => {
                const changed = Object.entries(run.results).filter(([, n]) => n > 0);
                const errors = Object.entries(run.errors);
                return (
                  <tr key={run.id} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{run.startedAt.replace('T', ' ').slice(0, 19)}</td>
                    <td className="px-3 py-2">{run.trigger}</td>
                    <td className={`px-3 py-2 font-semibold ${run.status === 'ok' ? 'text-green-700' : run.status === 'running' ? 'text-slate-600' : 'text-red-700'}`}>
                      {run.status}
                    </td>
                    <td className="px-3 py-2">
                      {changed.length === 0 ? '—' : changed.map(([k, n]) => `${k}: ${n}`).join(', ')}
                      {errors.map(([k, e]) => (
                        <div key={k} className="text-red-700">{k}: {e}</div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
