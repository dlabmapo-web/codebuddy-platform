'use client';

import { RefreshCw } from 'lucide-react';
import { StudentStatusList } from './student-status-list';
import { StudentsSummary } from './students-summary';
import { useStudentMonitor } from '../_hooks/use-student-monitor';

export function StudentsScreen() {
  const monitor = useStudentMonitor();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#16181D' }}>학생 현황</h1>
          <p style={{ fontSize: '13px', color: '#8A8F98', marginTop: 2 }}>담당 학생의 접속 및 학습 현황을 확인하세요.</p>
        </div>
        <button
          onClick={() => void monitor.load(true)}
          disabled={monitor.refreshing}
          className="flex items-center gap-1.5 px-3 rounded-lg transition-colors"
          style={{
            height: 34,
            border: '1px solid #E5E8EC',
            fontSize: '13px',
            color: monitor.refreshing ? '#BCC0C7' : '#5A6270',
            backgroundColor: '#FFFFFF',
            cursor: monitor.refreshing ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={13} className={monitor.refreshing ? 'animate-spin' : ''} />
          {monitor.refreshing ? '갱신 중' : '새로고침'}
          {!monitor.refreshing && (
            <span style={{ fontSize: '11px', color: '#BCC0C7' }}>
              {monitor.lastUpdated.getHours().toString().padStart(2, '0')}:{monitor.lastUpdated.getMinutes().toString().padStart(2, '0')}
            </span>
          )}
        </button>
      </div>

      <StudentsSummary {...monitor.summary} />
      <StudentStatusList loading={monitor.loading} students={monitor.students} />
    </div>
  );
}
