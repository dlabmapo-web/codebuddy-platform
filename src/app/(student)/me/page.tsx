'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Clock, MinusCircle, BookOpen, Trophy, Target, Layers3, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ProblemDifficulty } from '@/lib/types/db';
import {
  currentInternalRoute,
  withReturnTo,
} from '@/lib/navigation/returnTo';
import { routeWithQuery } from '@/lib/navigation/queryState';

type Submission = {
  id: string;
  problem_id: string;
  status: 'pass' | 'fail' | 'partial';
  score: number;
  passed_count: number;
  total_count: number;
  runtime_ms: number | null;
  elapsed_sec: number | null;
  submitted_at: string;
  problems: ProblemRef | ProblemRef[] | null;
};

type SubjectRef = { id: string; title: string; order_no: number };
type StageRef = {
  id: string;
  title: string;
  order_no: number;
  subject_id: string;
  subjects: SubjectRef | SubjectRef[] | null;
};
type ChapterRef = {
  id: string;
  title: string;
  order_no: number;
  stage_id: string;
  stages: StageRef | StageRef[] | null;
};
type ProblemRef = {
  problem_no: number;
  title: string;
  difficulty: ProblemDifficulty;
  order_no: number;
  chapter_id: string | null;
  chapters: ChapterRef | ChapterRef[] | null;
};
type CurriculumOption = { id: string; title: string; order_no: number };

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function curriculumOf(submission: Submission) {
  const problem = one(submission.problems);
  const chapter = one(problem?.chapters);
  const stage = one(chapter?.stages);
  const subject = one(stage?.subjects);
  return { problem, chapter, stage, subject };
}

const DIFF_LABEL: Record<ProblemDifficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
const DIFF_COLOR: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#DCFCE7', color: '#15803D' },
  medium: { bg: 'var(--color-primary-light)', color: 'var(--color-primary-hover)' },
  hard: { bg: '#FEE2E2', color: '#B91C1C' },
};

const STATUS_INFO = {
  pass: { label: '정답', color: '#15803D', bg: '#DCFCE7', Icon: CheckCircle2 },
  partial: { label: '일부 통과', color: '#D97706', bg: '#FEF3C7', Icon: MinusCircle },
  fail: { label: '오답', color: '#DC2626', bg: '#FEE2E2', Icon: XCircle },
};

