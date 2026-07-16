'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  RefreshCw,
  Target,
  XCircle,
} from 'lucide-react';
import ChartSkeleton from '@/components/charts/ChartSkeleton';
import type {
  DashboardRange,
  TeacherDashboardData,
} from '@/lib/types/teacherDashboard';

const SubmissionTrendChart = dynamic(() => import('@/components/charts/SubmissionTrendChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const ProblemPerformanceChart = dynamic(() => import('@/components/charts/ProblemPerformanceChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const ChapterPerformanceChart = dynamic(() => import('@/components/charts/ChapterPerformanceChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const StudentActivityChart = dynamic(() => import('@/components/charts/StudentActivityChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const AiErrorCategoryChart = dynamic(() => import('@/components/charts/AiErrorCategoryChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

const RANGE_OPTIONS: Array<{ value: DashboardRange; label: string }> = [
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
  { value: 'all', label: '전체' },
];

function formatNumber(value: number) {
  return value.toLocaleString('ko-KR');
}

function StatCard({
  label,
  value,
  unit,
  description,
  icon,
  color,
  background,
}: {
  label: string;
  value: number;
  unit: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  background: string;
}) {
  return (
    <div className="bg-white rounded-xl p-4 flex items-start gap-3 min-w-0" style={{ border: '1px solid #E5E8EC' }}>
      <div className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 38, height: 38, color, backgroundColor: background }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p style={{ fontSize: '12px', color: '#8A8F98', marginBottom: 3 }}>{label}</p>
        <div className="flex items-baseline gap-1">
          <strong style={{ fontSize: '22px', lineHeight: 1.1, color: '#16181D' }}>{formatNumber(value)}</strong>
          <span style={{ fontSize: '12px', color: '#5A6270' }}>{unit}</span>
        </div>
        <p className="truncate mt-1" style={{ fontSize: '11px', color: '#BCC0C7' }}>{description}</p>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  description,
  empty,
  children,
}: {
  title: string;
  description: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl p-5 min-w-0 overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
      <div className="mb-3">
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#16181D' }}>{title}</h3>
        <p style={{ fontSize: '12px', color: '#8A8F98', marginTop: 2 }}>{description}</p>
      </div>
      {empty ? (
        <div className="flex items-center justify-center rounded-xl" style={{ height: 260, backgroundColor: '#F9FAFB', color: '#BCC0C7', fontSize: '13px' }}>
          선택한 기간·커리큘럼에 표시할 데이터가 없습니다.
        </div>
      ) : children}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; title: string; order_no: number }>;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span style={{ fontSize: '11px', fontWeight: 600, color: '#8A8F98' }}>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg px-2.5 focus:outline-none disabled:opacity-50"
        style={{ height: 34, border: '1px solid #E5E8EC', fontSize: '12px', color: '#16181D', minWidth: 120, maxWidth: 180 }}
      >
        <option value="">전체</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.order_no}. {option.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="animate-pulse rounded-xl bg-white" style={{ height: 112, border: '1px solid #E5E8EC' }} />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="bg-white rounded-xl p-5" style={{ border: '1px solid #E5E8EC' }}>
            <div className="animate-pulse h-4 w-32 rounded bg-border mb-4" />
            <ChartSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TeacherAnalyticsDashboard() {
  const [range, setRange] = useState<DashboardRange>('30d');
  const [subjectId, setSubjectId] = useState('');
  const [stageId, setStageId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    const params = new URLSearchParams({ range });
    if (subjectId) params.set('subject_id', subjectId);
    if (stageId) params.set('stage_id', stageId);
    if (chapterId) params.set('chapter_id', chapterId);

    fetch(`/api/teacher/dashboard?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error?.message ?? '대시보드 데이터를 불러오지 못했습니다.');
        return json as TeacherDashboardData;
      })
      .then((json) => setData(json))
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : '대시보드 데이터를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range, subjectId, stageId, chapterId, reloadKey]);

  const subjects = data?.curriculum.subjects ?? [];
  const stages = data?.curriculum.stages ?? [];
  const chapters = data?.curriculum.chapters ?? [];

  return (
    <section className="flex flex-col gap-4 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#16181D' }}>학습 분석</h2>
          <p style={{ fontSize: '12px', color: '#8A8F98', marginTop: 2 }}>과목·단계·챕터 단위로 학습 흐름을 확인하세요.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label="과목"
            value={subjectId}
            options={subjects}
            onChange={(value) => {
              setSubjectId(value);
              setStageId('');
              setChapterId('');
            }}
          />
          <FilterSelect
            label="단계"
            value={stageId}
            options={stages}
            disabled={!subjectId}
            onChange={(value) => {
              setStageId(value);
              setChapterId('');
            }}
          />
          <FilterSelect
            label="챕터"
            value={chapterId}
            options={chapters}
            disabled={!stageId && !subjectId}
            onChange={setChapterId}
          />
          <div className="flex items-center gap-1 rounded-lg bg-white p-1" style={{ border: '1px solid #E5E8EC' }}>
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setRange(option.value)}
                className="rounded-md px-3 transition-colors"
                style={{
                  height: 30,
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: range === option.value ? '#1B64DA' : 'transparent',
                  color: range === option.value ? '#FFFFFF' : '#5A6270',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <DashboardLoading />
      ) : error ? (
        <div className="bg-white rounded-xl flex flex-col items-center justify-center gap-3 py-10" style={{ border: '1px solid #E5E8EC' }}>
          <AlertTriangle size={24} style={{ color: '#D97706' }} />
          <p style={{ fontSize: '13px', color: '#5A6270' }}>{error}</p>
          <button
            onClick={() => setReloadKey((key) => key + 1)}
            className="flex items-center gap-1.5 px-3 rounded-lg"
            style={{ height: 34, border: '1px solid #E5E8EC', fontSize: '12px', fontWeight: 600, color: '#1B64DA' }}
          >
            <RefreshCw size={13} /> 다시 시도
          </button>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard
              label="총 제출 수"
              value={data.summary.totalSubmissions}
              unit="회"
              description={`학생 ${data.summary.totalStudents}명 기준`}
              icon={<FileText size={18} />}
              color="#1B64DA"
              background="#EAF1FD"
            />
            <StatCard
              label="총 오답 수"
              value={data.summary.totalWrongAnswers}
              unit="회"
              description="채점 결과가 오답인 제출"
              icon={<XCircle size={18} />}
              color="#DC2626"
              background="#FFF1F2"
            />
            <StatCard
              label="해결한 문제"
              value={data.summary.solvedProblemPairs}
              unit="건"
              description="학생별 중복을 제외한 해결 수"
              icon={<CheckCircle2 size={18} />}
              color="#16A34A"
              background="#F0FDF4"
            />
            <StatCard
              label="학생 해결률"
              value={data.summary.solveRate}
              unit="%"
              description="시도한 학생·문제 중 해결 비율"
              icon={<Target size={18} />}
              color="#7C3AED"
              background="#F3E8FF"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="제출 추이" description="정답과 오답 제출이 언제 집중되는지 보여줍니다." empty={data.submissionTrend.every((point) => point.pass + point.fail === 0)}>
              <SubmissionTrendChart data={data.submissionTrend} />
            </ChartCard>
            <ChartCard title="챕터별 해결률" description="커리큘럼 챕터 단위로 학생 해결률이 낮은 순입니다." empty={data.chapterPerformance.length === 0}>
              <ChapterPerformanceChart data={data.chapterPerformance} />
            </ChartCard>
            <ChartCard title="해결이 어려운 문제" description="과목/단계/챕터 경로와 함께 해결률이 낮은 문제입니다." empty={data.problemPerformance.length === 0}>
              <ProblemPerformanceChart data={data.problemPerformance} />
            </ChartCard>
            <ChartCard title="학생 참여도" description="제출이 활발한 학생의 제출 수와 해결 문제 수입니다." empty={data.studentActivity.every((student) => student.submissionCount === 0)}>
              <StudentActivityChart data={data.studentActivity} />
            </ChartCard>
            <ChartCard title="AI 피드백 주요 오류" description="AI 피드백에서 자주 발견된 오류 분류입니다." empty={data.aiErrorCategories.length === 0}>
              <AiErrorCategoryChart data={data.aiErrorCategories} />
            </ChartCard>
          </div>

          <section className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
            <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid #E5E8EC' }}>
              <AlertTriangle size={15} style={{ color: '#D97706' }} />
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#16181D' }}>지원이 필요한 학생</h3>
                <p style={{ fontSize: '12px', color: '#8A8F98', marginTop: 1 }}>오답이 2회 이상이고 해결률이 60% 미만인 학생입니다.</p>
              </div>
            </div>
            {data.studentsNeedingHelp.length === 0 ? (
              <div className="px-5 py-8 text-center" style={{ fontSize: '13px', color: '#8A8F98' }}>
                현재 기준에 해당하는 학생이 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-[#F3F4F6]">
                {data.studentsNeedingHelp.map((student) => (
                  <div key={student.studentId} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: 34, height: 34, backgroundColor: '#FFF7ED', color: '#D97706', fontSize: '13px', fontWeight: 700 }}>
                      {student.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>{student.name}</span>
                        <span style={{ fontSize: '11px', color: '#BCC0C7' }}>@{student.username}</span>
                      </div>
                      <p style={{ fontSize: '11px', color: '#8A8F98', marginTop: 2 }}>
                        제출 {student.submissionCount}회 · 해결 {student.solvedCount}건
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <strong style={{ fontSize: '14px', color: '#DC2626' }}>오답 {student.wrongAnswerCount}회</strong>
                      <p style={{ fontSize: '11px', color: '#8A8F98', marginTop: 2 }}>해결률 {student.solveRate}%</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
