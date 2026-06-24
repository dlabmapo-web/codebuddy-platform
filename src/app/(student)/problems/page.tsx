'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronRight, BookOpen, PenLine } from 'lucide-react';
import type { ProblemDifficulty } from '@/lib/types/db';

type SolveStatus = 'unsolved' | 'tried' | 'solved';

type ProblemRow = {
  id: string;
  problem_no: number;
  title: string;
  difficulty: ProblemDifficulty;
  solve_status: SolveStatus;
};

type DraftSession = {
  id: string;
  problem_id: string;
  final_code: string;
  started_at: string;
  problems: {
    problem_no: number;
    title: string;
    difficulty: ProblemDifficulty;
  } | null;
};

const DIFF_LABEL: Record<ProblemDifficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
const DIFF_COLOR: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#DCFCE7', color: '#15803D' },
  medium: { bg: '#EAF1FD', color: '#1450B5' },
  hard: { bg: '#FEE2E2', color: '#B91C1C' },
};
const STATUS: Record<SolveStatus, { label: string; color: string; bg: string }> = {
  unsolved: { label: '미풀이', color: '#BCC0C7', bg: '#F6F7F9' },
  tried: { label: '도전 중', color: '#D97706', bg: '#FEF3C7' },
  solved: { label: '완료', color: '#15803D', bg: '#DCFCE7' },
};

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl px-6 py-5 animate-pulse" style={{ border: '1px solid #E5E8EC' }}>
      <div className="flex items-center gap-4">
        <div className="rounded-xl" style={{ width: 48, height: 48, backgroundColor: '#F0F1F3' }} />
        <div className="flex-1 flex flex-col gap-2">
          <div className="rounded" style={{ height: 16, width: '55%', backgroundColor: '#F0F1F3' }} />
          <div className="rounded" style={{ height: 13, width: '30%', backgroundColor: '#F0F1F3' }} />
        </div>
      </div>
    </div>
  );
}

