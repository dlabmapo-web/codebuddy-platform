import Link from 'next/link';
import { BookOpen, ChevronRight, Clock } from 'lucide-react';
import { curriculumOf } from '../_lib/submissions';
import { DIFF_COLOR, DIFF_LABEL, formatDate, formatElapsed, STATUS_INFO } from '../_lib/presentation';
import type { Submission } from '../_lib/types';

type SubmissionListProps = {
  loading: boolean;
  submissions: Submission[];
  onOpenSubmission: (submission: Submission) => void;
};

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

export function SubmissionList({ loading, submissions, onOpenSubmission }: SubmissionListProps) {
  if (loading) {
    return <div className="flex flex-col gap-3">{Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}</div>;
  }

  if (submissions.length === 0) {
    return (
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
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {submissions.map((submission) => {
        const status = STATUS_INFO[submission.status];
        const { problem, chapter, stage, subject } = curriculumOf(submission);
        const difficulty = problem?.difficulty ? DIFF_COLOR[problem.difficulty] : null;
        const canOpen = Boolean(problem);

        return (
          <div
            key={submission.id}
            onClick={() => canOpen && onOpenSubmission(submission)}
            className="bg-white rounded-2xl flex items-center gap-5 group transition-all"
            style={{
              border: '1px solid #E5E8EC',
              padding: '18px 24px',
              cursor: canOpen ? 'pointer' : 'default',
            }}
            onMouseEnter={(event) => {
              if (canOpen) {
                event.currentTarget.style.borderColor = '#1B64DA';
                event.currentTarget.style.boxShadow = '0 4px 16px rgba(27,100,218,0.10)';
              }
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.borderColor = '#E5E8EC';
              event.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div className="rounded-2xl flex items-center justify-center shrink-0" style={{ width: 52, height: 52, backgroundColor: status.bg }}>
              <status.Icon size={26} style={{ color: status.color }} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                {problem ? (
                  <>
                    <span style={{ fontSize: '13px', color: '#BCC0C7', flexShrink: 0 }}>
                      {chapter ? `${chapter.order_no}-${problem.order_no}` : `${problem.problem_no}번`}
                    </span>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#16181D' }} className="truncate group-hover:text-primary transition-colors">
                      {problem.title}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: '15px', color: '#BCC0C7' }}>삭제된 문제</span>
                )}
              </div>
              {subject && stage && chapter && (
                <div className="mb-2 flex min-w-0 items-center gap-1.5 overflow-hidden" style={{ fontSize: '11px', color: '#8A8F98' }}>
                  <span className="truncate">{subject.title}</span>
                  <ChevronRight size={10} className="shrink-0" />
                  <span className="truncate">{stage.title}</span>
                  <ChevronRight size={10} className="shrink-0" />
                  <span className="truncate">{chapter.title}</span>
                </div>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                {difficulty && problem && (
                  <span className="px-2.5 py-0.5 rounded-lg" style={{ fontSize: '12px', fontWeight: 700, backgroundColor: difficulty.bg, color: difficulty.color }}>
                    {DIFF_LABEL[problem.difficulty]}
                  </span>
                )}
                <span style={{ fontSize: '13px', fontWeight: 700, color: status.color }}>{status.label}</span>
                <span style={{ fontSize: '13px', color: '#BCC0C7' }}>·</span>
                <span style={{ fontSize: '13px', color: '#5A6270' }}>
                  {submission.passed_count}/{submission.total_count} 케이스 통과
                </span>
                {submission.elapsed_sec != null && (
                  <>
                    <span style={{ fontSize: '13px', color: '#BCC0C7' }}>·</span>
                    <span className="flex items-center gap-1" style={{ fontSize: '13px', color: '#5A6270' }}>
                      <Clock size={13} /> {formatElapsed(submission.elapsed_sec)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div style={{ fontSize: '16px', fontWeight: 700, color: status.color }}>{status.label}</div>
              <div style={{ fontSize: '12px', color: '#BCC0C7', marginTop: 2 }}>{formatDate(submission.submitted_at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
