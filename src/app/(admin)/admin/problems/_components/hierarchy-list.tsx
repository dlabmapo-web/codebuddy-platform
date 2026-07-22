import { ArrowDown, ArrowUp, ChevronRight, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import type { HierarchyKind, HierarchyRow } from '../_lib/types';

export function HierarchyList({
  rows,
  kind,
  childLabel,
  onEnter,
  onMove,
  onTogglePublish,
  onEdit,
  onDelete,
}: {
  rows: HierarchyRow[];
  kind: HierarchyKind;
  childLabel: string;
  onEnter: (row: HierarchyRow) => void;
  onMove: (kind: HierarchyKind, row: HierarchyRow, rows: HierarchyRow[], direction: -1 | 1) => void;
  onTogglePublish: (kind: HierarchyKind, row: HierarchyRow) => void;
  onEdit: (kind: HierarchyKind, row: HierarchyRow) => void;
  onDelete: (target: { kind: HierarchyKind; row: HierarchyRow }) => void;
}) {
  const sortedRows = [...rows].sort((a, b) => a.order_no - b.order_no);
  return (
    <div className="p-3 flex flex-col gap-2">
      {sortedRows.map((row, index) => (
        <div key={row.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: row.is_published ? '#F0F7FF' : '#F6F7F9' }}>
            <button onClick={() => onEnter(row)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
              <span className="flex items-center justify-center rounded-md shrink-0" style={{ width: 28, height: 28, backgroundColor: row.is_published ? '#1B64DA' : '#BCC0C7', color: '#fff', fontSize: '12px', fontWeight: 700 }}>{row.order_no}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate" style={{ fontSize: '14px', fontWeight: 700, color: row.is_published ? '#16181D' : '#8A8F98' }}>{row.title}</span>
                  <span style={{ fontSize: '12px', color: '#8A8F98' }}>· {row.child_count ?? 0}{childLabel}</span>
                  {!row.is_published && <span className="px-1.5 py-px rounded" style={{ fontSize: '10px', fontWeight: 600, backgroundColor: '#E5E8EC', color: '#8A8F98' }}>숨김</span>}
                </div>
                {row.description && <p className="truncate mt-0.5" style={{ fontSize: '12px', color: '#8A8F98' }}>{row.description}</p>}
              </div>
              <ChevronRight size={16} style={{ color: '#BCC0C7' }} />
            </button>
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={() => onMove(kind, row, rows, -1)} disabled={index === 0} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/70 disabled:opacity-30"><ArrowUp size={13} style={{ color: '#5A6270' }} /></button>
              <button onClick={() => onMove(kind, row, rows, 1)} disabled={index === sortedRows.length - 1} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/70 disabled:opacity-30"><ArrowDown size={13} style={{ color: '#5A6270' }} /></button>
              <button onClick={() => onTogglePublish(kind, row)} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/70">{row.is_published ? <Eye size={14} style={{ color: '#1B64DA' }} /> : <EyeOff size={14} style={{ color: '#BCC0C7' }} />}</button>
              <button onClick={() => onEdit(kind, row)} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/70"><Pencil size={13} style={{ color: '#5A6270' }} /></button>
              <button onClick={() => onDelete({ kind, row })} className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/70"><Trash2 size={13} style={{ color: '#DC2626' }} /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
