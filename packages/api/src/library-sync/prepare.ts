import type { PrismaClient } from '../generated/prisma/client.js';
import { AuditService } from '../academies/audit.service.js';
import { captureTree, lockCourseRow, releaseBlockers } from './release.js';
import { latestOrInitialRelease, latestRelease } from './release-access.js';

/** One bounded, idempotent maintenance transaction per master, before API startup. */
export async function prepareLibrarySync(db: PrismaClient, options: { checkOnly?: boolean; enableAllAcademies?: boolean } = {}) {
  const masters = await db.course.findMany({
    where: { isVisible: true, retiredAt: null, academy: { kind: 'LIBRARY' } },
    select: { id: true }, orderBy: { id: 'asc' },
  });
  let initialReleases = 0;
  for (const master of masters) {
    const missing = await db.$transaction(async tx => {
      await lockCourseRow(tx, master.id);
      // Recheck under the lock: publishing/retiring may race discovery.
      const eligible = await tx.course.findFirst({ where: { id: master.id, isVisible: true, retiredAt: null, academy: { kind: 'LIBRARY' } }, select: { id: true } });
      if (!eligible || await latestRelease(tx, master.id)) return false;
      if (options.checkOnly) {
        const blockers = await releaseBlockers(tx, await captureTree(tx, master.id), true);
        if (blockers.length) throw Error(`Initial library snapshot blocked for ${master.id}: ${blockers.slice(0, 5).join(', ')}`);
      } else await latestOrInitialRelease(tx, master.id, new AuditService());
      return true;
    }, { timeout: 60_000 });
    if (missing) initialReleases++;
  }
  // This is an explicit all-academy release operation. It never links legacy
  // copies or rewrites their baselines/content. Per-copy pauses still apply.
  const enabledAcademies = options.enableAllAcademies && !options.checkOnly
    ? await db.$executeRaw`
        INSERT INTO academy_feature_flags (academy_id, feature, is_enabled, created_at, updated_at)
        SELECT id, 'LIBRARY_COURSE_SYNC'::"AcademyFeature", true, now(), now()
        FROM academies WHERE kind='ACADEMY' AND status='ACTIVE'
        ON CONFLICT (academy_id, feature) DO UPDATE SET is_enabled=true, updated_at=now()
        WHERE NOT academy_feature_flags.is_enabled`
    : 0;
  return { checkOnly: Boolean(options.checkOnly), publishedMasters: masters.length, initialReleases, enabledAcademies };
}
