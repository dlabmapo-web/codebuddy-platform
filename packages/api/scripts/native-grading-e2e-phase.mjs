import { readQueueBacklog } from './grading-inventory-queues.mjs';

/** Isolated fixture control only. All admission and execution paths stay real. */
export async function transitionFixturePhase(phase, { allowed, db, redis, timings, configurations }) {
  if (!allowed || !['baseline', 'candidate'].includes(phase))
    return { status: 403, body: { error: 'isolated_linux_acceptance_only' } };
  const backlog = await readQueueBacklog(redis);
  const pending = (await db.submission.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }))
    + (await db.staffPracticeAttempt.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }));
  if (pending || Object.values(backlog).some(count => count !== 0)
    || await db.gradingExecutionLease.count({ where: { retiredAt: null } })
    || await redis.scard('cove:grading:sample-leases'))
    return { status: 409, body: { error: 'phase_requires_reconciled_idle_authority' } };
  await timings.clear(); // idle phase boundary; only this fixture's diagnostics
  for (const config of configurations) config.set('GRADING_NATIVE_ENABLED', phase === 'candidate');
  return { status: 200, body: { phase } };
}
