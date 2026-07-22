import type { ImportHint, ImportRow, ImportTestCase, RawImportRow } from './types';

export function importText(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function importNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function importBoolean(value: unknown, defaultValue = false) {
  const normalized = importText(value).toLocaleLowerCase('ko-KR');
  if (!normalized) return defaultValue;
  return ['y', 'yes', 'true', '1', '공개', '사용', '예'].includes(normalized);
}

function importDifficulty(value: unknown): 'easy' | 'medium' | 'hard' {
  const normalized = importText(value).toLocaleLowerCase('ko-KR');
  if (normalized === 'medium' || normalized === '보통') return 'medium';
  if (normalized === 'hard' || normalized === '어려움') return 'hard';
  return 'easy';
}

export function buildImportRows(
  problemRows: RawImportRow[],
  testCaseRows: RawImportRow[],
  hintRows: RawImportRow[],
) {
  const testsByKey = new Map<string, ImportTestCase[]>();
  for (const row of testCaseRows) {
    const key = importText(row['문제키']);
    if (!key) continue;
    const tests = testsByKey.get(key) ?? [];
    tests.push({
      order_no: importNumber(row['순서']) || tests.length + 1,
      input: importText(row['입력값']),
      expected_output: importText(row['정답출력']),
      is_sample: importBoolean(row['샘플여부'], true),
      is_hidden: importBoolean(row['숨김여부']),
    });
    testsByKey.set(key, tests);
  }

  const hintsByKey = new Map<string, ImportHint[]>();
  for (const row of hintRows) {
    const key = importText(row['문제키']);
    if (!key || !importText(row['힌트내용'])) continue;
    const hints = hintsByKey.get(key) ?? [];
    hints.push({
      order_no: importNumber(row['순서']) || hints.length + 1,
      hint_text: importText(row['힌트내용']),
      trigger_pattern: importText(row['조건키워드']),
    });
    hintsByKey.set(key, hints);
  }

  return problemRows
    .filter((row) => Object.values(row).some((value) => importText(value)))
    .map((row): ImportRow => {
      const key = importText(row['문제키']);
      return {
        key,
        subject: { order_no: importNumber(row['과목번호']), title: importText(row['과목명']), description: importText(row['과목설명']) },
        stage: { order_no: importNumber(row['단계번호']), title: importText(row['단계명']), description: importText(row['단계설명']) },
        chapter: { order_no: importNumber(row['챕터번호']), title: importText(row['챕터명']), description: importText(row['챕터설명']) },
        problem: {
          order_no: importNumber(row['문제순서']),
          title: importText(row['문제제목']),
          difficulty: importDifficulty(row['난이도']),
          description: importText(row['문제설명']),
          input_format: importText(row['입력형식']),
          output_format: importText(row['출력형식']),
          constraint_text: importText(row['제약조건']),
          starter_code: importText(row['초기코드']),
          is_published: importBoolean(row['공개여부']),
          use_ai_feedback: importBoolean(row['AI피드백']),
        },
        test_cases: (testsByKey.get(key) ?? []).sort((a, b) => a.order_no - b.order_no),
        hints: (hintsByKey.get(key) ?? []).sort((a, b) => a.order_no - b.order_no),
      };
    });
}

export function validateImportRows(rows: ImportRow[], testCaseKeys: Set<string>, hintKeys: Set<string>) {
  const errors: string[] = [];
  const keys = new Set<string>();
  const rowKeys = new Set(rows.map((row) => row.key));

  if (rows.length === 0) errors.push('"문제" 시트에 등록할 데이터가 없습니다.');
  if (rows.length > 200) errors.push('한 번에 최대 200개 문제까지 등록할 수 있습니다.');

  rows.forEach((row, index) => {
    const label = `${index + 2}행`;
    if (!row.key) errors.push(`${label}: 문제키를 입력해주세요.`);
    if (keys.has(row.key)) errors.push(`${label}: 문제키 "${row.key}"가 중복됩니다.`);
    keys.add(row.key);
    if (!row.subject.title || row.subject.order_no < 1) errors.push(`${label}: 과목번호와 과목명을 확인해주세요.`);
    if (!row.stage.title || row.stage.order_no < 1) errors.push(`${label}: 단계번호와 단계명을 확인해주세요.`);
    if (!row.chapter.title || row.chapter.order_no < 1) errors.push(`${label}: 챕터번호와 챕터명을 확인해주세요.`);
    if (!row.problem.title || row.problem.order_no < 1) errors.push(`${label}: 문제순서와 문제제목을 확인해주세요.`);
    if (!row.problem.description) errors.push(`${label}: 문제설명을 입력해주세요.`);
    if (row.test_cases.length === 0) errors.push(`${label}: 테스트케이스 시트에 문제키 "${row.key}"의 정답을 입력해주세요.`);
    row.test_cases.forEach((testCase, testIndex) => {
      if (!testCase.expected_output) errors.push(`${label}: 테스트케이스 ${testIndex + 1}의 정답출력이 없습니다.`);
    });
  });

  for (const key of testCaseKeys) {
    if (!rowKeys.has(key)) errors.push(`테스트케이스의 문제키 "${key}"가 문제 시트에 없습니다.`);
  }
  for (const key of hintKeys) {
    if (!rowKeys.has(key)) errors.push(`힌트의 문제키 "${key}"가 문제 시트에 없습니다.`);
  }
  return errors.slice(0, 30);
}

export function countUnique(rows: ImportRow[], selector: (row: ImportRow) => string) {
  return new Set(rows.map(selector)).size;
}
