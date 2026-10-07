import { query } from './db';
import { ensureUserSchema } from './users';

// Long enough for a few sentences about what to focus on
export const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 1000;

// The user's instructions for the word picker agent, or null if they
// haven't added any
export async function getCustomAgentInstructions(userId: number): Promise<string | null> {
  await ensureUserSchema();
  const rows = await query<{ instructions: string }>(
    'SELECT instructions FROM "CustomAgentInstructions" WHERE user_id = $1',
    [userId]
  );
  return rows[0]?.instructions ?? null;
}

// Adds or replaces the user's instructions; blank instructions remove them
export async function saveCustomAgentInstructions(userId: number, instructions: string): Promise<string | null> {
  await ensureUserSchema();
  const trimmed = instructions.trim();
  if (!trimmed) {
    await query('DELETE FROM "CustomAgentInstructions" WHERE user_id = $1', [userId]);
    return null;
  }

  await query(
    `INSERT INTO "CustomAgentInstructions" (user_id, instructions)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET instructions = EXCLUDED.instructions, updated_at = now()`,
    [userId, trimmed]
  );
  return trimmed;
}
