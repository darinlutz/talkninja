import { notFound } from 'next/navigation';
import AiModelCostTable from '@/components/AiModelCostTable';
import AiModelManager from '@/components/AiModelManager';
import RateLimitManager from '@/components/RateLimitManager';
import UserRoleManager from '@/components/UserRoleManager';
import RetentionRunsCard from '@/components/RetentionRunsCard';
import { listRetentionRuns } from '@/lib/retention';
import { allRetentionDays, RETENTION_KEYS, RETENTION_RULES } from '@/lib/retentionRules';
import { availableAiModels, getAiModels } from '@/lib/aiModels';
import { getRateLimitSettings, listOverrides, readAverageCallTokens } from '@/lib/rateLimits';
import { isAdmin } from '@/lib/roles';
import { getCurrentUser } from '@/lib/session';
import { listUsersForAdmin } from '@/lib/users';

// The site owner's Admin page: AI Model Control (src/components/AiModelManager.tsx), AI Model Costs
// (src/components/AiModelCostTable.tsx), Rate Limiting with the AI usage report (src/components/RateLimitManager.tsx)
// User Roles (src/components/UserRoleManager.tsx) and Data Retention (src/components/RetentionRunsCard.tsx). Only for the Admin role, read from the database with the
// session; anyone else, signed in or not, gets a plain 404, so the page's existence isn't advertised.
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) notFound();

  const [models, rateLimits, overrides, users, measured, retentionRuns] = await Promise.all([
    getAiModels(),
    getRateLimitSettings(),
    listOverrides(),
    listUsersForAdmin(),
    readAverageCallTokens(),
    listRetentionRuns(10),
  ]);
  const retentionDays = allRetentionDays(process.env);
  const retentionRules = RETENTION_KEYS.map((key) => ({
    key,
    description: RETENTION_RULES[key].description,
    days: retentionDays[key],
  }));
  const available = availableAiModels();

  return (
    <section className="py-12 px-4 bg-gradient-to-b from-slate-100 to-white flex justify-center">
      <div className="w-full max-w-6xl space-y-6">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-powder-600 via-powder-500 to-powder-600 bg-clip-text text-transparent">
          Admin
        </h1>
        <AiModelManager models={models} availableModels={available} />
        <AiModelCostTable measured={measured} availableModels={available} />
        <RateLimitManager settings={rateLimits} overrides={overrides} users={users} />
        <UserRoleManager users={users} currentUserId={user.id} />
        <RetentionRunsCard runs={retentionRuns} rules={retentionRules} />
      </div>
    </section>
  );
}
