import { HttpStatus } from '@nestjs/common';
import { executionEngineVersion, type RuntimeDescriptor, type RuntimeSelectionContext } from '@cove/shared';
import { guestBudget, ResourceBank } from '@cove/grading-runtime';
import { AppException } from '../common/app-exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { createRuntimeRegistry, loadRuntimeManifest } from './runtime-registry.js';
import { requireRuntimeReadiness, type ReadinessRedisProvider } from './runtime-readiness.js';

type Configuration = { get(key: string): unknown };
type RegistryGeneration = Readonly<{ path: string | null; enabled: boolean }>;
const registries = new WeakMap<Configuration, { key: string; pending: ReturnType<typeof loadRegistry> }>();
async function loadRegistry(generation: RegistryGeneration) {
  if (!generation.path) return null;
  return createRuntimeRegistry({ enabled: generation.enabled,
    manifest: await loadRuntimeManifest(generation.path), clientFactory: descriptor => ({ descriptor, version: executionEngineVersion(descriptor) }) });
}
/** Admission only. Workers resolve the recorded identity without reselecting a certification. */
export async function admitRuntime(config: Configuration, db: Pick<Prisma.TransactionClient, 'academy'>,
  context: Omit<RuntimeSelectionContext, 'organizationId'>, redis?: ReadinessRedisProvider): Promise<RuntimeDescriptor | undefined> {
  try {
    // Capture future-admission configuration before any await. A phase change
    // replaces this cache entry, never the immutable registry or accepted work
    // already held by another caller. Production normally changes via restart.
    const path = config.get('GRADING_RUNTIME_MANIFEST_PATH');
    const enabled = config.get('GRADING_NATIVE_ENABLED');
    const generation = { path: path ? String(path) : null, enabled: enabled === true || enabled === 'true' };
    const key = JSON.stringify(generation);
    let cached = registries.get(config);
    if (!cached || cached.key !== key) {
      cached = { key, pending: loadRegistry(generation) };
      registries.set(config, cached);
    }
    const registry = await cached.pending;
    if (!registry) return undefined;
    await requireRuntimeReadiness(config, registry.manifest, redis);
    const academy = await db.academy.findUniqueOrThrow({ where: { id: context.academyId }, select: { organizationId: true } });
    const descriptor = registry.selectRuntime({ ...context, organizationId: academy.organizationId });
    // Use the broker's single physical budget authority. Never lower authored memory.
    const funding = new ResourceBank().tryReserve(guestBudget(descriptor.engine, context.memoryLimitMb));
    if (!funding) throw new Error('Unfundable grading profile');
    funding.release();
    return descriptor;
  } catch { throw new AppException('GRADING_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE); }
}
