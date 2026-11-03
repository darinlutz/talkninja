// Runs once when a Next.js server instance starts (Next.js's instrumentation hook). Starts the retention job's
// fallback scheduler (src/lib/retention.ts) in the Node.js server only. The primary trigger is the Render Cron Job
// (POST /api/cron/retention); see docs/privacy.md.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startRetentionScheduler } = await import('./lib/retention');
    startRetentionScheduler();
  }
}
