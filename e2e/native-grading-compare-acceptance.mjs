import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const [baselineDirectory, candidateDirectory, outputFile] =
  process.argv.slice(2);
if (!outputFile)
  throw new Error(
    'Usage: node e2e/native-grading-compare-acceptance.mjs BASELINE_DIR CANDIDATE_DIR OUTPUT_JSON',
  );
const read = (directory, name) =>
  readFile(resolve(directory, name), 'utf8').then(JSON.parse);
const [baseline, candidate, before, after] = await Promise.all([
  read(baselineDirectory, 'summary.json'),
  read(candidateDirectory, 'summary.json'),
  read(baselineDirectory, 'placement.json'),
  read(candidateDirectory, 'placement.json'),
]);
if (
  baseline.phase !== 'baseline' ||
  candidate.phase !== 'candidate' ||
  baseline.hostIdentity !== candidate.hostIdentity ||
  JSON.stringify(before.profile) !== JSON.stringify(after.profile)
)
  throw new Error('Paired host/profile mismatch');
const gates = [];
for (const count of [1, 5, 10])
  for (const solve of ['first', 'repeat']) {
    const key = `${count}-${solve}`,
      b = baseline.cohorts[key].commit,
      c = candidate.cohorts[key].commit;
    const [p50, p95] =
      count === 1 ? [750, 1500] : count === 5 ? [2000, 3000] : [3000, 5000];
    gates.push({
      cohort: key,
      n: c.n,
      failures: c.failures,
      passed:
        b.n >= 100 &&
        c.n >= 100 &&
        !b.failures &&
        !c.failures &&
        c.p50 <= p50 &&
        c.p95 <= p95 &&
        (count !== 10 || c.p95 <= b.p95 * 0.5),
    });
  }
const result = {
  version: 1,
  performanceCohortsPassed: gates.every((gate) => gate.passed),
  gates,
  productionAcceptancePassed: false,
  remaining: [
    'Independent containment/compatibility/recovery/certification/scans evidence',
    'Browser p95 and commit-to-visible boundary across a sufficient visible-browser cohort',
    'Paired reference API/page/drawing p95 and throughput comparison in two consecutive mixed windows',
    'Fresh signed review against exact tested immutable artifacts and production-equivalent DB placement/RTT',
  ],
};
await writeFile(outputFile, JSON.stringify(result, null, 2) + '\n');
if (!result.performanceCohortsPassed) process.exitCode = 1;
