import { NextResponse } from 'next/server';
import { passwordProblem } from '@/lib/passwordRules';
import { resetPasswordWithToken } from '@/lib/passwordReset';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!token || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }
    const problem = passwordProblem(password);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    const ok = await resetPasswordWithToken(token, password);
    if (!ok) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
