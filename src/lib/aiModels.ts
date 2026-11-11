import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import type { z } from 'zod';
import { query } from './db';
import {
  AI_FEATURE_VALUES,
  AI_FEATURES,
  AI_MODEL_CATEGORIES,
  AI_MODELS,
  AI_PROVIDER_KEYS,
  aiModelProvider,
  type AiFeature,
  type AiModel,
  type AiModelCategory,
  isAiFeature,
  isAiModel,
  isAiModelCategory,
  isClaudeModel,
  SYSTEM_AI_MODEL_CATEGORY,
} from './aiModelList';
import { assertAiServicesOn } from './aiKillSwitch';
import { currentAiModelCategory, tokenUsageCallbacks } from './aiTokenUsage';
import { ensureUserSchema } from './users';

export * from './aiModelList';

// Which OpenAI or Anthropic model each AI feature uses for each category of caller (Admin or User; see
// aiModelCategoryOf), chosen on the Admin page's AI Model Control section and kept in "SiteSettings" (key
// ai_model:<category>:<feature>). A category with no row for a feature uses its default (AI_FEATURES in
// src/lib/aiModelList.ts). Every AI call gets its model from chatModel or structuredModel below, which read the
// setting each time, so a change applies to the next call without a restart.

const settingKey = (category: AiModelCategory, feature: AiFeature) => `ai_model:${category}:${feature}`;

// The models whose provider has an API key set; only these are offered and can be saved
export function availableAiModels(): AiModel[] {
  return AI_MODELS.filter((model) => !!process.env[AI_PROVIDER_KEYS[aiModelProvider(model)]]);
}

export function isAvailableAiModel(value: unknown): value is AiModel {
  return isAiModel(value) && availableAiModels().includes(value);
}

export type AiModelsByCategory = Record<AiModelCategory, Record<AiFeature, AiModel>>;

// Every category's model for every feature, saved or default
export async function getAiModels(): Promise<AiModelsByCategory> {
  await ensureUserSchema();
  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM "SiteSettings" WHERE key LIKE 'ai_model:%'`
  );
  const saved: Partial<Record<AiModelCategory, Partial<Record<AiFeature, AiModel>>>> = {};
  for (const row of rows) {
    const [, category, feature] = row.key.split(':');
    if (isAiModelCategory(category) && isAiFeature(feature) && isAiModel(row.value)) {
      (saved[category] ??= {})[feature] = row.value;
    }
  }
  return Object.fromEntries(
    AI_MODEL_CATEGORIES.map((category) => [
      category,
      Object.fromEntries(AI_FEATURE_VALUES.map((feature) => [feature, saved[category]?.[feature] ?? AI_FEATURES[feature]])),
    ])
  ) as AiModelsByCategory;
}

export async function setAiModel(category: AiModelCategory, feature: AiFeature, model: AiModel, userId: number): Promise<void> {
  await ensureUserSchema();
  await query(
    `INSERT INTO "SiteSettings" (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [settingKey(category, feature), model, userId]
  );
}

// A feature's model for the caller in context (aiRateLimit's track(); the Admin category outside it). A failed
// read falls back to the default rather than failing the feature
export async function getAiModel(feature: AiFeature): Promise<AiModel> {
  const context = currentAiModelCategory();
  const category = isAiModelCategory(context) ? context : SYSTEM_AI_MODEL_CATEGORY;
  try {
    await ensureUserSchema();
    const [row] = await query<{ value: string }>('SELECT value FROM "SiteSettings" WHERE key = $1', [
      settingKey(category, feature),
    ]);
    return isAiModel(row?.value) ? row.value : AI_FEATURES[feature];
  } catch (error) {
    console.error(`Failed to read the AI model for ${feature}:`, error);
    return AI_FEATURES[feature];
  }
}

// gpt-5 and later are reasoning models: OpenAI refuses any temperature but the default for them
const isReasoningModel = (model: string) => model.startsWith('gpt-5');

function makeChatModel(model: AiModel, temperature: number): BaseChatModel {
  const callbacks = tokenUsageCallbacks(model);
  if (isClaudeModel(model)) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured');
    // Current Claude models refuse a temperature, so none is sent
    return new ChatAnthropic({ model, maxTokens: 16000, outputConfig: { effort: 'low' }, callbacks });
  }
  // Reasoning models get low effort instead of the temperature, since their reasoning is billed as output
  // tokens. They go through the Responses API, so read replies with .text, not .content.
  return isReasoningModel(model)
    ? new ChatOpenAI({ model, reasoning: { effort: 'low' }, useResponsesApi: true, callbacks })
    : new ChatOpenAI({ model, temperature, callbacks });
}

// The chat model for a feature, for the caller in context. temperature is ignored by models that refuse one.
// Inside an AI route's limit.track(), every call's tokens are added to its AiUsage row (src/lib/aiTokenUsage.ts).
// Read the reply with .text. Throws AiServicesStoppedError while the Admin page's emergency stop is on.
export async function chatModel(feature: AiFeature, temperature: number): Promise<BaseChatModel> {
  await assertAiServicesOn();
  return makeChatModel(await getAiModel(feature), temperature);
}

// The feature's chat model answering in `schema`'s shape. Claude models use their native JSON-schema output;
// OpenAI models use LangChain's default (JSON schema).
export async function structuredModel<T extends Record<string, unknown>>(
  feature: AiFeature,
  schema: z.ZodType<T>,
  temperature: number
): Promise<Runnable<BaseLanguageModelInput, T>> {
  await assertAiServicesOn();
  const model = await getAiModel(feature);
  const method = isClaudeModel(model) ? 'jsonSchema' : undefined;
  return makeChatModel(model, temperature).withStructuredOutput<T>(schema, method ? { method } : undefined);
}
