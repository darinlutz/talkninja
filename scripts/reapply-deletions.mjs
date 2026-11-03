// Re-applies account deletions to a restored database backup: npm run db:reapply-deletions
//
// A backup taken before someone deleted their account still contains that account. Before sending users to a
// restored database, run this with:
//   LEDGER_SOURCE_DATABASE_URL  the database whose "DeletionLedger" is complete (normally the current production
//                               database, before it's replaced; or a copy of its ledger)
//   TARGET_DATABASE_URL         the restored database
// It copies every ledger entry into the target and deletes each account there whose ID *and* creation time match
// (an account that later got a reused ID is never touched), using the same code as Delete My Account
// (src/lib/deletionLedger.ts). Safe to run more than once. Prints counts only, never personal data.
// See docs/privacy.md ("Backups").

import pg from 'pg';
import { readLedger, reapplyDeletions } from '../src/lib/deletionLedger.ts';

const source = process.env.LEDGER_SOURCE_DATABASE_URL;
const target = process.env.TARGET_DATABASE_URL;
if (!source || !target) {
  console.error('Set LEDGER_SOURCE_DATABASE_URL and TARGET_DATABASE_URL');
  process.exit(1);
}

const connect = async (connectionString) => {
  const client = new pg.Client({ connectionString, options: '-c search_path=talkninja' });
  await client.connect();
  return client;
};

const from = await connect(source);
const entries = await readLedger(from);
await from.end();
console.log(`Ledger entries read: ${entries.length}`);

const to = await connect(target);
try {
  const { restoredEntries, accountsDeleted } = await reapplyDeletions(to, entries);
  console.log(`Ledger entries copied into the target: ${restoredEntries}; accounts deleted again: ${accountsDeleted}`);
} finally {
  await to.end();
}