function formatElapsed(sec: number | null) {
  if (!sec) return '-';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}.${mo}.${dd} ${hh}:${mm}`;
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="bg-card rounded-2xl flex items-center gap-4 px-6 py-5" style={{ border: '1px solid var(--color-border)' }}>
      <div className="rounded-2xl flex items-center justify-center shrink-0" style={{ width: 52, height: 52, backgroundColor: 'var(--color-surface)' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '13px', color: 'var(--color-sub)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: color ?? 'var(--color-ink)' }}>{value}</div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-card rounded-2xl px-6 py-5 animate-pulse" style={{ border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-4">
        <div className="rounded-xl" style={{ width: 52, height: 52, backgroundColor: 'var(--color-muted)' }} />
        <div className="flex-1 flex flex-col gap-2">
          <div className="rounded" style={{ height: 16, width: '60%', backgroundColor: 'var(--color-muted)' }} />
          <div className="rounded" style={{ height: 13, width: '40%', backgroundColor: 'var(--color-muted)' }} />
        </div>
      </div>
    </div>
  );
}

export default function MyHistoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const filterParam = searchParams.get('status');
  const filter: 'all' | 'pass' | 'fail' =
    filterParam === 'pass' || filterParam === 'fail' ? filterParam : 'all';
  const subjectId = searchParams.get('subject') ?? '';
  const stageId = searchParams.get('stage') ?? '';
  const chapterId = searchParams.get('chapter') ?? '';
  const returnRoute = currentInternalRoute({
    pathname,
    search: searchParams.toString(),
  });
  const replaceFilters = (updates: Record<string, string | null>) => {
    router.replace(routeWithQuery(pathname, searchParams, updates), {
      scroll: false,
    });
  };

  useEffect(() => {
    fetch('/api/submissions')
      .then((r) => r.json())
      .then((json) => setSubmissions(json.submissions ?? []))
      .finally(() => setLoading(false));
  }, []);

  const curriculumOptions = useMemo(() => {
    const subjects = new Map<string, CurriculumOption>();
    const stages = new Map<string, CurriculumOption & { subject_id: string }>();
    const chapters = new Map<string, CurriculumOption & { stage_id: string }>();

    for (const submission of submissions) {
      const curriculum = curriculumOf(submission);
      if (curriculum.subject) subjects.set(curriculum.subject.id, curriculum.subject);
      if (curriculum.stage) {
        stages.set(curriculum.stage.id, {
          id: curriculum.stage.id,
          title: curriculum.stage.title,
          order_no: curriculum.stage.order_no,
          subject_id: curriculum.stage.subject_id,
        });
      }
      if (curriculum.chapter) {
        chapters.set(curriculum.chapter.id, {
          id: curriculum.chapter.id,
          title: curriculum.chapter.title,
          order_no: curriculum.chapter.order_no,
          stage_id: curriculum.chapter.stage_id,
        });
      }
    }

    return {
      subjects: Array.from(subjects.values()).sort((a, b) => a.order_no - b.order_no),
      stages: Array.from(stages.values())
        .filter((stage) => !subjectId || stage.subject_id === subjectId)
        .sort((a, b) => a.order_no - b.order_no),
      chapters: Array.from(chapters.values())
        .filter((chapter) => !stageId || chapter.stage_id === stageId)
        .sort((a, b) => a.order_no - b.order_no),
    };
  }, [submissions, subjectId, stageId]);

  const filtered = useMemo(() => submissions.filter((submission) => {
    if (filter === 'pass' && submission.status !== 'pass') return false;
    if (filter === 'fail' && submission.status === 'pass') return false;
    const curriculum = curriculumOf(submission);
    if (subjectId && curriculum.subject?.id !== subjectId) return false;
    if (stageId && curriculum.stage?.id !== stageId) return false;
    if (chapterId && curriculum.chapter?.id !== chapterId) return false;
    return true;
  }), [submissions, filter, subjectId, stageId, chapterId]);

  const totalAttempts = submissions.length;
  const solvedProblems = new Set(submissions.filter((s) => s.status === 'pass').map((s) => s.problem_id)).size;
  const correctRate = totalAttempts > 0 ? Math.round((submissions.filter((s) => s.status === 'pass').length / totalAttempts) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-ink)' }}>내 풀이기록</h1>
        <p style={{ fontSize: '15px', color: 'var(--color-sub)', marginTop: 3 }}>지금까지 풀었던 문제들을 확인해보세요.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<BookOpen size={24} style={{ color: 'var(--color-primary)' }} />} label="총 제출 횟수" value={`${totalAttempts}회`} />
        <StatCard icon={<Trophy size={24} style={{ color: '#15803D' }} />} label="해결한 문제" value={`${solvedProblems}개`} color="#15803D" />
        <StatCard icon={<Target size={24} style={{ color: '#D97706' }} />} label="정답률" value={`${correctRate}%`} />
      </div>

      <div className="flex items-center gap-2">
        {(['all', 'pass', 'fail'] as const).map((f) => {
          const label = f === 'all' ? '전체 기록' : f === 'pass' ? '정답만' : '오답만';
          return (
            <button
              key={f}
              onClick={() => replaceFilters({
                status: f === 'all' ? null : f,
              })}
              className="rounded-2xl transition-colors px-5"
              style={{
                height: 44,
                fontSize: '14px',
                fontWeight: filter === f ? 700 : 500,
                backgroundColor: filter === f ? 'var(--color-primary)' : 'var(--color-card)',
                color: filter === f ? 'white' : 'var(--color-sub)',
                border: `1px solid ${filter === f ? 'var(--color-primary)' : 'var(--color-border)'}`,
              }}
            >
              {label}
            </button>
          );
        })}
        {filtered.length > 0 && (
          <span style={{ fontSize: '13px', color: '#BCC0C7', marginLeft: 4 }}>{filtered.length}개</span>
        )}
      </div>

      <section className="rounded-2xl bg-card p-4" style={{ border: '1px solid var(--color-border)' }}>
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light text-primary">
            <Layers3 size={16} />
          </div>
          <div>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>학습 경로 필터</h2>
            <p style={{ fontSize: '11px', color: 'var(--color-sub)', marginTop: 1 }}>과목·단계·챕터별 풀이기록을 확인하세요.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            value={subjectId}
            onChange={(event) => {
              replaceFilters({
                subject: event.target.value || null,
                stage: null,
                chapter: null,
              });
            }}
            className="h-10 rounded-xl px-3 outline-none"
            style={{ border: '1px solid var(--color-border)', fontSize: '13px', color: 'var(--color-ink)' }}
          >
            <option value="">전체 과목</option>
            {curriculumOptions.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.order_no}. {subject.title}</option>
            ))}
          </select>
          <select
            value={stageId}
            disabled={!subjectId}
            onChange={(event) => {
              replaceFilters({
                stage: event.target.value || null,
                chapter: null,
              });
            }}
            className="h-10 rounded-xl px-3 outline-none disabled:opacity-50"
            style={{ border: '1px solid var(--color-border)', fontSize: '13px', color: 'var(--color-ink)' }}
          >
            <option value="">전체 단계</option>
            {curriculumOptions.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.order_no}. {stage.title}</option>
            ))}
          </select>
          <select
            value={chapterId}
            disabled={!stageId}
            onChange={(event) => replaceFilters({
              chapter: event.target.value || null,
            })}
            className="h-10 rounded-xl px-3 outline-none disabled:opacity-50"
            style={{ border: '1px solid var(--color-border)', fontSize: '13px', color: 'var(--color-ink)' }}
          >
            <option value="">전체 챕터</option>
            {curriculumOptions.chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>{chapter.order_no}. {chapter.title}</option>
            ))}
          </select>
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-2xl flex flex-col items-center justify-center py-20 gap-3" style={{ border: '1px solid var(--color-border)' }}>
            <BookOpen size={40} style={{ color: 'var(--color-border)' }} />
            <p style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-ink)' }}>아직 제출 기록이 없어요</p>
            <p style={{ fontSize: '14px', color: 'var(--color-sub)' }}>문제를 풀고 제출하면 여기에 기록이 남아요!</p>
            <Link
              href="/problems"
              className="mt-2 rounded-2xl text-white px-6 flex items-center"
              style={{ height: 48, backgroundColor: 'var(--color-primary)', fontSize: '15px', fontWeight: 700 }}
            >
              문제 풀러 가기
            </Link>
          </div>
        ) : (
          filtered.map((s) => {
            const st = STATUS_INFO[s.status];
            const { problem, chapter, stage, subject } = curriculumOf(s);
            const diff = problem?.difficulty ? DIFF_COLOR[problem.difficulty] : null;
            const href = problem
              ? withReturnTo(
                  `/problems/${s.problem_id}?sid=${encodeURIComponent(s.id)}`,
                  returnRoute,
                )
              : null;

            return (
              <div
                key={s.id}
                onClick={() => href && router.push(href)}
                className="bg-card rounded-2xl flex items-center gap-5 group transition-all"
                style={{
                  border: '1px solid var(--color-border)',
                  padding: '18px 24px',
                  cursor: href ? 'pointer' : 'default',
                }}
                onMouseEnter={(e) => { if (href) { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(27,100,218,0.10)'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div
                  className="rounded-2xl flex items-center justify-center shrink-0"
                  style={{ width: 52, height: 52, backgroundColor: st.bg }}
                >
                  <st.Icon size={26} style={{ color: st.color }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    {problem ? (
                      <>
                        <span style={{ fontSize: '13px', color: '#BCC0C7', flexShrink: 0 }}>
                          {chapter ? `${chapter.order_no}-${problem.order_no}` : `${problem.problem_no}번`}
                        </span>
                        <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-ink)' }} className="truncate group-hover:text-primary transition-colors">
                          {problem.title}
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: '15px', color: '#BCC0C7' }}>삭제된 문제</span>
                    )}
                  </div>
                  {subject && stage && chapter && (
                    <div className="mb-2 flex min-w-0 items-center gap-1.5 overflow-hidden" style={{ fontSize: '11px', color: 'var(--color-sub)' }}>
                      <span className="truncate">{subject.title}</span>
                      <ChevronRight size={10} className="shrink-0" />
                      <span className="truncate">{stage.title}</span>
                      <ChevronRight size={10} className="shrink-0" />
                      <span className="truncate">{chapter.title}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    {diff && problem && (
                      <span className="px-2.5 py-0.5 rounded-lg" style={{ fontSize: '12px', fontWeight: 700, backgroundColor: diff.bg, color: diff.color }}>
                        {DIFF_LABEL[problem.difficulty]}
                      </span>
                    )}
                    <span style={{ fontSize: '13px', fontWeight: 700, color: st.color }}>{st.label}</span>
                    <span style={{ fontSize: '13px', color: '#BCC0C7' }}>·</span>
                    <span style={{ fontSize: '13px', color: 'var(--color-sub)' }}>
                      {s.passed_count}/{s.total_count} 케이스 통과
                    </span>
                    {s.elapsed_sec != null && (
                      <>
                        <span style={{ fontSize: '13px', color: '#BCC0C7' }}>·</span>
                        <span className="flex items-center gap-1" style={{ fontSize: '13px', color: 'var(--color-sub)' }}>
                          <Clock size={13} /> {formatElapsed(s.elapsed_sec)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div style={{ fontSize: '16px', fontWeight: 700, color: st.color }}>
                    {st.label}
                  </div>
                  <div style={{ fontSize: '12px', color: '#BCC0C7', marginTop: 2 }}>{formatDate(s.submitted_at)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
