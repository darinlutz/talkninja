'use client';

import { useMemo, useRef, useState } from 'react';
import AdminStatusMessage from '@/components/AdminStatusMessage';
import AiUsageReport, { type LimitTarget } from '@/components/AiUsageReport';
import {
  BURST_OPTIONS,
  EXEMPT_ROLES,
  type ExemptRoles,
  LIMIT_OPTIONS,
  LIMIT_TIER_LABELS,
  LIMIT_TIERS,
  type LimitRule,
  type LimitTier,
  OVERRIDE_DURATION_LABELS,
  OVERRIDE_DURATIONS,
  OVERRIDE_MODES,
  type OverrideDuration,
  type OverrideMode,
  PERIODS,
  type Period,
  RATE_LIMITED_FEATURE_LABELS,
  RATE_LIMITED_FEATURES,
  type RateLimitOverride,
  type RateLimitSettings,
  RESET_STYLES,
  type ResetStyle,
  WEIGHT_OPTIONS,
} from '@/lib/rateLimitConfig';
import type { AdminUser } from '@/lib/users';

// The Admin page's Rate Limiting section (src/lib/rateLimits.ts): turning limits on, the User and not-signed-in
// limits, a per-minute burst limit, the IP address cap and each feature's weight (saved together with PUT
// /api/admin/rate-limits); overrides for one user or IP address (POST/DELETE /api/admin/rate-limits/overrides);
// and the AI usage report (src/components/AiUsageReport.tsx), whose Set Limit fills in the override form.

const inputClass =
  'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-dark-blue text-sm focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors disabled:opacity-60';
const labelClass = 'block text-xs font-medium text-slate-500 mb-1';
const buttonClass =
  'px-6 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const RESET_STYLE_LABELS: Record<ResetStyle, string> = {
  rolling: 'Rolling: the last hour, day, 7 days or 30 days',
  calendar: 'Calendar: resets at the start of each hour, day, week (Monday) or month (UTC)',
};
const EXEMPT_ROLE_LABELS: Record<ExemptRoles, string> = { none: 'No one', admins: 'Admins' };
const PERIOD_OPTION_LABELS: Record<Period, string> = { hour: 'Per hour', day: 'Per day', week: 'Per week', month: 'Per month' };
const MODE_LABELS: Record<OverrideMode, string> = { custom: 'Custom limit', unlimited: 'Unlimited', blocked: 'Blocked from AI' };

// <select> values: limits and bursts are numbers, or "unlimited"/"off" for null
const limitValue = (limit: number | null) => (limit === null ? 'unlimited' : String(limit));
const parseLimitValue = (value: string) => (value === 'unlimited' ? null : Number(value));
const limitLabel = (limit: number | null) =>
  limit === null ? 'Unlimited' : limit === 0 ? '0 (no AI)' : limit.toLocaleString('en-US');
const durationValue = (duration: OverrideDuration) => (duration === null ? 'never' : String(duration));

type Message = { ok: boolean; text: string } | null;

