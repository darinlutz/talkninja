// Deleting an account, and the ledger that lets a deletion be made again after a database backup is restored.
// Takes a pg client (or anything with the same query method) instead of importing src/lib/db.ts, so the server
// (src/lib/accountDeletionServer.ts), the restore script (scripts/reapply-deletions.mjs) and the database tests all
// run the same statements. Every statement is scoped to one account and is safe to run again.
//
// What deleting an account does, in one transaction:
//   1. Records { user_id, account_created_at } in "DeletionLedger" (no other personal data).
//   2. Unlinks the account's "AiUsage" rows (user_id = NULL), which have no foreign key; they stay, anonymous, until
//      their own retention period ends.
//   3. Deletes the "Users" row. Every table that belongs to the user references it ON DELETE CASCADE ("Sessions",
//      "PasswordResets", "UserLanguageProgress", "LanguageActivity", "CustomAgentInstructions",
//      "RateLimitOverrides", "PolicyAcceptances"), so those rows go with it. "CookieConsents" and
//      "CancellationReason" are ON DELETE SET NULL: kept as evidence and for statistics, purged by the retention job.
// Admin accounts are never deleted (there must always be an Admin): the delete matches no row and the transaction
// is rolled back.

export type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
};

export type LedgerEntry = { userId: number; accountCreatedAt: Date };

// The role that can't be deleted. 'Admin' is ROLES.admin (src/lib/roles.ts), written out so this file has no imports.
const ADMIN_ROLE = 'Admin';

// Deletes the account on a client that is already inside a transaction. Returns the ledger entry, or null when
// there's no such account or it's an Admin (the caller must then roll back).
export async function deleteAccountRows(client: Queryable, userId: number): Promise<LedgerEntry | null> {
  const found = await client.query('SELECT created_at, role FROM "Users" WHERE id = $1 FOR UPDATE', [userId]);
  const row = found.rows[0];
  if (!row || row.role === ADMIN_ROLE) return null;
  const accountCreatedAt = row.created_at as Date;
  await client.query(
    `INSERT INTO "DeletionLedger" (user_id, account_created_at) VALUES ($1, $2)
     ON CONFLICT (user_id, account_created_at) DO NOTHING`,
    [userId, accountCreatedAt]
  );
  await client.query('UPDATE "AiUsage" SET user_id = NULL WHERE user_id = $1', [userId]);
  const deleted = await client.query('DELETE FROM "Users" WHERE id = $1 AND role <> $2', [userId, ADMIN_ROLE]);
  return deleted.rowCount ? { userId, accountCreatedAt } : null;
}

// The ledger, oldest first, for copying out of the live database before a restore
export async function readLedger(client: Queryable): Promise<LedgerEntry[]> {
  const { rows } = await client.query('SELECT user_id, account_created_at FROM "DeletionLedger" ORDER BY deleted_at, id');
  return rows.map((r) => ({ userId: Number(r.user_id), accountCreatedAt: new Date(r.account_created_at as string | Date) }));
}

// Makes each ledger entry's deletion again on a (restored) database: copies the entry into its ledger and deletes
// the account if one with the same ID *and* creation time is there, so an account that later got a reused ID is
// never touched. Runs each entry in its own transaction. Returns how many accounts were deleted again.
export async function reapplyDeletions(
  client: Queryable,
  entries: LedgerEntry[]
): Promise<{ restoredEntries: number; accountsDeleted: number }> {
  let restoredEntries = 0;
  let accountsDeleted = 0;
  for (const entry of entries) {
    await client.query('BEGIN');
    try {
      const inserted = await client.query(
        `INSERT INTO "DeletionLedger" (user_id, account_created_at) VALUES ($1, $2)
         ON CONFLICT (user_id, account_created_at) DO NOTHING`,
        [entry.userId, entry.accountCreatedAt]
      );
      restoredEntries += inserted.rowCount ?? 0;
      const match = await client.query('SELECT 1 FROM "Users" WHERE id = $1 AND created_at = $2', [
        entry.userId,
        entry.accountCreatedAt,
      ]);
      if (match.rows.length > 0 && (await deleteAccountRows(client, entry.userId))) accountsDeleted++;
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  return { restoredEntries, accountsDeleted };
}
