import { NextResponse } from 'next/server';
import { adminNotFound, checkAdminAccess } from '@/lib/adminAccess';
import { listRetentionRuns, runRetention } from '@/lib/retention';

// The Admin page's Data Retention section: GET lists recent runs, POST runs the retention job now.
export async function GET() {
  const access = await checkAdminAccess();
  if (access.denied) return access.denied;
  try {
    return NextResponse.json({ runs: await listRetentionRuns(20) });
  } catch (error) {
    console.error('Retention runs error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to load retention runs' }, { status: 500 });
  }
}

export async function POST() {
  const access = await checkAdminAccess();
  if (access.denied) return access.denied;
  try {
    const result = await runRetention('admin');
    console.log(`Retention run started by user ${access.user.id}`);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Retention run error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'The retention job failed' }, { status: 500 });
  }
}

export { adminNotFound as PUT, adminNotFound as PATCH, adminNotFound as DELETE };
