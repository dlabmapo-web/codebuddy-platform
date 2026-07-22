import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';

const BUCKET = 'problem-assets';

async function ensureBucket() {
  const db = supabaseAdmin();
  const { data: buckets } = await db.storage.listBuckets();
  if (buckets?.find(b => b.name === BUCKET)) return;
  await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 10 * 1024 * 1024 });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin' && user.role !== 'teacher') {
    return apiError('권한이 없습니다.', 'FORBIDDEN', 403);
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const file = formData.get('file') as File | null;
  if (!file) return apiError('파일이 없습니다.', 'MISSING_FILE', 400);

  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) return apiError('파일 크기는 10MB를 초과할 수 없습니다.', 'FILE_TOO_LARGE', 400);

  await ensureBucket();

  const ext = file.name.split('.').pop() ?? 'bin';
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const db = supabaseAdmin();
  const { error } = await db.storage.from(BUCKET).upload(path, arrayBuffer, {
    contentType: file.type,
    upsert: false,
  });

  if (error) return apiError('파일 업로드에 실패했습니다.', 'UPLOAD_ERROR', 500);

  const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path);
  return apiOk({ url: publicUrl, name: file.name, type: file.type });
}
