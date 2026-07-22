'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import type { TeacherDashboardData } from '@/lib/types/teacherDashboard';
import ChartSkeleton from './charts/chart-skeleton';

const SubmissionTrendChart = dynamic(() => import('./charts/submission-trend-chart'), { ssr: false, loading: () => <ChartSkeleton /> });
const ChapterPerformanceChart = dynamic(() => import('./charts/chapter-performance-chart'), { ssr: false, loading: () => <ChartSkeleton /> });
const ProblemPerformanceChart = dynamic(() => import('./charts/problem-performance-chart'), { ssr: false, loading: () => <ChartSkeleton /> });
const StudentActivityChart = dynamic(() => import('./charts/student-activity-chart'), { ssr: false, loading: () => <ChartSkeleton /> });
const AiErrorCategoryChart = dynamic(() => import('./charts/ai-error-category-chart'), { ssr: false, loading: () => <ChartSkeleton /> });

function ChartCard({ title, description, empty, children }: { title: string; description: string; empty: boolean; children: ReactNode }) {
  return (
    <section className="bg-white rounded-xl p-5 min-w-0 overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
      <div className="mb-3">
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#16181D' }}>{title}</h3>
        <p style={{ fontSize: '12px', color: '#8A8F98', marginTop: 2 }}>{description}</p>
      </div>
      {empty ? <div className="flex items-center justify-center rounded-xl" style={{ height: 260, backgroundColor: '#F9FAFB', color: '#BCC0C7', fontSize: '13px' }}>선택한 기간·커리큘럼에 표시할 데이터가 없습니다.</div> : children}
    </section>
  );
}

export function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="animate-pulse rounded-xl bg-white" style={{ height: 112, border: '1px solid #E5E8EC' }} />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="bg-white rounded-xl p-5" style={{ border: '1px solid #E5E8EC' }}><div className="animate-pulse h-4 w-32 rounded bg-border mb-4" /><ChartSkeleton /></div>)}
      </div>
    </div>
  );
}

export function DashboardCharts({ data }: { data: TeacherDashboardData }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <ChartCard title="제출 추이" description="정답과 오답 제출이 언제 집중되는지 보여줍니다." empty={data.submissionTrend.every((point) => point.pass + point.fail === 0)}><SubmissionTrendChart data={data.submissionTrend} /></ChartCard>
      <ChartCard title="챕터별 해결률" description="커리큘럼 챕터 단위로 학생 해결률이 낮은 순입니다." empty={data.chapterPerformance.length === 0}><ChapterPerformanceChart data={data.chapterPerformance} /></ChartCard>
      <ChartCard title="해결이 어려운 문제" description="과목/단계/챕터 경로와 함께 해결률이 낮은 문제입니다." empty={data.problemPerformance.length === 0}><ProblemPerformanceChart data={data.problemPerformance} /></ChartCard>
      <ChartCard title="학생 참여도" description="제출이 활발한 학생의 제출 수와 해결 문제 수입니다." empty={data.studentActivity.every((student) => student.submissionCount === 0)}><StudentActivityChart data={data.studentActivity} /></ChartCard>
      <ChartCard title="AI 피드백 주요 오류" description="AI 피드백에서 자주 발견된 오류 분류입니다." empty={data.aiErrorCategories.length === 0}><AiErrorCategoryChart data={data.aiErrorCategories} /></ChartCard>
    </div>
  );
}
