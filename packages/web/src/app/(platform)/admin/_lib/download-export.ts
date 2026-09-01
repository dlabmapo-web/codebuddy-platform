import type { AcademyRole, ResolvedListPlatformUsersInput } from '@cove/shared';
import { serializePlatformUsersQuery } from '@cove/shared';

import { ApiError, extractAppErrorCode } from '@/lib/api-errors';
import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/client';

/**
 * Downloads the directory the operator is looking at, as a spreadsheet.
 *
 * Not an oRPC call, for the reason `upload-workbook.ts` gives in the other
 * direction: the contract layer carries JSON, and a spreadsheet base64-encoded
 * into a JSON string is a third larger and gets decoded twice.
 *
 * The filter is the page's own, serialized by the same function the address
 * bar uses, so the file holds exactly the rows on screen. A `role` narrows it
 * further for this one download — it *replaces* the filter's roles rather than
 * intersecting with them, because an intersection of two disagreeing role sets
 * is an empty file, and an empty spreadsheet is the least debuggable answer a
 * download can give.
 *
 * The filename comes from `Content-Disposition` rather than being rebuilt
 * here. The server decides what the file is called; a second implementation in
 * the browser would be a second thing to keep in step.
 */
export async function downloadUserExport(input: {
  query: ResolvedListPlatformUsersInput;
  role?: AcademyRole | null;
  locale: string;
}): Promise<void> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError('No session', 401, [], 'AUTHENTICATION_REQUIRED');
  }

  const search = new URLSearchParams(
    serializePlatformUsersQuery({
      ...input.query,
      ...(input.role ? { roles: [input.role] } : {}),
      // Paging is a property of reading the table, not of the file: the export
      // covers everything matching, and sending page 3 would look like a
      // filter that quietly dropped the first fifty.
      page: 1,
    }),
  );
  search.set('locale', input.locale.startsWith('ko') ? 'ko' : 'en');
  // The browser's own zone, so the dates in the file are the dates the
  // operator just read on the page rather than UTC's version of them.
  search.set('tz', resolvedTimeZone());

  const response = await fetch(
    `${apiRoot()}/platform-users/export?${search.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) {
    throw await toDownloadError(response);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filenameFrom(response.headers.get('content-disposition'));
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * The name the server gave the file, or a plain fallback.
 *
 * The header is built from a closed set of parts — a role slug, a date, a
 * count — so this only ever has to read the simple quoted form. Anything it
 * cannot read becomes a name that is still obviously a Cove export rather than
 * `download`.
 */
function filenameFrom(header: string | null): string {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] ?? 'cove-users.xlsx';
}

/**
 * A failed download, with its code preserved.
 *
 * The body is `{ code, message }` from the controller's exception filter, and
 * the code is the whole point: `PLATFORM_EXPORT_TOO_LARGE` has to reach
 * `useErrorText` as itself so the operator is told to narrow the filter rather
 * than that something went wrong.
 */
async function toDownloadError(response: Response): Promise<ApiError> {
  let code: string | undefined;
  let message = 'Download failed';
  try {
    const body = (await response.json()) as { code?: string; message?: string };
    code = body.code;
    if (body.message) message = body.message;
  } catch {
    // A non-JSON body — a proxy error page, a dropped connection. The status
    // is still worth carrying.
  }
  return new ApiError(
    message,
    response.status,
    [],
    extractAppErrorCode(code, undefined),
  );
}

function resolvedTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function apiRoot(): string {
  return publicConfig.apiUrl.replace(/\/rpc\/?$/, '');
}