export default function ProblemsPage() {
  const router = useRouter();
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftSession[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'no' | 'difficulty'>('no');

  const fetchProblems = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('sort', sort);
    const res = await fetch(`/api/problems?${params.toString()}`);
    const json = await res.json();
    setProblems(json.problems ?? []);
    setLoading(false);
  }, [q, sort]);

  const fetchDrafts = useCallback(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(json => {
        const sessions: DraftSession[] = json.sessions ?? [];
        const byProblem = new Map<string, DraftSession>();
        for (const s of sessions) {
          if (!s.final_code || !s.problems || !s.problem_id) continue;
          if (!byProblem.has(s.problem_id)) {
            byProblem.set(s.problem_id, s);
          }
        }
        setDrafts(Array.from(byProblem.values()));
        setDraftsLoading(false);
      })
      .catch(() => setDraftsLoading(false));
  }, []);

  // 마운트 시 즉시 조회 + 1.5초 후 재조회 (keepalive PATCH 경쟁 조건 대응)
  useEffect(() => {
    fetchDrafts();
    const timer = setTimeout(fetchDrafts, 1500);
    return () => clearTimeout(timer);
  }, [fetchDrafts]);

  useEffect(() => { fetchProblems(); }, [fetchProblems]);

  // 작성하던 코드(draft)가 있으면 통과 여부와 관계없이 "이어서 풀기"로 노출.
  // (이전에 통과한 문제라도 다시 풀던 코드를 이어서 작업할 수 있어야 함)
  const pendingDrafts = draftsLoading ? [] : drafts;

  const solvedCount = problems.filter((p) => p.solve_status === 'solved').length;
  const triedCount = problems.filter((p) => p.solve_status === 'tried').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#16181D' }}>문제 목록</h1>
          <p style={{ fontSize: '15px', color: '#5A6270', marginTop: 3 }}>문제를 골라서 풀어보세요!</p>
        </div>
        {!loading && problems.length > 0 && (
          <div className="flex items-center gap-4" style={{ fontSize: '14px', color: '#5A6270' }}>
            <span><b style={{ color: '#15803D' }}>{solvedCount}</b>개 완료</span>
            <span><b style={{ color: '#D97706' }}>{triedCount}</b>개 도전 중</span>
            <span><b style={{ color: '#16181D' }}>{problems.length}</b>개 전체</span>
          </div>
        )}
      </div>

      {/* ── 이어서 풀기 섹션 ─────────────────────────────────── */}
      {pendingDrafts.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #BFDBFE', background: '#EFF6FF' }}>
          <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid #BFDBFE' }}>
            <PenLine size={15} style={{ color: '#1B64DA' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#1B64DA' }}>이어서 풀기</span>
            <span className="rounded-full px-2 py-0.5 ml-0.5" style={{ fontSize: '12px', fontWeight: 700, background: '#1B64DA', color: '#fff' }}>
              {pendingDrafts.length}
            </span>
            <span style={{ fontSize: '13px', color: '#3B82F6', marginLeft: 4 }}>작성하다 저장된 코드가 있어요. 이어서 풀어보세요!</span>
          </div>
          <div className="flex flex-col divide-y" style={{ '--tw-divide-opacity': 1, borderColor: '#DBEAFE' } as React.CSSProperties}>
            {pendingDrafts.map(d => {
              const diff = DIFF_COLOR[d.problems!.difficulty];
              const lines = d.final_code.trim().split('\n').length;
              return (
                <div
                  key={d.id}
                  onClick={() => router.push(`/problems/${d.problem_id}`)}
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors"
                  style={{ background: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#DBEAFE')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 44, height: 44, background: '#fff', border: '1px solid #BFDBFE' }}>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#1B64DA' }}>{d.problems!.problem_no}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#16181D' }} className="truncate">
                      {d.problems!.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 rounded-lg" style={{ fontSize: '11px', fontWeight: 700, backgroundColor: diff.bg, color: diff.color }}>
                        {DIFF_LABEL[d.problems!.difficulty]}
                      </span>
                      <span style={{ fontSize: '12px', color: '#3B82F6' }}>코드 {lines}줄 저장됨</span>
                    </div>
                  </div>
                  <ChevronRight size={18} style={{ color: '#93C5FD', flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 검색 / 정렬 ──────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <form
          onSubmit={(e) => { e.preventDefault(); fetchProblems(); }}
          className="flex items-center gap-2 flex-1"
          style={{ maxWidth: 360 }}
        >
          <div className="flex items-center flex-1 rounded-2xl px-4 gap-2 bg-white" style={{ border: '1px solid #E5E8EC', height: 48 }}>
            <Search size={17} style={{ color: '#BCC0C7', flexShrink: 0 }} />
            <input
              className="flex-1 focus:outline-none"
              style={{ fontSize: '15px', color: '#16181D' }}
              placeholder="문제 제목으로 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          {(['no', 'difficulty'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className="rounded-2xl transition-colors px-4"
              style={{
                height: 48,
                fontSize: '14px',
                fontWeight: sort === s ? 700 : 500,
                backgroundColor: sort === s ? '#1B64DA' : '#FFFFFF',
                color: sort === s ? '#FFFFFF' : '#5A6270',
                border: `1px solid ${sort === s ? '#1B64DA' : '#E5E8EC'}`,
              }}
            >
              {s === 'no' ? '번호순' : '난이도순'}
            </button>
          ))}
        </div>
      </div>

      {/* ── 전체 문제 목록 ────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : problems.length === 0 ? (
          <div className="bg-white rounded-2xl flex flex-col items-center justify-center py-20 gap-3" style={{ border: '1px solid #E5E8EC' }}>
            <BookOpen size={40} style={{ color: '#E5E8EC' }} />
            <p style={{ fontSize: '17px', fontWeight: 700, color: '#16181D' }}>
              {q ? '검색 결과가 없어요' : '아직 문제가 없어요'}
            </p>
            <p style={{ fontSize: '14px', color: '#5A6270' }}>
              {q ? '다른 키워드로 검색해보세요' : '선생님이 곧 문제를 등록할 거예요!'}
            </p>
          </div>
        ) : (
          problems.map((p) => {
            const st = STATUS[p.solve_status];
            const diff = DIFF_COLOR[p.difficulty];
            const hasDraft = pendingDrafts.some(d => d.problem_id === p.id);
            return (
              <div
                key={p.id}
                onClick={() => router.push(`/problems/${p.id}`)}
                className="bg-white rounded-2xl flex items-center gap-5 cursor-pointer group transition-all"
                style={{ border: `1px solid ${hasDraft ? '#BFDBFE' : '#E5E8EC'}`, padding: '18px 24px' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1B64DA'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(27,100,218,0.10)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = hasDraft ? '#BFDBFE' : '#E5E8EC'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 52, height: 52, backgroundColor: '#F6F7F9', border: '1px solid #E5E8EC' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#5A6270' }}>{p.problem_no}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#16181D' }} className="group-hover:text-[#1B64DA] transition-colors truncate">
                      {p.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg" style={{ fontSize: '12px', fontWeight: 700, backgroundColor: diff.bg, color: diff.color }}>
                      {DIFF_LABEL[p.difficulty]}
                    </span>
                    {hasDraft && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg" style={{ fontSize: '12px', fontWeight: 600, backgroundColor: '#EFF6FF', color: '#1B64DA' }}>
                        <PenLine size={10} />
                        이어 풀기
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <span className="px-3 py-1.5 rounded-xl" style={{ fontSize: '13px', fontWeight: 700, backgroundColor: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                  <ChevronRight size={20} style={{ color: '#BCC0C7' }} className="group-hover:text-[#1B64DA] transition-colors" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
