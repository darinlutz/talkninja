import { NextResponse } from 'next/server';
import { fetchVocabulary, SheetFormatError } from '@/lib/language';
import {
  connectedSheetResponse,
  getConnectedSheet,
  parseSheetLink,
  sheetCsvUrl,
  sheetViewUrl,
  VOCAB_SHEET_COOKIE,
} from '@/lib/vocabSheet';
import { getServiceAccountEmail } from '@/lib/vocabSheetWriter';
import { requireSignIn } from '@/lib/practiceAccess';

// The My Account page's Setup section; signed-in users only

// Which sheet the Language page is currently using
export async function GET() {
  const denied = await requireSignIn();
  if (denied) return denied;

  const sheet = await getConnectedSheet();
  return NextResponse.json({ connected: !!sheet, link: sheet ? sheetViewUrl(sheet) : null });
}

// Connects a Google Sheet after checking it can be read and has vocabulary
export async function POST(request: Request) {
  const denied = await requireSignIn();
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.link !== 'string' || !body.link.trim()) {
      return NextResponse.json({ error: 'Please paste a Google Sheet link' }, { status: 400 });
    }

    const sheet = parseSheetLink(body.link);
    if (!sheet) {
      return NextResponse.json(
        { error: 'That is not a Google Sheets link (it should start with https://docs.google.com/spreadsheets/)' },
        { status: 400 }
      );
    }

    let wordCount: number;
    try {
      wordCount = (await fetchVocabulary(sheetCsvUrl(sheet))).length;
    } catch (error) {
      // The Account page offers to erase a wrongly formatted sheet and fill it with samples
      if (error instanceof SheetFormatError) {
        return NextResponse.json(
          {
            error: error.message,
            formatError: true,
            canReset: sheet.kind === 'doc' && !!getServiceAccountEmail(),
            serviceAccountEmail: getServiceAccountEmail(),
          },
          { status: 422 }
        );
      }
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Could not read that Google Sheet' },
        { status: 400 }
      );
    }

    return connectedSheetResponse(sheet, wordCount);
  } catch (error) {
    console.error('Connect sheet error:', error);
    return NextResponse.json({ error: 'Failed to connect the Google Sheet' }, { status: 500 });
  }
}

// Goes back to the built-in vocabulary sheet
export async function DELETE() {
  const denied = await requireSignIn();
  if (denied) return denied;

  const response = NextResponse.json({ success: true });
  response.cookies.delete(VOCAB_SHEET_COOKIE);
  return response;
}