export default function RateLimitManager({
  settings: initialSettings,
  overrides: initialOverrides,
  users,
}: {
  settings: RateLimitSettings;
  overrides: RateLimitOverride[];
  users: AdminUser[];
}) {
  const [saved, setSaved] = useState(initialSettings);
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  const setTier = (tier: LimitTier, change: Partial<LimitRule>) =>
    setSettings((s) => ({ ...s, tiers: { ...s.tiers, [tier]: { ...s.tiers[tier], ...change } } }));

  const saveSettings = async (next: RateLimitSettings) => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/rate-limits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ ok: false, text: data.error ?? 'Failed to save the setting' });
        return;
      }
      setSaved(data.settings);
      setSettings(data.settings);
      setMessage({ ok: true, text: 'Rate limit settings saved.' });
    } catch {
      setMessage({ ok: false, text: 'Failed to save the setting' });
    } finally {
      setSaving(false);
    }
  };

  // The on/off switch saves at once, with the rest of the form as it was last saved
  const toggleEnabled = () => {
    const enabled = !saved.enabled;
    setSettings((s) => ({ ...s, enabled }));
    saveSettings({ ...saved, enabled });
  };

  // ---- Overrides ----
  const [overrides, setOverrides] = useState(initialOverrides);
  const [kind, setKind] = useState<'user' | 'ip'>('user');
  const [userSearch, setUserSearch] = useState('');
  const [userId, setUserId] = useState<number | null>(null);
  const [ipAddress, setIpAddress] = useState('');
  const [mode, setMode] = useState<OverrideMode>('custom');
  const [limit, setLimit] = useState<number>(100);
  const [period, setPeriod] = useState<Period>('day');
  const [duration, setDuration] = useState<OverrideDuration>(null);
  const [note, setNote] = useState('');
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState<Message>(null);
  const overrideForm = useRef<HTMLDivElement>(null);

  const userMatches = useMemo(() => {
    const needle = userSearch.trim().toLowerCase();
    const list = needle
      ? users.filter((u) => u.userName.toLowerCase().includes(needle) || u.emailAddress.toLowerCase().includes(needle))
      : users;
    const shown = list.slice(0, 50);
    // Keep the chosen user in the list while searching for someone else
    const chosen = users.find((u) => u.id === userId);
    return chosen && !shown.includes(chosen) ? [chosen, ...shown] : shown;
  }, [userSearch, users, userId]);

  // From the usage report's Set Limit: fill in the form for that user or IP address, with its override if it has one
  const startOverride = (target: LimitTarget) => {
    const existing = overrides.find((o) => ('userId' in target ? o.userId === target.userId : o.ipAddress === target.ipAddress));
    if ('userId' in target) {
      setKind('user');
      setUserId(target.userId);
      setUserSearch('');
    } else {
      setKind('ip');
      setIpAddress(target.ipAddress);
    }
    setMode(existing?.mode ?? 'custom');
    setLimit(existing?.limit ?? 100);
    setPeriod(existing?.period ?? 'day');
    setDuration(null);
    setNote(existing?.note ?? '');
    setOverrideMessage(null);
    overrideForm.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const targetName = (o: Pick<RateLimitOverride, 'userName' | 'emailAddress' | 'ipAddress'>) =>
    o.userName ? `${o.userName} (${o.emailAddress})` : (o.ipAddress ?? '');

  const saveOverride = async () => {
    setOverrideSaving(true);
    setOverrideMessage(null);
    try {
      const response = await fetch('/api/admin/rate-limits/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(kind === 'user' ? { userId } : { ipAddress: ipAddress.trim() }),
          mode,
          limit: mode === 'custom' ? limit : null,
          period,
          note,
          durationSeconds: duration,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOverrideMessage({ ok: false, text: data.error ?? 'Failed to save the override' });
        return;
      }
      setOverrides(data.overrides);
      const user = users.find((u) => u.id === userId);
      setOverrideMessage({ ok: true, text: `Override saved for ${kind === 'user' && user ? user.userName : ipAddress.trim()}.` });
    } catch {
      setOverrideMessage({ ok: false, text: 'Failed to save the override' });
    } finally {
      setOverrideSaving(false);
    }
  };

  const removeOverride = async (id: number) => {
    setOverrideMessage(null);
    try {
      const response = await fetch(`/api/admin/rate-limits/overrides/${id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOverrideMessage({ ok: false, text: data.error ?? 'Failed to remove the override' });
        return;
      }
      setOverrides(data.overrides);
      setOverrideMessage({ ok: true, text: 'Override removed.' });
    } catch {
      setOverrideMessage({ ok: false, text: 'Failed to remove the override' });
    }
  };

  const ruleText = (o: Pick<RateLimitOverride, 'mode' | 'limit' | 'period'>) =>
    o.mode === 'custom' ? `${limitLabel(o.limit)} per ${o.period}` : MODE_LABELS[o.mode];
  const formatTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const canSaveOverride = (kind === 'user' ? userId !== null : ipAddress.trim() !== '') && !overrideSaving;

  const limitSelect = (id: string, value: number | null, onChange: (limit: number | null) => void, label?: string) => (
    <select
      id={id}
      aria-label={label}
      value={limitValue(value)}
      onChange={(e) => onChange(parseLimitValue(e.target.value))}
      disabled={saving}
      className={inputClass}
    >
      {LIMIT_OPTIONS.map((option) => (
        <option key={limitValue(option)} value={limitValue(option)}>
          {limitLabel(option)}
        </option>
      ))}
    </select>
  );
  const periodSelect = (id: string, value: Period, onChange: (period: Period) => void, disabled = saving, label?: string) => (
    <select
      id={id}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as Period)}
      disabled={disabled}
      className={inputClass}
    >
      {PERIODS.map((p) => (
        <option key={p} value={p}>
          {PERIOD_OPTION_LABELS[p]}
        </option>
      ))}
    </select>
  );

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-dark-blue mb-2">Rate Limiting</h2>
        <p className="text-slate-600">
          Limit how many AI calls users can make, cap busy IP addresses, and override the limits for one user or IP
          address. Every AI call is logged in AI Usage below, whether limits are on or not.
        </p>
      </div>

      {/* The master switch */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-dark-blue">Enforce limits</p>
          <p className="text-xs text-slate-500">
            {saved.enabled
              ? 'On: calls over a limit are refused, and the user is told when they can try again.'
              : 'Off: every AI call is allowed and logged, but nothing is limited.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={saved.enabled}
          aria-label="Enforce limits"
          onClick={toggleEnabled}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            saved.enabled ? 'bg-powder-600' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${saved.enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="rl-reset-style" className={labelClass}>
            Limit window
          </label>
          <select
            id="rl-reset-style"
            value={settings.resetStyle}
            onChange={(e) => setSettings((s) => ({ ...s, resetStyle: e.target.value as ResetStyle }))}
            disabled={saving}
            className={inputClass}
          >
            {RESET_STYLES.map((style) => (
              <option key={style} value={style}>
                {RESET_STYLE_LABELS[style]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rl-exempt" className={labelClass}>
            Never limit
          </label>
          <select
            id="rl-exempt"
            value={settings.exemptRoles}
            onChange={(e) => setSettings((s) => ({ ...s, exemptRoles: e.target.value as ExemptRoles }))}
            disabled={saving}
            className={inputClass}
          >
            {EXEMPT_ROLES.map((value) => (
              <option key={value} value={value}>
                {EXEMPT_ROLE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Each tier's limit */}
      <div>
        <h3 className="text-sm font-semibold text-dark-blue">Limits</h3>
        <p className="text-xs text-slate-500 mb-3">
          Limits count weighted calls (see Feature weights). Visitors who aren’t signed in are counted by IP address.
          Max per minute stops scripts and repeated clicks.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Who</th>
                <th className="py-1 pr-3 font-medium">Limit</th>
                <th className="py-1 pr-3 font-medium">Per</th>
                <th className="py-1 font-medium">Max per minute</th>
              </tr>
            </thead>
            <tbody>
              {LIMIT_TIERS.map((tier) => (
                <tr key={tier}>
                  <td className="py-1.5 pr-3 font-medium text-dark-blue whitespace-nowrap">{LIMIT_TIER_LABELS[tier]}</td>
                  <td className="py-1.5 pr-3 min-w-[130px]">
                    {limitSelect(`rl-limit-${tier}`, settings.tiers[tier].limit, (value) => setTier(tier, { limit: value }), `Limit: ${LIMIT_TIER_LABELS[tier]}`)}
                  </td>
                  <td className="py-1.5 pr-3 min-w-[130px]">
                    {periodSelect(`rl-period-${tier}`, settings.tiers[tier].period, (value) => setTier(tier, { period: value }), saving, `Period: ${LIMIT_TIER_LABELS[tier]}`)}
                  </td>
                  <td className="py-1.5 min-w-[110px]">
                    <select
                      id={`rl-burst-${tier}`}
                      aria-label={`Max per minute: ${LIMIT_TIER_LABELS[tier]}`}
                      value={settings.burst[tier] === null ? 'off' : String(settings.burst[tier])}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, burst: { ...s.burst, [tier]: e.target.value === 'off' ? null : Number(e.target.value) } }))
                      }
                      disabled={saving}
                      className={inputClass}
                    >
                      {BURST_OPTIONS.map((option) => (
                        <option key={option ?? 'off'} value={option === null ? 'off' : String(option)}>
                          {option === null ? 'Off' : option}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Everyone at one IP address */}
      <div>
        <h3 className="text-sm font-semibold text-dark-blue">IP address cap</h3>
        <p className="text-xs text-slate-500 mb-3">
          The most AI calls everyone at one IP address can make together, signed in or not. Catches many accounts
          made on one network; keep it high enough for shared homes and offices.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 max-w-md">
          <div>
            <label htmlFor="rl-ip-limit" className={labelClass}>
              Limit
            </label>
            {limitSelect('rl-ip-limit', settings.ip.limit, (value) => setSettings((s) => ({ ...s, ip: { ...s.ip, limit: value } })))}
          </div>
          <div>
            <label htmlFor="rl-ip-period" className={labelClass}>
              Per
            </label>
            {periodSelect('rl-ip-period', settings.ip.period, (value) => setSettings((s) => ({ ...s, ip: { ...s.ip, period: value } })))}
          </div>
        </div>
      </div>

      {/* What each feature counts */}
      <div>
        <h3 className="text-sm font-semibold text-dark-blue">Feature weights</h3>
        <p className="text-xs text-slate-500 mb-3">
          How much one call of each feature counts against the limits. A feature that makes several model calls can
          count more. 0 leaves the feature unlimited (its calls are still logged, and blocks still apply).
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RATE_LIMITED_FEATURES.map((feature) => (
            <div key={feature}>
              <label htmlFor={`rl-weight-${feature}`} className={labelClass}>
                {RATE_LIMITED_FEATURE_LABELS[feature]}
              </label>
              <select
                id={`rl-weight-${feature}`}
                value={settings.weights[feature]}
                onChange={(e) => setSettings((s) => ({ ...s, weights: { ...s.weights, [feature]: Number(e.target.value) } }))}
                disabled={saving}
                className={inputClass}
              >
                {WEIGHT_OPTIONS.map((weight) => (
                  <option key={weight} value={weight}>
                    {weight === 0 ? '0 (not limited)' : `Counts as ${weight}`}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => saveSettings(settings)} disabled={saving || !dirty} className={buttonClass}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          {dirty && !saving && <span className="text-sm text-amber-600">Unsaved changes</span>}
        </div>
        {message && <AdminStatusMessage message={message} />}
      </div>

      {/* Overrides for one user or IP address */}
      <div ref={overrideForm} className="pt-6 border-t border-slate-200">
        <h3 className="text-xl font-bold text-dark-blue mb-1">Overrides</h3>
        <p className="text-sm text-slate-600 mb-4">
          Give one user or IP address its own limit, no limit, or no AI at all. A user’s override replaces the User
          limit; an IP address’s replaces the IP address cap and the not-signed-in limit there. Blocking an IP address
          blocks everyone at it.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="rl-kind" className={labelClass}>
              Applies to
            </label>
            <select id="rl-kind" value={kind} onChange={(e) => setKind(e.target.value as 'user' | 'ip')} className={inputClass}>
              <option value="user">A user</option>
              <option value="ip">An IP address</option>
            </select>
          </div>
          {kind === 'user' ? (
            <>
              <div>
                <label htmlFor="rl-user-search" className={labelClass}>
                  Find a user
                </label>
                <input
                  id="rl-user-search"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Name or email address"
                  className={inputClass}
                />
              </div>
              <div className="lg:col-span-2">
                <label htmlFor="rl-user" className={labelClass}>
                  User
                </label>
                <select
                  id="rl-user"
                  value={userId ?? ''}
                  onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : null)}
                  className={inputClass}
                >
                  <option value="">Choose a user</option>
                  {userMatches.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.userName} ({u.emailAddress}) · {u.role}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="lg:col-span-3">
              <label htmlFor="rl-ip" className={labelClass}>
                IP address
              </label>
              <input
                id="rl-ip"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="e.g. 203.0.113.7"
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label htmlFor="rl-mode" className={labelClass}>
              Rule
            </label>
            <select id="rl-mode" value={mode} onChange={(e) => setMode(e.target.value as OverrideMode)} className={inputClass}>
              {OVERRIDE_MODES.map((value) => (
                <option key={value} value={value}>
                  {MODE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          {mode === 'custom' && (
            <>
              <div>
                <label htmlFor="rl-override-limit" className={labelClass}>
                  Limit
                </label>
                <select id="rl-override-limit" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={inputClass}>
                  {LIMIT_OPTIONS.filter((option): option is number => option !== null).map((option) => (
                    <option key={option} value={option}>
                      {limitLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="rl-override-period" className={labelClass}>
                  Per
                </label>
                {periodSelect('rl-override-period', period, setPeriod, false)}
              </div>
            </>
          )}
          <div>
            <label htmlFor="rl-duration" className={labelClass}>
              Lasts
            </label>
            <select
              id="rl-duration"
              value={durationValue(duration)}
              onChange={(e) => setDuration(e.target.value === 'never' ? null : (Number(e.target.value) as OverrideDuration))}
              className={inputClass}
            >
              {OVERRIDE_DURATIONS.map((value) => (
                <option key={durationValue(value)} value={durationValue(value)}>
                  {OVERRIDE_DURATION_LABELS[durationValue(value)]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label htmlFor="rl-note" className={labelClass}>
              Note
            </label>
            <input
              id="rl-note"
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why (optional)"
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4">
          <button type="button" onClick={saveOverride} disabled={!canSaveOverride} className={buttonClass}>
            {overrideSaving ? 'Saving…' : 'Save Override'}
          </button>
        </div>
        {overrideMessage && <AdminStatusMessage message={overrideMessage} />}

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500 border-b border-slate-200">
              <tr>
                {['User or IP address', 'Rule', 'Expires', 'Note', 'Set by', ''].map((heading, i) => (
                  <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {overrides.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    No overrides.
                  </td>
                </tr>
              )}
              {overrides.map((o) => (
                <tr key={o.id} className="align-top">
                  <td translate="no" className="px-3 py-2 text-dark-blue">
                    {targetName(o)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={o.mode === 'blocked' ? 'text-red-600' : o.mode === 'unlimited' ? 'text-green-700' : 'text-dark-blue'}
                    >
                      {ruleText(o)}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                    {o.expiresAt ? formatTime.format(new Date(o.expiresAt)) : 'Never'}
                  </td>
                  <td className="px-3 py-2 text-slate-500 max-w-[240px] truncate" title={o.note}>
                    {o.note || '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{o.createdBy ?? '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => startOverride(o.userId !== null ? { userId: o.userId } : { ipAddress: o.ipAddress ?? '' })}
                      className="text-xs font-semibold text-powder-600 hover:underline mr-3"
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => removeOverride(o.id)} className="text-xs font-semibold text-red-600 hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AiUsageReport onSetLimit={startOverride} overridesVersion={overrides} />
    </div>
  );
}
