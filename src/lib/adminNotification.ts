// Emails the site owner when a user signs up, buys a subscription, or
// cancels one. Never throws: a failed notification mustn't fail the signup
// or payment that triggered it.

const ADMIN_EMAIL = 'darinlutz@yahoo.com';
const APP_NAME = 'TalkNinja';

export type AdminEvent = 'signup' | 'monthly' | 'lifetime' | 'cancelled';

const EVENT_TEXT: Record<AdminEvent, { subject: string; body: string }> = {
  signup: { subject: 'New user sign up', body: `has just signed up for ${APP_NAME}` },
  monthly: { subject: 'Monthly subscription purchased', body: `has just purchased a monthly subscription for ${APP_NAME}` },
  lifetime: { subject: 'Lifetime subscription purchased', body: `has just purchased a lifetime subscription for ${APP_NAME}` },
  cancelled: { subject: 'Subscription cancelled', body: `has just cancelled their monthly subscription for ${APP_NAME}` },
};

export async function notifyAdmin(event: AdminEvent, userEmail: string): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error(`Resend API key not configured. Admin "${event}" email for ${userEmail} not sent.`);
    return;
  }

  const { subject, body } = EVENT_TEXT[event];
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to: ADMIN_EMAIL,
        subject: `${APP_NAME} app ${subject}`,
        text: `User ${userEmail} ${body}.`,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error(`Resend API error sending admin "${event}" email:`, error);
    }
  } catch (error) {
    console.error(`Admin "${event}" email failed:`, error);
  }
}
