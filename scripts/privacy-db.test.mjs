// Account deletion, data export, Terms acceptance and retention against a real Postgres: npm run test:privacy:db
//
// Needs PRIVACY_TEST_DATABASE_URL pointing at a disposable Postgres on this computer (it refuses anything else,
// and it DROPS the talkninja schema there first). For example, with Docker:
//   docker run -d --rm --name tn-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=tntest -p 127.0.0.1:55433:5432 postgres:16
//   PRIVACY_TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55433/tntest npm run test:privacy:db
// Without the variable the tests are skipped.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.PRIVACY_TEST_DATABASE_URL;
const local = url && /@(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(url);
if (url && !local) throw new Error('PRIVACY_TEST_DATABASE_URL must point at a database on this computer');
const skip = !url ? 'PRIVACY_TEST_DATABASE_URL is not set' : false;

const DAY = 24 * 60 * 60 * 1000;

let db, users, ledger, exporter, job, rules, policies, retention;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  // A fresh schema each run (local only, checked above)
  const pg = (await import('pg')).default;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query('DROP SCHEMA IF EXISTS talkninja CASCADE');
  await admin.end();

  db = await import('../src/lib/db.ts');
  users = await import('../src/lib/users.ts');
  ledger = await import('../src/lib/deletionLedger.ts');
  exporter = await import('../src/lib/personalDataExport.ts');
  job = await import('../src/lib/retentionJob.ts');
  rules = await import('../src/lib/retentionRules.ts');
  policies = await import('../src/lib/policyAcceptances.ts');
  retention = await import('../src/lib/retention.ts');
  await users.ensureUserSchema();
});

after(async () => {
  if (skip) return;
  // Close the pool so node:test can exit
  const pool = globalThis.pgPool;
  await pool?.end();
});

let counter = 0;
async function makeUser(overrides = {}) {
  counter++;
  return users.createUser({
    userName: `Test ${counter}`,
    emailAddress: `privacy-test-${counter}-${Date.now()}@example.test`,
    password: 'correct horse battery',
    nativeLanguage: 'English',
    activeLearningLanguage: 'Spanish',
    ...overrides,
  });
}

