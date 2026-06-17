import { cookies } from 'next/headers';
import { verifyToken } from './jwt';
import type { UserRole } from '@/lib/types/db';

export const COOKIE_NAME = 'pc_token';

export interface CurrentUser {
  id: string;
  role: UserRole;
  name: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  return { id: payload.sub, role: payload.role, name: payload.name };
}
