// The look of the emails the site sends to its users (the email address confirmation, the password reset): the
// TalkNinja logo, a white card with the message and a blue button, a strip of the eight belt colors, and a footer,
// in the site's colors (src/app/globals.css). No imports, so tests render it directly.
//
// Built for email apps rather than browsers: tables for layout, every style inline, no web fonts, CSS or SVG (Gmail
// and Outlook drop them), the logo as an absolute URL on the site (public/email/talkninja-icon.png, the ninja of
// src/app/icon.svg at 96 px) with a fixed size, the name beside it as text so it shows with images blocked, and the
// link written out under the button for email apps that strip buttons.

const COLORS = {
  page: '#f1f5f9',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  primary: '#155dfc',
};

// White to Black, the order they're earned in (src/lib/languageLevels.ts)
const BELTS = ['#ffffff', '#22c55e', '#facc15', '#f97316', '#155dfc', '#ef4444', '#92400e', '#0f172a'];

const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export type EmailContent = {
  siteUrl: string;
  subject: string;
  heading: string;
  // Paragraphs before the button
  intro: string[];
  button: { label: string; url: string };
  // Under the button: how long the link lasts
  note?: string;
  // Small print at the bottom of the card, e.g. what to do when it wasn't you
  footnote: string;
};

const LINK_FALLBACK = "If the button doesn't work, copy this link into your browser:";

export function renderEmail(email: EmailContent): { html: string; text: string } {
  const site = email.siteUrl.replace(/\/+$/, '');
  const host = site.replace(/^https?:\/\//, '');
  const url = escapeHtml(email.button.url);
  const paragraph = (text: string) =>
    `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:24px;color:${COLORS.text};">${escapeHtml(text)}</p>`;
  const belts = BELTS.map(
    (color) => `<td width="12.5%" height="6" style="height:6px;background-color:${color};font-size:0;line-height:0;">&nbsp;</td>`
  ).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(email.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(email.intro[0] ?? '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.page};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td align="left" style="padding:0 0 20px;">
            <a href="${escapeHtml(site)}" style="text-decoration:none;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:12px;">
                    <img src="${escapeHtml(site)}/email/talkninja-icon.png" width="44" height="44" alt=""
                      style="display:block;border:0;outline:none;width:44px;height:44px;border-radius:10px;">
                  </td>
                  <td valign="middle" style="font-family:${FONT};font-size:26px;line-height:32px;font-weight:700;color:${COLORS.text};">Talk<span style="color:${COLORS.primary};">Ninja</span></td>
                </tr>
              </table>
            </a>
          </td>
        </tr>
        <tr>
          <td style="background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="height:6px;background-color:${COLORS.primary};font-size:0;line-height:0;">&nbsp;</td></tr>
              <tr>
                <td style="padding:32px 32px 8px;">
                  <h1 style="margin:0 0 20px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;color:${COLORS.text};">${escapeHtml(email.heading)}</h1>
                  ${email.intro.map(paragraph).join('\n                  ')}
                </td>
              </tr>
              <tr>
                <td align="left" style="padding:8px 32px 24px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" bgcolor="${COLORS.primary}" style="border-radius:8px;">
                        <a href="${url}" target="_blank"
                          style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(email.button.label)}</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 28px;">
                  ${email.note ? `<p style="margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:21px;color:${COLORS.muted};">${escapeHtml(email.note)}</p>` : ''}
                  <p style="margin:0 0 6px;font-family:${FONT};font-size:13px;line-height:19px;color:${COLORS.muted};">${LINK_FALLBACK}</p>
                  <p style="margin:0;font-family:${FONT};font-size:13px;line-height:19px;word-break:break-all;"><a href="${url}" style="color:${COLORS.primary};text-decoration:underline;">${url}</a></p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 32px 24px;border-top:1px solid ${COLORS.border};">
                  <p style="margin:0;font-family:${FONT};font-size:13px;line-height:19px;color:${COLORS.muted};">${escapeHtml(email.footnote)}</p>
                </td>
              </tr>
              <tr>
                <td style="font-size:0;line-height:0;border-top:1px solid ${COLORS.border};">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${belts}</tr></table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 16px 0;">
            <p style="margin:0 0 4px;font-family:${FONT};font-size:13px;line-height:19px;font-weight:700;color:${COLORS.text};">New Language. Next Belt.</p>
            <p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};">
              <a href="${escapeHtml(site)}" style="color:${COLORS.muted};text-decoration:underline;">${escapeHtml(host)}</a> &middot; Clarivex, LLC
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    email.heading,
    '',
    ...email.intro.flatMap((p) => [p, '']),
    `${email.button.label}: ${email.button.url}`,
    '',
    ...(email.note ? [email.note, ''] : []),
    email.footnote,
    '',
    `-- \nTalkNinja · ${host}`,
  ].join('\n');

  return { html, text };
}

// Sends one of these emails through Resend. False when it couldn't be sent (never throws).
export async function sendUserEmail(to: string, subject: string, body: { html: string; text: string }): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error(`Resend API key not configured. "${subject}" email not sent.`);
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to,
        subject,
        text: body.text,
        html: body.html,
      }),
    });
    if (!response.ok) {
      // Resend's reason (e.g. the sender's domain isn't verified), never the recipient's address
      console.error(`Resend API error sending "${subject}" (HTTP ${response.status}):`, await response.json().catch(() => ({})));
      return false;
    }
    return true;
  } catch (error) {
    console.error(`"${subject}" email failed:`, error instanceof Error ? error.message : error);
    return false;
  }
}
