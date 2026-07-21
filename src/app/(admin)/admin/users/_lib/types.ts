import type { UserRole } from '@/lib/types/db';

export type UserRow = {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  last_active_at: string | null;
  created_at: string;
  teachers: string[];
  student_count: number;
};

export type UserStats = {
  total: number;
  studentCount: number;
  teacherCount: number;
  activeCount: number;
};

export type EditUserForm = {
  name: string;
  role: 'student' | 'teacher';
  is_active: boolean;
  new_password: string;
};

export type RoleFilter = 'all' | 'student' | 'teacher';
export type StatusFilter = 'all' | 'active' | 'inactive';
export type ToastMessage = { message: string; type: 'ok' | 'err' };