// Gives the user one row in every table that belongs to a user
async function fillUserData(userId, label) {
  const q = db.query;
  await q(`INSERT INTO "Sessions" (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [`tok-${label}-${userId}`, userId, Date.now() + DAY]);
  await q(`INSERT INTO "PasswordResets" (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [`rst-${label}-${userId}`, userId, Date.now() + DAY]);
  await q(`INSERT INTO "UserLanguageProgress" (user_id, language, belt_level) VALUES ($1, 'Spanish', 2)`, [userId]);
  await q(
    `INSERT INTO "LanguageActivity" (user_id, language, level, activity, score, passed, was_next_step) VALUES ($1, 'Spanish', 2, 'reading', 90, true, true)`,
    [userId]
  );
  await q(`INSERT INTO "CustomAgentInstructions" (user_id, instructions) VALUES ($1, $2)`, [userId, `focus ${label}`]);
  await q(
    `INSERT INTO "AiUsage" (user_id, ip_address, feature, tier, weight, blocked) VALUES ($1, '203.0.113.9', 'translate', 'User', 1, false)`,
    [userId]
  );
  await q(
    `INSERT INTO "CancellationReason" (user_id, user_name, email_address, reason, stripe_subscription_id) VALUES ($1, $2, 'x@example.test', 'Too expensive', 'sub_test')`,
    [userId, `Name ${label}`]
  );
  await q(
    `INSERT INTO "CookieConsents" (id, browser_id, user_id, action, categories, cookie_policy_version, banner_version, purposes_version, notice_language, method)
     VALUES (gen_random_uuid(), gen_random_uuid(), $1, 'rejected', '{"necessary":true}', 'v', 'v', 1, 'en', 'banner')`,
    [userId]
  );
  await q(`INSERT INTO "RateLimitOverrides" (user_id, mode, note) VALUES ($1, 'unlimited', 'test')`, [userId]);
}

async function countFor(userId) {
  const tables = ['Sessions', 'PasswordResets', 'UserLanguageProgress', 'LanguageActivity', 'CustomAgentInstructions', 'PolicyAcceptances', 'RateLimitOverrides', 'AiUsage', 'CookieConsents', 'CancellationReason'];
  const out = {};
  for (const t of tables) out[t] = Number((await db.query(`SELECT count(*) FROM "${t}" WHERE user_id = $1`, [userId]))[0].count);
  return out;
}

const deleteAccount = (userId) => db.transaction((client) => ledger.deleteAccountRows(client, userId));

describe('signup and Terms acceptance', { skip }, () => {
  test('signing up records the current Terms (and Privacy Policy shown) and the age confirmation', async () => {
    const user = await makeUser();
    const status = await policies.getTermsStatus(user.id);
    assert.deepEqual(status, { acceptedCurrentTerms: true, ageConfirmed: true });
    const rows = await db.query('SELECT policy, source FROM "PolicyAcceptances" WHERE user_id = $1 ORDER BY policy', [user.id]);
    assert.deepEqual(rows.map((r) => `${r.policy}:${r.source}`), ['privacy:signup', 'terms:signup']);
  });

  test('an account from before the Terms is asked, and accepting is recorded once', async () => {
    const user = await makeUser();
    await db.query('DELETE FROM "PolicyAcceptances" WHERE user_id = $1', [user.id]);
    await db.query('UPDATE "Users" SET age_confirmed_at = NULL WHERE id = $1', [user.id]);
    assert.deepEqual(await policies.getTermsStatus(user.id), { acceptedCurrentTerms: false, ageConfirmed: false });
    await policies.acceptCurrentTerms(user.id);
    await policies.acceptCurrentTerms(user.id);
    assert.deepEqual(await policies.getTermsStatus(user.id), { acceptedCurrentTerms: true, ageConfirmed: true });
    const [{ count }] = await db.query(`SELECT count(*) FROM "PolicyAcceptances" WHERE user_id = $1 AND source = 'website'`, [user.id]);
    assert.equal(Number(count), 2);
  });
});

describe('Delete My Account', { skip }, () => {
  test('deletes only that account, unlinks what is kept, and records the deletion', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await fillUserData(a.id, 'a');
    await fillUserData(b.id, 'b');
    const before = await countFor(b.id);

    const entry = await deleteAccount(a.id);
    assert.equal(entry.userId, a.id);

    assert.equal(await users.getUserById(a.id), null);
    assert.equal(await users.authenticateUser(a.emailAddress, 'correct horse battery'), null, 'a deleted account cannot sign in');
    const gone = await countFor(a.id);
    for (const [table, n] of Object.entries(gone)) assert.equal(n, 0, `${table} still has rows for the deleted account`);
    // Kept, without the account: AI usage, consent evidence, cancellation reason
    const [{ count: orphanAi }] = await db.query(`SELECT count(*) FROM "AiUsage" WHERE user_id IS NULL AND ip_address = '203.0.113.9'`);
    assert.ok(Number(orphanAi) >= 1);
    const [kept] = await db.query(`SELECT user_id, user_name FROM "CancellationReason" WHERE user_name = 'Name a'`);
    assert.equal(kept.user_id, null);
    const [led] = await db.query('SELECT user_id FROM "DeletionLedger" WHERE user_id = $1', [a.id]);
    assert.equal(led.user_id, a.id);

    assert.deepEqual(await countFor(b.id), before, 'the other account is untouched');
  });

  test('is safe to repeat and never deletes an Admin', async () => {
    const a = await makeUser();
    assert.ok(await deleteAccount(a.id));
    assert.equal(await deleteAccount(a.id), null, 'second attempt finds nothing');
    const admin = await makeUser();
    await db.query(`UPDATE "Users" SET role = 'Admin' WHERE id = $1`, [admin.id]);
    assert.equal(await deleteAccount(admin.id), null);
    assert.ok(await users.getUserById(admin.id));
    const [{ count }] = await db.query('SELECT count(*) FROM "DeletionLedger" WHERE user_id = $1', [admin.id]);
    assert.equal(Number(count), 0, 'no ledger row for a refused deletion');
  });

  test('a restored backup has deleted accounts deleted again, but never an account that reused the ID', async () => {
    const a = await makeUser();
    await fillUserData(a.id, 'restore');
    const [{ created_at: createdAt }] = await db.query('SELECT created_at FROM "Users" WHERE id = $1', [a.id]);
    await deleteAccount(a.id);
    const entries = await db.withClient((c) => ledger.readLedger(c));

    // Simulate restoring a backup taken before the deletion: the account and its data are back, the ledger isn't
    await db.query('DELETE FROM "DeletionLedger"');
    await db.query(
      `INSERT INTO "Users" (id, user_name, email_address, password, created_at) VALUES ($1, 'Restored', $2, 'x', $3)`,
      [a.id, `restored-${Date.now()}@example.test`, createdAt]
    );
    await db.query(`INSERT INTO "UserLanguageProgress" (user_id, language) VALUES ($1, 'French')`, [a.id]);
    // An account that got a reused ID later must survive
    const reused = await makeUser();
    const fake = { userId: reused.id, accountCreatedAt: new Date('2020-01-01T00:00:00Z') };

    const result = await db.withClient((c) => ledger.reapplyDeletions(c, [...entries, fake]));
    assert.ok(result.accountsDeleted >= 1);
    assert.equal(await users.getUserById(a.id), null);
    assert.equal(Number((await db.query('SELECT count(*) FROM "UserLanguageProgress" WHERE user_id = $1', [a.id]))[0].count), 0);
    assert.ok(await users.getUserById(reused.id), 'an account with a reused ID and a different creation time is kept');
    // Running it again changes nothing
    const again = await db.withClient((c) => ledger.reapplyDeletions(c, entries));
    assert.equal(again.accountsDeleted, 0);
  });
});

