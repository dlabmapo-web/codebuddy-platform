import type { DashboardRange, CurriculumFilterOption } from '@/lib/types/teacherDashboard';

const RANGE_OPTIONS: Array<{ value: DashboardRange; label: string }> = [
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
  { value: 'all', label: '전체' },
];

function FilterSelect({ label, value, onChange, options, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: CurriculumFilterOption[];
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span style={{ fontSize: '11px', fontWeight: 600, color: '#8A8F98' }}>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg px-2.5 focus:outline-none disabled:opacity-50"
        style={{ height: 34, border: '1px solid #E5E8EC', fontSize: '12px', color: '#16181D', minWidth: 120, maxWidth: 180 }}
      >
        <option value="">전체</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.order_no}. {option.title}</option>)}
      </select>
    </label>
  );
}

export function DashboardFilters(props: {
  subjectId: string;
  stageId: string;
  chapterId: string;
  range: DashboardRange;
  subjects: CurriculumFilterOption[];
  stages: CurriculumFilterOption[];
  chapters: CurriculumFilterOption[];
  onSubjectChange: (value: string) => void;
  onStageChange: (value: string) => void;
  onChapterChange: (value: string) => void;
  onRangeChange: (value: DashboardRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterSelect label="과목" value={props.subjectId} options={props.subjects} onChange={props.onSubjectChange} />
      <FilterSelect label="단계" value={props.stageId} options={props.stages} disabled={!props.subjectId} onChange={props.onStageChange} />
      <FilterSelect label="챕터" value={props.chapterId} options={props.chapters} disabled={!props.stageId && !props.subjectId} onChange={props.onChapterChange} />
      <div className="flex items-center gap-1 rounded-lg bg-white p-1" style={{ border: '1px solid #E5E8EC' }}>
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => props.onRangeChange(option.value)}
            className="rounded-md px-3 transition-colors"
            style={{ height: 30, fontSize: '12px', fontWeight: 600, backgroundColor: props.range === option.value ? '#1B64DA' : 'transparent', color: props.range === option.value ? '#FFFFFF' : '#5A6270' }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
