import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runRetention } from '@/lib/retention';

// The Render Cron Job's trigger for the daily retention job (src/lib/retention.ts):
//   curl -fsS -X POST -H "Authorization: Bearer $RETENTION_CRON_SECRET" https://talkninja.app/api/cron/retention
// Answers 404 unless RETENTION_CRON_SECRET is set and the request carries it, so the route isn't advertised.
// Returns only counts and step names, never data.

function authorized(request: Request): boolean {
  const secret = process.env.RETENTION_CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  // Hashing both makes the comparison constant-time regardless of length
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export async function POST(request: Request) {
  if (!authorized(request)) return notFound();
  try {
    const result = await runRetention('cron');
    const status = result.skipped ? 200 : result.status === 'ok' ? 200 : 500;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error('Retention cron error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Retention run failed' }, { status: 500 });
  }
}

export const GET = notFound;
