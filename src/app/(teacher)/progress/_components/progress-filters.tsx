import type { FilterOption } from '../_lib/types';

function FilterSelect({ label, value, onChange, options, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
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
        style={{ height: 34, border: '1px solid #E5E8EC', fontSize: '12px', color: '#16181D', minWidth: 128 }}
      >
        <option value="">전체</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.order_no}. {option.title}</option>)}
      </select>
    </label>
  );
}

export function ProgressFilters(props: {
  subjectId: string;
  stageId: string;
  chapterId: string;
  subjects: FilterOption[];
  stages: FilterOption[];
  chapters: FilterOption[];
  onSubjectChange: (value: string) => void;
  onStageChange: (value: string) => void;
  onChapterChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterSelect label="과목" value={props.subjectId} options={props.subjects} onChange={props.onSubjectChange} />
      <FilterSelect label="단계" value={props.stageId} options={props.stages} disabled={!props.subjectId} onChange={props.onStageChange} />
      <FilterSelect label="챕터" value={props.chapterId} options={props.chapters} disabled={!props.subjectId && !props.stageId} onChange={props.onChapterChange} />
    </div>
  );
}
