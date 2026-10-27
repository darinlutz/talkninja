import { NextResponse } from 'next/server';
import { adminNotFound, checkAdminAccess } from '@/lib/adminAccess';
import { isAiFeature, isAiModelCategory, isAvailableAiModel, setAiModel } from '@/lib/aiModels';

// The Admin page's AI Model Control section. Body: { category, feature, model }; the model must be one of
// AI_MODELS whose provider has an API key set (src/lib/aiModels.ts). The feature's next call for that category
// uses it. Admin role only; anyone else gets a 404, like the Admin page.
export async function PUT(request: Request) {
  const access = await checkAdminAccess();
  if (access.denied) return access.denied;

  try {
    const body = await request.json().catch(() => ({}));
    if (!isAiModelCategory(body.category) || !isAiFeature(body.feature) || !isAvailableAiModel(body.model)) {
      return NextResponse.json({ error: 'Choose a category, a feature and an offered model' }, { status: 400 });
    }

    await setAiModel(body.category, body.feature, body.model, access.user.id);
    console.log(`AI model for ${body.feature} (${body.category}) set to ${body.model} by user ${access.user.id}`);
    return NextResponse.json({ category: body.category, feature: body.feature, model: body.model });
  } catch (error) {
    console.error('AI model setting error:', error);
    return NextResponse.json({ error: 'Failed to save the setting' }, { status: 500 });
  }
}

export { adminNotFound as GET, adminNotFound as POST, adminNotFound as PATCH, adminNotFound as DELETE };
