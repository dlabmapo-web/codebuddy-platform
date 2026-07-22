import { useState } from 'react';
import { buildImportRows, importText, validateImportRows } from '../_lib/curriculum-import';
import type { ImportRow, RawImportRow } from '../_lib/types';

export function useCurriculumImport(onImported: (message: string) => void) {
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
      const problemRows = XLSX.utils.sheet_to_json<RawImportRow>(problemSheet, { defval: '' });
      const testCaseRows = XLSX.utils.sheet_to_json<RawImportRow>(testCaseSheet, { defval: '' });
      const hintRows = hintSheet ? XLSX.utils.sheet_to_json<RawImportRow>(hintSheet, { defval: '' }) : [];
      const nextRows = buildImportRows(problemRows, testCaseRows, hintRows);
      const testCaseKeys = new Set(testCaseRows.map((row) => importText(row['문제키'])).filter(Boolean));
      const hintKeys = new Set(hintRows.map((row) => importText(row['문제키'])).filter(Boolean));
      setRows(nextRows);
      setErrors(validateImportRows(nextRows, testCaseKeys, hintKeys));
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
      onImported(`과목 ${imported.subjects}개, 단계 ${imported.stages}개, 챕터 ${imported.chapters}개, 문제 ${imported.problems}개를 등록했습니다.`);
    } finally {
      setImporting(false);
    }
  };

  return {
    dragging, errors, fileName, importing, parseFile, parsing,
    ready: rows.length > 0 && errors.length === 0,
    rows, setDragging, submit,
  };
}
