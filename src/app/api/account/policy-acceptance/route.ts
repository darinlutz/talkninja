import { NextResponse } from 'next/server';
import { acceptCurrentTerms } from '@/lib/policyAcceptances';
import { acceptsCurrentTerms } from '@/lib/policyVersions';
import { getCurrentUser } from '@/lib/session';

// The updated Terms notice (src/components/PolicyUpdateNotice.tsx). Body: { versions: { terms }, ageConfirmed: true }.
// Records the signed-in user's acceptance of the current Terms; a page showing an older version is refused (409)
// so nobody "accepts" text they weren't shown.
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Please log in again' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    if (body.ageConfirmed !== true) {
      return NextResponse.json({ error: 'Please confirm your age' }, { status: 400 });
    }
    if (!acceptsCurrentTerms(body.versions)) {
      return NextResponse.json({ error: 'The Terms have changed. Please reload the page.' }, { status: 409 });
    }
    await acceptCurrentTerms(user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Policy acceptance error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Your acceptance could not be saved' }, { status: 500 });
  }
}
