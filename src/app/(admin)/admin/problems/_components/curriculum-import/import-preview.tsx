import { CheckCircle2 } from 'lucide-react';
import { countUnique } from '../../_lib/curriculum-import';
import type { ImportRow } from '../../_lib/types';

export function ImportPreview({ rows }: { rows: ImportRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-lg bg-[#F0FDF4] px-3 py-1.5" style={{ fontSize: '12px', fontWeight: 700, color: '#15803D' }}><CheckCircle2 size={13} /> 문제 {rows.length}개</span>
        <span className="rounded-lg bg-surface px-3 py-1.5" style={{ fontSize: '12px', color: '#5A6270' }}>과목 {countUnique(rows, (row) => row.subject.title)}개</span>
        <span className="rounded-lg bg-surface px-3 py-1.5" style={{ fontSize: '12px', color: '#5A6270' }}>단계 {countUnique(rows, (row) => `${row.subject.title}/${row.stage.title}`)}개</span>
        <span className="rounded-lg bg-surface px-3 py-1.5" style={{ fontSize: '12px', color: '#5A6270' }}>챕터 {countUnique(rows, (row) => `${row.subject.title}/${row.stage.title}/${row.chapter.title}`)}개</span>
      </div>
      <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #E5E8EC' }}>
        <table className="w-full border-collapse" style={{ minWidth: 760 }}>
          <thead><tr className="bg-[#F9FAFB]">{['문제키', '과목', '단계', '챕터', '문제', '난이도', '테스트'].map((header) => <th key={header} className="px-3 py-2.5 text-left" style={{ fontSize: '11px', fontWeight: 700, color: '#8A8F98', borderBottom: '1px solid #E5E8EC' }}>{header}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 10).map((row, index) => <tr key={`${row.key}-${index}`} style={{ borderBottom: index < Math.min(rows.length, 10) - 1 ? '1px solid #F0F1F3' : 'none' }}><td className="px-3 py-2.5" style={{ fontSize: '12px', fontFamily: 'monospace', color: '#5A6270' }}>{row.key}</td><td className="px-3 py-2.5" style={{ fontSize: '12px', color: '#16181D' }}>{row.subject.title}</td><td className="px-3 py-2.5" style={{ fontSize: '12px', color: '#16181D' }}>{row.stage.title}</td><td className="px-3 py-2.5" style={{ fontSize: '12px', color: '#16181D' }}>{row.chapter.title}</td><td className="px-3 py-2.5" style={{ fontSize: '12px', fontWeight: 600, color: '#16181D' }}>{row.problem.title}</td><td className="px-3 py-2.5" style={{ fontSize: '12px', color: '#5A6270' }}>{row.problem.difficulty}</td><td className="px-3 py-2.5" style={{ fontSize: '12px', color: '#5A6270' }}>{row.test_cases.length}개</td></tr>)}</tbody>
        </table>
      </div>
      {rows.length > 10 && <p className="mt-2 text-right" style={{ fontSize: '11px', color: '#8A8F98' }}>외 {rows.length - 10}개 문제</p>}
    </div>
  );
}
