'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { ChevronDown, ChevronRight, Clock, FileCode2, X, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import type { ProblemDifficulty } from '@/lib/types/db';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type Student = { id: string; name: string; username: string };

type Submission = {
  id: string;
  problem_id: string;
  code: string;
  status: 'pass' | 'fail' | 'partial';
  passed_count: number;
  total_count: number;
  elapsed_sec: number | null;
  submitted_at: string;
  problems: { problem_no: number; title: string; difficulty: ProblemDifficulty } | null;
};

type ProblemStat = {
  id: string;
  problem_no: number;
  title: string;
  difficulty: ProblemDifficulty;
  student_count: number;
  submission_count: number;
  pass_count: number;
  pass_rate: number;
  avg_elapsed_sec: number | null;
};

const DIFF_LABEL: Record<ProblemDifficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
const DIFF_COLOR: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#F0FDF4', color: '#15803D' },
  medium: { bg: '#EFF6FF', color: '#1D4ED8' },
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

function groupByProblem(subs: Submission[]) {
  const map: Record<string, Submission[]> = {};
  for (const s of subs) {
    if (!map[s.problem_id]) map[s.problem_id] = [];
    map[s.problem_id].push(s);
  }
  return map;
}

export default function ProgressPage() {
  const [tab, setTab] = useState<'student' | 'problem'>('student');
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [problemStats, setProblemStats] = useState<ProblemStat[]>([]);
  const [expandedProblems, setExpandedProblems] = useState<Set<string>>(new Set());
  const [codeModal, setCodeModal] = useState<{ sub: Submission; studentName: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/students').then(r => r.json()).then(json => {
      const list: Student[] = json.users ?? [];
      setStudents(list);
      if (list.length > 0) setSelectedStudent(list[0]);
    });
    fetch('/api/progress').then(r => r.json()).then(json => {
      setProblemStats(json.problems ?? []);
    });
  }, []);

  const loadStudentSubmissions = useCallback(async (studentId: string) => {
    setLoading(true);
    const res = await fetch(`/api/submissions?student_id=${studentId}`);
    const json = await res.json();
    setSubmissions(json.submissions ?? []);
    setExpandedProblems(new Set());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedStudent) loadStudentSubmissions(selectedStudent.id);
  }, [selectedStudent, loadStudentSubmissions]);

  const grouped = groupByProblem(submissions);

  const allProblems = Array.from(
    new Map(submissions.map(s => [s.problem_id, s.problems])).entries()
  ).sort((a, b) => (a[1]?.problem_no ?? 0) - (b[1]?.problem_no ?? 0));

  const toggleExpand = (problemId: string) => {
    setExpandedProblems(prev => {
      const next = new Set(prev);
      next.has(problemId) ? next.delete(problemId) : next.add(problemId);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#16181D' }}>풀이 현황</h1>
        <p style={{ fontSize: '13px', color: '#8A8F98', marginTop: 2 }}>학생별·문제별 제출 현황과 코드를 확인하세요.</p>
      </div>

      <div className="flex gap-1 bg-white rounded-xl p-1 w-fit" style={{ border: '1px solid #E5E8EC' }}>
        {(['student', 'problem'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              height: 34, padding: '0 16px', borderRadius: 8,
              fontSize: '13px', fontWeight: 600,
              backgroundColor: tab === t ? '#1B64DA' : 'transparent',
              color: tab === t ? '#FFFFFF' : '#5A6270',
            }}
          >
            {t === 'student' ? '학생별' : '문제별'}
          </button>
        ))}
      </div>

      {tab === 'student' ? (
        <div className="flex gap-4" style={{ minHeight: 480 }}>
          <div className="bg-white rounded-xl overflow-hidden shrink-0" style={{ width: 176, border: '1px solid #E5E8EC' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #E5E8EC' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#8A8F98' }}>학생 목록</span>
            </div>
            {students.length === 0 ? (
              <p className="px-4 py-6 text-center" style={{ fontSize: '12px', color: '#BCC0C7' }}>학생 없음</p>
            ) : (
              students.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                  style={{
                    borderLeft: selectedStudent?.id === s.id ? '3px solid #1B64DA' : '3px solid transparent',
                    backgroundColor: selectedStudent?.id === s.id ? '#EFF6FF' : 'transparent',
                    fontSize: '13px', fontWeight: selectedStudent?.id === s.id ? 600 : 400,
                    color: selectedStudent?.id === s.id ? '#1B64DA' : '#16181D',
                  }}
                >
                  <div
                    className="rounded-full flex items-center justify-center shrink-0 font-semibold"
                    style={{ width: 26, height: 26, fontSize: '11px', backgroundColor: selectedStudent?.id === s.id ? '#DBEAFE' : '#F3F4F6', color: '#1B64DA' }}
                  >
                    {s.name.charAt(0)}
                  </div>
                  {s.name}
                </button>
              ))
            )}
          </div>

          <div className="flex-1 bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
            <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid #E5E8EC' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#16181D' }}>
                {selectedStudent ? `${selectedStudent.name}님의 제출 기록` : '학생을 선택하세요'}
              </span>
              {selectedStudent && (
                <span style={{ fontSize: '12px', color: '#8A8F98' }}>
                  총 {submissions.length}회 제출 · 정답 {submissions.filter(s => s.status === 'pass').length}회
                </span>
              )}
            </div>

            {!loading && allProblems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <FileCode2 size={32} style={{ color: '#E5E8EC' }} />
                <p style={{ fontSize: '14px', color: '#BCC0C7' }}>제출 기록이 없습니다</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: '#F3F4F6', opacity: loading ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                {allProblems.map(([problemId, problem]) => {
                  const subs = (grouped[problemId] ?? []).sort(
                    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
                  );
                  const best = subs.find(s => s.status === 'pass') ?? subs[0];
                  const isExpanded = expandedProblems.has(problemId);
                  const diff = problem?.difficulty;
                  const StatusIcon = best ? STATUS_CONFIG[best.status].Icon : null;

                  return (
                    <div key={problemId}>
                      <button
                        onClick={() => toggleExpand(problemId)}
                        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                      >
                        {isExpanded ? <ChevronDown size={15} style={{ color: '#8A8F98', flexShrink: 0 }} /> : <ChevronRight size={15} style={{ color: '#8A8F98', flexShrink: 0 }} />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#16181D' }}>
                              {problem?.problem_no}. {problem?.title}
                            </span>
                            {diff && (
                              <span className="px-1.5 py-px rounded" style={{ fontSize: '10px', fontWeight: 600, backgroundColor: DIFF_COLOR[diff].bg, color: DIFF_COLOR[diff].color }}>
                                {DIFF_LABEL[diff]}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span style={{ fontSize: '12px', color: '#8A8F98' }}>{subs.length}회 제출</span>
                          {best && StatusIcon && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ backgroundColor: STATUS_CONFIG[best.status].bg }}>
                              <StatusIcon size={13} style={{ color: STATUS_CONFIG[best.status].color }} />
                              <span style={{ fontSize: '12px', fontWeight: 600, color: STATUS_CONFIG[best.status].color }}>
                                {STATUS_CONFIG[best.status].label}
                              </span>
                            </div>
                          )}
                          {best?.elapsed_sec && (
                            <span className="flex items-center gap-1" style={{ fontSize: '12px', color: '#8A8F98' }}>
                              <Clock size={12} /> {formatElapsed(best.elapsed_sec)}
                            </span>
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div style={{ backgroundColor: '#F9FAFB', borderTop: '1px solid #F3F4F6' }}>
                          {subs.map((sub, idx) => {
                            const cfg = STATUS_CONFIG[sub.status];
                            return (
                              <div
                                key={sub.id}
                                className="flex items-center gap-4 px-10 py-3 cursor-pointer hover:bg-blue-50 transition-colors"
                                style={{ borderBottom: idx < subs.length - 1 ? '1px solid #F3F4F6' : 'none' }}
                                onClick={() => setCodeModal({ sub, studentName: selectedStudent?.name ?? '' })}
                              >
                                <cfg.Icon size={14} style={{ color: cfg.color, flexShrink: 0 }} />
                                <span style={{ fontSize: '13px', fontWeight: 600, color: cfg.color, width: 72 }}>{cfg.label}</span>
                                <span style={{ fontSize: '12px', color: '#8A8F98' }}>
                                  {sub.passed_count}/{sub.total_count} 케이스
                                </span>
                                {sub.elapsed_sec && (
                                  <span className="flex items-center gap-1" style={{ fontSize: '12px', color: '#8A8F98' }}>
                                    <Clock size={11} /> {formatElapsed(sub.elapsed_sec)}
                                  </span>
                                )}
                                <span style={{ fontSize: '12px', color: '#BCC0C7', marginLeft: 'auto' }}>{formatDate(sub.submitted_at)}</span>
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded" style={{ fontSize: '11px', color: '#1B64DA', backgroundColor: '#EFF6FF', fontWeight: 600 }}>
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
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E8EC' }}>
                {['번호', '문제', '난이도', '응시 학생', '제출 수', '정답률', '평균 소요시간'].map((col, i) => (
                  <th key={i} className="px-5 py-3 text-left" style={{ fontSize: '12px', fontWeight: 600, color: '#8A8F98' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {problemStats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center" style={{ fontSize: '14px', color: '#BCC0C7' }}>
                    등록된 문제가 없습니다
                  </td>
                </tr>
              ) : (
                problemStats.map((p, idx) => (
                  <tr key={p.id} style={{ borderBottom: idx < problemStats.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                    <td className="px-5 py-4" style={{ fontSize: '13px', color: '#8A8F98', width: 48 }}>
                      {p.problem_no}
                    </td>
                    <td className="px-5 py-4">
                      <span style={{ fontSize: '14px', fontWeight: 500, color: '#16181D' }}>{p.title}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded" style={{ fontSize: '11px', fontWeight: 600, backgroundColor: DIFF_COLOR[p.difficulty].bg, color: DIFF_COLOR[p.difficulty].color }}>
                        {DIFF_LABEL[p.difficulty]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span style={{ fontSize: '14px', color: '#16181D' }}>{p.student_count}명</span>
                    </td>
                    <td className="px-5 py-4">
                      <span style={{ fontSize: '14px', color: '#16181D' }}>{p.submission_count}회</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="rounded-full overflow-hidden" style={{ width: 72, height: 5, backgroundColor: '#E5E8EC' }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${p.pass_rate}%`, backgroundColor: p.pass_rate >= 70 ? '#16A34A' : p.pass_rate >= 40 ? '#1B64DA' : '#DC2626' }}
                          />
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>{p.pass_rate}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span style={{ fontSize: '13px', color: '#8A8F98' }}>{formatElapsed(p.avg_elapsed_sec)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {codeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl flex flex-col overflow-hidden" style={{ width: '60vw', height: '80vh', maxWidth: 900 }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E5E8EC', flexShrink: 0 }}>
              <div className="flex items-center gap-3">
                <FileCode2 size={18} style={{ color: '#1B64DA' }} />
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#16181D' }}>
                    {codeModal.sub.problems?.problem_no}. {codeModal.sub.problems?.title}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span style={{ fontSize: '12px', color: '#8A8F98' }}>{codeModal.studentName}</span>
                    <span style={{ fontSize: '11px', color: '#BCC0C7' }}>·</span>
                    <span style={{ fontSize: '12px', color: '#8A8F98' }}>{formatDate(codeModal.sub.submitted_at)}</span>
                    <span style={{ fontSize: '11px', color: '#BCC0C7' }}>·</span>
                    {(() => {
                      const cfg = STATUS_CONFIG[codeModal.sub.status];
                      return (
                        <span className="flex items-center gap-1" style={{ fontSize: '12px', fontWeight: 600, color: cfg.color }}>
                          <cfg.Icon size={12} /> {cfg.label}
                        </span>
                      );
                    })()}
                    <span style={{ fontSize: '12px', color: '#8A8F98' }}>
                      · {codeModal.sub.passed_count}/{codeModal.sub.total_count} 케이스
                    </span>
                    {codeModal.sub.elapsed_sec && (
                      <span style={{ fontSize: '12px', color: '#8A8F98' }}>
                        · {formatElapsed(codeModal.sub.elapsed_sec)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setCodeModal(null)}
                className="flex items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
                style={{ width: 32, height: 32, color: '#8A8F98' }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden" style={{ backgroundColor: '#1E1E1E' }}>
              <MonacoEditor
                height="100%"
                language="python"
                theme="vs-dark"
                value={codeModal.sub.code}
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
