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
    <section className="practice-panel account-section">
      <h2>My AI Usage</h2>
      <p className="account-intro">
        Your AI requests: translations, sentences, tests, voices and AI Friend replies. Weighted calls are what count
        toward any usage limit.
      </p>
      <div className="overflow-x-auto">
      <table className="account-table">
        <thead>
          <tr>
            <th className="text-left" />
            <th className="text-right">Last 24 hours</th>
            <th className="text-right">Last 7 days</th>
          </tr>
        </thead>
        <tbody>
          {measures.map((m) => (
            <tr key={m.label}>
              <td>{m.label}</td>
              <td>{number(m.value(day))}</td>
              <td>{number(m.value(week))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
