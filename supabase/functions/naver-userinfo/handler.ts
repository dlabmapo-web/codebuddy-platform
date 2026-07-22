const NAVER_PROFILE_URL = "https://openapi.naver.com/v1/nid/me";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type NaverProfile = {
  id?: unknown;
  email?: unknown;
  name?: unknown;
  nickname?: unknown;
  profile_image?: unknown;
};

type NaverProfileResponse = {
  resultcode?: unknown;
  response?: NaverProfile;
};

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function requiredString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function createNaverUserInfoHandler(
  fetcher: Fetcher = fetch,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { ...responseHeaders, Allow: "GET" },
      });
    }

    const authorization = request.headers.get("authorization");
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
      return jsonResponse(401, { error: "authentication_required" });
    }

    let upstream: Response;
    try {
      upstream = await fetcher(NAVER_PROFILE_URL, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: authorization,
        },
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      return jsonResponse(502, { error: "naver_profile_unavailable" });
    }

    if (!upstream.ok) {
      return jsonResponse(502, { error: "naver_profile_unavailable" });
    }

    let payload: NaverProfileResponse;
    try {
      payload = await upstream.json() as NaverProfileResponse;
    } catch {
      return jsonResponse(502, { error: "invalid_naver_profile" });
    }

    const profile = payload.response;
    const subject = requiredString(profile?.id);
    const email = requiredString(profile?.email);
    if (payload.resultcode !== "00" || !subject || !email) {
      return jsonResponse(502, { error: "invalid_naver_profile" });
    }

    const name = requiredString(profile?.name)
      ?? requiredString(profile?.nickname)
      ?? "Naver User";
    const picture = requiredString(profile?.profile_image);

    return jsonResponse(200, {
      sub: subject,
      email,
      email_verified: true,
      name,
      ...(picture ? { picture } : {}),
    });
  };
}
