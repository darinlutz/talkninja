// User emails: npm run test:email
//
// The branded layout every user email shares (src/lib/emailLayout.ts: the email address confirmation, the password
// reset and the account deletion notice), who they're sent from, and source guards on the signup and password
// recovery routes. No database, Resend or network needed.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SENDER, emailSender, REPLY_TO, renderEmail } from '../src/lib/emailLayout.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function sourceFiles(dir = path.join(ROOT, 'src')) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const sample = (overrides = {}) =>
  renderEmail({
    siteUrl: 'https://talkninja.app/',
    subject: 'Reset your TalkNinja password',
    heading: 'Reset your password',
    intro: ['Hi Ana, press the button to choose a new password.'],
    button: { label: 'Reset Password', url: 'https://talkninja.app/reset-password?token=abc&x=1' },
    note: 'This link expires in 1 hour and can only be used once.',
    footnote: "If you didn't ask for this, you can ignore this email.",
    ...overrides,
  });

describe('branded email layout', () => {
  test('shows the TalkNinja logo, name, colors, belts and footer', () => {
    const { html } = sample();
    assert.match(html, /src="https:\/\/talkninja\.app\/email\/talkninja-icon\.png"/, 'logo from the site, as an absolute URL');
    assert.ok(fs.existsSync(path.join(ROOT, 'public/email/talkninja-icon.png')), 'the logo file is published');
    assert.match(html, /Talk<span style="color:#155dfc;">Ninja<\/span>/, 'the name as text, for blocked images');
    assert.equal((html.match(/height="6" style="height:6px;background-color:/g) ?? []).length, 8, 'the eight belt colors');
    assert.ok(html.includes('New Language. Next Belt.'));
    assert.ok(html.includes('Clarivex, LLC'));
    assert.ok(html.includes('talkninja.app</a>'));
  });

  test('the button and the written-out link both carry the URL, escaped', () => {
    const { html, text } = sample();
    assert.equal((html.match(/href="https:\/\/talkninja\.app\/reset-password\?token=abc&#38;x=1"/g) ?? []).length, 2);
    assert.ok(text.includes('Reset Password: https://talkninja.app/reset-password?token=abc&x=1'), 'plain-text version');
    assert.ok(text.includes('TalkNinja · talkninja.app'));
  });

  test("a user's name can't inject HTML", () => {
    const { html } = sample({ heading: 'Welcome to the dojo, <img src=x onerror=alert(1)>' });
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&#60;img src=x onerror=alert(1)&#62;'));
  });

  test('a notice without a button has no button or link block', () => {
    const { html, text } = sample({ button: undefined, note: undefined });
    assert.ok(!html.includes("If the button doesn't work"));
    assert.ok(!html.includes('bgcolor="#155dfc"'));
    assert.ok(!text.includes('undefined'));
  });
});

describe('sender', () => {
  test('defaults to TalkNinja’s own address, never Resend’s onboarding address', () => {
    assert.equal(emailSender(undefined), DEFAULT_SENDER);
    assert.equal(emailSender('  '), DEFAULT_SENDER);
    assert.equal(DEFAULT_SENDER, 'TalkNinja <no-reply@talkninja.app>');
    assert.equal(emailSender('hello@talkninja.app'), 'TalkNinja <hello@talkninja.app>', 'a bare address gets the name');
    assert.equal(emailSender('Talk Ninja <no-reply@talkninja.app>'), 'Talk Ninja <no-reply@talkninja.app>');
    assert.equal(REPLY_TO, 'support@talkninja.app');
  });

  test('every email goes out through emailSender', () => {
    for (const file of sourceFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      assert.ok(!text.includes('onboarding@resend.dev'), `${path.relative(ROOT, file)} uses Resend's unbranded sender`);
      if (text.includes('api.resend.com/emails')) {
        assert.match(text, /from: emailSender\(\)/, `${path.relative(ROOT, file)} sets its own sender`);
      }
    }
  });

  test('every user email uses the branded layout', () => {
    for (const file of ['src/lib/emailVerification.ts', 'src/app/api/auth/forgot-password/route.ts', 'src/lib/accountDeletionServer.ts']) {
      const text = read(file);
      assert.match(text, /sendUserEmail\(/, file);
      assert.match(text, /renderEmail\(\{/, file);
    }
  });
});

describe('signup and password recovery (source guards)', () => {
  test('signup sends the activation link to the site’s real address', () => {
    const signup = read('src/app/api/auth/signup/route.ts');
    assert.match(signup, /sendVerificationEmail\(user, getPublicSiteUrl\(request\)\)/);
    const verify = read('src/lib/emailVerification.ts');
    assert.match(verify, /\$\{siteUrl\}\/api\/auth\/verify-email\?token=/);
    assert.match(verify, /VERIFY_TTL_MS = 3 \* 24 \* 60 \* 60 \* 1000/, '3 days');
    assert.match(verify, /DELETE FROM "EmailVerifications" WHERE token_hash = \$1 AND expires_at > \$2 RETURNING/, 'one use');
  });

  test('the reset link uses SITE_URL, lasts an hour, is used once and confirms the address', () => {
    const forgot = read('src/app/api/auth/forgot-password/route.ts');
    assert.match(forgot, /const siteUrl = getPublicSiteUrl\(request\)/);
    assert.match(forgot, /\$\{siteUrl\}\/reset-password\?token=\$\{token\}/);
    const reset = read('src/lib/passwordReset.ts');
    assert.match(reset, /RESET_TTL_MS = 60 \* 60 \* 1000/);
    assert.match(reset, /DELETE FROM "PasswordResets" WHERE user_id = \$1/);
    assert.match(reset, /markEmailVerified\(user\.id\)/);
    assert.match(read('src/lib/siteOrigin.ts'), /throw new Error\('SITE_URL is not set/, 'production refuses links from the Host header');
  });

  test('Forgot Password doesn’t reveal whether an address has an account', () => {
    const forgot = read('src/app/api/auth/forgot-password/route.ts');
    const unknown = forgot.slice(forgot.indexOf('if (!user) {'), forgot.indexOf('if (!user) {') + 80);
    assert.match(unknown, /return NextResponse\.json\(\{ success: true \}\);/, 'same answer as a sent email');
    assert.doesNotMatch(forgot, /not found|status: 404/i);
    assert.match(read('src/components/ForgotPasswordForm.tsx'), /If \{emailAddress\} has a TalkNinja account/);
  });

  test('only token hashes are stored', () => {
    for (const file of ['src/lib/emailVerification.ts', 'src/lib/passwordReset.ts']) {
      assert.match(read(file), /createHash\('sha256'\)/, file);
    }
  });
});
