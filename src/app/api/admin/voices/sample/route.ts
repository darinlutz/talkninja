import { NextResponse } from 'next/server';
import { adminNotFound, checkAdminAccess } from '@/lib/adminAccess';
import { aiErrorResponse } from '@/lib/aiErrors';
import { isLanguage } from '@/lib/languages';
import { ElevenLabsError } from '@/lib/elevenLabs';
import { elevenLabsSample } from '@/lib/speech';
import {
  elevenLabsLanguageCode,
  isElevenLabsModel,
  isValidVoiceId,
  isVoiceGender,
  modelSupportsLanguage,
} from '@/lib/voiceConfig';
import { listVoiceSettingsForAdmin } from '@/lib/voiceSettings';

// The Admin page's Play Sample and Test Voice (src/components/VoiceManager.tsx): speaks the sample text in one
// ElevenLabs voice, through the server so the API key never reaches the browser. Admin role only; anyone else gets a
// 404. Body: { language, gender, text, voiceId?, model? }: voiceId (and model) test a voice before it's saved;
// without them the language's current voice for that gender is used. No fallback to another voice, so a bad voice
// ID shows as an error. The Emergency AI Stop applies (src/lib/elevenLabs.ts).
const MAX_SAMPLE_LENGTH = 300;

export async function POST(request: Request) {
  const access = await checkAdminAccess();
  if (access.denied) return access.denied;

  try {
    const body = await request.json().catch(() => ({}));
    if (!isLanguage(body.language) || !isVoiceGender(body.gender)) {
      return NextResponse.json({ error: 'Pick a language and a voice' }, { status: 400 });
    }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > MAX_SAMPLE_LENGTH) {
      return NextResponse.json({ error: `Enter sample text of up to ${MAX_SAMPLE_LENGTH} characters` }, { status: 400 });
    }

    let voiceId: string | null = null;
    if (body.voiceId) {
      if (!isValidVoiceId(body.voiceId)) {
        return NextResponse.json({ error: 'That is not a valid ElevenLabs voice ID' }, { status: 400 });
      }
      voiceId = body.voiceId;
    }
    const current = (await listVoiceSettingsForAdmin()).find((row) => row.language === body.language)!;
    if (!voiceId) {
      voiceId = current.voices[body.gender as 'male' | 'female'].voiceId;
      if (!voiceId) {
        return NextResponse.json({ error: `${body.language} has no ${body.gender} ElevenLabs voice` }, { status: 400 });
      }
    }
    const model = isElevenLabsModel(body.model) ? body.model : current.model;
    if (!modelSupportsLanguage(model, body.language)) {
      return NextResponse.json({ error: `${model} does not speak ${body.language}` }, { status: 400 });
    }

    const audio = await elevenLabsSample({
      text,
      voiceId,
      model,
      languageCode: elevenLabsLanguageCode(body.language),
      language: body.language,
    });
    console.log(`Voice sample: ${body.language} ${body.gender} voice ${voiceId} (${model}) by user ${access.user.id}`);
    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof ElevenLabsError) {
      console.error('Voice sample error:', error.message);
      return NextResponse.json({ error: error.message }, { status: error.configProblem ? 400 : 502 });
    }
    console.error('Voice sample error:', error);
    return aiErrorResponse(error, 'Failed to play the sample');
  }
}

export { adminNotFound as GET, adminNotFound as PUT, adminNotFound as PATCH, adminNotFound as DELETE };
