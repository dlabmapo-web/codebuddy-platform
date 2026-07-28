export type TeacherStudentScope =
  | { kind: 'all' }
  | { kind: 'assigned'; studentIds: string[] };

export function resolveTeacherStudentScope(
  mappedStudentIds: readonly string[]
): TeacherStudentScope {
  const studentIds = [...new Set(mappedStudentIds.filter(Boolean))];

  return studentIds.length > 0
    ? { kind: 'assigned', studentIds }
    : { kind: 'all' };
}

export function canAccessStudent(
  scope: TeacherStudentScope,
  studentId: string
): boolean {
  return scope.kind === 'all' || scope.studentIds.includes(studentId);
}
