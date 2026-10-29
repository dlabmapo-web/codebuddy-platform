import { HttpStatus } from '@nestjs/common';
import { executionEngineVersion, type RuntimeDescriptor, type RuntimeSelectionContext } from '@cove/shared';
import { guestBudget, ResourceBank } from '@cove/grading-runtime';
import { AppException } from '../common/app-exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { createRuntimeRegistry, loadRuntimeManifest } from './runtime-registry.js';

type Configuration = { get(key: string): unknown };
const registries = new WeakMap<Configuration, ReturnType<typeof loadRegistry>>();
async function loadRegistry(config: Configuration) {
  const path = config.get('GRADING_RUNTIME_MANIFEST_PATH');
  if (!path) return null;
  return createRuntimeRegistry({ enabled: config.get('GRADING_NATIVE_ENABLED') === true || config.get('GRADING_NATIVE_ENABLED') === 'true',
    manifest: await loadRuntimeManifest(String(path)), clientFactory: descriptor => ({ descriptor, version: executionEngineVersion(descriptor) }) });
}
/** Admission only. Workers resolve the recorded identity without reselecting a certification. */
export async function admitRuntime(config: Configuration, db: Pick<Prisma.TransactionClient, 'academy'>,
  context: Omit<RuntimeSelectionContext, 'organizationId'>): Promise<RuntimeDescriptor | undefined> {
  try {
    let pending = registries.get(config);
    if (!pending) { pending = loadRegistry(config); registries.set(config, pending); }
    const registry = await pending;
    if (!registry) return undefined;
    const academy = await db.academy.findUniqueOrThrow({ where: { id: context.academyId }, select: { organizationId: true } });
    const descriptor = registry.selectRuntime({ ...context, organizationId: academy.organizationId });
    // Use the broker's single physical budget authority. Never lower authored memory.
    const funding = new ResourceBank().tryReserve(guestBudget(descriptor.engine, context.memoryLimitMb));
    if (!funding) throw new Error('Unfundable grading profile');
    funding.release();
    return descriptor;
  } catch { throw new AppException('GRADING_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE); }
}
