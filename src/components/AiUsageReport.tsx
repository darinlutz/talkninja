'use client';

import { useCallback, useEffect, useState } from 'react';
import { AI_FEATURE_LABELS, isAiFeature } from '@/lib/aiModelList';
import {
  isRateLimitedFeature,
  LIMIT_TIER_LABELS,
  RATE_LIMITED_FEATURE_LABELS,
  USAGE_RANGES,
  type OverrideMode,
  type RateLimitOverride,
  type UsageRange,
} from '@/lib/rateLimitConfig';
import type { UsageReport, UsageRow } from '@/lib/rateLimits';

// The Rate Limiting section's AI usage report (GET /api/admin/rate-limits/usage): every AI call in a range, by
// user (a visitor who isn't signed in by IP address) or by IP address, with totals, calls and tokens (with the
// models) by feature (src/lib/aiTokenUsage.ts), and each row's usage of the limit that applies to it now. Set Limit
// opens the section's override form for the row; Reset starts its count over (POST /api/admin/rate-limits/reset).

export type LimitTarget = { userId: number } | { ipAddress: string };

const inputClass =
  'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-dark-blue text-sm focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors';
const labelClass = 'block text-xs font-medium text-slate-500 mb-1';

const RANGE_LABELS: Record<UsageRange, string> = {
  hour: 'Last hour',
  day: 'Last 24 hours',
  week: 'Last 7 days',
  month: 'Last 30 days',
  all: 'All time',
};
const OVERRIDE_BADGES: Record<OverrideMode, string> = { custom: 'Custom', unlimited: 'Unlimited', blocked: 'Blocked' };

const number = (n: number) => n.toLocaleString('en-US');
// Token counts get large: 12345678 -> "12.3M"
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const tokens = (n: number) => compact.format(n);
const featureName = (feature: string) =>
  isRateLimitedFeature(feature) ? RATE_LIMITED_FEATURE_LABELS[feature] : isAiFeature(feature) ? AI_FEATURE_LABELS[feature] : feature;

