// Privacy rules and source guards: npm run test:privacy
//
// The pure parts of the privacy work (cookie consent rules, the cookie inventory, retention rules, policy versions,
// the legal documents) run straight from their .ts files, plus guards over the source that fail when something
// stores information in the browser without being in the cookie inventory, loads a third-party script, adds a table
// that belongs to a user without deciding how it's exported and deleted, or drops a server-side check from the
// privacy routes. The database tests are scripts/privacy-db.test.mjs.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONSENT_PURPOSES_VERSION,
  OFFERED_CATEGORIES,
  allChoices,
  consentAction,
  hasOptionalCategories,
  isConsentCurrent,
  isGranted,
  needsChoice,
  normalizeChoices,
  parseConsent,
  serializeConsent,
} from '../src/lib/cookieConsent.ts';
import { COOKIE_INVENTORY, isInventoried } from '../src/lib/cookieInventory.ts';
import { cookiePolicy, privacyPolicy, termsOfService, SERVICE_PROVIDERS, SUPPORT_EMAIL } from '../src/lib/legal.ts';
import { MINIMUM_AGE, POLICY_VERSIONS, acceptsCurrentTerms } from '../src/lib/policyVersions.ts';
import { RETENTION_KEYS, RETENTION_RULES, cutoff, retentionDays } from '../src/lib/retentionRules.ts';
import { AI_MODELS, AI_MODEL_PROVIDERS } from '../src/lib/aiModelList.ts';
import { EXPORTED_TABLES, NOT_EXPORTED } from '../src/lib/personalDataExport.ts';
import { SCRIBE_LANGUAGE_CODES, SPEAKING_PASS_SCORE, SPEECH_RECOGNITION_LOCALES, gradeSpokenAttempt, gradeSpokenWords, scoreSpokenAttempt } from '../src/lib/speechPractice.ts';
import { LANGUAGES } from '../src/lib/languages.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 3, 12);
const B = '11111111-1111-4111-8111-111111111111';
const R = '22222222-2222-4222-8222-222222222222';

function sourceFiles(dir = path.join(ROOT, 'src')) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}
const FILES = sourceFiles().map((file) => ({ file: path.relative(ROOT, file).replaceAll('\\', '/'), text: fs.readFileSync(file, 'utf8') }));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const docText = (doc) => JSON.stringify(doc);

describe('cookie consent rules', () => {
  const stored = { browserId: B, recordId: R, purposesVersion: CONSENT_PURPOSES_VERSION, choices: { analytics: true }, decidedAt: NOW };

  test('the stored choice survives a round trip through the cookie', () => {
    const offered = ['analytics'];
    assert.deepEqual(parseConsent(serializeConsent(stored, offered)), stored);
  });

  test('anything that is not a valid consent cookie is ignored', () => {
    for (const bad of [undefined, '', 'x', '{}', '{"b":"no","r":"no","p":1,"c":{},"t":1}', JSON.stringify({ b: B, r: R, p: 1.5, c: {}, t: 1 })]) {
      assert.equal(parseConsent(bad), null, String(bad));
    }
  });

  test('a choice stops counting after the review period, for an old purposes version, or from the future', () => {
    assert.equal(isConsentCurrent(stored, NOW + 179 * DAY, 180), true);
    assert.equal(isConsentCurrent(stored, NOW + 180 * DAY, 180), false);
    assert.equal(isConsentCurrent({ ...stored, purposesVersion: CONSENT_PURPOSES_VERSION - 1 }, NOW, 180), false);
    assert.equal(isConsentCurrent(stored, NOW - 2 * DAY, 180), false);
  });

  test('opt-in: nothing optional runs without a current grant, and a refusal is never turned into consent', () => {
    assert.equal(isGranted('analytics', null, false), false);
    assert.equal(isGranted('analytics', stored, true), true);
    assert.equal(isGranted('analytics', stored, false), false, 'an expired grant no longer counts');
    assert.equal(isGranted('analytics', { ...stored, choices: { analytics: false } }, true), false);
    assert.equal(isGranted('marketing', stored, true), false, 'a category not chosen stays off');
  });

  test('Customize starts with every optional category off and keeps only real choices', () => {
    assert.deepEqual(normalizeChoices({}, ['analytics', 'marketing']), { analytics: false, marketing: false });
    assert.deepEqual(normalizeChoices({ analytics: 'yes', marketing: true, bogus: true }, ['analytics', 'marketing']), {
      analytics: false,
      marketing: true,
    });
    assert.deepEqual(allChoices(false, ['analytics']), { analytics: false });
  });

  test('actions: accept, reject, customize, update and withdrawal are told apart', () => {
    assert.equal(consentAction(null, { analytics: true }, 'acceptAll'), 'accepted');
    assert.equal(consentAction(null, { analytics: false }, 'rejectAll'), 'rejected');
    assert.equal(consentAction(null, { analytics: true }, 'save'), 'customized');
    assert.equal(consentAction(stored, { analytics: true }, 'save'), 'updated');
    assert.equal(consentAction(stored, { analytics: false }, 'save'), 'withdrawn');
    assert.equal(consentAction(stored, { analytics: false }, 'rejectAll'), 'withdrawn');
  });

  test('the banner only asks when something optional is offered', () => {
    assert.equal(hasOptionalCategories(), OFFERED_CATEGORIES.length > 0);
    assert.equal(needsChoice(null, false, []), false);
    assert.equal(needsChoice(null, false, ['analytics']), true);
    assert.equal(needsChoice(stored, true, ['analytics']), false);
    assert.equal(needsChoice(stored, false, ['analytics']), true, 'an expired choice is asked again');
  });

  test('TalkNinja offers no optional categories, matching the inventory', () => {
    const optionalInUse = new Set(COOKIE_INVENTORY.filter((i) => i.category !== 'necessary').map((i) => i.category));
    assert.deepEqual([...optionalInUse].sort(), [...OFFERED_CATEGORIES].sort());
  });
});

