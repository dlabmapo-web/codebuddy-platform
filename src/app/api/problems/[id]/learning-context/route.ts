import { getCurrentUser } from '@/lib/auth/session';
import { apiError, apiOk } from '@/lib/api/response';
import { getLearningContext } from '@/lib/curriculum/learningContext.server';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'student') {
    return apiError('학생 계정만 조회할 수 있습니다.', 'FORBIDDEN', 403);
  }

  const { id } = await params;
  const learningContext = await getLearningContext({
    problemId: id,
    studentId: user.id,
  });

  return apiOk({ learning_context: learningContext });
}
