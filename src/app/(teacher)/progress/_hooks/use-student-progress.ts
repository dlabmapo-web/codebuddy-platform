import { useCallback, useEffect, useMemo, useState } from 'react';
import { groupSubmissionsByProblem, uniqueSubmissionProblems } from '../_lib/progress';
import type { CodeModal, Student, Submission } from '../_lib/types';

export function useStudentProgress() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [expandedProblems, setExpandedProblems] = useState<Set<string>>(new Set());
  const [codeModal, setCodeModal] = useState<CodeModal | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/students').then((response) => response.json()).then((json) => {
      const list = (json.users ?? []) as Student[];
      setStudents(list);
      if (list.length > 0) setSelectedStudent(list[0]);
    });
  }, []);

  const loadSubmissions = useCallback(async (studentId: string) => {
    setLoading(true);
    const response = await fetch(`/api/submissions?student_id=${studentId}`);
    const json = await response.json();
    setSubmissions(json.submissions ?? []);
    setExpandedProblems(new Set());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedStudent) return;
    // A selected student intentionally starts the external submissions synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSubmissions(selectedStudent.id);
  }, [selectedStudent, loadSubmissions]);

  const toggleProblem = (problemId: string) => {
    setExpandedProblems((current) => {
      const next = new Set(current);
      if (next.has(problemId)) next.delete(problemId);
      else next.add(problemId);
      return next;
    });
  };

  const groupedSubmissions = useMemo(() => groupSubmissionsByProblem(submissions), [submissions]);
  const problems = useMemo(() => uniqueSubmissionProblems(submissions), [submissions]);

  return {
    closeCodeModal: () => setCodeModal(null),
    codeModal,
    expandedProblems,
    groupedSubmissions,
    loading,
    openCodeModal: (submission: Submission) => setCodeModal({ submission, studentName: selectedStudent?.name ?? '' }),
    problems,
    selectStudent: setSelectedStudent,
    selectedStudent,
    students,
    submissions,
    toggleProblem,
  };
}