describe('Download My Data', { skip }, () => {
  test('contains the account\'s own data only, and no secrets', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await fillUserData(a.id, 'mine');
    await fillUserData(b.id, 'theirs');
    const data = await db.withClient((c) => exporter.buildPersonalDataExport(c, a.id));
    const text = JSON.stringify(data);
    assert.equal(data.account.id, a.id);
    assert.equal(data.account.email_address, a.emailAddress);
    assert.ok(!text.includes(b.emailAddress), 'another user\'s email address');
    assert.ok(!text.includes('focus theirs'), 'another user\'s instructions');
    assert.ok(!text.includes('scrypt$'), 'password hash');
    assert.ok(!text.includes('tok-mine'), 'session token hash');
    assert.equal(data.customTrainingInstructions[0].instructions, 'focus mine');
    assert.equal(data.languageActivity.length, 1);
    assert.equal(data.aiUsage.length, 1);
    assert.equal(data.policyAcceptances.length, 2);
    assert.equal(data.sessions.active, 1);
    assert.equal(await db.withClient((c) => exporter.buildPersonalDataExport(c, 999999)), null);
  });
});

describe('retention job', { skip }, () => {
  const NOW = new Date('2026-11-03T12:00:00Z');
  const ago = (days, extraMs = 0) => new Date(NOW.getTime() - days * DAY - extraMs);

  test('removes exactly what is past its period, keeps what is not, and a rerun changes nothing', async () => {
    const u = await makeUser();
    const q = db.query;
    await q('DELETE FROM "Sessions"');
    await q('DELETE FROM "AiUsage"');
    await q('DELETE FROM "CancellationReason"');
    await q('DELETE FROM "CookieConsents"');
    await q('DELETE FROM "DeletionLedger"');
    const ms = (d) => d.getTime();
    // Sessions: expired 8 days ago (delete), 6 days ago (keep), active (keep)
    await q(`INSERT INTO "Sessions" VALUES ('s-old', $1, $2), ('s-recent', $1, $3), ('s-live', $1, $4)`, [u.id, ms(ago(8)), ms(ago(6)), ms(NOW) + DAY]);
    await q(`INSERT INTO "PasswordResets" VALUES ('r-old', $1, $2), ('r-recent', $1, $3)`, [u.id, ms(ago(8)), ms(ago(1))]);
    // AI usage: IP 91 days (cleared), 89 days (kept); row 401 days (deleted); orphan user (unlinked)
    const ai = `INSERT INTO "AiUsage" (created_at, user_id, ip_address, feature, tier, weight, blocked) VALUES ($1, $2, $3, 'translate', 'User', 1, false)`;
    await q(ai, [ago(91), u.id, '198.51.100.1']);
    await q(ai, [ago(89), u.id, '198.51.100.2']);
    await q(ai, [ago(401), u.id, null]);
    await q(ai, [ago(1), 987654, null]);
    // Cancellation contact: 731 days (anonymized), 729 days (kept)
    const cr = `INSERT INTO "CancellationReason" (user_id, user_name, email_address, notes, reason, stripe_subscription_id, cancelled_at) VALUES ($1, $2, 'c@example.test', 'notes', 'Too expensive', 'sub', $3)`;
    await q(cr, [u.id, 'Old Name', ago(731)]);
    await q(cr, [u.id, 'Recent Name', ago(729)]);
    // Consent records and ledger: 1096 days (deleted), 1094 days (kept)
    const cc = `INSERT INTO "CookieConsents" (id, browser_id, recorded_at, action, categories, cookie_policy_version, banner_version, purposes_version, notice_language, method) VALUES (gen_random_uuid(), gen_random_uuid(), $1, 'rejected', '{}', 'v', 'v', 1, 'en', 'banner')`;
    await q(cc, [ago(1096)]);
    await q(cc, [ago(1094)]);
    await q(`INSERT INTO "DeletionLedger" (user_id, account_created_at, deleted_at) VALUES (1, $1, $1), (2, $2, $2)`, [ago(1096), ago(1094)]);

    const days = rules.allRetentionDays({});
    const first = await db.withClient((c) => job.runRetentionSteps(c, NOW, days));
    assert.deepEqual(first.errors, {});
    assert.equal(first.results.expiredSessions, 1);
    assert.equal(first.results.expiredPasswordResets, 1);
    assert.equal(first.results.aiUsageIp, 1);
    assert.equal(first.results.aiUsageRows, 1);
    assert.equal(first.results.aiUsageOrphans, 1);
    assert.equal(first.results.cancellationContact, 1);
    assert.equal(first.results.consentRecords, 1);
    assert.equal(first.results.deletionLedger, 1);

    assert.deepEqual((await q('SELECT token_hash FROM "Sessions" ORDER BY 1')).map((r) => r.token_hash), ['s-live', 's-recent']);
    assert.deepEqual((await q('SELECT ip_address FROM "AiUsage" WHERE user_id = $1 ORDER BY created_at', [u.id])).map((r) => r.ip_address), [null, '198.51.100.2']);
    const reasons = await q('SELECT user_name, email_address, notes, reason, anonymized_at FROM "CancellationReason" ORDER BY cancelled_at');
    assert.equal(reasons[0].user_name, null);
    assert.equal(reasons[0].email_address, null);
    assert.equal(reasons[0].notes, null);
    assert.equal(reasons[0].reason, 'Too expensive', 'the reason itself is kept');
    assert.equal(reasons[1].user_name, 'Recent Name', 'still within its period');
    assert.equal(Number((await q('SELECT count(*) FROM "CookieConsents"'))[0].count), 1);
    assert.equal(Number((await q('SELECT count(*) FROM "DeletionLedger"'))[0].count), 1);

    const second = await db.withClient((c) => job.runRetentionSteps(c, NOW, days));
    for (const [step, n] of Object.entries(second.results)) assert.equal(n, 0, `${step} changed rows on a rerun`);
  });

  test('a failing step is recorded, the other steps still run, and the next run recovers', async () => {
    const failing = { name: 'expiredSessions', run: async () => { throw new Error('simulated outage'); } };
    const rest = job.RETENTION_STEPS.filter((s) => s.name !== 'expiredSessions');
    const outcome = await db.withClient((c) => job.runRetentionSteps(c, NOW, rules.allRetentionDays({}), [failing, ...rest]));
    assert.equal(outcome.errors.expiredSessions, 'simulated outage');
    assert.equal(Object.keys(outcome.results).length, rest.length);
    assert.equal(job.runStatus(outcome), 'partial');
    const recovered = await db.withClient((c) => job.runRetentionSteps(c, NOW, rules.allRetentionDays({})));
    assert.equal(job.runStatus(recovered), 'ok');
  });

  test('runs are recorded, and only one runs at a time', async () => {
    const result = await retention.runRetention('admin');
    assert.equal(result.skipped, false);
    assert.equal(result.status, 'ok');
    const runs = await retention.listRetentionRuns(5);
    assert.equal(runs[0].id, result.runId);
    assert.equal(runs[0].status, 'ok');
    assert.equal(runs[0].trigger, 'admin');

    const stale = await retention.runRetention('scheduler', { onlyIfStale: true });
    assert.deepEqual(stale, { skipped: true, reason: 'recent' });

    // Another instance holding the lock
    const pg = (await import('pg')).default;
    const other = new pg.Client({ connectionString: url });
    await other.connect();
    await other.query(`SELECT pg_advisory_lock(hashtext('talkninja_retention_job'))`);
    try {
      assert.deepEqual(await retention.runRetention('admin'), { skipped: true, reason: 'locked' });
    } finally {
      await other.end();
    }
  });
});
