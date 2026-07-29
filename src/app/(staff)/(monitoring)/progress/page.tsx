'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight, Clock, FileCode2, X, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import type { ProblemDifficulty } from '@/lib/types/db';
import { routeWithQuery } from '@/lib/navigation/queryState';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type Student = { id: string; name: string; username: string };

type Submission = {
  id: string;
  problem_id: string;
  code?: string;
  status: 'pass' | 'fail' | 'partial';
  score: number;
  passed_count: number;
  total_count: number;
  runtime_ms: number | null;
  elapsed_sec: number | null;
  submitted_at: string;
  problems: { problem_no: number; title: string; difficulty: ProblemDifficulty } | null;
};

type ProblemStat = {
  id: string;
  problem_no: number;
  order_no: number;
  title: string;
  difficulty: ProblemDifficulty;
  student_count: number;
  submission_count: number;
  pass_count: number;
  pass_rate: number;
  avg_elapsed_sec: number | null;
  chapter_id: string;
  chapter_title: string;
  chapter_order_no: number;
  stage_id: string;
  stage_title: string;
  stage_order_no: number;
  subject_id: string;
  subject_title: string;
  subject_order_no: number;
};

type ChapterNode = {
  id: string;
  title: string;
  order_no: number;
  problems: ProblemStat[];
};

type StageNode = {
  id: string;
  title: string;
  order_no: number;
  chapters: ChapterNode[];
};

type SubjectNode = {
  id: string;
  title: string;
  order_no: number;
  stages: StageNode[];
};

const DIFF_LABEL: Record<ProblemDifficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
const DIFF_COLOR: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#F0FDF4', color: '#15803D' },
  medium: { bg: 'var(--tint-soft)', color: '#1D4ED8' },
  hard: { bg: '#FFF1F2', color: '#BE123C' },
};

const STATUS_CONFIG = {
  pass: { label: '정답', color: '#15803D', bg: '#F0FDF4', Icon: CheckCircle2 },
  partial: { label: '일부 통과', color: '#D97706', bg: '#FFFBEB', Icon: MinusCircle },
  fail: { label: '오답', color: '#DC2626', bg: '#FFF1F2', Icon: XCircle },
};

