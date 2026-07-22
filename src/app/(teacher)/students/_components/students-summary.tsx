import { BookOpen, Wifi } from 'lucide-react';

type StudentsSummaryProps = {
  totalCount: number;
  onlineCount: number;
  solvingCount: number;
};

export function StudentsSummary({ totalCount, onlineCount, solvingCount }: StudentsSummaryProps) {
  return (
    <div className="flex items-center gap-6 px-5 py-3 bg-white rounded-xl" style={{ border: '1px solid #E5E8EC' }}>
      <div>
        <span style={{ fontSize: '12px', color: '#8A8F98' }}>전체</span>
        <span style={{ fontSize: '22px', fontWeight: 700, color: '#16181D', marginLeft: 8 }}>{totalCount}</span>
        <span style={{ fontSize: '13px', color: '#8A8F98' }}>명</span>
      </div>
      <div style={{ width: 1, height: 28, backgroundColor: '#E5E8EC' }} />
      <div className="flex items-center gap-2">
        <Wifi size={14} style={{ color: '#16A34A' }} />
        <span style={{ fontSize: '12px', color: '#8A8F98' }}>접속 중</span>
        <span style={{ fontSize: '18px', fontWeight: 700, color: '#16A34A' }}>{onlineCount}</span>
      </div>
      <div style={{ width: 1, height: 28, backgroundColor: '#E5E8EC' }} />
      <div className="flex items-center gap-2">
        <BookOpen size={14} style={{ color: '#1B64DA' }} />
        <span style={{ fontSize: '12px', color: '#8A8F98' }}>풀이 중</span>
        <span style={{ fontSize: '18px', fontWeight: 700, color: '#1B64DA' }}>{solvingCount}</span>
      </div>
    </div>
  );
}
