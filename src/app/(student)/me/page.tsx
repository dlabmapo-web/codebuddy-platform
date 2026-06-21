'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Clock, MinusCircle, BookOpen, Trophy, Target } from 'lucide-react';
import Link from 'next/link';
import type { ProblemDifficulty } from '@/lib/types/db';

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
  problems: { problem_no: number; title: string; difficulty: ProblemDifficulty } | null;
};

const DIFF_LABEL: Record<ProblemDifficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
const DIFF_COLOR: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#DCFCE7', color: '#15803D' },
  medium: { bg: '#EAF1FD', color: '#1450B5' },
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
    <div className="bg-white rounded-2xl flex items-center gap-4 px-6 py-5" style={{ border: '1px solid #E5E8EC' }}>
      <div className="rounded-2xl flex items-center justify-center flex-shrink-0" style={{ width: 52, height: 52, backgroundColor: '#F6F7F9' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '13px', color: '#5A6270', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: color ?? '#16181D' }}>{value}</div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl px-6 py-5 animate-pulse" style={{ border: '1px solid #E5E8EC' }}>
      <div className="flex items-center gap-4">
        <div className="rounded-xl" style={{ width: 52, height: 52, backgroundColor: '#F0F1F3' }} />
        <div className="flex-1 flex flex-col gap-2">
          <div className="rounded" style={{ height: 16, width: '60%', backgroundColor: '#F0F1F3' }} />
          <div className="rounded" style={{ height: 13, width: '40%', backgroundColor: '#F0F1F3' }} />
        </div>
      </div>
    </div>
  );
}

export default function MyHistoryPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pass' | 'fail'>('all');

  useEffect(() => {
    fetch('/api/submissions')
      .then((r) => r.json())
      .then((json) => setSubmissions(json.submissions ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? submissions : submissions.filter((s) =>
    filter === 'pass' ? s.status === 'pass' : s.status !== 'pass'
  );

  const totalAttempts = submissions.length;
  const solvedProblems = new Set(submissions.filter((s) => s.status === 'pass').map((s) => s.problem_id)).size;
  const correctRate = totalAttempts > 0 ? Math.round((submissions.filter((s) => s.status === 'pass').length / totalAttempts) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#16181D' }}>내 풀이기록</h1>
        <p style={{ fontSize: '15px', color: '#5A6270', marginTop: 3 }}>지금까지 풀었던 문제들을 확인해보세요.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<BookOpen size={24} style={{ color: '#1B64DA' }} />} label="총 제출 횟수" value={`${totalAttempts}회`} />
        <StatCard icon={<Trophy size={24} style={{ color: '#15803D' }} />} label="해결한 문제" value={`${solvedProblems}개`} color="#15803D" />
        <StatCard icon={<Target size={24} style={{ color: '#D97706' }} />} label="정답률" value={`${correctRate}%`} />
      </div>

      <div className="flex items-center gap-2">
        {(['all', 'pass', 'fail'] as const).map((f) => {
          const label = f === 'all' ? '전체 기록' : f === 'pass' ? '✓ 정답만' : '✗ 오답만';
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-2xl transition-colors px-5"
              style={{
                height: 44,
                fontSize: '14px',
                fontWeight: filter === f ? 700 : 500,
                backgroundColor: filter === f ? '#1B64DA' : '#FFFFFF',
                color: filter === f ? '#FFFFFF' : '#5A6270',
                border: `1px solid ${filter === f ? '#1B64DA' : '#E5E8EC'}`,
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

      <div className="flex flex-col gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl flex flex-col items-center justify-center py-20 gap-3" style={{ border: '1px solid #E5E8EC' }}>
            <BookOpen size={40} style={{ color: '#E5E8EC' }} />
            <p style={{ fontSize: '17px', fontWeight: 700, color: '#16181D' }}>아직 제출 기록이 없어요</p>
            <p style={{ fontSize: '14px', color: '#5A6270' }}>문제를 풀고 제출하면 여기에 기록이 남아요!</p>
            <Link
              href="/problems"
              className="mt-2 rounded-2xl text-white px-6 flex items-center"
              style={{ height: 48, backgroundColor: '#1B64DA', fontSize: '15px', fontWeight: 700 }}
            >
              문제 풀러 가기
            </Link>
          </div>
        ) : (
          filtered.map((s) => {
            const st = STATUS_INFO[s.status];
            const diff = s.problems?.difficulty ? DIFF_COLOR[s.problems.difficulty] : null;
            const href = s.problems ? `/problems/${s.problem_id}?sid=${s.id}` : null;

            return (
              <div
                key={s.id}
                onClick={() => href && router.push(href)}
                className="bg-white rounded-2xl flex items-center gap-5 group transition-all"
                style={{
                  border: '1px solid #E5E8EC',
                  padding: '18px 24px',
                  cursor: href ? 'pointer' : 'default',
                }}
                onMouseEnter={(e) => { if (href) { e.currentTarget.style.borderColor = '#1B64DA'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(27,100,218,0.10)'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5E8EC'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div
                  className="rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ width: 52, height: 52, backgroundColor: st.bg }}
                >
                  <st.Icon size={26} style={{ color: st.color }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    {s.problems ? (
                      <>
                        <span style={{ fontSize: '13px', color: '#BCC0C7', flexShrink: 0 }}>{s.problems.problem_no}번</span>
                        <span style={{ fontSize: '16px', fontWeight: 600, color: '#16181D' }} className="truncate group-hover:text-[#1B64DA] transition-colors">
                          {s.problems.title}
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: '15px', color: '#BCC0C7' }}>삭제된 문제</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {diff && s.problems && (
                      <span className="px-2.5 py-0.5 rounded-lg" style={{ fontSize: '12px', fontWeight: 700, backgroundColor: diff.bg, color: diff.color }}>
                        {DIFF_LABEL[s.problems.difficulty]}
                      </span>
                    )}
                    <span style={{ fontSize: '13px', fontWeight: 700, color: st.color }}>{st.label}</span>
                    <span style={{ fontSize: '13px', color: '#BCC0C7' }}>·</span>
                    <span style={{ fontSize: '13px', color: '#5A6270' }}>
                      {s.passed_count}/{s.total_count} 케이스 통과
                    </span>
                    {s.elapsed_sec != null && (
                      <>
                        <span style={{ fontSize: '13px', color: '#BCC0C7' }}>·</span>
                        <span className="flex items-center gap-1" style={{ fontSize: '13px', color: '#5A6270' }}>
                          <Clock size={13} /> {formatElapsed(s.elapsed_sec)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0 text-right">
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
