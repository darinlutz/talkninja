import { query, transaction } from './db';
import { ensureUserSchema } from './users';
import type { Language } from './languages';
import {
  MAX_BELT_LEVEL,
  PASSING_SCORE,
  type LanguageActivity,
  type LanguageProgress,
  type NextStep,
  type RecordedActivity,
} from './languageLevels';

function rowToProgress(row: Record<string, unknown>): LanguageProgress {
  const beltLevel = Number(row.belt_level);
  const nextStep = row.next_step as NextStep;
  return {
    language: row.language as Language,
    beltLevel,
    beltColor: row.belt_color as string,
    workingLevel: nextStep === 'complete' ? null : beltLevel + 1,
    nextStep,
  };
}

const PROGRESS_SELECT = `
  SELECT p.language, p.belt_level, p.next_step, b.belt_color
  FROM "UserLanguageProgress" p
  JOIN "BeltLevelKey" b ON b.level = p.belt_level`;

// Every language the user has started, alphabetically
export async function getLanguageProgress(userId: number): Promise<LanguageProgress[]> {
  await ensureUserSchema();
  const rows = await query(`${PROGRESS_SELECT} WHERE p.user_id = $1 ORDER BY p.language`, [userId]);
  return rows.map(rowToProgress);
}

// Saves a completed Training or a Reading/Writing test score, and moves the
// user to their next step when it was the step they were on:
//   training complete -> reading
//   reading >= 80%    -> writing
//   writing >= 80%    -> next belt level, starting with training
// Anything else (another level, a failed test, Fast Phrases/Words practice
// with a null level) is recorded but doesn't move them.
export async function recordLanguageActivity(
  userId: number,
  input: { language: Language; level: number | null; activity: LanguageActivity; score: number | null }
): Promise<RecordedActivity> {
  await ensureUserSchema();
  const { language, level, activity } = input;
  const score = activity === 'training' ? null : input.score;
  const passed = score === null ? null : score >= PASSING_SCORE;

  return transaction(async (client) => {
    await client.query(
      `INSERT INTO "UserLanguageProgress" (user_id, language) VALUES ($1, $2)
       ON CONFLICT (user_id, language) DO NOTHING`,
      [userId, language]
    );
    const {
      rows: [current],
    } = await client.query(
      'SELECT belt_level, next_step FROM "UserLanguageProgress" WHERE user_id = $1 AND language = $2 FOR UPDATE',
      [userId, language]
    );
    const beltLevel = Number(current.belt_level);
    const nextStep = current.next_step as NextStep;
    const wasNextStep = nextStep === activity && level === beltLevel + 1;

    await client.query(
      `INSERT INTO "LanguageActivity" (user_id, language, level, activity, score, passed, was_next_step)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, language, level, activity, score, passed, wasNextStep]
    );

    let newBeltLevel = beltLevel;
    let newNextStep: NextStep = nextStep;
    if (wasNextStep) {
      if (activity === 'training') {
        newNextStep = 'reading';
      } else if (activity === 'reading' && passed) {
        newNextStep = 'writing';
      } else if (activity === 'writing' && passed) {
        newBeltLevel = beltLevel + 1;
        newNextStep = newBeltLevel >= MAX_BELT_LEVEL ? 'complete' : 'training';
      }
    }

    const advanced = newNextStep !== nextStep || newBeltLevel !== beltLevel;
    if (advanced) {
      await client.query(
        `UPDATE "UserLanguageProgress" SET belt_level = $3, next_step = $4, updated_at = now()
         WHERE user_id = $1 AND language = $2`,
        [userId, language, newBeltLevel, newNextStep]
      );
    }

    const {
      rows: [row],
    } = await client.query(`${PROGRESS_SELECT} WHERE p.user_id = $1 AND p.language = $2`, [userId, language]);
    const progress = rowToProgress(row);

    return {
      progress,
      wasNextStep,
      advanced,
      newBelt: newBeltLevel !== beltLevel ? progress.beltColor : null,
    };
  });
}

// Adds a language to the user's profile at Level 0 (No Belt, next step
// Level 1 Training). Does nothing if they've already started it.
export async function startLanguage(userId: number, language: Language): Promise<LanguageProgress> {
  await ensureUserSchema();
  await query(
    `INSERT INTO "UserLanguageProgress" (user_id, language) VALUES ($1, $2)
     ON CONFLICT (user_id, language) DO NOTHING`,
    [userId, language]
  );
  const [row] = await query(`${PROGRESS_SELECT} WHERE p.user_id = $1 AND p.language = $2`, [userId, language]);
  return rowToProgress(row);
}

// Removes a language from the user's profile, but only while it's still at
// Level 0 (no belt earned). Its test score history is kept. Returns whether
// it was removed.
export async function removeLanguage(userId: number, language: Language): Promise<boolean> {
  await ensureUserSchema();
  const rows = await query(
    `DELETE FROM "UserLanguageProgress" WHERE user_id = $1 AND language = $2 AND belt_level = 0
     RETURNING language`,
    [userId, language]
  );
  return rows.length > 0;
}
