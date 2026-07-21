import Link from 'next/link';
import { Circle, MessageSquare } from 'lucide-react';
import { DIFF_COLOR, DIFF_LABEL } from '../../_lib/problem-difficulty';
import { formatRelative, isOnline } from '../_lib/presence';
import type { StudentRow } from '../_lib/types';

export function StudentStatusList({ loading, students }: { loading: boolean; students: StudentRow[] }) {
  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
      {loading ? (
        Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="animate-pulse" style={{ height: 64, borderBottom: index < 4 ? '1px solid #F3F4F6' : 'none', margin: '0 20px' }} />
        ))
      ) : students.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <p style={{ fontSize: '14px', color: '#BCC0C7' }}>등록된 학생이 없습니다</p>
        </div>
      ) : (
        students.map((student, index) => {
          const online = isOnline(student.last_active_at);
          const session = online ? student.activeSession : null;
          const difficulty = session?.problems?.difficulty;

          return (
            <div
              key={student.id}
              className="flex items-center gap-4 px-5"
              style={{
                height: 64,
                borderBottom: index < students.length - 1 ? '1px solid #F3F4F6' : 'none',
                borderLeft: session ? '3px solid #1B64DA' : online ? '3px solid #16A34A' : '3px solid transparent',
              }}
            >
              <div className="relative shrink-0">
                <div
                  className="rounded-full flex items-center justify-center font-semibold"
                  style={{ width: 36, height: 36, backgroundColor: online ? '#EFF6FF' : '#F6F7F9', color: online ? '#1B64DA' : '#BCC0C7', fontSize: '14px' }}
                >
                  {student.name.charAt(0)}
                </div>
                <Circle
                  size={9}
                  className="absolute"
                  style={{ bottom: 0, right: 0, fill: online ? '#16A34A' : '#D1D5DB', color: online ? '#16A34A' : '#D1D5DB' }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#16181D' }}>{student.name}</span>
                  <span style={{ fontSize: '12px', color: '#BCC0C7' }}>@{student.username}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {session?.problems ? (
                    <>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#1B64DA' }}>풀이 중</span>
                      <span style={{ fontSize: '12px', color: '#5A6270' }}>{session.problems.problem_no}. {session.problems.title}</span>
                      {difficulty && (
                        <span className="px-1.5 py-px rounded" style={{ fontSize: '10px', fontWeight: 600, backgroundColor: DIFF_COLOR[difficulty].bg, color: DIFF_COLOR[difficulty].color }}>
                          {DIFF_LABEL[difficulty]}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ fontSize: '12px', color: online ? '#16A34A' : '#BCC0C7' }}>
                      {online ? '접속 중' : `마지막 접속 ${formatRelative(student.last_active_at)}`}
                    </span>
                  )}
                </div>
              </div>

              {session && (
                <Link
                  href={`/feedback/${session.id}`}
                  className="flex items-center gap-1.5 px-3 rounded-lg transition-colors shrink-0"
                  style={{ height: 34, backgroundColor: '#1B64DA', fontSize: '12px', fontWeight: 600, color: '#FFFFFF' }}
                  onMouseEnter={(event) => (event.currentTarget.style.backgroundColor = '#1450B5')}
                  onMouseLeave={(event) => (event.currentTarget.style.backgroundColor = '#1B64DA')}
                >
                  <MessageSquare size={13} /> 함께 풀기
                </Link>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
