import { getCurrentUser, type CurrentUser } from '@/lib/auth/session';
import { apiError } from '@/lib/api/response';

export async function requireAdmin(): Promise<
  { user: CurrentUser; error?: undefined } | { user?: undefined; error: Response }
> {
  const user = await getCurrentUser();
  if (!user) return { error: apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401) };
  if (user.role !== 'admin') return { error: apiError('권한이 없습니다.', 'FORBIDDEN', 403) };
  return { user };
}
