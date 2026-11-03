import Stripe from 'stripe';
import { ACCOUNT_STATUS } from './accountStatus';
import { transaction } from './db';
import { deleteAccountRows, type Queryable } from './deletionLedger';
import { ensureUserSchema, type User } from './users';

// Delete My Account, server side (DELETE /api/account). The order makes partial failures safe to retry:
//   1. A live Stripe subscription is cancelled first, so a deleted account is never charged again. If Stripe fails,
//      nothing is deleted and the user can try again. Already-cancelled is fine (idempotent).
//   2. The account is deleted in one transaction with its ledger entry (src/lib/deletionLedger.ts). If that fails,
//      the subscription is already cancelled (the account shows Cancelled) and trying again finishes the job.
//   3. A confirmation email is sent. It never fails the deletion.
// The caller has already checked the session, the password and the typed confirmation.

export class StripeNotConfiguredError extends Error {}

export type DeletionOutcome = { deleted: boolean; subscriptionCancelled: boolean };

export async function deleteAccount(user: User): Promise<DeletionOutcome> {
  await ensureUserSchema();
  let subscriptionCancelled = false;
  if (user.accountStatus === ACCOUNT_STATUS.subscribed && user.stripeSubscriptionId) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) throw new StripeNotConfiguredError('Stripe is not configured');
    try {
      await new Stripe(stripeSecretKey).subscriptions.cancel(user.stripeSubscriptionId);
      subscriptionCancelled = true;
    } catch (error) {
      // Already gone in Stripe (e.g. cancelled in the Dashboard) is fine; anything else stops the deletion so
      // they aren't billed for a deleted account
      if ((error as { code?: string }).code !== 'resource_missing') throw error;
    }
  }

  const entry = await transaction(async (client) => {
    const result = await deleteAccountRows(client as unknown as Queryable, user.id);
    // An Admin or a vanished account: undo the ledger row too
    if (!result) throw new AccountNotDeletableError();
    return result;
  }).catch((error) => {
    if (error instanceof AccountNotDeletableError) return null;
    throw error;
  });

  if (entry) {
    // Only the account ID, never the email address, in the logs
    console.log(`Account deleted: user ${user.id}`);
    await sendAccountDeletedEmail(user);
  }
  return { deleted: !!entry, subscriptionCancelled };
}

class AccountNotDeletableError extends Error {}

// Tells the (former) account holder their account was deleted, so an unexpected deletion is noticed. The email
// address is used for this one message and isn't kept.
async function sendAccountDeletedEmail(user: User): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: user.emailAddress,
        subject: 'Your TalkNinja account has been deleted',
        text:
          `Hello ${user.userName},\n\n` +
          'Your TalkNinja account and its learning data have been deleted, as you asked. ' +
          'Any subscription was cancelled and you will not be charged again.\n\n' +
          'If you did not ask for this, contact support@talkninja.app right away.\n\n' +
          'TalkNinja',
      }),
    });
    if (!response.ok) console.error(`Account deletion email failed (HTTP ${response.status})`);
  } catch (error) {
    console.error('Account deletion email failed:', error instanceof Error ? error.message : error);
  }
}
