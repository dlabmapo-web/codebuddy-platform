'use client';

import { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';

type ImportTestCase = {
  order_no: number;
  input: string;
  expected_output: string;
  is_sample: boolean;
  is_hidden: boolean;
};

type ImportHint = {
  order_no: number;
  hint_text: string;
  trigger_pattern: string;
};

type ImportRow = {
  key: string;
  subject: { order_no: number; title: string; description: string };
  stage: { order_no: number; title: string; description: string };
  chapter: { order_no: number; title: string; description: string };
  problem: {
    order_no: number;
    title: string;
    difficulty: 'easy' | 'medium' | 'hard';
    description: string;
    input_format: string;
    output_format: string;
    constraint_text: string;
    starter_code: string;
    is_published: boolean;
    use_ai_feedback: boolean;
  };
  test_cases: ImportTestCase[];
  hints: ImportHint[];
};

type RawRow = Record<string, unknown>;

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(value: unknown, defaultValue = false) {
  const normalized = text(value).toLocaleLowerCase('ko-KR');
  if (!normalized) return defaultValue;
  return ['y', 'yes', 'true', '1', '공개', '사용', '예'].includes(normalized);
}

function difficulty(value: unknown): 'easy' | 'medium' | 'hard' {
  const normalized = text(value).toLocaleLowerCase('ko-KR');
  if (normalized === 'medium' || normalized === '보통') return 'medium';
  if (normalized === 'hard' || normalized === '어려움') return 'hard';
  return 'easy';
}

function buildImportRows(problemRows: RawRow[], testCaseRows: RawRow[], hintRows: RawRow[]) {
  const testsByKey = new Map<string, ImportTestCase[]>();
  for (const row of testCaseRows) {
    const key = text(row['문제키']);
    if (!key) continue;
    const tests = testsByKey.get(key) ?? [];
    tests.push({
      order_no: number(row['순서']) || tests.length + 1,
      input: text(row['입력값']),
      expected_output: text(row['정답출력']),
      is_sample: bool(row['샘플여부'], true),
      is_hidden: bool(row['숨김여부']),
    });
    testsByKey.set(key, tests);
  }

  const hintsByKey = new Map<string, ImportHint[]>();
  for (const row of hintRows) {
    const key = text(row['문제키']);
    if (!key || !text(row['힌트내용'])) continue;
    const hints = hintsByKey.get(key) ?? [];
    hints.push({
      order_no: number(row['순서']) || hints.length + 1,
      hint_text: text(row['힌트내용']),
      trigger_pattern: text(row['조건키워드']),
    });
    hintsByKey.set(key, hints);
  }

  return problemRows
    .filter((row) => Object.values(row).some((value) => text(value)))
    .map((row): ImportRow => {
      const key = text(row['문제키']);
      return {
        key,
        subject: {
          order_no: number(row['과목번호']),
          title: text(row['과목명']),
          description: text(row['과목설명']),
        },
        stage: {
          order_no: number(row['단계번호']),
          title: text(row['단계명']),
          description: text(row['단계설명']),
        },
        chapter: {
          order_no: number(row['챕터번호']),
          title: text(row['챕터명']),
          description: text(row['챕터설명']),
        },
        problem: {
          order_no: number(row['문제순서']),
          title: text(row['문제제목']),
          difficulty: difficulty(row['난이도']),
          description: text(row['문제설명']),
          input_format: text(row['입력형식']),
          output_format: text(row['출력형식']),
          constraint_text: text(row['제약조건']),
          starter_code: text(row['초기코드']),
          is_published: bool(row['공개여부']),
          use_ai_feedback: bool(row['AI피드백']),
        },
        test_cases: (testsByKey.get(key) ?? []).sort((a, b) => a.order_no - b.order_no),
        hints: (hintsByKey.get(key) ?? []).sort((a, b) => a.order_no - b.order_no),
      };
    });
}

function validate(rows: ImportRow[], testCaseKeys: Set<string>, hintKeys: Set<string>) {
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

function uniqueCount(rows: ImportRow[], selector: (row: ImportRow) => string) {
  return new Set(rows.map(selector)).size;
}

export function CurriculumExcelImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);

  const parseFile = async (file: File) => {
    setParsing(true);
    setErrors([]);
    setRows([]);
    setFileName(file.name);

    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const problemSheet = workbook.Sheets['문제'];
      const testCaseSheet = workbook.Sheets['테스트케이스'];
      const hintSheet = workbook.Sheets['힌트'];

      if (!problemSheet || !testCaseSheet) {
        throw new Error('"문제", "테스트케이스" 시트가 필요합니다. 샘플 파일을 사용해주세요.');
      }

      const problemRows = XLSX.utils.sheet_to_json<RawRow>(problemSheet, { defval: '' });
      const testCaseRows = XLSX.utils.sheet_to_json<RawRow>(testCaseSheet, { defval: '' });
      const hintRows = hintSheet ? XLSX.utils.sheet_to_json<RawRow>(hintSheet, { defval: '' }) : [];
      const nextRows = buildImportRows(problemRows, testCaseRows, hintRows);
      const testCaseKeys = new Set(testCaseRows.map((row) => text(row['문제키'])).filter(Boolean));
      const hintKeys = new Set(hintRows.map((row) => text(row['문제키'])).filter(Boolean));

      setRows(nextRows);
      setErrors(validate(nextRows, testCaseKeys, hintKeys));
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : '엑셀 파일을 읽지 못했습니다.']);
    } finally {
      setParsing(false);
    }
  };

  const submit = async () => {
    if (rows.length === 0 || errors.length > 0) return;
    setImporting(true);
    try {
      const response = await fetch('/api/admin/curriculum/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const json = await response.json();
      if (!response.ok) {
        setErrors(String(json.error?.message ?? '일괄 등록 중 오류가 발생했습니다.').split('\n'));
        return;
      }
      const imported = json.imported;
      onImported(
        `과목 ${imported.subjects}개, 단계 ${imported.stages}개, 챕터 ${imported.chapters}개, 문제 ${imported.problems}개를 등록했습니다.`,
      );
    } finally {
      setImporting(false);
    }
  };

  const ready = rows.length > 0 && errors.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,24,29,0.55)' }} onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-card"
        style={{ boxShadow: '0 16px 48px rgba(22,24,29,0.22)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #E5E8EC' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#16181D' }}>엑셀 일괄 등록</h2>
              <p style={{ fontSize: '12px', color: '#8A8F98', marginTop: 2 }}>과목부터 문제·테스트케이스까지 한 번에 등록합니다.</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface" aria-label="닫기">
            <X size={16} style={{ color: '#5A6270' }} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
            <div className="rounded-xl bg-[#F8FAFC] px-4 py-3" style={{ border: '1px solid #E5E8EC' }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#16181D' }}>등록 방법</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4" style={{ fontSize: '12px', lineHeight: 1.55, color: '#5A6270' }}>
                <li>샘플 파일의 <b>문제</b>, <b>테스트케이스</b>, <b>힌트</b> 시트를 작성합니다.</li>
                <li>시트 간 문제는 <b>문제키</b>로 연결합니다. 같은 과목·단계·챕터는 자동으로 재사용합니다.</li>
                <li>업로드 후 검증 결과를 확인하고 일괄 등록을 누릅니다.</li>
              </ol>
            </div>
            <a
              href="/templates/paircode-curriculum-import-sample.xlsx"
              download
              className="flex items-center justify-center gap-2 rounded-xl px-4 text-primary transition-colors hover:bg-primary-light"
              style={{ minHeight: 46, border: '1px solid #C7D9F7', fontSize: '13px', fontWeight: 700 }}
            >
              <Download size={15} /> 샘플 엑셀 다운로드
            </a>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) parseFile(file);
              event.target.value = '';
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) parseFile(file);
            }}
            className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-9 transition-colors"
            style={{ borderColor: dragging ? '#1B64DA' : '#C9CED6', backgroundColor: dragging ? '#F0F7FF' : '#FAFBFC' }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card text-primary shadow-sm">
              <Upload size={21} />
            </div>
            <p className="mt-3" style={{ fontSize: '14px', fontWeight: 700, color: '#16181D' }}>
              {parsing ? '엑셀 파일을 읽는 중...' : fileName || '엑셀 파일을 선택하거나 여기에 놓으세요'}
            </p>
            <p className="mt-1" style={{ fontSize: '12px', color: '#8A8F98' }}>.xlsx 또는 .xls · 최대 200개 문제</p>
          </button>

          {errors.length > 0 && (
            <div className="mt-4 rounded-xl bg-[#FFF7F7] p-4" style={{ border: '1px solid #FECACA' }}>
              <div className="flex items-center gap-2" style={{ color: '#DC2626' }}>
                <AlertCircle size={16} />
                <span style={{ fontSize: '13px', fontWeight: 700 }}>수정이 필요한 항목 {errors.length}개</span>
              </div>
              <ul className="mt-2 max-h-36 list-disc space-y-1 overflow-y-auto pl-5" style={{ fontSize: '12px', color: '#B91C1C' }}>
                {errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
              </ul>
            </div>
          )}

          {rows.length > 0 && (
            <div className="mt-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-lg bg-[#F0FDF4] px-3 py-1.5" style={{ fontSize: '12px', fontWeight: 700, color: '#15803D' }}>
                  <CheckCircle2 size={13} /> 문제 {rows.length}개
                </span>
                <span className="rounded-lg bg-surface px-3 py-1.5" style={{ fontSize: '12px', color: '#5A6270' }}>
                  과목 {uniqueCount(rows, (row) => row.subject.title)}개
                </span>
                <span className="rounded-lg bg-surface px-3 py-1.5" style={{ fontSize: '12px', color: '#5A6270' }}>
                  단계 {uniqueCount(rows, (row) => `${row.subject.title}/${row.stage.title}`)}개
                </span>
                <span className="rounded-lg bg-surface px-3 py-1.5" style={{ fontSize: '12px', color: '#5A6270' }}>
                  챕터 {uniqueCount(rows, (row) => `${row.subject.title}/${row.stage.title}/${row.chapter.title}`)}개
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #E5E8EC' }}>
                <table className="w-full border-collapse" style={{ minWidth: 760 }}>
                  <thead>
                    <tr className="bg-[#F9FAFB]">
                      {['문제키', '과목', '단계', '챕터', '문제', '난이도', '테스트'].map((header) => (
                        <th key={header} className="px-3 py-2.5 text-left" style={{ fontSize: '11px', fontWeight: 700, color: '#8A8F98', borderBottom: '1px solid #E5E8EC' }}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((row, index) => (
                      <tr key={`${row.key}-${index}`} style={{ borderBottom: index < Math.min(rows.length, 10) - 1 ? '1px solid #F0F1F3' : 'none' }}>
                        <td className="px-3 py-2.5" style={{ fontSize: '12px', fontFamily: 'monospace', color: '#5A6270' }}>{row.key}</td>
                        <td className="px-3 py-2.5" style={{ fontSize: '12px', color: '#16181D' }}>{row.subject.title}</td>
                        <td className="px-3 py-2.5" style={{ fontSize: '12px', color: '#16181D' }}>{row.stage.title}</td>
                        <td className="px-3 py-2.5" style={{ fontSize: '12px', color: '#16181D' }}>{row.chapter.title}</td>
                        <td className="px-3 py-2.5" style={{ fontSize: '12px', fontWeight: 600, color: '#16181D' }}>{row.problem.title}</td>
                        <td className="px-3 py-2.5" style={{ fontSize: '12px', color: '#5A6270' }}>{row.problem.difficulty}</td>
                        <td className="px-3 py-2.5" style={{ fontSize: '12px', color: '#5A6270' }}>{row.test_cases.length}개</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 10 && <p className="mt-2 text-right" style={{ fontSize: '11px', color: '#8A8F98' }}>외 {rows.length - 10}개 문제</p>}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: '1px solid #E5E8EC', backgroundColor: '#FAFBFC' }}>
          <p style={{ fontSize: '11px', color: '#8A8F98' }}>
            기존 항목과 번호가 충돌하면 등록하지 않고 오류를 안내합니다.
          </p>
          <div className="flex shrink-0 gap-2">
            <button onClick={onClose} className="rounded-xl px-5" style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '13px', fontWeight: 700, color: '#5A6270' }}>취소</button>
            <button
              onClick={submit}
              disabled={!ready || importing}
              className="rounded-xl px-5 text-white disabled:opacity-40"
              style={{ height: 40, backgroundColor: '#1B64DA', fontSize: '13px', fontWeight: 700 }}
            >
              {importing ? '등록 중...' : `${rows.length || ''}개 문제 일괄 등록`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
