import { aiModelProvider, type AiModel } from '@/lib/aiModelList';
import { DEFAULT_CALL_TOKENS, modelsByCost, type CallTokens } from '@/lib/aiModelPrices';

// The Admin page's AI Model Costs table: every model AI Model Control offers, one column each, cheapest on the
// left, with its price per million tokens and what 100 AI calls cost on it. A call's size is the site's own
// average over the last 30 days (readAverageCallTokens in src/lib/rateLimits.ts), or DEFAULT_CALL_TOKENS until
// there are enough calls to measure.
export default function AiModelCostTable({
  measured,
  availableModels,
}: {
  measured: (CallTokens & { calls: number }) | null;
  availableModels: AiModel[];
}) {
  const tokens = measured ?? DEFAULT_CALL_TOKENS;
  const models = modelsByCost(tokens, availableModels);
  const dollars = (value: number, digits: number) =>
    value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits });
  const number = (value: number) => Math.round(value).toLocaleString('en-US');
  const size = `${number(tokens.input)} input tokens (${number(tokens.cachedInput)} of them cached) and ${number(tokens.output)} output tokens`;

  const rows = [
    { label: 'Provider', cell: (m: (typeof models)[number]) => aiModelProvider(m.model) },
    { label: 'Input / 1M tokens', cell: (m: (typeof models)[number]) => dollars(m.price.input, 3) },
    { label: 'Cached input / 1M tokens', cell: (m: (typeof models)[number]) => dollars(m.price.cachedInput, 3) },
    { label: 'Output / 1M tokens', cell: (m: (typeof models)[number]) => dollars(m.price.output, 2) },
  ];

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8">
      <h2 className="text-2xl font-bold text-dark-blue mb-2">AI Model Costs</h2>
      <p className="text-slate-600 mb-4">
        {measured
          ? `Every model AI Model Control offers, cheapest first, priced for this site’s average AI call over the last 30 days (${number(measured.calls)} calls): ${size}.`
          : `Every model AI Model Control offers, cheapest first, priced for an estimated AI call of ${size}, until the site has logged enough calls to measure its own.`}
      </p>

      <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
        <table className="text-sm whitespace-nowrap">
          <thead>
            <tr className="text-xs font-medium text-slate-500">
              <th className="px-4 py-3 text-left sticky left-0 bg-white">Model</th>
              {models.map(({ model }) => (
                <th key={model} className="px-3 py-3 text-right font-mono text-dark-blue">
                  {model}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-200 text-slate-600">
                <th className="px-4 py-2 text-left text-xs font-medium sticky left-0 bg-white">{row.label}</th>
                {models.map((m) => (
                  <td key={m.model} className="px-3 py-2 text-right tabular-nums">
                    {row.cell(m)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-slate-200">
              <th className="px-4 py-2 text-left text-xs font-semibold text-dark-blue sticky left-0 bg-white">
                Cost per 100 calls
              </th>
              {models.map((m) => (
                <td key={m.model} className="px-3 py-2 text-right tabular-nums font-semibold text-dark-blue">
                  {dollars(m.cost, 2)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Estimates from the providers’ list prices in US dollars. Actual costs vary with the feature, and models that
        think before answering use more output tokens than the average shows.
      </p>
    </div>
  );
}
