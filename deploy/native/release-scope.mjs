const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const key = entry => [entry.organizationId, entry.academyId, entry.materialId, entry.gradingRevision, entry.context].join('/');

/** Metadata eligibility only; execution readiness and semantic qualification are separate gates. */
export function releaseScope(rows, retained = []) {
    const entries = new Map(retained.map(entry => [key(entry), entry]));
    const excluded = { cases: 0, input: 0, memory: 0, timeout: 0 };
    let included = 0;
    for (const row of rows) {
        if (![row.organizationId, row.academyId, row.materialId].every(value => uuid.test(value ?? '')) || !Number.isInteger(row.gradingRevision) || row.gradingRevision < 0)
            throw Error('Invalid exercise scope identity');
        if (!Number.isInteger(row.caseCount) || row.caseCount < 1 || row.caseCount > 10) { excluded.cases++; continue; }
        if (!Number.isSafeInteger(Number(row.stdinBytes)) || Number(row.stdinBytes) < 0 || Number(row.stdinBytes) > 65536) { excluded.input++; continue; }
        if (!Number.isInteger(row.memoryLimitMb) || row.memoryLimitMb < 16 || row.memoryLimitMb > 512) { excluded.memory++; continue; }
        if (![row.timeLimitMs, row.maxCaseTimeLimitMs].every(value => Number.isInteger(value) && value > 0 && value <= 120000) || row.maxCaseTimeLimitMs < row.timeLimitMs) { excluded.timeout++; continue; }
        for (const context of ['live', 'preview']) {
            const entry = { organizationId: row.organizationId, academyId: row.academyId, materialId: row.materialId, gradingRevision: row.gradingRevision,
                context, kinds: ['official', 'staff-practice', 'sample', 'regrade'], memoryLimitMb: row.memoryLimitMb, timeLimitMs: row.timeLimitMs,
                ...(row.maxCaseTimeLimitMs > row.timeLimitMs ? { maxCaseTimeLimitMs: row.maxCaseTimeLimitMs } : {}) };
            const previous = entries.get(key(entry));
            if (previous && (previous.memoryLimitMb !== entry.memoryLimitMb || previous.timeLimitMs !== entry.timeLimitMs || (previous.maxCaseTimeLimitMs ?? previous.timeLimitMs) !== (entry.maxCaseTimeLimitMs ?? entry.timeLimitMs)))
                throw Error('Authored limits changed without a grading revision; refusing to replace retained certification');
            entries.set(key(entry), entry);
        }
        included++;
    }
    if (entries.size > 10000) throw Error('Release scope exceeds manifest limit; retain historical certification separately');
    return { eligibility: [...entries.values()].sort((a, b) => key(a).localeCompare(key(b))), included, excluded };
}
