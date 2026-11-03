import { NextResponse } from 'next/server';
import { withClient } from '@/lib/db';
import type { Queryable } from '@/lib/deletionLedger';
import { confirmPassword, PASSWORD_CHECK_ERRORS } from '@/lib/passwordConfirmation';
import { buildPersonalDataExport } from '@/lib/personalDataExport';
import { getCurrentUser } from '@/lib/session';
import { ensureUserSchema } from '@/lib/users';

// Download My Data (Account page → Privacy & Data). Body: { password }. Returns the signed-in account's data as a
// JSON file (src/lib/personalDataExport.ts). Works only on the session's own account (it takes no user ID) and
// needs the current password. Nothing is stored: the file is built for this response and not cached.
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Please log in again' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    const check = await confirmPassword(user.id, password);
    if (check !== 'ok') {
      const { error, status } = PASSWORD_CHECK_ERRORS[check];
      return NextResponse.json({ error }, { status });
    }

    await ensureUserSchema();
    const data = await withClient((client) => buildPersonalDataExport(client as unknown as Queryable, user.id));
    if (!data) {
      return NextResponse.json({ error: 'Please log in again' }, { status: 401 });
    }
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="talkninja-my-data-${date}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Data export error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Your data could not be downloaded. Please try again.' }, { status: 500 });
  }
}
