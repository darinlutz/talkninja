// AI cost guards: npm run test:ai
//
// Source guards that fail when an API route can reach a paid AI service (a chat model, OpenAI text to speech,
// Tavily image search) without requiring a login and going through aiRateLimit, when a paid call can skip the
// Admin page's emergency stop (src/lib/aiKillSwitch.ts), or when the always-on safety ceilings are weakened.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RATE_LIMITS, RATE_LIMITED_FEATURES, SAFETY_LIMITS } from '../src/lib/rateLimitConfig.ts';
import { AI_INPUT_LIMITS, latestStrings } from '../src/lib/aiInputLimits.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

function sourceFiles(dir = SRC) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const rel = (file) => path.relative(ROOT, file).replaceAll('\\', '/');
const TEXT = new Map(sourceFiles().map((file) => [file, fs.readFileSync(file, 'utf8')]));

// The files a file imports (value imports only: `import type` can't call anything)
function importsOf(file) {
  const text = TEXT.get(file) ?? '';
  const specs = [...text.matchAll(/^\s*(?:import|export)\s+(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  return specs.flatMap((spec) => {
    let base;
    if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(file), spec);
    else return [];
    const found = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((f) => TEXT.has(f));
    return found ? [found] : [];
  });
}

// Modules that make paid calls themselves
const PAID = new Set(['src/lib/aiModels.ts', 'src/lib/imageSearch.ts'].map((f) => path.join(ROOT, f)));
const callsPaidApiDirectly = (file) => /api\.openai\.com|api\.tavily\.com|api\.anthropic\.com/.test(TEXT.get(file));

function reachesPaid(file, seen = new Set()) {
  if (seen.has(file)) return false;
  seen.add(file);
  if (PAID.has(file) || callsPaidApiDirectly(file)) return true;
  return importsOf(file).some((next) => reachesPaid(next, seen));
}

const ROUTES = [...TEXT.keys()].filter((f) => rel(f).startsWith('src/app/api/') && f.endsWith('route.ts'));
// Routes that import a module with AI functions only for its non-AI helpers (reading the vocabulary sheet).
// They must never reference an AI entry point; a route that starts making AI calls comes off this list.
const NON_AI_ROUTES = {
  'src/app/api/language/word/route.ts': 'getRandomWord picks from the vocabulary sheet',
  'src/app/api/language/word/count/route.ts': 'getWordCountForCategory counts the vocabulary sheet',
  'src/app/api/language/sheet/route.ts': 'fetchVocabulary reads the vocabulary sheet',
  'src/app/api/language/sheet/reset/route.ts': 'fetchVocabulary reads the vocabulary sheet',
};
const AI_ENTRY_POINTS =
  /\b(chatModel|structuredModel|getRandomSentence|translateText|translateUiStrings|checkGrammar|chatWithFriend|alignTranslation|pickReadingItem|pickWritingItem|generateReadingTest|generateTestSentence|searchSentenceImage|aiRateLimit)\b/;

const AI_ROUTES = ROUTES.filter((f) => !rel(f).startsWith('src/app/api/admin/') && !(rel(f) in NON_AI_ROUTES) && reachesPaid(f));

describe('AI routes (source guards)', () => {
  test('the AI routes are found', () => {
    // A sanity check on the import walk: these must be among them
    for (const route of ['translate', 'friend', 'speak', 'language/image', 'ui-translate']) {
      assert.ok(AI_ROUTES.some((f) => rel(f) === `src/app/api/${route}/route.ts`), `${route} should be an AI route`);
    }
  });

  for (const file of AI_ROUTES) {
    const text = TEXT.get(file);
    test(`${rel(file)} requires a login and goes through aiRateLimit`, () => {
      const signIn = text.search(/checkPracticeAccess\(\)|getCurrentUser\(\)/);
      const gate = text.search(/aiRateLimit\(request, '/);
      assert.ok(signIn >= 0, 'checks the signed-in user (checkPracticeAccess or getCurrentUser)');
      assert.ok(gate > signIn, 'calls aiRateLimit(request, ...) after the sign-in check');
      const feature = text.slice(gate).match(/aiRateLimit\(request, '([^']+)'/)[1];
      assert.ok(RATE_LIMITED_FEATURES.includes(feature), `${feature} is in RATE_LIMITED_FEATURES`);
      assert.match(text, /if \(limit\.response\) return limit\.response;/, 'returns the refusal');
      assert.match(text, /limit\.track\(/, 'runs the paid work in limit.track()');
      assert.match(text, /limit\??\.refund\(\)/, 'refunds failed calls');
    });
  }

  test('the non-AI routes make no AI calls', () => {
    for (const file of Object.keys(NON_AI_ROUTES)) {
      assert.doesNotMatch(fs.readFileSync(path.join(ROOT, file), 'utf8'), AI_ENTRY_POINTS, file);
    }
  });

  test('admin routes make no AI calls', () => {
    for (const file of ROUTES.filter((f) => rel(f).startsWith('src/app/api/admin/'))) {
      assert.doesNotMatch(TEXT.get(file), /chatModel\(|structuredModel\(|searchSentenceImage\(|api\.openai\.com/, rel(file));
    }
  });

  test('only aiModels.ts builds chat models, and only known files call paid APIs directly', () => {
    for (const [file, text] of TEXT) {
      if (rel(file) !== 'src/lib/aiModels.ts') {
        assert.doesNotMatch(text, /new Chat(OpenAI|Anthropic)\(/, `${rel(file)} must use chatModel/structuredModel`);
      }
      if (callsPaidApiDirectly(file)) {
        assert.ok(['src/app/api/speak/route.ts', 'src/lib/imageSearch.ts'].includes(rel(file)), `${rel(file)} calls a paid API`);
      }
    }
  });
});

describe('emergency stop and gate (source guards)', () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

  test('every paid call checks the emergency stop', () => {
    const models = read('src/lib/aiModels.ts');
    for (const fn of ['chatModel', 'structuredModel']) {
      const body = models.slice(models.indexOf(`export async function ${fn}`)).split(/\n}\n/)[0];
      assert.match(body, /await assertAiServicesOn\(\)/, `${fn} checks the emergency stop`);
    }
    assert.match(read('src/lib/imageSearch.ts'), /await assertAiServicesOn\(\)/);
    const speak = read('src/app/api/speak/route.ts');
    assert.ok(speak.indexOf('assertAiServicesOn()') < speak.indexOf('api.openai.com'), 'speak checks before calling OpenAI');
  });

  test('aiRateLimit refuses visitors, honours the stop and the safety ceilings, and fails closed', () => {
    const limits = read('src/lib/rateLimits.ts');
    const body = limits.slice(limits.indexOf('export async function aiRateLimit'));
    assert.match(body, /if \(!user\) return refuse\([^)]*401\)/);
    assert.match(body, /if \(!\(await aiServicesOn\(\)\)\)/);
    assert.match(body, /safetyRefusal\(client, user\.id\)/);
    assert.match(body, /refusing the call[\s\S]{0,200}503/, 'a failed check refuses the call');
    assert.doesNotMatch(body, /allowing the call/);
  });

  test('the emergency stop fails closed when the database is unreadable', () => {
    assert.match(read('src/lib/aiKillSwitch.ts'), /return cached\?\.on \?\? false;/);
  });
});

describe('limits', () => {
  test('rate limits are on by default and every feature has a weight', () => {
    assert.equal(DEFAULT_RATE_LIMITS.enabled, true);
    assert.equal(DEFAULT_RATE_LIMITS.tiers.Anonymous.limit, 0);
    for (const feature of RATE_LIMITED_FEATURES) assert.equal(typeof DEFAULT_RATE_LIMITS.weights[feature], 'number', feature);
  });

  test('safety ceilings are set', () => {
    assert.ok(SAFETY_LIMITS.perUserPerMinute > 0 && SAFETY_LIMITS.perUserPerMinute <= 120);
    assert.ok(SAFETY_LIMITS.perUserPerDay > 0 && SAFETY_LIMITS.perUserPerDay <= 5000);
    assert.ok(SAFETY_LIMITS.sitePerDay > 0);
  });

  test('latestStrings keeps the latest strings, trimmed', () => {
    assert.deepEqual(latestStrings(['a', 1, 'b', null, 'c'], 2), ['b', 'c']);
    assert.deepEqual(latestStrings('nope', 5), []);
    assert.equal(latestStrings(['x'.repeat(10_000)], 1)[0].length, AI_INPUT_LIMITS.usedItem);
  });
});
