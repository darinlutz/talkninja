// The AI features and the OpenAI and Anthropic models the Admin page's AI Model Control section offers.
// No imports, so client components can use it; src/lib/aiModels.ts reads and saves the choices and makes the
// chat model for each call (chatModel).

// Every place the site calls a chat model, with the model it used before models could be chosen
export const AI_FEATURES = {
  translate: 'gpt-4o',
  uiTranslate: 'gpt-4o-mini',
  friendChat: 'gpt-4o',
  grammarCheck: 'gpt-4o',
  wordAlignment: 'gpt-4o',
  practiceSentence: 'gpt-4o',
  readingTest: 'gpt-4o',
  testSentence: 'gpt-4o',
  levelWordTranslation: 'gpt-4o',
  wordRelevance: 'gpt-4o',
} as const satisfies Record<string, AiModel>;

export type AiFeature = keyof typeof AI_FEATURES;
export const AI_FEATURE_VALUES = Object.keys(AI_FEATURES) as AiFeature[];

// What the Admin page calls each feature, and where it's used
export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  translate: 'Translator (and test translations)',
  uiTranslate: 'Page translation (the site in "I speak")',
  friendChat: 'AI Friend conversation',
  grammarCheck: 'AI Friend grammar check',
  wordAlignment: 'Word-by-word alignment',
  practiceSentence: 'Reading/Writing practice sentences',
  readingTest: 'Reading Test questions',
  testSentence: 'Training & Writing Test sentences',
  levelWordTranslation: 'Level word list translation',
  wordRelevance: 'Custom instructions word weighting',
};

// The models the Admin page offers; only these can be saved. Add new OpenAI or Anthropic (claude-*) chat models
// here, with their price in src/lib/aiModelPrices.ts. DeepSeek was removed (2026-11-03): it processes data in China,
// which has no EU adequacy decision, and no transfer safeguard is in place (see docs/privacy.md). Don't add a
// provider without updating the Privacy Policy's list of service providers (src/lib/legal.ts).
export const AI_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-nano',
  'gpt-4.1-mini',
  'gpt-4.1',
  'gpt-5-nano',
  'gpt-5-mini',
  'gpt-5',
  'gpt-5.1',
  'gpt-5.2',
  'gpt-5.4-mini',
  'gpt-5.4',
  'gpt-5.5',
  'claude-sonnet-5-5',
  'claude-opus-5-5',
] as const;

export type AiModel = (typeof AI_MODELS)[number];

export const isClaudeModel = (model: string) => model.startsWith('claude-');

export type AiModelProvider = 'OpenAI' | 'Anthropic';
export const AI_MODEL_PROVIDERS: readonly AiModelProvider[] = ['OpenAI', 'Anthropic'];

// The env var each provider's API key is in; a provider without one isn't offered (src/lib/aiModels.ts
// availableAiModels)
export const AI_PROVIDER_KEYS: Record<AiModelProvider, string> = {
  OpenAI: 'OPENAI_API_KEY',
  Anthropic: 'ANTHROPIC_API_KEY',
};

export function aiModelProvider(model: string): AiModelProvider {
  return isClaudeModel(model) ? 'Anthropic' : 'OpenAI';
}

// Each feature's model is set separately for each category of caller: Admins and everyone else. Visitors who
// aren't signed in count as User, the lowest.
export const AI_MODEL_CATEGORIES = ['Admin', 'User'] as const;
export type AiModelCategory = (typeof AI_MODEL_CATEGORIES)[number];

// AI calls made for no user (background work) use the Admin category's models
export const SYSTEM_AI_MODEL_CATEGORY: AiModelCategory = 'Admin';

// role 'Admin' is ROLES.admin (src/lib/roles.ts), written out so this file keeps no imports
export function aiModelCategoryOf(user: { role: string } | null): AiModelCategory {
  return user?.role === 'Admin' ? 'Admin' : 'User';
}

export function isAiModelCategory(value: unknown): value is AiModelCategory {
  return typeof value === 'string' && (AI_MODEL_CATEGORIES as readonly string[]).includes(value);
}

export function isAiFeature(value: unknown): value is AiFeature {
  return typeof value === 'string' && Object.hasOwn(AI_FEATURES, value);
}

export function isAiModel(value: unknown): value is AiModel {
  return typeof value === 'string' && (AI_MODELS as readonly string[]).includes(value);
}
