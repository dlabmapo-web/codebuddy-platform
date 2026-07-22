'use client';

import { useState } from 'react';
import { ProblemProgressPanel } from './problem-progress-panel';
import { StudentProgressPanel } from './student-progress-panel';
import { SubmissionCodeModal } from './submission-code-modal';
import { useProblemProgress } from '../_hooks/use-problem-progress';
import { useStudentProgress } from '../_hooks/use-student-progress';
import type { ProgressTab } from '../_lib/types';

export function ProgressScreen() {
  const [tab, setTab] = useState<ProgressTab>('student');
  const studentProgress = useStudentProgress();
  const problemProgress = useProblemProgress();

  return (
    <div className="flex flex-col gap-5 min-w-0">
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#16181D' }}>풀이 현황</h1>
        <p style={{ fontSize: '13px', color: '#8A8F98', marginTop: 2 }}>학생별·문제별 제출 현황을 과목/단계/챕터 단위로 확인하세요.</p>
      </div>
      <div className="flex gap-1 bg-white rounded-xl p-1 w-fit" style={{ border: '1px solid #E5E8EC' }}>
        {(['student', 'problem'] as const).map((option) => (
          <button
            key={option}
            onClick={() => setTab(option)}
            style={{ height: 34, padding: '0 16px', borderRadius: 8, fontSize: '13px', fontWeight: 600, backgroundColor: tab === option ? '#1B64DA' : 'transparent', color: tab === option ? '#FFFFFF' : '#5A6270' }}
          >
            {option === 'student' ? '학생별' : '문제별'}
          </button>
        ))}
      </div>

      {tab === 'student' ? (
        <StudentProgressPanel progress={studentProgress} problemStats={problemProgress.problemStats} />
      ) : (
        <ProblemProgressPanel progress={problemProgress} />
      )}
      <SubmissionCodeModal modal={studentProgress.codeModal} onClose={studentProgress.closeCodeModal} />
    </div>
  );
}
