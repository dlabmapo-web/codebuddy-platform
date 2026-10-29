import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { contextFixture, manifestFixture, nativeFixture, compatibilityFixture } from '../../../shared/src/testing/grading-runtime-fixtures.js';
import { admitRuntime } from './runtime-admission.js';
import { gradingSnapshotFor } from './grading-profile.js';
import { defaultEliceGradingProfile, legacyCaseGrading } from '@cove/shared';
import { exerciseProfileColumns } from './grading-profile.js';
import { requireRuntimeReadiness } from './runtime-readiness.js';
vi.mock('./runtime-readiness.js', () => ({ requireRuntimeReadiness: vi.fn(async () => undefined) }));

describe('runtime admission', () => {
  it('leaves no-manifest legacy operation usable without a tenant/runtime lookup', async () => {
    const db = { academy: { findUniqueOrThrow: vi.fn() } };
    expect(await admitRuntime(new ConfigService({}), db as never, contextFixture)).toBeUndefined();
    expect(db.academy.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it('freezes role-independent native identity and v4 comparator policy, refusing unfundable authored memory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cove-admission-'));
    try {
      const path = join(directory, 'manifest.json'); await writeFile(path, JSON.stringify(manifestFixture));
      const config = new ConfigService({ GRADING_RUNTIME_MANIFEST_PATH: path, GRADING_NATIVE_ENABLED: true });
      const db = { academy: { findUniqueOrThrow: async () => ({ organizationId: contextFixture.organizationId }) } };
      const descriptor = await admitRuntime(config, db as never, contextFixture);
      expect(descriptor).toEqual(nativeFixture);
      const source = { ...exerciseProfileColumns(defaultEliceGradingProfile), gradingSemanticVersion: "elice-v1", timeLimitMs: 1000, memoryLimitMb: 128,
        testCases: [{ ...legacyCaseGrading, input: '', expectedOutput: 'ok', visibility: 'SAMPLE' as const, label: null }] };
      const frozen = gradingSnapshotFor(source, { engineVersion: '0.27.5', descriptor });
      expect(frozen.submission.executionRuntimeSnapshot).toEqual(nativeFixture);
      expect(frozen.submission.gradingPolicySnapshot).toMatchObject({ version: 4, runtime: nativeFixture, comparator: { engineVersion: '0.27.5' } });
      const compatibilityConfig = new ConfigService({ GRADING_RUNTIME_MANIFEST_PATH: path });
      expect(await admitRuntime(compatibilityConfig, db as never, contextFixture)).toEqual(compatibilityFixture);
      await expect(admitRuntime(config, db as never, { ...contextFixture, memoryLimitMb: 4096 })).rejects.toThrow();
      await writeFile(path, '{}');
      expect(await admitRuntime(config, db as never, contextFixture)).toEqual(nativeFixture);
      vi.mocked(requireRuntimeReadiness).mockRejectedValueOnce(new Error('cleanup fault'));
      await expect(admitRuntime(config, db as never, contextFixture)).rejects.toMatchObject({ code: 'GRADING_UNAVAILABLE' });
      expect(descriptor).toEqual(nativeFixture);
      vi.mocked(requireRuntimeReadiness).mockRejectedValueOnce(new Error('missing worker'));
      await expect(admitRuntime(compatibilityConfig, db as never, contextFixture)).rejects.toMatchObject({ code: 'GRADING_UNAVAILABLE' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