export default function AiUsageReport({
  onSetLimit,
  overridesVersion,
}: {
  onSetLimit: (target: LimitTarget) => void;
  // The section's overrides; the report reloads when they change, for its badges and limits
  overridesVersion: RateLimitOverride[];
}) {
  const [range, setRange] = useState<UsageRange>('day');
  const [by, setBy] = useState<'user' | 'ip'>('user');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [report, setReport] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);

  // Search as the admin types, a moment after they stop
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    // A slower answer for a filter picked earlier mustn't replace the one picked last
    let current = true;
    const params = new URLSearchParams({ range, by, q: query });
    fetch(`/api/admin/rate-limits/usage?${params}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!current) return;
        if (!response.ok) throw new Error(data.error ?? 'Couldn’t load the AI usage.');
        setReport(data);
        setError('');
      })
      .catch((err) => current && setError(err instanceof Error ? err.message : 'Couldn’t load the AI usage.'))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [range, by, query, reload, overridesVersion]);

  // Shows Loading and asks the effect above for a fresh report
  const load = useCallback(() => {
    setLoading(true);
    setReload((n) => n + 1);
  }, []);

  const nameOf = (row: UsageRow) =>
    row.userId !== null
      ? (row.userName ?? `Deleted account #${row.userId}`)
      : by === 'user'
        ? `Not signed in · ${row.ipAddress ?? '—'}`
        : (row.ipAddress ?? '—');
  const targetOf = (row: UsageRow): LimitTarget | null =>
    row.userId !== null && row.userName !== null ? { userId: row.userId } : row.ipAddress ? { ipAddress: row.ipAddress } : null;

  const reset = async (row: UsageRow) => {
    const target = targetOf(row);
    if (!target || !window.confirm(`Start the AI usage count over for ${nameOf(row)}? Their calls stay in this report.`)) return;
    setNotice('');
    try {
      const response = await fetch('/api/admin/rate-limits/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Failed to reset the usage');
      setNotice(`Usage reset for ${nameOf(row)}: ${number(data.reset)} calls no longer count against the limits.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset the usage');
    }
  };

  const formatTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' });
  const totals = report?.totals;
  const tiles: { label: string; value: string; note?: string }[] = totals
    ? [
        { label: 'Calls', value: number(totals.calls) },
        { label: 'Weighted', value: number(totals.weighted) },
        { label: 'Blocked', value: number(totals.blocked) },
        { label: 'Failed', value: number(totals.failed) },
        { label: 'Users', value: number(totals.users) },
        { label: 'IP addresses', value: number(totals.ips) },
        {
          label: 'Input tokens',
          value: tokens(totals.inputTokens),
          note: totals.cachedInputTokens > 0 ? `${tokens(totals.cachedInputTokens)} cached` : undefined,
        },
        { label: 'Output tokens', value: tokens(totals.outputTokens) },
      ]
    : [];
  const maxFeature = Math.max(1, ...(report?.features ?? []).map((f) => f.calls + f.blocked));

  return (
    <div className="pt-6 border-t border-slate-200 space-y-4">
      <div>
        <h3 className="text-xl font-bold text-dark-blue mb-1">AI Usage</h3>
        <p className="text-sm text-slate-600">
          Every AI call, by user or by IP address. Weighted is what counts against the limits; tokens are what the AI
          provider bills, added up over each call’s model calls; Current Limit is the usage of the limit that applies
          now.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr_auto] lg:items-end">
        <div>
          <label htmlFor="rl-range" className={labelClass}>
            Range
          </label>
          <select
            id="rl-range"
            value={range}
            onChange={(e) => {
              setLoading(true);
              setRange(e.target.value as UsageRange);
            }}
            className={inputClass}
          >
            {USAGE_RANGES.map((value) => (
              <option key={value} value={value}>
                {RANGE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rl-by" className={labelClass}>
            Show
          </label>
          <select
            id="rl-by"
            value={by}
            onChange={(e) => {
              setLoading(true);
              setBy(e.target.value as 'user' | 'ip');
            }}
            className={inputClass}
          >
            <option value="user">By user</option>
            <option value="ip">By IP address</option>
          </select>
        </div>
        <div>
          <label htmlFor="rl-search" className={labelClass}>
            Search
          </label>
          <input
            id="rl-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email or IP address"
            className={inputClass}
          />
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-5 py-2 rounded-lg text-sm font-semibold border border-powder-600 text-powder-600 bg-white hover:bg-powder-500/10 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="p-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-700">{error}</p>}
      {notice && (
        <p role="status" className="p-3 rounded-lg text-sm bg-green-50 border border-green-200 text-green-700">
          {notice}
        </p>
      )}

      {report && (
        <>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-xs font-medium text-slate-500">{tile.label}</p>
                <p className="text-2xl font-bold text-dark-blue tabular-nums">{tile.value}</p>
                {tile.note && <p className="text-xs text-slate-500 tabular-nums">{tile.note}</p>}
              </div>
            ))}
          </div>

          {report.features.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h4 className="text-sm font-medium text-slate-500 mb-3">Calls and tokens by feature</h4>
              <ol className="grid gap-3 sm:grid-cols-2">
                {report.features.map((f) => (
                  <li key={f.feature}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="truncate text-dark-blue">{featureName(f.feature)}</span>
                      <span className="text-slate-500 tabular-nums">
                        {number(f.calls)}
                        {f.blocked > 0 && <span className="text-red-600"> · {number(f.blocked)} blocked</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100 flex overflow-hidden">
                      <div className="h-1.5 bg-powder-500" style={{ width: `${(f.calls / maxFeature) * 100}%` }} />
                      <div className="h-1.5 bg-red-400" style={{ width: `${(f.blocked / maxFeature) * 100}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500 tabular-nums">
                      {f.trackedCalls === 0 ? (
                        <p>No tokens recorded</p>
                      ) : (
                        <>
                          <p>
                            {tokens(f.inputTokens)} in ({tokens(f.cachedInputTokens)} cached) / {tokens(f.outputTokens)} out
                            tokens
                          </p>
                          {/* Averages over the calls with tokens recorded */}
                          <p>
                            Per call: {tokens((f.inputTokens + f.outputTokens) / f.trackedCalls)} tokens,{' '}
                            {(f.modelCalls / f.trackedCalls).toLocaleString('en-US', { maximumFractionDigits: 1 })} model calls
                          </p>
                          {f.models && <p className="truncate font-mono">{f.models}</p>}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    {[
                      by === 'user' ? 'User' : 'IP address',
                      by === 'user' ? 'Tier' : 'Accounts',
                      'Calls',
                      'Weighted',
                      'Tokens',
                      'Blocked',
                      'Current Limit',
                      'Top features',
                      'Last call',
                      '',
                    ].map((heading, i) => (
                      <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {report.rows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                        No AI calls in this range.
                      </td>
                    </tr>
                  )}
                  {report.rows.map((row) => {
                    const target = targetOf(row);
                    const topFeatures = Object.entries(row.features)
                      .sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))
                      .slice(0, 3);
                    return (
                      <tr key={row.key} className="align-top">
                        <td className="px-3 py-2 max-w-[240px]">
                          <p translate="no" className="truncate text-dark-blue" title={row.emailAddress ?? undefined}>
                            {nameOf(row)}
                            {row.override && (
                              <span
                                className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                  row.override === 'blocked' ? 'bg-red-50 text-red-600' : 'bg-powder-500/15 text-powder-600'
                                }`}
                              >
                                {OVERRIDE_BADGES[row.override]}
                              </span>
                            )}
                          </p>
                          {row.emailAddress && (
                            <p translate="no" className="truncate text-xs text-slate-500">
                              {row.emailAddress}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                          {by === 'user' ? (
                            row.tier ? (
                              `${LIMIT_TIER_LABELS[row.tier]}${row.role === 'Admin' ? ' (Admin)' : ''}`
                            ) : (
                              '—'
                            )
                          ) : (
                            <span title={row.names ?? undefined}>{number(row.distinct)} accounts</span>
                          )}
                          {by === 'user' && row.userId !== null && row.distinct > 1 && (
                            <p className="text-xs">from {number(row.distinct)} IPs</p>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-dark-blue">{number(row.calls)}</td>
                        <td className="px-3 py-2 tabular-nums text-dark-blue">{number(row.weighted)}</td>
                        <td className="px-3 py-2 tabular-nums text-xs text-slate-500 whitespace-nowrap">
                          {row.inputTokens + row.outputTokens === 0
                            ? '—'
                            : `${tokens(row.inputTokens)} in / ${tokens(row.outputTokens)} out`}
                        </td>
                        <td className={`px-3 py-2 tabular-nums ${row.blocked > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                          {number(row.blocked)}
                          {row.failed > 0 && <p className="text-xs text-slate-500">{number(row.failed)} failed</p>}
                        </td>
                        <td className="px-3 py-2 min-w-[150px]">
                          <CurrentUsage row={row} />
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 max-w-[220px]">
                          {topFeatures.map(([feature, calls]) => (
                            <p key={feature} className="truncate">
                              {featureName(feature)}: {number(calls ?? 0)}
                            </p>
                          ))}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-500 tabular-nums">
                          {formatTime.format(new Date(row.lastAt))}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          {target && (
                            <>
                              <button
                                type="button"
                                onClick={() => onSetLimit(target)}
                                className="text-xs font-semibold text-powder-600 hover:underline mr-3"
                              >
                                Set Limit
                              </button>
                              <button
                                type="button"
                                onClick={() => reset(row)}
                                className="text-xs font-semibold text-slate-500 hover:text-dark-blue hover:underline"
                              >
                                Reset
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// "12 / 25 per day" with a bar that turns amber near the limit and red at it
function CurrentUsage({ row }: { row: UsageRow }) {
  const current = row.current;
  if (!current) return <span className="text-slate-500">—</span>;
  if (current.exempt) return <span className="text-xs text-slate-500">Exempt</span>;
  if (current.limit === 0 && !current.unlimited) return <span className="text-xs text-red-600">Blocked</span>;
  if (current.limit === null) return <span className="text-xs text-green-700">Unlimited</span>;
  const share = current.limit === 0 ? 1 : Math.min(1, current.used / current.limit);
  const color = share >= 1 ? 'bg-red-500' : share >= 0.8 ? 'bg-amber-500' : 'bg-powder-500';
  return (
    <div>
      <p className="text-xs text-dark-blue tabular-nums whitespace-nowrap">
        {number(current.used)} / {number(current.limit)} per {current.period}
      </p>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}
