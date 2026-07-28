'use client';

import { TeacherAnalyticsDashboard } from '@/components/dashboard/TeacherAnalyticsDashboard';

export default function TeacherDashboardPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-ink)' }}>대시보드</h1>
        <p style={{ fontSize: '13px', color: 'var(--color-sub)', marginTop: 2 }}>
          담당 학생의 제출·오답·해결 현황과 학습 분석을 한눈에 확인하세요.
        </p>
      </div>
      <TeacherAnalyticsDashboard />
    </div>
  );
}
