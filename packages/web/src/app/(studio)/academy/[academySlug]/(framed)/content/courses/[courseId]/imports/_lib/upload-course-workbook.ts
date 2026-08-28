import type { ContentImportPreview } from '@cove/shared';
import { CONTENT_IMPORT_MAX_UPLOAD_BYTES } from '@cove/shared';

import { ApiError, extractAppErrorCode } from '@/lib/api-errors';
import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/client';

/**
 * The two calls that move bytes, on the browser's side.
 *
 * Not oRPC, for the reason §8 gives: the contract layer carries JSON, and ten
 * megabytes of spreadsheet base64-encoded into a JSON string is a third larger
 * and gets decoded twice. Everything after the bytes — preview, commit,
 * result — is an ordinary typed call and goes through `orpc`.
 *
 * The content type sent here is whatever the browser guessed. The API ignores
 * it and reads the format from the leading bytes, so nothing here has to be
 * honest for the upload to be safe — only for the error to be useful.
 */
export async function uploadCourseWorkbook(input: {
  academyId: string;
  courseId: string;
  file: File;
}): Promise<ContentImportPreview> {
  const token = await accessToken();

  const url = new URL('content-imports', `${apiRoot()}/`);
  url.searchParams.set('academyId', input.academyId);
  url.searchParams.set('courseId', input.courseId);
  url.searchParams.set('filename', input.file.name);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type':
        input.file.type ||
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    body: input.file,
  });

  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as ContentImportPreview;
}

/**
 * A generated workbook, saved to disk.
 *
 * Fetched with the access token and handed over as a blob rather than opened as
 * a plain link: the endpoint requires `content.import`, and a bare `<a href>`
 * carries no Authorization header. It would answer 401 in a new tab, which
 * looks like the feature is broken rather than like the browser asked wrong.
 */
export async function downloadCourseWorkbook(input: {
  academyId: string;
  courseId: string;
  kind: 'current' | 'blank';
  locale: string;
  moduleIds?: string[];
  lectureIds?: string[];
}): Promise<void> {
  const token = await accessToken();

  const url = new URL('content-imports/template', `${apiRoot()}/`);
  url.searchParams.set('academyId', input.academyId);
  url.searchParams.set('courseId', input.courseId);
  url.searchParams.set('kind', input.kind);
  url.searchParams.set('locale', input.locale.startsWith('ko') ? 'ko' : 'en');
  for (const moduleId of input.moduleIds ?? []) {
    url.searchParams.append('moduleIds', moduleId);
  }
  for (const lectureId of input.lectureIds ?? []) {
    url.searchParams.append('lectureIds', lectureId);
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw await toApiError(response);

  const blob = await response.blob();
  const filename =
    response.headers
      .get('Content-Disposition')
      ?.match(/filename="([^"]+)"/)?.[1] ?? 'course-import.xlsx';

  saveBlob(blob, filename);
}

/**
 * Hand the reader a file the browser is holding.
 *
 * An object URL rather than a data URI: Safari caps data URIs well below the
 * size a two-hundred-problem workbook reaches, and the revoke keeps the blob
 * from being held for the life of the tab.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** The issue report, with the BOM Excel needs to read UTF-8 as UTF-8. */
export function saveCsv(filename: string, csv: string): void {
  saveBlob(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }), filename);
}

/**
 * The same size check the server makes, made before the upload starts.
 *
 * Not a substitute for the server's — that one is authoritative and enforced
 * while the body streams — but sending ten megabytes to be told it is too big
 * is a slow way to learn something the browser already knew.
 */
export function workbookIsTooLarge(file: File): boolean {
  return file.size > CONTENT_IMPORT_MAX_UPLOAD_BYTES;
}

/**
 * Whether the file even claims to be a workbook.
 *
 * A name check, and only advisory — the server sniffs the leading bytes and
 * refuses anything that is not a zip regardless of what it is called. Catching
 * a `.csv` here saves a round trip and, more usefully, says *why*: CSV cannot
 * express the four related sheets this format is built on.
 */
export function looksLikeXlsx(file: File): boolean {
  return file.name.toLowerCase().endsWith('.xlsx');
}

async function accessToken(): Promise<string> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError('No session', 401, [], 'AUTHENTICATION_REQUIRED');
  }
  return token;
}

function apiRoot(): string {
  return publicConfig.apiUrl.replace(/\/rpc\/?$/, '');
}

/**
 * The failure, with the workbook reason preserved.
 *
 * The body carries `{ code, message }`, where the code is the stable
 * application code and the message is the specific reason — `too_many_sheets`,
 * `formula_cell`. The wizard renders the reason when it recognises one and the
 * code otherwise, so a team lead is told which problem their file has rather
 * than that it has one.
 */
async function toApiError(response: Response): Promise<ApiError> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A proxy or a crash can answer with something that is not JSON.
  }
  const message =
    isRecord(payload) && typeof payload.message === 'string'
      ? payload.message
      : 'Request failed';
  return new ApiError(
    message,
    response.status,
    [],
    extractAppErrorCode(undefined, payload),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
