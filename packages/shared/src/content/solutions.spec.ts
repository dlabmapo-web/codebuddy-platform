import { describe, expect, it } from 'vitest';
import { exerciseSolutionEntrySchema, exerciseSolutionsSchema } from './solutions.js';
import { buildBlankWorkbook } from './import/workbook-template.js';
import { readWorkbookRows } from './import/rows.js';
import { planContentImport } from './import/plan.js';

const first = { title: ' Loop ', code: '\n# method 1\nn = int(input())\nprint(sum(1 for i in range(1, n + 1) if i % 2 == 0))\n' };
const second = { title: 'Formula', code: 'n = int(input())\nprint(n // 2)\n' };
describe('private solution collections', () => {
  it('preserves exact code while normalizing optional names', () => {
    expect(exerciseSolutionEntrySchema.parse(first)).toEqual({ ...first, title: 'Loop' });
    expect(exerciseSolutionEntrySchema.parse({ ...first, title: '  ' }).title).toBeNull();
  });
  it('enforces nonblank code, per-entry and total limits', () => {
    expect(exerciseSolutionsSchema.safeParse([{ title: null, code: ' \n' }]).success).toBe(false);
    expect(exerciseSolutionsSchema.safeParse([{ ...first, title: 'x'.repeat(81) }]).success).toBe(false);
    expect(exerciseSolutionsSchema.safeParse([{ ...first, code: 'x'.repeat(100_001) }]).success).toBe(false);
    expect(exerciseSolutionsSchema.safeParse(Array(10).fill(second)).success).toBe(true);
    expect(exerciseSolutionsSchema.safeParse(Array(11).fill(second)).success).toBe(false);
    expect(exerciseSolutionsSchema.safeParse(Array(5).fill({ ...first, code: 'x'.repeat(100_000) })).success).toBe(true);
    expect(exerciseSolutionsSchema.safeParse(Array(6).fill({ ...first, code: 'x'.repeat(100_000) })).success).toBe(false);
  });

});

function workbook(solutionRows?: string[][]) {
  const sheets = new Map(buildBlankWorkbook('en').sheets.map(sheet => [sheet.name, sheet.rows]));
  if (solutionRows) sheets.set('Solutions', [sheets.get('Solutions')![0], ...solutionRows]);
  return readWorkbookRows({ Structure: sheets.get('Structure')!, Problems: sheets.get('Problems')!, Solutions: sheets.get('Solutions')!, 'Test Cases': sheets.get('Test Cases')!, Hints: sheets.get('Hints')! });
}
describe('workbook v3 solutions', () => {
  it('ships two methods for one sample and preserves order and exact code', () => {
    const rows = workbook();
    expect(rows.issues).toEqual([]);
    expect(rows.problems[0].solutions).toHaveLength(2);
    expect(rows.problems[1].solutions).toHaveLength(1);
  });
  it('rejects orphan keys, gaps, duplicates, blank code and private names without echoing them', () => {
    const rows = workbook([
      ['UNKNOWN', '1', '', first.code],
      ['VAR-001', '2', 'PRIVATE'.repeat(20), first.code],
      ['VAR-001', '2', '', '  '],
    ]);
    expect(rows.issues.filter(issue => issue.severity === 'ERROR').length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(rows.issues)).not.toContain(first.code);
    expect(JSON.stringify(rows.issues)).not.toContain('PRIVATE');
  });
  it('stages the entire collection and refuses a new problem without solutions', () => {
    const rows = workbook([['VAR-001', '1', first.title, first.code], ['VAR-001', '2', second.title, second.code]]);
    const plan = planContentImport({ workbook: rows, course: { contentRevision: 1, isVisible: false, modules: [] } });
    const problems = plan.modules.flatMap(module => module.lectures.flatMap(lecture => lecture.problems));
    expect(problems.find(problem => problem.key === 'VAR-001')?.solutions.map(solution => solution.code)).toEqual([first.code, second.code]);
    expect(problems.find(problem => problem.key === 'LOOP-001')?.issues.map(issue => issue.code)).toContain('solution_code_missing');
  });
});
