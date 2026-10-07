import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Published-to-web CSV export of the user's personal Vietnamese vocabulary notes.
// Used until a visitor connects their own sheet on the Account page.
const DEFAULT_VOCAB_SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1IFBHrYHXXnM2QgdhRekn7OhQ7mIkun46IKQjO1agw_4/export?format=csv&gid=0';

export const VOCAB_SHEET_COOKIE = 'vocab_sheet';

// A Google Sheet is identified either by its document ID (from an editor or
// share link) or by its "Publish to web" ID (links containing /d/e/...).
export interface VocabSheet {
  kind: 'doc' | 'published';
  id: string;
  gid: string;
}

const SHEET_ID = /^[A-Za-z0-9_-]+$/;
const GID = /^\d+$/;

function isVocabSheet(value: unknown): value is VocabSheet {
  if (!value || typeof value !== 'object') return false;
  const sheet = value as Record<string, unknown>;
  return (
    (sheet.kind === 'doc' || sheet.kind === 'published') &&
    typeof sheet.id === 'string' &&
    SHEET_ID.test(sheet.id) &&
    typeof sheet.gid === 'string' &&
    GID.test(sheet.gid)
  );
}

// Accepts any docs.google.com/spreadsheets link and keeps only the IDs, so the
// server only ever fetches URLs it builds itself.
export function parseSheetLink(link: string): VocabSheet | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') return null;

  const published = url.pathname.match(/^\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)/);
  const doc = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  // The tab is in ?gid= or #gid=; default to the first tab
  const gid =
    url.searchParams.get('gid') ?? new URLSearchParams(url.hash.slice(1)).get('gid') ?? '0';
  if (!GID.test(gid)) return null;

  if (published) return { kind: 'published', id: published[1], gid };
  if (doc) return { kind: 'doc', id: doc[1], gid };
  return null;
}

export function sheetCsvUrl(sheet: VocabSheet): string {
  return sheet.kind === 'published'
    ? `https://docs.google.com/spreadsheets/d/e/${sheet.id}/pub?output=csv&gid=${sheet.gid}`
    : `https://docs.google.com/spreadsheets/d/${sheet.id}/export?format=csv&gid=${sheet.gid}`;
}

export function sheetViewUrl(sheet: VocabSheet): string {
  return sheet.kind === 'published'
    ? `https://docs.google.com/spreadsheets/d/e/${sheet.id}/pubhtml?gid=${sheet.gid}`
    : `https://docs.google.com/spreadsheets/d/${sheet.id}/edit#gid=${sheet.gid}`;
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Success response that also remembers the sheet for this browser.
export function connectedSheetResponse(sheet: VocabSheet, wordCount: number): NextResponse {
  const response = NextResponse.json({ success: true, link: sheetViewUrl(sheet), wordCount });
  response.cookies.set(VOCAB_SHEET_COOKIE, JSON.stringify(sheet), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
  return response;
}

// The sheet this visitor connected on the Account page, if any.
export async function getConnectedSheet(): Promise<VocabSheet | null> {
  try {
    const value = (await cookies()).get(VOCAB_SHEET_COOKIE)?.value;
    if (!value) return null;
    const sheet: unknown = JSON.parse(value);
    return isVocabSheet(sheet) ? sheet : null;
  } catch {
    // No request in scope, or a malformed cookie
    return null;
  }
}

export async function getVocabSheetCsvUrl(): Promise<string> {
  const sheet = await getConnectedSheet();
  return sheet ? sheetCsvUrl(sheet) : DEFAULT_VOCAB_SHEET_CSV_URL;
}
