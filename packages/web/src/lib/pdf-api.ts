import type { PdfReadResult, SavePdf } from '@cove/shared';
import { publicConfig } from './config';
import { createClient } from './supabase/client';
import { shouldForwardViewRole } from './orpc-view-role';
const endpoint = publicConfig.apiUrl.replace(/\/rpc\/?$/, '/documents');
async function headers() {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) throw new Error('AUTHENTICATION_REQUIRED');
  const result: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };
  const role = document.cookie.match(/(?:^|;\s*)cove_view_role=([^;]+)/)?.[1];
  if (role && shouldForwardViewRole())
    result['X-Cove-View-Role'] = decodeURIComponent(role);
  return result;
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint + path, {
    ...init,
    headers: { ...(await headers()), ...init?.headers },
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.code ?? 'PDF_STORAGE_FAILED');
  return data as T;
}
export const pdfApi = {
  read: (input: {
    academyId: string;
    materialId: string;
    preview?: boolean;
    download?: boolean;
  }) =>
    request<PdfReadResult>(
      '?' +
        new URLSearchParams(
          Object.entries(input).map(([k, v]) => [k, String(v)]),
        ),
    ),
  save: (input: SavePdf) =>
    request<{ materialId: string }>('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  mutate: (input: {
    academyId: string;
    courseId: string;
    lectureId: string;
    materialId: string;
    isVisible?: boolean;
  }) =>
    request(input.isVisible === undefined ? '' : '/visibility', {
      method: input.isVisible === undefined ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  upload: async (
    target: { academyId: string; courseId: string; lectureId: string },
    file: File,
    onProgress: (n: number) => void,
    signal?: AbortSignal,
  ) => {
    const authHeaders = await headers();
    return new Promise<{
      assetId: string;
      originalFilename: string;
      byteSize: number;
      pageCount: number;
    }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint + '/upload?' + new URLSearchParams(target));
      for (const [key, value] of Object.entries(authHeaders))
        xhr.setRequestHeader(key, value);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onerror = () => reject(new Error('PDF_STORAGE_FAILED'));
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data.code ?? 'PDF_STORAGE_FAILED'));
        } catch {
          reject(new Error('PDF_STORAGE_FAILED'));
        }
      };
      xhr.onabort = () =>
        reject(new DOMException('Upload canceled', 'AbortError'));
      signal?.addEventListener('abort', () => xhr.abort(), { once: true });
      if (signal?.aborted) {
        reject(new DOMException('Upload canceled', 'AbortError'));
        return;
      }
      xhr.send(file);
    });
  },
};
