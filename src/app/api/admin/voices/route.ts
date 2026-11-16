import { NextResponse } from 'next/server';
import { adminNotFound, checkAdminAccess } from '@/lib/adminAccess';
import { isLanguage } from '@/lib/languages';
import {
  isElevenLabsModel,
  isValidVoiceId,
  isVoiceGender,
  modelSupportsLanguage,
} from '@/lib/voiceConfig';
import { listVoiceSettingsForAdmin, resetVoiceSettings, saveVoiceSettings } from '@/lib/voiceSettings';

// The Admin page's Voice Management (src/components/VoiceManager.tsx). Admin role only; anyone else gets a 404.
//   PUT    { language, maleVoiceId, femaleVoiceId, maleEnabled, femaleEnabled, defaultGender, model }
//          saves a language's voices (an empty voice ID or model means the environment variable's / the default)
//   DELETE { language } resets it to the environment variables and the default model
// Both answer with every language's settings. Changes apply to the next audio request (within 5 s on every server).

function optionalVoiceId(value: unknown): { ok: true; id: string | null } | { ok: false } {
  if (value === null || value === undefined || value === '') return { ok: true, id: null };
  const id = typeof value === 'string' ? value.trim() : value;
  return isValidVoiceId(id) ? { ok: true, id } : { ok: false };
}

export async function PUT(request: Request) {
  const access = await checkAdminAccess();
  if (access.denied) return access.denied;

  try {
    const body = await request.json().catch(() => ({}));
    if (!isLanguage(body.language)) {
      return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
    }
    const male = optionalVoiceId(body.maleVoiceId);
    const female = optionalVoiceId(body.femaleVoiceId);
    if (!male.ok || !female.ok) {
      return NextResponse.json(
        { error: 'A voice ID is the 20 letters and digits ElevenLabs shows for the voice (or empty for the default)' },
        { status: 400 }
      );
    }
    if (typeof body.maleEnabled !== 'boolean' || typeof body.femaleEnabled !== 'boolean' || !isVoiceGender(body.defaultGender)) {
      return NextResponse.json({ error: 'Invalid settings' }, { status: 400 });
    }
    const model = body.model === null || body.model === '' || body.model === undefined ? null : body.model;
    if (model !== null && !isElevenLabsModel(model)) {
      return NextResponse.json({ error: 'Unknown ElevenLabs model' }, { status: 400 });
    }
    if (model !== null && !modelSupportsLanguage(model, body.language)) {
      return NextResponse.json({ error: `${model} does not speak ${body.language}` }, { status: 400 });
    }

    await saveVoiceSettings(
      body.language,
      {
        maleVoiceId: male.id,
        femaleVoiceId: female.id,
        maleEnabled: body.maleEnabled,
        femaleEnabled: body.femaleEnabled,
        defaultGender: body.defaultGender,
        model,
      },
      access.user.id
    );
    console.log(`Voice settings for ${body.language} saved by user ${access.user.id}`);
    return NextResponse.json({ languages: await listVoiceSettingsForAdmin() });
  } catch (error) {
    console.error('Voice settings save error:', error);
    return NextResponse.json({ error: 'Failed to save the voice settings' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const access = await checkAdminAccess();
  if (access.denied) return access.denied;

  try {
    const body = await request.json().catch(() => ({}));
    if (!isLanguage(body.language)) {
      return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
    }
    await resetVoiceSettings(body.language);
    console.log(`Voice settings for ${body.language} reset by user ${access.user.id}`);
    return NextResponse.json({ languages: await listVoiceSettingsForAdmin() });
  } catch (error) {
    console.error('Voice settings reset error:', error);
    return NextResponse.json({ error: 'Failed to reset the voice settings' }, { status: 500 });
  }
}

export { adminNotFound as GET, adminNotFound as POST, adminNotFound as PATCH };
