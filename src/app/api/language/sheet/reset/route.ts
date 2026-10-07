import { NextResponse } from 'next/server';
import { fetchVocabulary } from '@/lib/language';
import { connectedSheetResponse, parseSheetLink, sheetCsvUrl } from '@/lib/vocabSheet';
import { getServiceAccountEmail, resetSheetToSample } from '@/lib/vocabSheetWriter';

// Erases a wrongly formatted Google Sheet, fills it with sample words in the
// vocabulary format, and connects it. The Account page confirms with the user first.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.link !== 'string' || !body.link.trim()) {
      return NextResponse.json({ error: 'Please paste a Google Sheet link' }, { status: 400 });
    }

    const sheet = parseSheetLink(body.link);
    if (!sheet) {
      return NextResponse.json({ error: 'That is not a Google Sheets link' }, { status: 400 });
    }

    if (!getServiceAccountEmail()) {
      return NextResponse.json(
        { error: 'Resetting sheets is not configured on this site' },
        { status: 500 }
      );
    }

    try {
      await resetSheetToSample(sheet);
    } catch (error) {
      console.error('Reset sheet error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to reset the Google Sheet' },
        { status: 400 }
      );
    }

    // Reads it back the same way the Language page will
    let wordCount: number;
    try {
      wordCount = (await fetchVocabulary(sheetCsvUrl(sheet))).length;
    } catch (error) {
      return NextResponse.json(
        {
          error: `The sheet was reset with sample words, but could not be read back: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        },
        { status: 400 }
      );
    }

    return connectedSheetResponse(sheet, wordCount);
  } catch (error) {
    console.error('Reset sheet error:', error);
    return NextResponse.json({ error: 'Failed to reset the Google Sheet' }, { status: 500 });
  }
}
