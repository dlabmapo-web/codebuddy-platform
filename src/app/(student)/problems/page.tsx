'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronRight, BookOpen, PenLine, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { ProblemDifficulty } from '@/lib/types/db';

type SolveStatus = 'unsolved' | 'tried' | 'solved';

type StudentProblem = {
  id: string;
  problem_no: number;
  title: string;
  difficulty: ProblemDifficulty;
  sub_no: number;
  solve_status: SolveStatus;
};

type StudentCategory = {
  id: string;
  title: string;
  description: string | null;
  order_no: number;
  level_no: number;
  problems: StudentProblem[];
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
  const [categories, setCategories] = useState<StudentCategory[]>([]);
  const [allCategories, setAllCategories] = useState<{ id: string; title: string; level_no: number }[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftSession[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [q, setQ] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('');

  const fetchProblems = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (activeCategory) params.set('category', activeCategory);
    const res = await fetch(`/api/problems?${params.toString()}`);
    const json = await res.json();
    const cats: StudentCategory[] = json.categories ?? [];
    setCategories(cats);
    // 새로 로드된 카테고리는 기본값 펼침 상태로
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const c of cats) {
        if (!(c.id in next)) next[c.id] = false;
      }
      return next;
    });
    setLoading(false);
  }, [q, activeCategory]);

  // 카테고리 필터 칩은 전체 카테고리 목록을 항상 유지 (검색/필터로 사라지지 않도록)
  const fetchAllCategories = useCallback(async () => {
    const res = await fetch('/api/problems');
    const json = await res.json();
    const cats: StudentCategory[] = json.categories ?? [];
    setAllCategories(cats.map((c) => ({ id: c.id, title: c.title, level_no: c.level_no })));
  }, []);

  const fetchDrafts = useCallback(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((json) => {
        const sessions: DraftSession[] = json.sessions ?? [];
        const byProblem = new Map<string, DraftSession>();
        for (const s of sessions) {
          if (!s.final_code || !s.problems || !s.problem_id) continue;
          if (!byProblem.has(s.problem_id)) byProblem.set(s.problem_id, s);
        }
        setDrafts(Array.from(byProblem.values()));
        setDraftsLoading(false);
      })
      .catch(() => setDraftsLoading(false));
  }, []);

  const deleteDraft = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDrafts((prev) => prev.filter((d) => d.id !== sessionId));
    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_code: null }),
    });
  }, []);

  useEffect(() => { fetchAllCategories(); }, [fetchAllCategories]);

  useEffect(() => {
    fetchDrafts();
    const timer = setTimeout(fetchDrafts, 1500);
    return () => clearTimeout(timer);
  }, [fetchDrafts]);

  useEffect(() => { fetchProblems(); }, [fetchProblems]);

  const pendingDrafts = useMemo(() => {
    if (draftsLoading) return [];
    const solvedIds = new Set<string>();
    for (const c of categories) {
      for (const p of c.problems) {
        if (p.solve_status === 'solved') solvedIds.add(p.id);
      }
    }
    return drafts.filter((d) => !solvedIds.has(d.problem_id));
  }, [draftsLoading, drafts, categories]);

  const { solvedCount, triedCount, totalCount } = useMemo(() => {
    let solved = 0, tried = 0, total = 0;
    for (const c of categories) {
      for (const p of c.problems) {
        total++;
        if (p.solve_status === 'solved') solved++;
        else if (p.solve_status === 'tried') tried++;
      }
    }
    return { solvedCount: solved, triedCount: tried, totalCount: total };
  }, [categories]);

  const draftByProblem = useMemo(() => new Set(pendingDrafts.map((d) => d.problem_id)), [pendingDrafts]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#16181D' }}>문제 목록</h1>
          <p style={{ fontSize: '15px', color: '#5A6270', marginTop: 3 }}>주제를 골라 차근차근 풀어보세요!</p>
        </div>
        {!loading && totalCount > 0 && (
          <div className="flex items-center gap-4" style={{ fontSize: '14px', color: '#5A6270' }}>
            <span><b style={{ color: '#15803D' }}>{solvedCount}</b>개 완료</span>
            <span><b style={{ color: '#D97706' }}>{triedCount}</b>개 도전 중</span>
            <span><b style={{ color: '#16181D' }}>{totalCount}</b>개 전체</span>
          </div>
        )}
      </div>

      {/* ── 이어서 풀기 섹션 ─────────────────────────────────── */}
      {pendingDrafts.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #BFDBFE' }}>
          <button
            onClick={() => setDraftsOpen((o) => !o)}
            className="flex items-center gap-2 w-full px-5 py-3 transition-colors"
            style={{ background: draftsOpen ? '#DBEAFE' : '#EFF6FF', borderBottom: draftsOpen ? '1px solid #BFDBFE' : 'none' }}
          >
            <PenLine size={15} style={{ color: '#1B64DA' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#1B64DA' }}>이어서 풀기</span>
            <span className="rounded-full px-2 py-0.5" style={{ fontSize: '12px', fontWeight: 700, background: '#1B64DA', color: '#fff' }}>
              {pendingDrafts.length}
            </span>
            <span style={{ fontSize: '13px', color: '#3B82F6', flex: 1, textAlign: 'left', marginLeft: 4 }}>작성하다 저장된 코드가 있어요.</span>
            {draftsOpen
              ? <ChevronUp size={15} style={{ color: '#93C5FD', flexShrink: 0 }} />
              : <ChevronDown size={15} style={{ color: '#93C5FD', flexShrink: 0 }} />
            }
          </button>
          {draftsOpen && (
            <div className="flex flex-col" style={{ background: '#EFF6FF' }}>
              {pendingDrafts.map((d, i) => {
                const diff = DIFF_COLOR[d.problems!.difficulty];
                const lines = d.final_code.trim().split('\n').length;
                return (
                  <div
                    key={d.id}
                    onClick={() => router.push(`/problems/${d.problem_id}`)}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                    style={{ background: 'transparent', borderTop: i > 0 ? '1px solid #DBEAFE' : 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#DBEAFE')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="rounded-lg flex items-center justify-center shrink-0" style={{ width: 34, height: 34, background: '#fff', border: '1px solid #BFDBFE' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1B64DA' }}>{d.problems!.problem_no}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }} className="truncate">{d.problems!.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="px-1.5 py-px rounded" style={{ fontSize: '10px', fontWeight: 700, backgroundColor: diff.bg, color: diff.color }}>
                          {DIFF_LABEL[d.problems!.difficulty]}
                        </span>
                        <span style={{ fontSize: '11px', color: '#3B82F6' }}>코드 {lines}줄</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteDraft(d.id, e)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors hover:bg-[#BFDBFE]"
                      title="이어 풀기 삭제"
                    >
                      <X size={13} style={{ color: '#93C5FD' }} />
                    </button>
                    <ChevronRight size={15} style={{ color: '#93C5FD', flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 검색 ──────────────────────────────────────────────── */}
      <form
        onSubmit={(e) => { e.preventDefault(); fetchProblems(); }}
        className="flex items-center gap-2"
        style={{ maxWidth: 420 }}
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

      {/* ── 카테고리 필터 칩 ──────────────────────────────────── */}
      {allCategories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveCategory('')}
            className="rounded-full transition-colors px-4"
            style={{
              height: 38,
              fontSize: '14px',
              fontWeight: activeCategory === '' ? 700 : 500,
              backgroundColor: activeCategory === '' ? '#1B64DA' : '#FFFFFF',
              color: activeCategory === '' ? '#FFFFFF' : '#5A6270',
              border: `1px solid ${activeCategory === '' ? '#1B64DA' : '#E5E8EC'}`,
            }}
          >
            전체
          </button>
          {allCategories.map((c) => {
            const active = activeCategory === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className="rounded-full transition-colors px-4"
                style={{
                  height: 38,
                  fontSize: '14px',
                  fontWeight: active ? 700 : 500,
                  backgroundColor: active ? '#1B64DA' : '#FFFFFF',
                  color: active ? '#FFFFFF' : '#5A6270',
                  border: `1px solid ${active ? '#1B64DA' : '#E5E8EC'}`,
                }}
              >
                {c.title}
              </button>
            );
          })}
        </div>
      )}

      {/* ── 2레벨 문제 목록 ───────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : categories.length === 0 ? (
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
        <div className="flex flex-col gap-7">
          {categories.map((cat) => {
            const catSolved = cat.problems.filter((p) => p.solve_status === 'solved').length;
            const isCollapsed = collapsed[cat.id] ?? false;
            return (
              <section key={cat.id} className="flex flex-col gap-0 rounded-2xl overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [cat.id]: !c[cat.id] }))}
                  className="flex items-center gap-3 w-full text-left px-5 py-4 transition-colors"
                  style={{ background: '#F0F4FF', borderBottom: isCollapsed ? 'none' : '1px solid #E5E8EC' }}
                >
                  <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 28, height: 28, backgroundColor: '#1B64DA', color: '#fff', fontSize: '14px', fontWeight: 700 }}>
                    {cat.level_no}
                  </span>
                  <div className="flex items-baseline gap-2 flex-wrap flex-1">
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#16181D' }}>{cat.title}</h2>
                    <span style={{ fontSize: '13px', color: '#8A8F98' }}>{catSolved}/{cat.problems.length} 완료</span>
                    {cat.description && (
                      <span style={{ fontSize: '13px', color: '#8A8F98' }}>· {cat.description}</span>
                    )}
                  </div>
                  {isCollapsed
                    ? <ChevronDown size={18} style={{ color: '#BCC0C7', flexShrink: 0 }} />
                    : <ChevronUp size={18} style={{ color: '#BCC0C7', flexShrink: 0 }} />
                  }
                </button>

                {!isCollapsed && (
                  <div className="flex flex-col gap-2.5 p-4" style={{ background: '#FAFBFC' }}>
                    {cat.problems.map((p) => {
                      const st = STATUS[p.solve_status];
                      const diff = DIFF_COLOR[p.difficulty];
                      const hasDraft = draftByProblem.has(p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => router.push(`/problems/${p.id}`)}
                          className="bg-white rounded-2xl flex items-center gap-5 cursor-pointer group transition-all"
                          style={{ border: `1px solid ${hasDraft ? '#BFDBFE' : '#E5E8EC'}`, padding: '16px 22px' }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1B64DA'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(27,100,218,0.10)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = hasDraft ? '#BFDBFE' : '#E5E8EC'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 50, height: 50, backgroundColor: '#F6F7F9', border: '1px solid #E5E8EC' }}>
                            <span style={{ fontSize: '15px', fontWeight: 700, color: '#5A6270', fontFamily: 'monospace' }}>{cat.level_no}-{p.sub_no}</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="mb-1.5">
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
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
