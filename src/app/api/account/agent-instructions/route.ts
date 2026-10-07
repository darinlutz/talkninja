import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { MAX_CUSTOM_INSTRUCTIONS_LENGTH, saveCustomAgentInstructions } from '@/lib/customAgentInstructions';

// Saves the Account page's "Customize Training Experience" instructions for
// the signed-in user; blank instructions remove them
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.instructions !== 'string') {
      return NextResponse.json({ error: 'Missing instructions' }, { status: 400 });
    }
    if (body.instructions.trim().length > MAX_CUSTOM_INSTRUCTIONS_LENGTH) {
      return NextResponse.json(
        { error: `Instructions can be at most ${MAX_CUSTOM_INSTRUCTIONS_LENGTH} characters` },
        { status: 400 }
      );
    }

    const instructions = await saveCustomAgentInstructions(user.id, body.instructions);
    return NextResponse.json({ success: true, instructions });
  } catch (error) {
    console.error('Save agent instructions error:', error);
    return NextResponse.json({ error: 'Failed to save your instructions' }, { status: 500 });
  }
}
