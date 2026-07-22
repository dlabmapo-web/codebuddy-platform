import type { AiFeedbackPatternType, DbAiFeedbackPattern } from '@/lib/types/db';
import type { PatternTypeFilter } from '../_lib/types';

export function PatternFilters({ patterns, typeOptions, typeFilter, onChange }: {
  patterns: DbAiFeedbackPattern[];
  typeOptions: AiFeedbackPatternType[];
  typeFilter: PatternTypeFilter;
  onChange: (value: PatternTypeFilter) => void;
}) {
  const options = [
    { key: 'all', label: `전체 ${patterns.length}` },
    ...typeOptions.map((type) => ({ key: type, label: `${type} ${patterns.filter((pattern) => pattern.pattern_type === type).length}` })),
  ];
  return (
    <div className="flex items-center gap-1.5 rounded-2xl p-1 bg-white w-fit" style={{ border: '1px solid #E5E8EC' }}>
      {options.map(({ key, label }) => <button key={key} onClick={() => onChange(key)} className="rounded-xl px-4 transition-colors" style={{ height: 36, fontSize: '13px', fontWeight: typeFilter === key ? 700 : 500, backgroundColor: typeFilter === key ? '#16181D' : 'transparent', color: typeFilter === key ? '#FFFFFF' : '#5A6270' }}>{label}</button>)}
    </div>
  );
}
