import type { OwnAiUsage } from '@/lib/rateLimits';

// The Account page's My AI Usage: the user's own AI calls in the last 24
// hours and the last 7 days (readOwnAiUsage), counted like the Admin page's
// usage report
export default function MyAiUsageCard({ day, week }: { day: OwnAiUsage; week: OwnAiUsage }) {
  const number = (value: number) => value.toLocaleString('en-US');
  const measures: { label: string; value: (usage: OwnAiUsage) => number }[] = [
    { label: 'AI calls', value: (usage) => usage.calls },
    { label: 'Weighted calls', value: (usage) => usage.weighted },
    { label: 'Input tokens', value: (usage) => usage.inputTokens },
    { label: 'Output tokens', value: (usage) => usage.outputTokens },
    { label: 'Blocked calls', value: (usage) => usage.blocked },
  ];

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8">
      <h2 className="text-2xl font-bold text-dark-blue mb-2">My AI Usage</h2>
      <p className="text-slate-600 mb-4">
        Your AI requests: translations, sentences, tests, voices and AI Friend replies. Weighted calls are what count
        toward any usage limit.
      </p>
      <table className="w-full text-sm bg-white rounded-lg border border-slate-200">
        <thead>
          <tr className="text-slate-500 border-b border-slate-200">
            <th className="px-4 py-3 text-left font-medium" />
            <th className="px-4 py-3 text-right font-medium">Last 24 hours</th>
            <th className="px-4 py-3 text-right font-medium">Last 7 days</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {measures.map((m) => (
            <tr key={m.label}>
              <td className="px-4 py-3 text-slate-500 font-medium">{m.label}</td>
              <td className="px-4 py-3 text-right tabular-nums text-dark-blue font-medium">{number(m.value(day))}</td>
              <td className="px-4 py-3 text-right tabular-nums text-dark-blue font-medium">{number(m.value(week))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
