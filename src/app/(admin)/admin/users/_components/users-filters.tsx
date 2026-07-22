import { Search } from 'lucide-react';
import { ROLE_TABS, STATUS_TABS } from '../_lib/presentation';
import type { RoleFilter, StatusFilter } from '../_lib/types';

export function UsersFilters({ query, roleFilter, statusFilter, onQueryChange, onRoleChange, onStatusChange, onSubmit }: {
  query: string;
  roleFilter: RoleFilter;
  statusFilter: StatusFilter;
  onQueryChange: (value: string) => void;
  onRoleChange: (value: RoleFilter) => void;
  onStatusChange: (value: StatusFilter) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="flex-1" style={{ minWidth: 200, maxWidth: 320 }}>
        <div className="flex items-center gap-2 rounded-2xl px-4 bg-white" style={{ border: '1px solid #E5E8EC', height: 46 }}><Search size={16} style={{ color: '#BCC0C7', flexShrink: 0 }} /><input className="flex-1 focus:outline-none" style={{ fontSize: '14px', color: '#16181D' }} placeholder="이름 또는 아이디 검색" value={query} onChange={(event) => onQueryChange(event.target.value)} /></div>
      </form>
      <div className="flex items-center gap-1.5 rounded-2xl p-1 bg-white" style={{ border: '1px solid #E5E8EC' }}>
        {ROLE_TABS.map(({ key, label }) => <button key={key} onClick={() => onRoleChange(key)} className="rounded-xl px-4 transition-colors" style={{ height: 36, fontSize: '13px', fontWeight: roleFilter === key ? 700 : 500, backgroundColor: roleFilter === key ? '#16181D' : 'transparent', color: roleFilter === key ? '#FFFFFF' : '#5A6270' }}>{label}</button>)}
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl p-1 bg-white" style={{ border: '1px solid #E5E8EC' }}>
        {STATUS_TABS.map(({ key, label }) => <button key={key} onClick={() => onStatusChange(key)} className="rounded-xl px-4 transition-colors" style={{ height: 36, fontSize: '13px', fontWeight: statusFilter === key ? 700 : 500, backgroundColor: statusFilter === key ? key === 'active' ? '#16A34A' : key === 'inactive' ? '#DC2626' : '#16181D' : 'transparent', color: statusFilter === key ? '#FFFFFF' : '#5A6270' }}>{label}</button>)}
      </div>
    </div>
  );
}
