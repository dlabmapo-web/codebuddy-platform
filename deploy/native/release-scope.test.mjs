import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseScope } from './release-scope.mjs';
const id = '10000000-0000-4000-8000-000000000001';
const row = { organizationId: id, academyId: id, materialId: id, gradingRevision: 1, caseCount: 2, stdinBytes: 100n, memoryLimitMb: 256, timeLimitMs: 1000, maxCaseTimeLimitMs: 5000 };
test('release metadata preserves authored overrides and retains earlier revisions', () => {
    const first = releaseScope([row]);
    assert.equal(first.included, 1);
    assert.equal(first.eligibility.length, 2);
    assert.equal(first.eligibility[0].timeLimitMs, 1000);
    assert.equal(first.eligibility[0].maxCaseTimeLimitMs, 5000);
    const second = releaseScope([{ ...row, gradingRevision: 2, maxCaseTimeLimitMs: 6000 }], first.eligibility);
    assert.equal(second.eligibility.length, 4);
    assert.throws(() => releaseScope([{ ...row, maxCaseTimeLimitMs: 6000 }], first.eligibility), /without a grading revision/);
});
test('metadata refuses unsupported shapes without changing authored limits', () => {
    const rows = [{ ...row, caseCount: 20 }, { ...row, stdinBytes: 65537n }, { ...row, memoryLimitMb: 1024 }, { ...row, maxCaseTimeLimitMs: 999 }];
    const result = releaseScope(rows);
    assert.equal(result.eligibility.length, 0);
    assert.deepEqual(result.excluded, { cases: 1, input: 1, memory: 1, timeout: 1 });
    assert.equal(rows[2].memoryLimitMb, 1024);
    assert.throws(() => releaseScope([{ ...row, academyId: 'arbitrary' }]), /identity/);
});
