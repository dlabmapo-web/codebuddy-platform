import { useCallback, useEffect, useMemo, useState } from 'react';
import { HIERARCHY_API, HIERARCHY_LABEL } from '../_lib/presentation';
import type {
  HierarchyKind,
  HierarchyModalState,
  HierarchyRow,
  NavLevel,
  ProblemRow,
  ShowMessage,
} from '../_lib/types';

export function useCurriculumBrowser(showMessage: ShowMessage) {
  const [level, setLevel] = useState<NavLevel>('subjects');
  const [subjects, setSubjects] = useState<HierarchyRow[]>([]);
  const [stages, setStages] = useState<HierarchyRow[]>([]);
  const [chapters, setChapters] = useState<HierarchyRow[]>([]);
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<HierarchyRow | null>(null);
  const [selectedStage, setSelectedStage] = useState<HierarchyRow | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<HierarchyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [hierarchyModal, setHierarchyModal] = useState<HierarchyModalState | null>(null);
  const [hierarchySaving, setHierarchySaving] = useState(false);
  const [deleteHierarchyTarget, setDeleteHierarchyTarget] = useState<{ kind: HierarchyKind; row: HierarchyRow } | null>(null);
  const [deleteProblemTarget, setDeleteProblemTarget] = useState<ProblemRow | null>(null);

  const loadSubjects = useCallback(async () => {
    const response = await fetch('/api/admin/subjects');
    const json = await response.json();
    setSubjects((json.subjects ?? []).map((row: HierarchyRow & { stage_count?: number }) => ({ ...row, child_count: row.stage_count ?? 0 })));
  }, []);

  const loadStages = useCallback(async (subjectId: string) => {
    const response = await fetch(`/api/admin/stages?subject_id=${subjectId}`);
    const json = await response.json();
    setStages((json.stages ?? []).map((row: HierarchyRow & { chapter_count?: number }) => ({ ...row, child_count: row.chapter_count ?? 0 })));
  }, []);

  const loadChapters = useCallback(async (stageId: string) => {
    const response = await fetch(`/api/admin/chapters?stage_id=${stageId}`);
    const json = await response.json();
    setChapters((json.chapters ?? []).map((row: HierarchyRow & { problem_count?: number }) => ({ ...row, child_count: row.problem_count ?? 0 })));
  }, []);

  const loadProblems = useCallback(async (chapterId: string) => {
    const response = await fetch(`/api/admin/problems?chapter_id=${chapterId}`);
    const json = await response.json();
    const rows: ProblemRow[] = json.problems ?? [];
    setProblems(rows.sort((a, b) => a.order_no - b.order_no));
  }, []);

  useEffect(() => {
    // Initial route hydration intentionally starts the existing client-side request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSubjects().finally(() => setLoading(false));
  }, [loadSubjects]);

  const currentRows = useMemo(() => {
    if (level === 'subjects') return subjects;
    if (level === 'stages') return stages;
    if (level === 'chapters') return chapters;
    return [];
  }, [chapters, level, stages, subjects]);

  const currentKind: HierarchyKind | null = level === 'subjects'
    ? 'subject'
    : level === 'stages'
      ? 'stage'
      : level === 'chapters'
        ? 'chapter'
        : null;
  const childLabel = level === 'subjects' ? '단계' : level === 'stages' ? '챕터' : '문제';
  const nextOrderNo = (level === 'problems' ? problems : currentRows)
    .reduce((maximum, row) => Math.max(maximum, row.order_no), 0) + 1;

  const refreshKind = async (kind: HierarchyKind) => {
    if (kind === 'subject') await loadSubjects();
    else if (kind === 'stage' && selectedSubject) await loadStages(selectedSubject.id);
    else if (kind === 'chapter' && selectedStage) await loadChapters(selectedStage.id);
  };

  const enterSubject = (row: HierarchyRow) => {
    setSelectedSubject(row);
    setSelectedStage(null);
    setSelectedChapter(null);
    setLevel('stages');
    loadStages(row.id);
  };

  const enterStage = (row: HierarchyRow) => {
    setSelectedStage(row);
    setSelectedChapter(null);
    setLevel('chapters');
    loadChapters(row.id);
  };

  const enterChapter = (row: HierarchyRow) => {
    setSelectedChapter(row);
    setLevel('problems');
    loadProblems(row.id);
  };

  const goTo = (target: NavLevel) => {
    if (target === 'subjects') {
      setLevel('subjects');
      setSelectedSubject(null);
      setSelectedStage(null);
      setSelectedChapter(null);
      loadSubjects();
    } else if (target === 'stages' && selectedSubject) {
      setLevel('stages');
      setSelectedStage(null);
      setSelectedChapter(null);
      loadStages(selectedSubject.id);
    } else if (target === 'chapters' && selectedStage) {
      setLevel('chapters');
      setSelectedChapter(null);
      loadChapters(selectedStage.id);
    }
  };

  const openCreateHierarchy = () => {
    if (!currentKind) return;
    setHierarchyModal({ kind: currentKind, mode: 'create', title: '', description: '', is_published: true, order_no: nextOrderNo });
  };

  const openEditHierarchy = (kind: HierarchyKind, row: HierarchyRow) => {
    setHierarchyModal({
      kind,
      mode: 'edit',
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      is_published: row.is_published,
      order_no: row.order_no,
    });
  };

  const saveHierarchy = async (data: { title: string; description: string; is_published: boolean; order_no: number }) => {
    if (!hierarchyModal) return;
    setHierarchySaving(true);
    const url = hierarchyModal.mode === 'edit' ? `${HIERARCHY_API[hierarchyModal.kind]}/${hierarchyModal.id}` : HIERARCHY_API[hierarchyModal.kind];
    const method = hierarchyModal.mode === 'edit' ? 'PATCH' : 'POST';
    const body: Record<string, unknown> = { ...data };
    if (hierarchyModal.mode === 'create') {
      if (hierarchyModal.kind === 'stage' && selectedSubject) body.subject_id = selectedSubject.id;
      if (hierarchyModal.kind === 'chapter' && selectedStage) body.stage_id = selectedStage.id;
    }
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setHierarchySaving(false);
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      showMessage(json?.error?.message ?? `${HIERARCHY_LABEL[hierarchyModal.kind]} 저장 중 오류가 발생했습니다.`, 'err');
      return;
    }
    showMessage(hierarchyModal.mode === 'edit' ? `${HIERARCHY_LABEL[hierarchyModal.kind]}가 수정되었습니다.` : `${HIERARCHY_LABEL[hierarchyModal.kind]}가 추가되었습니다.`, 'ok');
    setHierarchyModal(null);
    await refreshKind(hierarchyModal.kind);
  };

  const toggleHierarchyPublish = async (kind: HierarchyKind, row: HierarchyRow) => {
    await fetch(`${HIERARCHY_API[kind]}/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: !row.is_published }),
    });
    await refreshKind(kind);
  };

  const deleteHierarchy = async () => {
    if (!deleteHierarchyTarget) return;
    const { kind, row } = deleteHierarchyTarget;
    const response = await fetch(`${HIERARCHY_API[kind]}/${row.id}`, { method: 'DELETE' });
    const json = await response.json();
    setDeleteHierarchyTarget(null);
    if (!response.ok) {
      showMessage(json.error?.message ?? '삭제 중 오류가 발생했습니다.', 'err');
      return;
    }
    showMessage(`${HIERARCHY_LABEL[kind]}가 삭제되었습니다.`, 'ok');
    await refreshKind(kind);
  };

  const moveHierarchy = async (kind: HierarchyKind, row: HierarchyRow, siblings: HierarchyRow[], direction: -1 | 1) => {
    const sorted = [...siblings].sort((a, b) => a.order_no - b.order_no);
    const index = sorted.findIndex((candidate) => candidate.id === row.id);
    const other = sorted[index + direction];
    if (!other) return;
    await Promise.all([
      fetch(`${HIERARCHY_API[kind]}/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_no: other.order_no }) }),
      fetch(`${HIERARCHY_API[kind]}/${other.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_no: row.order_no }) }),
    ]);
    await refreshKind(kind);
  };

  const toggleProblemPublish = async (problem: ProblemRow) => {
    await fetch(`/api/admin/problems/${problem.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_published: !problem.is_published }) });
    if (selectedChapter) await loadProblems(selectedChapter.id);
  };

  const moveProblem = async (problem: ProblemRow, direction: -1 | 1) => {
    const index = problems.findIndex((candidate) => candidate.id === problem.id);
    const other = problems[index + direction];
    if (!other) return;
    await Promise.all([
      fetch(`/api/admin/problems/${problem.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_no: other.order_no }) }),
      fetch(`/api/admin/problems/${other.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_no: problem.order_no }) }),
    ]);
    if (selectedChapter) await loadProblems(selectedChapter.id);
  };

  const deleteProblem = async () => {
    if (!deleteProblemTarget) return;
    const response = await fetch(`/api/admin/problems/${deleteProblemTarget.id}`, { method: 'DELETE' });
    setDeleteProblemTarget(null);
    if (!response.ok) {
      showMessage('삭제 중 오류가 발생했습니다.', 'err');
      return;
    }
    showMessage('문제가 삭제되었습니다.', 'ok');
    if (selectedChapter) await loadProblems(selectedChapter.id);
  };

  const refreshAll = () => {
    loadSubjects();
    if (selectedSubject) loadStages(selectedSubject.id);
    if (selectedStage) loadChapters(selectedStage.id);
    if (selectedChapter) loadProblems(selectedChapter.id);
  };

  return {
    chapters, childLabel, currentKind, currentRows, deleteHierarchy, deleteHierarchyTarget,
    deleteProblem, deleteProblemTarget, enterChapter, enterStage, enterSubject, goTo,
    hierarchyModal, hierarchySaving, level, loading, moveHierarchy, moveProblem,
    openCreateHierarchy, openEditHierarchy, problems, refreshAll, loadProblems, saveHierarchy,
    selectedChapter, selectedStage, selectedSubject, setDeleteHierarchyTarget,
    setDeleteProblemTarget, setHierarchyModal, stages, subjects, toggleHierarchyPublish,
    toggleProblemPublish,
  };
}
