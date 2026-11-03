'use client';

import { useState } from 'react';
import AdminStatusMessage from '@/components/AdminStatusMessage';
import {
  AI_FEATURE_LABELS,
  AI_FEATURE_VALUES,
  AI_FEATURES,
  AI_MODEL_CATEGORIES,
  AI_MODEL_PROVIDERS,
  AI_PROVIDER_KEYS,
  aiModelProvider,
  type AiFeature,
  type AiModel,
  type AiModelCategory,
} from '@/lib/aiModelList';

// The Admin page's AI Model Control section: a grid of every AI feature's OpenAI or Anthropic model
// for each category of caller (Admin and User; see aiModelCategoryOf in src/lib/aiModelList.ts). Only models whose
// provider has an API key set are offered. Changed cells are saved together (PUT /api/admin/ai-models, one per
// cell); the feature's next AI call for that category uses them.

type Models = Record<AiModelCategory, Record<AiFeature, AiModel>>;

const selectClass =
  'w-full min-w-[10rem] px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-dark-blue text-sm focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors';

export default function AiModelManager({
  models: initialModels,
  availableModels,
}: {
  models: Models;
  availableModels: AiModel[];
}) {
  const [saved, setSaved] = useState(initialModels);
  const [models, setModels] = useState(initialModels);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const missingProviders = AI_MODEL_PROVIDERS.filter(
    (provider) => !availableModels.some((model) => aiModelProvider(model) === provider)
  );
  const modelName = (feature: AiFeature, value: AiModel) => (value === AI_FEATURES[feature] ? `${value} (default)` : value);

  const changes = AI_MODEL_CATEGORIES.flatMap((category) =>
    AI_FEATURE_VALUES.filter((feature) => models[category][feature] !== saved[category][feature]).map((feature) => ({
      category,
      feature,
      model: models[category][feature],
    }))
  );

  const change = (category: AiModelCategory, feature: AiFeature, model: AiModel) => {
    setModels((current) => ({ ...current, [category]: { ...current[category], [feature]: model } }));
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    let count = 0;
    try {
      for (const item of changes) {
        const response = await fetch('/api/admin/ai-models', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessage({ ok: false, text: data.error ?? 'Failed to save the setting' });
          return;
        }
        setSaved((current) => ({ ...current, [item.category]: { ...current[item.category], [item.feature]: item.model } }));
        count++;
      }
      setMessage({ ok: true, text: `Saved ${count} model ${count === 1 ? 'change' : 'changes'}.` });
    } catch {
      setMessage({ ok: false, text: 'Failed to save the setting' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8">
      <h2 className="text-2xl font-bold text-dark-blue mb-2">AI Model Control</h2>
      <p className="text-slate-600 mb-2">
        Choose which model each AI feature uses for Admins and for everyone else (Users, and visitors who aren’t
        signed in). Smaller models cost less per call. A change applies to the feature’s next call.
      </p>
      {missingProviders.length > 0 && (
        <p className="text-sm text-slate-500 mb-4">
          Not offered until their API key is set:{' '}
          {missingProviders.map((provider) => `${provider} (${AI_PROVIDER_KEYS[provider]})`).join(', ')}.
        </p>
      )}

      <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-slate-500">
              <th className="px-4 py-3">Feature</th>
              {AI_MODEL_CATEGORIES.map((category) => (
                <th key={category} className="px-2 py-3">
                  {category}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AI_FEATURE_VALUES.map((feature) => (
              <tr key={feature} className="border-t border-slate-200">
                <td className="px-4 py-2 text-dark-blue">
                  {AI_FEATURE_LABELS[feature]}
                  <span className="block text-xs text-slate-400 font-mono">{feature}</span>
                </td>
                {AI_MODEL_CATEGORIES.map((category) => {
                  const value = models[category][feature];
                  // A saved model whose provider's key was removed is still shown, so the cell isn't blank
                  const options = availableModels.includes(value) ? availableModels : [value, ...availableModels];
                  return (
                    <td key={category} className="px-2 py-2">
                      <select
                        aria-label={`${AI_FEATURE_LABELS[feature]}: ${category}`}
                        value={value}
                        onChange={(e) => change(category, feature, e.target.value as AiModel)}
                        disabled={saving}
                        className={`${selectClass} disabled:opacity-60 ${
                          value !== saved[category][feature] ? 'border-powder-600 ring-1 ring-powder-500' : ''
                        }`}
                      >
                        {AI_MODEL_PROVIDERS.map((provider) => {
                          const group = options.filter((model) => aiModelProvider(model) === provider);
                          return group.length === 0 ? null : (
                            <optgroup key={provider} label={provider}>
                              {group.map((model) => (
                                <option key={model} value={model}>
                                  {modelName(feature, model)}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || changes.length === 0}
          className="px-6 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-powder-500 to-powder-600 hover:from-powder-600 hover:to-powder-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {changes.length > 0 && !saving && (
          <span className="text-sm text-amber-600">
            {changes.length} unsaved {changes.length === 1 ? 'change' : 'changes'}
          </span>
        )}
      </div>

      {message && <AdminStatusMessage message={message} />}
    </div>
  );
}
