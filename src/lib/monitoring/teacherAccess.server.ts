import 'server-only';

import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  canAccessStudent,
  resolveTeacherStudentScope,
} from './studentScope';

export type TeacherStudentAccessResult =
  | { allowed: true }
  | { allowed: false; reason: 'forbidden' | 'query_failed' };

export async function canTeacherMonitorStudent(
  teacherId: string,
  studentId: string
): Promise<TeacherStudentAccessResult> {
  const { data, error } = await supabaseAdmin()
    .from('teacher_student')
    .select('student_id')
    .eq('teacher_id', teacherId);

  if (error) return { allowed: false, reason: 'query_failed' };

  const scope = resolveTeacherStudentScope(
    (data ?? []).map((mapping) => mapping.student_id)
  );
  return canAccessStudent(scope, studentId)
    ? { allowed: true }
    : { allowed: false, reason: 'forbidden' };
}