function formatElapsed(sec: number | null) {
  if (!sec) return '—';
  if (sec < 60) return `${sec}초`;
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function SubmissionScore({ score, compact = false }: { score: number; compact?: boolean }) {
  const color = score === 100 ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626';
  return (
    <div
      data-testid="teacher-submission-score"
      className="flex items-center gap-2 rounded-lg"
      style={{
        minWidth: compact ? 82 : 112,
        padding: compact ? '4px 8px' : '6px 9px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-border)' }}>
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <strong style={{ fontSize: compact ? 11 : 12, color, whiteSpace: 'nowrap' }}>{score}점</strong>
    </div>
  );
}

function groupByProblem(subs: Submission[]) {
  const map: Record<string, Submission[]> = {};
  for (const s of subs) {
    if (!map[s.problem_id]) map[s.problem_id] = [];
    map[s.problem_id].push(s);
  }
  return map;
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
      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-sub)' }}>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg px-2.5 focus:outline-none disabled:opacity-50"
        style={{ height: 34, border: '1px solid var(--color-border)', fontSize: '12px', color: 'var(--color-ink)', minWidth: 128 }}
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

export default function ProgressPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'problem' ? 'problem' : 'student';
  const requestedStudentId = searchParams.get('student');
  const subjectId = searchParams.get('subject') ?? '';
  const stageId = searchParams.get('stage') ?? '';
  const chapterId = searchParams.get('chapter') ?? '';
  const [students, setStudents] = useState<Student[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [subjects, setSubjects] = useState<SubjectNode[]>([]);
  const [problemStats, setProblemStats] = useState<ProblemStat[]>([]);
  const [curriculumLoaded, setCurriculumLoaded] = useState(false);
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(new Set());
  const [expandedProblems, setExpandedProblems] = useState<Set<string>>(new Set());
  const [codeModal, setCodeModal] = useState<{ sub: Submission; studentName: string } | null>(null);
  const [submissionSummary, setSubmissionSummary] = useState({ total: 0, passed: 0 });
  const [nextSubmissionOffset, setNextSubmissionOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const replaceQuery = useCallback((updates: Record<string, string | null>) => {
    window.history.replaceState(
      null,
      '',
      routeWithQuery(pathname, searchParams, updates),
    );
  }, [pathname, searchParams]);

  const pushQuery = (updates: Record<string, string | null>) => {
    window.history.pushState(
      null,
      '',
      routeWithQuery(pathname, searchParams, updates),
    );
  };

  useEffect(() => {
    fetch('/api/students').then(r => r.json()).then(json => {
      const list: Student[] = json.users ?? [];
      setStudents(list);
    });
  }, []);

  useEffect(() => {
    if (tab !== 'problem' || curriculumLoaded) return;
    fetch('/api/progress', { cache: 'no-store' }).then(r => r.json()).then(json => {
      setSubjects(json.subjects ?? []);
      setProblemStats(json.problems ?? []);
      setCollapsedChapters(new Set(
        (json.problems ?? []).map((problem: ProblemStat) => problem.chapter_id),
      ));
      setCurriculumLoaded(true);
    });
  }, [curriculumLoaded, tab]);

  const selectedStudent = useMemo(() => (
    students.find((student) => student.id === requestedStudentId)
    ?? students[0]
    ?? null
  ), [requestedStudentId, students]);

  useEffect(() => {
    if (!curriculumLoaded) return;
    const subject = subjectId
      ? subjects.find((item) => item.id === subjectId)
      : null;
    if (subjectId && !subject) {
      replaceQuery({ subject: null, stage: null, chapter: null });
      return;
    }
    const stages = subject?.stages ?? [];
    const stage = stageId ? stages.find((item) => item.id === stageId) : null;
    if (stageId && !stage) {
      replaceQuery({ stage: null, chapter: null });
      return;
    }
    const availableChapters = stage
      ? stage.chapters
      : stages.flatMap((item) => item.chapters);
    if (chapterId && !availableChapters.some((item) => item.id === chapterId)) {
      replaceQuery({ chapter: null });
    }
  }, [chapterId, curriculumLoaded, replaceQuery, stageId, subjectId, subjects]);

  const loadStudentSubmissions = useCallback(async (
    studentId: string,
    offset = 0,
  ) => {
    setLoading(true);
    const res = await fetch(
      `/api/submissions?student_id=${studentId}&view=teacher-summary&limit=20&offset=${offset}`,
      { cache: 'no-store' },
    );
    const json = await res.json();
    setSubmissions((current) => offset === 0
      ? json.submissions ?? []
      : [...current, ...(json.submissions ?? [])]);
    setSubmissionSummary(json.summary ?? { total: 0, passed: 0 });
    setNextSubmissionOffset(json.next_offset ?? null);
    if (offset === 0) setExpandedProblems(new Set());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedStudent) return;
    const studentId = selectedStudent.id;
    queueMicrotask(() => void loadStudentSubmissions(studentId));
  }, [selectedStudent, loadStudentSubmissions]);

  const subjectOptions = useMemo(
    () => subjects.map((s) => ({ id: s.id, title: s.title, order_no: s.order_no })),
    [subjects],
  );

  const stageOptions = useMemo(() => {
    const subject = subjects.find((s) => s.id === subjectId);
    return (subject?.stages ?? []).map((s) => ({ id: s.id, title: s.title, order_no: s.order_no }));
  }, [subjects, subjectId]);

  const chapterOptions = useMemo(() => {
    if (stageId) {
      for (const subject of subjects) {
        const stage = subject.stages.find((s) => s.id === stageId);
        if (stage) return stage.chapters.map((c) => ({ id: c.id, title: c.title, order_no: c.order_no }));
      }
    }
    if (subjectId) {
      const subject = subjects.find((s) => s.id === subjectId);
      return (subject?.stages ?? []).flatMap((stage) =>
        stage.chapters.map((c) => ({ id: c.id, title: c.title, order_no: c.order_no })),
      );
    }
    return subjects.flatMap((subject) =>
      subject.stages.flatMap((stage) =>
        stage.chapters.map((c) => ({ id: c.id, title: c.title, order_no: c.order_no })),
      ),
    );
  }, [subjects, subjectId, stageId]);

  const filteredProblems = useMemo(() => {
    return problemStats.filter((p) => {
      if (subjectId && p.subject_id !== subjectId) return false;
      if (stageId && p.stage_id !== stageId) return false;
      if (chapterId && p.chapter_id !== chapterId) return false;
      return true;
    });
  }, [problemStats, subjectId, stageId, chapterId]);

  const groupedChapters = useMemo(() => {
    const map = new Map<string, {
      chapterId: string;
      chapterTitle: string;
      chapterOrder: number;
      stageTitle: string;
      subjectTitle: string;
      problems: ProblemStat[];
    }>();

    for (const p of filteredProblems) {
      const key = p.chapter_id;
      const group = map.get(key) ?? {
        chapterId: p.chapter_id,
        chapterTitle: p.chapter_title,
        chapterOrder: p.chapter_order_no,
        stageTitle: p.stage_title,
        subjectTitle: p.subject_title,
        problems: [],
      };
      group.problems.push(p);
      map.set(key, group);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.subjectTitle.localeCompare(b.subjectTitle)
      || a.stageTitle.localeCompare(b.stageTitle)
      || a.chapterOrder - b.chapterOrder,
    );
  }, [filteredProblems]);

  const grouped = groupByProblem(submissions);

  const allProblems = Array.from(
    new Map(submissions.map(s => [s.problem_id, s.problems])).entries()
  ).sort((a, b) => (a[1]?.problem_no ?? 0) - (b[1]?.problem_no ?? 0));

  const toggleExpand = (problemId: string) => {
    setExpandedProblems(prev => {
      const next = new Set(prev);
      if (next.has(problemId)) next.delete(problemId);
      else next.add(problemId);
      return next;
    });
  };

  const toggleChapter = (chapterIdKey: string) => {
    setCollapsedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterIdKey)) next.delete(chapterIdKey);
      else next.add(chapterIdKey);
      return next;
    });
  };

  const openSubmissionCode = useCallback(async (
    submission: Submission,
    studentName: string,
  ) => {
    if (typeof submission.code === 'string') {
      setCodeModal({ sub: submission, studentName });
      return;
    }
    const response = await fetch(`/api/submissions/${submission.id}`, {
      cache: 'no-store',
    });
    const json = response.ok ? await response.json() : null;
    if (json?.submission) {
      setCodeModal({ sub: json.submission, studentName });
    }
  }, []);

  return (
    <div className="flex flex-col gap-5 min-w-0">
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-ink)' }}>풀이 현황</h1>
        <p style={{ fontSize: '13px', color: 'var(--color-sub)', marginTop: 2 }}>학생별·문제별 제출 현황을 과목/단계/챕터 단위로 확인하세요.</p>
      </div>

      <div className="flex gap-1 bg-card rounded-xl p-1 w-fit" style={{ border: '1px solid var(--color-border)' }}>
        {(['student', 'problem'] as const).map(t => (
          <button
            key={t}
            onClick={() => pushQuery({ tab: t === 'student' ? null : t })}
            style={{
              height: 34, padding: '0 16px', borderRadius: 8,
              fontSize: '13px', fontWeight: 600,
              backgroundColor: tab === t ? 'var(--color-primary)' : 'transparent',
              color: tab === t ? 'white' : 'var(--color-sub)',
            }}
          >
            {t === 'student' ? '학생별' : '문제별'}
          </button>
        ))}
      </div>

      {tab === 'student' ? (
        <div className="flex gap-4 min-w-0" style={{ minHeight: 480 }}>
          <div className="bg-card rounded-xl overflow-hidden shrink-0" style={{ width: 176, border: '1px solid var(--color-border)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-sub)' }}>학생 목록</span>
            </div>
            {students.length === 0 ? (
              <p className="px-4 py-6 text-center" style={{ fontSize: '12px', color: '#BCC0C7' }}>학생 없음</p>
            ) : (
              students.map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    pushQuery({ tab: null, student: s.id });
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                  style={{
                    borderLeft: selectedStudent?.id === s.id ? '3px solid var(--color-primary)' : '3px solid transparent',
                    backgroundColor: selectedStudent?.id === s.id ? 'var(--tint-soft)' : 'transparent',
                    fontSize: '13px', fontWeight: selectedStudent?.id === s.id ? 600 : 400,
                    color: selectedStudent?.id === s.id ? 'var(--color-primary)' : 'var(--color-ink)',
                  }}
                >
                  <div
                    className="rounded-full flex items-center justify-center shrink-0 font-semibold"
                    style={{ width: 26, height: 26, fontSize: '11px', backgroundColor: selectedStudent?.id === s.id ? '#DBEAFE' : 'var(--color-muted)', color: 'var(--color-primary)' }}
                  >
                    {s.name.charAt(0)}
                  </div>
                  {s.name}
                </button>
              ))
            )}
          </div>

          <div className="flex-1 min-w-0 bg-card rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
            <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>
                {selectedStudent ? `${selectedStudent.name}님의 제출 기록` : '학생을 선택하세요'}
              </span>
              {selectedStudent && (
                <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>
                  총 {submissionSummary.total}회 제출 · 정답 {submissionSummary.passed}회
                </span>
              )}
            </div>

            {!loading && allProblems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <FileCode2 size={32} style={{ color: 'var(--color-border)' }} />
                <p style={{ fontSize: '14px', color: '#BCC0C7' }}>제출 기록이 없습니다</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--color-muted)', opacity: loading ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                {allProblems.map(([problemId, problem]) => {
                  const subs = (grouped[problemId] ?? []).sort(
                    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
                  );
                  const best = subs.find(s => s.status === 'pass') ?? subs[0];
                  const isExpanded = expandedProblems.has(problemId);
                  const diff = problem?.difficulty;
                  const StatusIcon = best ? STATUS_CONFIG[best.status].Icon : null;
                  const meta = problemStats.find((p) => p.id === problemId);

                  return (
                    <div key={problemId}>
                      <button
                        onClick={() => toggleExpand(problemId)}
                        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted transition-colors"
                      >
                        {isExpanded ? <ChevronDown size={15} style={{ color: 'var(--color-sub)', flexShrink: 0 }} /> : <ChevronRight size={15} style={{ color: 'var(--color-sub)', flexShrink: 0 }} />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>
                              {meta
                                ? `${meta.chapter_order_no}-${meta.order_no}. ${problem?.title}`
                                : `${problem?.problem_no}. ${problem?.title}`}
                            </span>
                            {diff && (
                              <span className="px-1.5 py-px rounded" style={{ fontSize: '10px', fontWeight: 600, backgroundColor: DIFF_COLOR[diff].bg, color: DIFF_COLOR[diff].color }}>
                                {DIFF_LABEL[diff]}
                              </span>
                            )}
                          </div>
                          {meta && (
                            <p className="truncate mt-0.5" style={{ fontSize: '11px', color: 'var(--color-sub)' }}>
                              {meta.subject_title} / {meta.stage_title} / {meta.chapter_title}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>{subs.length}회 제출</span>
                          {best && StatusIcon && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ backgroundColor: STATUS_CONFIG[best.status].bg }}>
                              <StatusIcon size={13} style={{ color: STATUS_CONFIG[best.status].color }} />
                              <span style={{ fontSize: '12px', fontWeight: 600, color: STATUS_CONFIG[best.status].color }}>
                                {STATUS_CONFIG[best.status].label}
                              </span>
                            </div>
                          )}
                          {best && <SubmissionScore score={best.score} compact />}
                          {best?.elapsed_sec && (
                            <span className="flex items-center gap-1" style={{ fontSize: '12px', color: 'var(--color-sub)' }}>
                              <Clock size={12} /> {formatElapsed(best.elapsed_sec)}
                            </span>
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div style={{ backgroundColor: 'var(--color-muted)', borderTop: '1px solid var(--color-muted)' }}>
                          {subs.map((sub, idx) => {
                            const cfg = STATUS_CONFIG[sub.status];
                            return (
                              <div
                                key={sub.id}
                                className="flex items-center gap-4 px-10 py-3 cursor-pointer hover:bg-blue-50 transition-colors"
                                style={{ borderBottom: idx < subs.length - 1 ? '1px solid var(--color-muted)' : 'none' }}
                                onClick={() => void openSubmissionCode(
                                  sub,
                                  selectedStudent?.name ?? '',
                                )}
                              >
                                <cfg.Icon size={14} style={{ color: cfg.color, flexShrink: 0 }} />
                                <span style={{ fontSize: '13px', fontWeight: 600, color: cfg.color, width: 72 }}>{cfg.label}</span>
                                <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>
                                  {sub.passed_count}/{sub.total_count} 케이스
                                </span>
                                <SubmissionScore score={sub.score} />
                                <span style={{ fontSize: '11px', color: 'var(--color-sub)' }}>
                                  {subs.length - idx}번째 제출
                                </span>
                                {sub.runtime_ms !== null && (
                                  <span className="flex items-center gap-1" style={{ fontSize: '12px', color: 'var(--color-sub)' }}>
                                    실행 {sub.runtime_ms}ms
                                  </span>
                                )}
                                {sub.elapsed_sec && (
                                  <span className="flex items-center gap-1" style={{ fontSize: '12px', color: 'var(--color-sub)' }}>
                                    <Clock size={11} /> {formatElapsed(sub.elapsed_sec)}
                                  </span>
                                )}
                                <span style={{ fontSize: '12px', color: '#BCC0C7', marginLeft: 'auto' }}>{formatDate(sub.submitted_at)}</span>
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded" style={{ fontSize: '11px', color: 'var(--color-primary)', backgroundColor: 'var(--tint-soft)', fontWeight: 600 }}>
                                  <FileCode2 size={11} /> 코드 보기
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {nextSubmissionOffset !== null && selectedStudent && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void loadStudentSubmissions(
                      selectedStudent.id,
                      nextSubmissionOffset,
                    )}
                    className="w-full px-5 py-3 text-center disabled:opacity-50"
                    style={{ color: 'var(--color-primary)', fontSize: 13, fontWeight: 600 }}
                  >
                    더 보기
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex flex-wrap items-end gap-3">
            <FilterSelect
              label="과목"
              value={subjectId}
              options={subjectOptions}
              onChange={(value) => {
                replaceQuery({ subject: value || null, stage: null, chapter: null });
              }}
            />
            <FilterSelect
              label="단계"
              value={stageId}
              options={stageOptions}
              disabled={!subjectId}
              onChange={(value) => {
                replaceQuery({ stage: value || null, chapter: null });
              }}
            />
            <FilterSelect
              label="챕터"
              value={chapterId}
              options={chapterOptions}
              disabled={!subjectId && !stageId}
              onChange={(value) => replaceQuery({ chapter: value || null })}
            />
            <span style={{ fontSize: '12px', color: 'var(--color-sub)', paddingBottom: 8 }}>
              {filteredProblems.length}개 문제
            </span>
          </div>

          {groupedChapters.length === 0 ? (
            <div className="bg-card rounded-xl flex flex-col items-center justify-center py-16" style={{ border: '1px solid var(--color-border)' }}>
              <p style={{ fontSize: '14px', color: '#BCC0C7' }}>표시할 문제가 없습니다</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 min-w-0">
              {groupedChapters.map((group) => {
                const collapsed = collapsedChapters.has(group.chapterId);
                return (
                  <div key={group.chapterId} className="bg-card rounded-xl overflow-hidden min-w-0" style={{ border: '1px solid var(--color-border)' }}>
                    <button
                      onClick={() => toggleChapter(group.chapterId)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left"
                      style={{ backgroundColor: 'var(--tint-soft)', borderBottom: collapsed ? 'none' : '1px solid var(--color-border)' }}
                    >
                      {collapsed
                        ? <ChevronRight size={15} style={{ color: 'var(--color-sub)', flexShrink: 0 }} />
                        : <ChevronDown size={15} style={{ color: 'var(--color-sub)', flexShrink: 0 }} />}
                      <span className="flex items-center justify-center rounded-md shrink-0" style={{ width: 26, height: 26, backgroundColor: 'var(--color-primary)', color: 'white', fontSize: '12px', fontWeight: 700 }}>
                        {group.chapterOrder}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-ink)' }}>{group.chapterTitle}</div>
                        <div className="truncate" style={{ fontSize: '11px', color: 'var(--color-sub)', marginTop: 1 }}>
                          {group.subjectTitle} / {group.stageTitle} · {group.problems.length}문제
                        </div>
                      </div>
                    </button>

                    {!collapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse" style={{ minWidth: 720, tableLayout: 'fixed' }}>
                          <colgroup>
                            <col style={{ width: 72 }} />
                            <col />
                            <col style={{ width: 72 }} />
                            <col style={{ width: 88 }} />
                            <col style={{ width: 80 }} />
                            <col style={{ width: 140 }} />
                            <col style={{ width: 110 }} />
                          </colgroup>
                          <thead>
                            <tr style={{ backgroundColor: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)' }}>
                              {['번호', '문제', '난이도', '응시 학생', '제출 수', '정답률', '평균 소요'].map((col) => (
                                <th key={col} className="px-3 py-2.5 text-left whitespace-nowrap" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-sub)' }}>
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {group.problems.map((p, idx) => (
                              <tr key={p.id} style={{ borderBottom: idx < group.problems.length - 1 ? '1px solid var(--color-muted)' : 'none' }}>
                                <td className="px-3 py-3 whitespace-nowrap" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-sub)', fontFamily: 'monospace' }}>
                                  {p.chapter_order_no}-{p.order_no}
                                </td>
                                <td className="px-3 py-3 min-w-0">
                                  <span className="block truncate" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-ink)' }} title={p.title}>
                                    {p.title}
                                  </span>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded" style={{ fontSize: '11px', fontWeight: 600, backgroundColor: DIFF_COLOR[p.difficulty].bg, color: DIFF_COLOR[p.difficulty].color }}>
                                    {DIFF_LABEL[p.difficulty]}
                                  </span>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap" style={{ fontSize: '13px', color: 'var(--color-ink)' }}>
                                  {p.student_count}명
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap" style={{ fontSize: '13px', color: 'var(--color-ink)' }}>
                                  {p.submission_count}회
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="rounded-full overflow-hidden shrink-0" style={{ width: 56, height: 5, backgroundColor: 'var(--color-border)' }}>
                                      <div
                                        className="h-full rounded-full"
                                        style={{ width: `${p.pass_rate}%`, backgroundColor: p.pass_rate >= 70 ? '#16A34A' : p.pass_rate >= 40 ? 'var(--color-primary)' : '#DC2626' }}
                                      />
                                    </div>
                                    <span className="whitespace-nowrap" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)' }}>{p.pass_rate}%</span>
                                  </div>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap" style={{ fontSize: '12px', color: 'var(--color-sub)' }}>
                                  {formatElapsed(p.avg_elapsed_sec)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {codeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-card rounded-2xl flex flex-col overflow-hidden" style={{ width: '60vw', height: '80vh', maxWidth: 900 }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
              <div className="flex items-center gap-3 min-w-0">
                <FileCode2 size={18} style={{ color: 'var(--color-primary)' }} />
                <div className="min-w-0">
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-ink)' }}>
                    {codeModal.sub.problems?.problem_no}. {codeModal.sub.problems?.title}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>{codeModal.studentName}</span>
                    <span style={{ fontSize: '11px', color: '#BCC0C7' }}>·</span>
                    <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>{formatDate(codeModal.sub.submitted_at)}</span>
                    <span style={{ fontSize: '11px', color: '#BCC0C7' }}>·</span>
                    {(() => {
                      const cfg = STATUS_CONFIG[codeModal.sub.status];
                      return (
                        <span className="flex items-center gap-1" style={{ fontSize: '12px', fontWeight: 600, color: cfg.color }}>
                          <cfg.Icon size={12} /> {cfg.label}
                        </span>
                      );
                    })()}
                    <SubmissionScore score={codeModal.sub.score} compact />
                    <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>
                      {codeModal.sub.passed_count}/{codeModal.sub.total_count} 테스트
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setCodeModal(null)}
                className="flex items-center justify-center rounded-lg transition-colors hover:bg-muted shrink-0"
                style={{ width: 32, height: 32, color: 'var(--color-sub)' }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden" style={{ backgroundColor: '#1E1E1E' }}>
              <MonacoEditor
                height="100%"
                language="python"
                theme="vs-dark"
                value={codeModal.sub.code ?? ''}
                options={{
                  readOnly: true,
                  fontSize: 13,
                  fontFamily: "'Fira Code', Consolas, monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  padding: { top: 16, bottom: 16 },
                  automaticLayout: true,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