describe('cookie inventory and source guards', () => {
  test('every named cookie in the code is in the inventory', () => {
    const names = new Set();
    for (const { text } of FILES) {
      for (const m of text.matchAll(/const\s+\w*COOKIE\w*\s*=\s*'([^']+)'/g)) names.add(m[1]);
    }
    assert.ok(names.has('session') && names.has('vocab_sheet') && names.has('cookie_consent'), [...names].join(','));
    for (const name of names) assert.ok(isInventoried(name, 'cookie'), `cookie ${name} is not in src/lib/cookieInventory.ts`);
  });

  test('cookies are only set through the known modules', () => {
    const allowed = new Set(['src/lib/session.ts', 'src/lib/vocabSheet.ts', 'src/lib/cookieConsentServer.ts', 'src/app/api/language/sheet/route.ts']);
    for (const { file, text } of FILES) {
      if (/(cookieStore|cookies\(\)\)?|response\.cookies|store)\.(set|delete)\(/.test(text) || text.includes('document.cookie')) {
        assert.ok(allowed.has(file), `${file} sets cookies; add it to the inventory and to this list`);
      }
    }
  });

  test('browser storage is only used where the inventory says', () => {
    const allowed = new Set(['src/components/PageTranslator.tsx', 'src/components/CookieConsentProvider.tsx']);
    for (const { file, text } of FILES) {
      // Actual use (a property access or a window[...] lookup), not a type name or a word in a dictionary
      if (/\b(localStorage|sessionStorage|indexedDB)\s*\.|window\[\w+\]/.test(text)) {
        assert.ok(allowed.has(file), `${file} uses browser storage; add its keys to src/lib/cookieInventory.ts`);
      }
    }
    assert.ok(isInventoried('talkninja-ui-translations-Spanish', 'localStorage'));
    assert.ok(read('src/components/PageTranslator.tsx').includes('talkninja-ui-translations-'));
  });

  test('no third-party scripts, trackers or embeds are loaded', () => {
    const banned = /next\/script|<script[^>]+src=|<iframe|googletagmanager|google-analytics|gtag\(|posthog|mixpanel|segment\.(com|io)|hotjar|clarity\.ms|facebook\.net|@vercel\/analytics|plausible\.io/i;
    for (const { file, text } of FILES) assert.ok(!banned.test(text), `${file} loads a third-party script or tracker`);
  });

  test('Cookie Settings is in the footer, and the footer is in the root layout', () => {
    assert.ok(read('src/components/SiteFooter.tsx').includes('CookieSettingsButton'));
    const layout = read('src/app/layout.tsx');
    assert.ok(layout.includes('<SiteFooter />') && layout.includes('<CookieConsentProvider'));
  });
});

describe('legal documents', () => {
  test('the Cookie Policy lists every inventory item', () => {
    const text = docText(cookiePolicy);
    for (const item of COOKIE_INVENTORY) assert.ok(text.includes(item.name), `Cookie Policy is missing ${item.name}`);
  });

  test('the Privacy Policy names every service provider and the retention periods in force by default', () => {
    const text = docText(privacyPolicy);
    for (const p of SERVICE_PROVIDERS) assert.ok(text.includes(p.name), p.name);
    assert.ok(text.includes(`${RETENTION_RULES.aiUsageIp.days} days`));
    assert.ok(text.includes(`${RETENTION_RULES.aiUsageRows.days} days`));
    assert.ok(text.includes('2 years'), 'cancellation contact period');
  });

  test('every document names the operator and the support address, and no placeholders are left', () => {
    for (const doc of [termsOfService, privacyPolicy, cookiePolicy]) {
      const text = docText(doc);
      assert.ok(text.includes('Clarivex, LLC'), doc.title);
      assert.ok(text.includes(SUPPORT_EMAIL), doc.title);
      assert.ok(!/\[(CONFIRM|TBD|TODO|PLACEHOLDER)/i.test(text), `${doc.title} has a placeholder`);
    }
  });

  test('the Terms set the minimum age, Kentucky law and the refund/withdrawal carve-out', () => {
    const text = docText(termsOfService);
    assert.ok(text.includes(`at least ${MINIMUM_AGE} years old`));
    assert.ok(text.includes('Kentucky'));
    assert.ok(text.includes('cannot be waived'));
    assert.equal(MINIMUM_AGE, 18);
  });

  test('ElevenLabs is disclosed because it is used; the microphone is used only by Speak practice, as disclosed; DeepSeek is not used', () => {
    // src/lib/elevenLabs.ts sends text to speak to ElevenLabs, so the Privacy Policy must name it
    assert.ok(FILES.some(({ text }) => text.includes('api.elevenlabs.io')));
    assert.ok(SERVICE_PROVIDERS.some((p) => p.name === 'ElevenLabs'));
    assert.ok(docText(privacyPolicy).includes('ElevenLabs'));
    assert.ok(docText(privacyPolicy).includes('do not record your voice'));
    assert.ok(!AI_MODELS.some((m) => m.startsWith('deepseek')));
    assert.ok(!AI_MODEL_PROVIDERS.includes('DeepSeek'));
    // Speak practice (Reading & Speaking tab) streams the microphone from the browser straight to ElevenLabs Scribe,
    // or uses the browser's own speech recognition; our server never receives the audio
    const MIC_FILES = ['src/components/SpeakPractice.tsx', 'src/lib/scribeRecognizer.ts'];
    assert.ok(docText(privacyPolicy).includes('Speaking practice'));
    assert.ok(docText(privacyPolicy).includes('We do not receive or store your audio'));
    assert.ok(docText(privacyPolicy).includes('sends what you say directly to ElevenLabs'));
    assert.ok(SERVICE_PROVIDERS.find((p) => p.name === 'ElevenLabs').data.includes('your voice'));
    assert.ok(fs.readFileSync(path.join(ROOT, 'next.config.js'), 'utf8').includes('microphone=(self)'));
    for (const { file, text } of FILES) {
      if (MIC_FILES.includes(file)) {
        // Never recorded, and never uploaded to us: the only request is for the session URL, and the audio goes only
        // over the WebSocket to the URL that request returned
        assert.ok(!/MediaRecorder|localStorage|indexedDB/.test(text), `${file} must not record or keep audio`);
        const fetches = [...text.matchAll(/fetch\(\s*([^,)]+)/g)].map((m) => m[1].trim());
        assert.ok(fetches.every((target) => target === "'/api/speech-recognition'"), `${file} fetches only the session URL`);
        assert.ok(!/new WebSocket\((?!url\))/.test(text), `${file} opens a WebSocket only to the URL the server gave`);
        continue;
      }
      assert.ok(!/new WebSocket\(/.test(text), `${file} opens a WebSocket; check what it sends against the Privacy Policy`);
      assert.ok(!/getUserMedia|MediaRecorder|SpeechRecognition/.test(text), `${file} uses the microphone; update the Privacy Policy first`);
      assert.ok(!text.includes('api.deepseek.com'), file);
    }
  });

  test('only the Terms are accepted; acceptance must name the current version', () => {
    assert.equal(acceptsCurrentTerms({ terms: POLICY_VERSIONS.terms }), true);
    assert.equal(acceptsCurrentTerms({ terms: '2000-01-01' }), false);
    assert.equal(acceptsCurrentTerms(null), false);
  });
});

describe('speaking practice scores', () => {
  test('an exact attempt scores 100, ignoring case, punctuation and spacing', () => {
    assert.equal(scoreSpokenAttempt('Xin chào!', 'xin chào', 'vi-VN'), 100);
    assert.equal(scoreSpokenAttempt('你好吗？', '你 好 吗', 'zh-CN'), 100);
  });
  test('a near miss scores partially, silence or a different phrase scores low', () => {
    const near = scoreSpokenAttempt('Tôi muốn uống cà phê', 'tôi muốn uống cafe', 'vi-VN');
    assert.ok(near >= 60 && near < 100, String(near));
    assert.equal(scoreSpokenAttempt('Hello there', '', 'en-US'), 0);
    assert.ok(scoreSpokenAttempt('Good morning', 'banana', 'en-US') < SPEAKING_PASS_SCORE);
  });
  test('the best alternative is used, and every language has a recognition locale', () => {
    assert.equal(scoreSpokenAttempt('good night', 'good knight', 'en-US'), 100);
    // Each word keeps its best result across the alternatives
    const across = gradeSpokenAttempt('good morning friend', ['good mourning fiend', 'could morning friend']);
    assert.equal(across.score, 100);
    assert.equal(scoreSpokenAttempt('good morning friend', 'good banana friend', 'en-US') < SPEAKING_PASS_SCORE, true);
    assert.equal(SPEAKING_PASS_SCORE, 80);
    for (const language of LANGUAGES) assert.ok(SPEECH_RECOGNITION_LOCALES[language], language);
    // Scribe knows every language but Latin, which falls back to the browser's recognition
    for (const language of LANGUAGES) assert.equal(Boolean(SCRIBE_LANGUAGE_CODES[language]), language !== 'Latin', language);
    for (const language of Object.keys(SCRIBE_LANGUAGE_CODES)) assert.ok(LANGUAGES.includes(language), language);
  });
  const graded = (parts) => parts.filter((p) => p.grade).map((p) => `${p.text}:${p.grade}`);
  test('the Speak box shows only the sentence\'s words, as they are reached, each graded', () => {
    assert.deepEqual(gradeSpokenWords('Tôi muốn uống', '', 'vi-VN'), []);
    // Still speaking: only the words reached so far, in the sentence's own spelling
    assert.deepEqual(graded(gradeSpokenWords('Tôi muốn uống cà phê.', 'tôi muốn', 'vi-VN')), ['Tôi:correct', 'muốn:correct']);
    // The benefit of the doubt: a small slip (a missing letter, a missing tone mark, a doubled letter, a homophone
    // spelling, a number as digits, a filler word) is still correct; a different word is wrong
    assert.deepEqual(graded(gradeSpokenWords('good morning', 'good mornin', 'en-US', true)), ['good:correct', 'morning:correct']);
    assert.deepEqual(graded(gradeSpokenWords('good morning', 'goo morning', 'en-US', true)), ['good:correct', 'morning:correct']);
    assert.deepEqual(graded(gradeSpokenWords('Tôi muốn uống', 'tôi muôn uống', 'vi-VN', true)), ['Tôi:correct', 'muốn:correct', 'uống:correct']);
    assert.deepEqual(graded(gradeSpokenWords('Tôi muốn uống', 'toi muon uong', 'vi-VN', true)), ['Tôi:correct', 'muốn:correct', 'uống:correct']);
    assert.deepEqual(graded(gradeSpokenWords('I want to go', 'I want too go', 'en-US', true)), ['I:correct', 'want:correct', 'to:correct', 'go:correct']);
    assert.deepEqual(graded(gradeSpokenWords('I have two cats', 'I have 2 cats', 'en-US', true)), ['I:correct', 'have:correct', 'two:correct', 'cats:correct']);
    assert.deepEqual(graded(gradeSpokenWords('the big dog', 'the um big dog', 'en-US', true)), ['the:correct', 'big:correct', 'dog:correct']);
    assert.deepEqual(graded(gradeSpokenWords('cat', 'car', 'en-US', true)), ['cat:close']);
    assert.deepEqual(graded(gradeSpokenWords('good morning friend', 'good banana friend', 'en-US', true)), ['good:correct', 'morning:wrong', 'friend:correct']);
    // Finished: words never said are wrong, and the sentence's punctuation comes back
    const finished = gradeSpokenWords('Hello there!', 'hello', 'en-US', true);
    assert.deepEqual(graded(finished), ['Hello:correct', 'there:wrong']);
    assert.equal(finished.map((p) => p.text).join(''), 'Hello there!');
    // Languages written without spaces still grade word by word
    assert.ok(graded(gradeSpokenWords('你好吗', '你好吗', 'zh-CN', true)).every((w) => w.endsWith(':correct')));
  });
});

describe('retention rules', () => {
  test('defaults are the approved periods', () => {
    assert.equal(RETENTION_RULES.expiredSessions.days, 7);
    assert.equal(RETENTION_RULES.expiredPasswordResets.days, 7);
    assert.equal(RETENTION_RULES.aiUsageIp.days, 90);
    assert.equal(RETENTION_RULES.cancellationContact.days, 730);
    assert.equal(RETENTION_RULES.consentRecords.days, 1095);
    assert.equal(RETENTION_RULES.deletionLedger.days, 1095);
  });

  test('the environment can change a period, but not below its minimum or to nonsense', () => {
    assert.equal(retentionDays('aiUsageIp', { RETENTION_AI_USAGE_IP_DAYS: '60' }), 60);
    assert.equal(retentionDays('aiUsageIp', { RETENTION_AI_USAGE_IP_DAYS: '1' }), 90, 'below the minimum');
    assert.equal(retentionDays('aiUsageIp', { RETENTION_AI_USAGE_IP_DAYS: 'ninety' }), 90);
    assert.equal(retentionDays('aiUsageIp', { RETENTION_AI_USAGE_IP_DAYS: '2.5' }), 90);
    assert.equal(retentionDays('aiUsageIp', { RETENTION_AI_USAGE_IP_DAYS: '' }), 90);
    for (const key of RETENTION_KEYS) assert.ok(retentionDays(key) >= RETENTION_RULES[key].minDays, key);
  });

  test('cutoff is UTC milliseconds', () => {
    assert.equal(cutoff(NOW, 7), NOW - 7 * DAY);
  });
});

describe('privacy routes and schema (source guards)', () => {
  test('Delete My Account checks the session, refuses Admins, and checks the password before deleting', () => {
    const route = read('src/app/api/account/route.ts');
    const order = ['getCurrentUser()', 'isAdmin(user.role)', 'body.confirm !== DELETE_CONFIRMATION', 'confirmPassword(user.id', 'deleteAccount(user)'];
    let last = -1;
    for (const step of order) {
      const at = route.indexOf(step);
      assert.ok(at > last, `${step} is missing or out of order`);
      last = at;
    }
    assert.ok(!/body\.(userId|id)\b/.test(route), 'must not take a user ID from the request');
  });

  test('Download My Data works only on the session account and needs the password', () => {
    const route = read('src/app/api/account/export/route.ts');
    assert.ok(route.indexOf('getCurrentUser()') < route.indexOf('confirmPassword(user.id'));
    assert.ok(route.includes('buildPersonalDataExport(client as unknown as Queryable, user.id)'));
    assert.ok(!/body\.(userId|id)\b/.test(route));
    assert.ok(route.includes("'Cache-Control': 'no-store'"));
  });

  test('the cron endpoint needs its secret and the Admin retention route needs an Admin', () => {
    const cron = read('src/app/api/cron/retention/route.ts');
    assert.ok(cron.includes('if (!authorized(request)) return notFound();'));
    assert.ok(cron.includes('secret.length < 32'));
    const admin = read('src/app/api/admin/retention/route.ts');
    assert.equal(admin.match(/checkAdminAccess\(\)/g)?.length, 2);
  });

  test('every table that belongs to a user is exported (or excluded with a reason) and deletes with the account', () => {
    const schema = read('src/lib/users.ts') + read('src/lib/privacyDb.ts');
    const tables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)" \(([\s\S]*?)\n\s*\)`/g)];
    const referencing = tables.filter(([, , body]) => body.includes('REFERENCES "Users"'));
    assert.ok(referencing.length >= 8);
    for (const [, name, body] of referencing) {
      assert.ok(EXPORTED_TABLES.includes(name) || name in NOT_EXPORTED, `${name} must be exported or listed in NOT_EXPORTED`);
      for (const ref of body.matchAll(/REFERENCES "Users"\(id\)([^,\n]*)/g)) {
        assert.match(ref[1], /ON DELETE (CASCADE|SET NULL)/, `${name}: a reference to "Users" without ON DELETE would block account deletion`);
      }
    }
    // AiUsage has no foreign key; account deletion unlinks it explicitly
    assert.ok(read('src/lib/deletionLedger.ts').includes('UPDATE "AiUsage" SET user_id = NULL WHERE user_id = $1'));
  });
});
