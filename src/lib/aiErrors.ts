import { NextResponse } from 'next/server';

// Error responses for API routes that call OpenAI. Server-only.

export const AI_OUT_OF_CREDITS_MESSAGE = 'The AI service is out of credits. Please try again later.';

// OpenAI's error code/type when the account has no credits left
const OUT_OF_CREDITS_CODES = ['credit_balance_exhausted', 'insufficient_quota'];

// True for an OpenAI "no credits remaining" error: a thrown OpenAI/LangChain
// error, or the raw body of a failed OpenAI response
export function isAiOutOfCredits(error: unknown): boolean {
  if (typeof error === 'string') {
    return OUT_OF_CREDITS_CODES.some((code) => error.includes(code));
  }
  if (!error || typeof error !== 'object') return false;

  const { code, type, message } = error as { code?: unknown; type?: unknown; message?: unknown };
  return (
    OUT_OF_CREDITS_CODES.includes(String(code)) ||
    OUT_OF_CREDITS_CODES.includes(String(type)) ||
    (typeof message === 'string' && OUT_OF_CREDITS_CODES.some((c) => message.includes(c)))
  );
}

// The JSON error response for a failed AI call: the out-of-credits message
// (503) when that's the cause, otherwise `fallback` (500)
export function aiErrorResponse(error: unknown, fallback: string) {
  if (isAiOutOfCredits(error)) {
    return NextResponse.json({ error: AI_OUT_OF_CREDITS_MESSAGE }, { status: 503 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
