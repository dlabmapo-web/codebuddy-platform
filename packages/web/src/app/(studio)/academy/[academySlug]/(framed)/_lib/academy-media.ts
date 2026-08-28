import type { AcademyMedia } from '@cove/shared';

import { ApiError, extractAppErrorCode } from '@/lib/api-errors';
import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/client';

export type AcademyMediaResponse = {
  cover: AcademyMedia | null;
  gallery: AcademyMedia[];
};

export async function uploadAcademyMedia(input: {
  academyId: string;
  kind: 'COVER' | 'GALLERY';
  altText: string;
  decorative: boolean;
  file: File;
}): Promise<AcademyMediaResponse> {
  const token = await accessToken();
  const url = mediaUrl(input.academyId);
  url.searchParams.set('kind', input.kind);
  url.searchParams.set('altText', input.altText);
  url.searchParams.set('decorative', String(input.decorative));
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': input.file.type || 'application/octet-stream',
    },
    body: input.file,
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<AcademyMediaResponse>;
}

export async function removeAcademyMedia(input: {
  academyId: string;
  mediaId: string;
}): Promise<AcademyMediaResponse> {
  const token = await accessToken();
  const url = mediaUrl(input.academyId);
  url.searchParams.set('mediaId', input.mediaId);
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<AcademyMediaResponse>;
}

function mediaUrl(academyId: string): URL {
  const url = new URL('academy-media', `${publicConfig.apiUrl.replace(/\/rpc\/?$/, '')}/`);
  url.searchParams.set('academyId', academyId);
  return url;
}

async function accessToken(): Promise<string> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('No session', 401, [], 'AUTHENTICATION_REQUIRED');
  return token;
}

async function responseError(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const message = payload && typeof payload === 'object' && 'message' in payload
    ? String(payload.message)
    : 'Upload failed';
  return new ApiError(message, response.status, [], extractAppErrorCode(undefined, payload));
}
