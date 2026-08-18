import type { ImportPreview } from '@cove/shared';
import {
  IMPORT_MAX_FILE_BYTES,
  importColumns,
  importTemplateSamples,
  toCsv,
} from '@cove/shared';

import { ApiError, extractAppErrorCode } from '@/lib/api-errors';
import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/client';

/**
 * Posts a member workbook as the raw request body.
 *
 * Not an oRPC call, for the same reason a profile image is not: the contract
 * layer carries JSON, and five megabytes of spreadsheet base64-encoded into a
 * JSON string is a third larger and gets decoded twice. Everything after the
 * bytes — the preview, the commit, the result — is an ordinary typed call.
 *
 * The content type sent here is whatever the browser guessed. The API ignores
 * it and reads the format from the leading bytes, so nothing here needs to be
 * honest for the upload to be safe — only for the error to be useful.
 */
export async function uploadWorkbook(input: {
  academyId: string;
  file: File;
}): Promise<ImportPreview> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError('No session', 401, [], 'AUTHENTICATION_REQUIRED');
  }

  const url = new URL('people-imports', `${apiRoot()}/`);
  url.searchParams.set('academyId', input.academyId);
  url.searchParams.set('filename', input.file.name);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': input.file.type || 'application/octet-stream',
    },
    body: input.file,
  });

  if (!response.ok) throw await toUploadError(response);
  return (await response.json()) as ImportPreview;
}

/**
 * The same size check the server makes, made before the upload starts.
 *
 * Not a substitute for the server's — that one is authoritative and enforced
 * while the body streams — but uploading five megabytes to be told it is too
 * big is a slow way to learn something the browser already knew.
 */
export function fileIsTooLarge(file: File): boolean {
  return file.size > IMPORT_MAX_FILE_BYTES;
}

/**
 * The template, built in the browser.
 *
 * From the shared column list and the shared CSV writer, so the file a manager
 * downloads has exactly the header the parser recognises and exactly the
 * escaping the result export uses. A hand-written template string in the web
 * package is how the two drift apart and a manager's file stops importing.
 */
export function templateCsv(): string {
  return toCsv([[...importColumns], ...importTemplateSamples.map((row) => [...row])]);
}

/**
 * Hand the reader a file the browser generated.
 *
 * An object URL rather than a data URI: Safari caps data URIs well below the
 * size a 500-row result can reach, and the revoke keeps the blob from being
 * held for the life of the tab.
 */
export function downloadCsv(filename: string, csv: string): void {
  // The BOM is what makes Excel open a UTF-8 CSV as UTF-8. Without it a
  // Korean name in the results file renders as mojibake, which looks like the
  // import corrupted the data rather than like a spreadsheet default.
  const blob = new Blob([`﻿${csv}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function apiRoot(): string {
  return publicConfig.apiUrl.replace(/\/rpc\/?$/, '');
}

/**
 * The upload's failure, with the workbook reason preserved.
 *
 * The body carries `{ code, message }`, where the code is the stable
 * application code and the message is the specific workbook reason —
 * `too_many_rows`, `missing_required_column`. The wizard renders the reason
 * when it recognises one and the code otherwise, so a manager is told which
 * problem their file has rather than that it has one.
 */
async function toUploadError(response: Response): Promise<ApiError> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A proxy or a crash can answer with something that is not JSON.
  }
  const message =
    isRecord(payload) && typeof payload.message === 'string'
      ? payload.message
      : 'Upload failed';
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
