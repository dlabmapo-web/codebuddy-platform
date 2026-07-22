import assert from "node:assert/strict";
import test from "node:test";

import { createNaverUserInfoHandler } from "./handler.ts";

test("rejects requests without a Naver bearer token", async () => {
  let fetchCalled = false;
  const handler = createNaverUserInfoHandler(async () => {
    fetchCalled = true;
    return new Response();
  });

  const response = await handler(new Request("https://example.com"));

  assert.equal(response.status, 401);
  assert.equal(fetchCalled, false);
  assert.deepEqual(await response.json(), { error: "authentication_required" });
});

test("allows only GET requests", async () => {
  const handler = createNaverUserInfoHandler(async () => new Response());

  const response = await handler(new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer naver-token" },
  }));

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
});

test("forwards the bearer token and flattens a valid Naver profile", async () => {
  let forwardedAuthorization: string | null = null;
  let requestedUrl = "";
  const handler = createNaverUserInfoHandler(async (input, init) => {
    requestedUrl = input.toString();
    forwardedAuthorization = new Headers(init?.headers).get("authorization");
    return Response.json({
      resultcode: "00",
      message: "success",
      response: {
        id: "naver-user-1",
        email: "naver@example.com",
        name: "Naver User",
        profile_image: "https://example.com/avatar.png",
      },
    });
  });

  const response = await handler(new Request("https://example.com", {
    headers: { Authorization: "Bearer naver-token" },
  }));

  assert.equal(response.status, 200);
  assert.equal(requestedUrl, "https://openapi.naver.com/v1/nid/me");
  assert.equal(forwardedAuthorization, "Bearer naver-token");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    sub: "naver-user-1",
    email: "naver@example.com",
    email_verified: true,
    name: "Naver User",
    picture: "https://example.com/avatar.png",
  });
});

test("rejects malformed Naver profiles", async () => {
  const handler = createNaverUserInfoHandler(async () => Response.json({
    resultcode: "00",
    response: { id: "naver-user-without-email" },
  }));

  const response = await handler(new Request("https://example.com", {
    headers: { Authorization: "Bearer naver-token" },
  }));

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "invalid_naver_profile" });
});

test("does not expose upstream error details", async () => {
  const handler = createNaverUserInfoHandler(async () => Response.json(
    { error: "invalid_token", secret_detail: "must-not-leak" },
    { status: 401 },
  ));

  const response = await handler(new Request("https://example.com", {
    headers: { Authorization: "Bearer rejected-token" },
  }));

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "naver_profile_unavailable" });
});
