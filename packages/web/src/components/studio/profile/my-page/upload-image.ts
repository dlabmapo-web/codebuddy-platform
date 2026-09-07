import { ApiError, extractAppErrorCode } from '@/lib/api-errors';
import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/client';

/**
 * Posts the chosen image as the raw request body.
 *
 * Not an oRPC call: the contract layer carries JSON, and five megabytes of
 * photo base64-encoded into a JSON string is a third larger and gets decoded
 * twice. The API ignores the content type it is given and reads the format
 * from the leading bytes, so nothing here needs to be honest for the upload to
 * be safe — only for the error message to be useful.
 */
export async function uploadProfileImage<TResponse>(
  file: File,
  academy?: { academyId: string; membershipId?: string },
): Promise<TResponse> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError('No session', 401, [], 'AUTHENTICATION_REQUIRED');
  }

  const url = new URL(
    academy ? 'profile-images/academy' : 'profile-images/global',
    `${apiRoot()}/`,
  );
  if (academy) {
    url.searchParams.set('academyId', academy.academyId);
    if (academy.membershipId) {
      url.searchParams.set('membershipId', academy.membershipId);
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!response.ok) throw await toUploadError(response);
  return (await response.json()) as TResponse;
}

/**
 * `apiUrl` points at the RPC handler; the upload route is its sibling. Derived
 * rather than configured separately so one environment variable cannot point
 * the two halves of the same API at different hosts.
 */
function apiRoot(): string {
  return publicConfig.apiUrl.replace(/\/rpc\/?$/, '');
}

async function toUploadError(response: Response): Promise<ApiError> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A proxy or a crash can answer with something that is not JSON. The
    // status is still worth reporting; the body is not.
  }
  const message = isRecord(payload) && typeof payload.message === 'string'
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
